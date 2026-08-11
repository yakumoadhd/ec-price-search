"""
ai_parser.py
============
【フェーズA - モジュール5】
regex_parser で容量・入数・ロットがすべて抽出できなかったアイテムのみを
n8n Groq Gateway WF（CLA-235）経由のGroq API（openai/gpt-oss-120b）に投げて情報を補完する。

【設計方針】
- Ollama完全廃止・Groq API（openai/gpt-oss-120b）に移行（CLA-232）
- n8n Groq Gateway WF経由でGroq APIを呼び出す（キーローテーション・Rate Limit対策）
- Groq Gateway WF ID: iDdM3zz3usGcfqPO（CLA-235で構築済み）
- aiohttp で非同期POST → choices[0].message.content のJSONをパース
- エンドポイント: 環境変数 N8N_GROQ_WEBHOOK_URL

【コスト最適化（エコ設計）の詳細】

  ■ AI 補完対象の判定ロジック（_needs_ai_parse）
    以下の条件をすべて満たす場合はみ呼び出す:
        capacity_ml is None
        AND quantity == 1（デフォルト値）
        AND lot == 1（デフォルト値）
    = regex_parser が 3フィールドすべてをデフォルト値のまま返したアイテム

  ■ 並列処理による待機時間の最小化
    対象アイテムを asyncio.gather で並列送信
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import replace as _dc_replace
from typing import Any

import aiohttp

from schemas import ParsedItem

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# Groq Gateway 定数
# ──────────────────────────────────────────────

_N8N_GROQ_WEBHOOK_URL = os.environ.get(
    "N8N_GROQ_WEBHOOK_URL",
    "https://omoikane-1.tail32db64.ts.net/webhook/95f70cfa-f549-4cd6-a629-43c43b63081b/groq-gateway",
)
_GROQ_MODEL   = "openai/gpt-oss-120b"
_GROQ_TIMEOUT = 20.0  # 秒

# プロンプトテンプレート
_PROMPT_TEMPLATE = """\\
あなたはECサイトの商品情報解析AIです。
以下の商品名から「容量」「入数」「ロット数」を抽出してください。

商品名: {product_name}

抽出ルール:
- volume    : 商品1個あたりの容量（ml 換算の数値のみ）。Lはml換算、gやkgは対象外。不明なら 0。
- pack_count: 1パッケージ・1箱・1セットに含まれる個数（入数）。不明または単品なら 1。
- lot_count : まとめ買いのケース数・箱数などロット単位の数量。不明なら 1。

注意:
- 推測が難しい場合は、安全な初期値（volume=0, pack_count=1, lot_count=1）を返してください。
- 数値のみを返し、単位や説明文は不要です。
- 必ずJSONのみを出力してください。例: {"volume": 350, "pack_count": 24, "lot_count": 1}
"""


# ──────────────────────────────────────────────
# 補完要否の判定
# ──────────────────────────────────────────────

def _needs_ai_parse(item: ParsedItem) -> bool:
    return (
        item.capacity_ml is None
        and item.quantity == 1
        and item.lot == 1
    )


# ──────────────────────────────────────────────
# Groq Gateway レスポンスのパース
# ──────────────────────────────────────────────

def _parse_groq_response(response_json: dict[str, Any]) -> dict[str, Any] | None:
    """
    Groq Gateway WF経由のOpenAI互換レスポンスから結果を取り出す。

    レスポンス構造:
        {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "{\\"volume\\":350,\\"pack_count\\":24,\\"lot_count\\":1}"
                    }
                }
            ]
        }
    """
    try:
        content = response_json["choices"][0]["message"]["content"]
        # JSONコードブロックが含まれる場合の除去
        content = content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.strip()
        parsed = json.loads(content)
        if not all(k in parsed for k in ("volume", "pack_count", "lot_count")):
            logger.warning("Groq レスポンスに必須キーが欠損: %s", parsed)
            return None
        return parsed
    except (KeyError, IndexError, json.JSONDecodeError, TypeError) as exc:
        logger.warning("Groq レスポンスのパース失敗: %s | raw=%s", exc, str(response_json)[:200])
        return None


# ──────────────────────────────────────────────
# ParsedItem への書き戻し
# ──────────────────────────────────────────────

def _apply_ai_result(item: ParsedItem, ai_result: dict[str, Any]) -> ParsedItem:
    updates: dict[str, Any] = {"parsed_by": "ai"}

    volume = ai_result.get("volume", 0)
    if isinstance(volume, (int, float)) and volume > 0:
        updates["capacity_ml"] = float(volume)

    pack_count = ai_result.get("pack_count", 1)
    if isinstance(pack_count, (int, float)) and int(pack_count) > 1:
        updates["quantity"] = int(pack_count)

    lot_count = ai_result.get("lot_count", 1)
    if isinstance(lot_count, (int, float)) and int(lot_count) > 1:
        updates["lot"] = int(lot_count)

    return _dc_replace(item, **updates)


# ──────────────────────────────────────────────
# 1件分の Groq Gateway 呼び出しと補完�# ──────────────────────────────────────────────

async def _parse_single_with_ai(item: ParsedItem) -> ParsedItem:
    """
    ParsedItem 1件を Groq Gateway WF に投げて情報を補完する。
    失敗時は元の ParsedItem をそのまま返す（フォールバック）。
    """
    if not _N8N_GROQ_WEBHOOK_URL:
        logger.warning("N8N_GROQ_WEBHOOK_URL 未設定 - AI補完スキップ")
        return item

    prompt = _PROMPT_TEMPLATE.format(product_name=item.raw_name)
    payload = {
        "prompt": prompt,
        "model": _GROQ_MODEL,
        "max_tokens": 200,
    }

    try:
        timeout = aiohttp.ClientTimeout(total=_GROQ_TIMEOUT)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                _N8N_GROQ_WEBHOOK_URL,
                json=payload,
                headers={"Content-Type": "application/json"},
            ) as response:
                if response.status != 200:
                    body_text = await response.text()
                    logger.error(
                        "Groq Gateway HTTPエラー: status=%d, item='%s', body=%s",
                        response.status,
                        item.raw_name[:40],
                        body_text[:300],
                    )
                    return item  # フォールバック

                response_json = await response.json(content_type=None)

    except Exception as exc:
        logger.error(
            "Groq Gateway リクエストエラー: item='%s', error=%s",
            item.raw_name[:40],
            exc,
        )
        return item  # フォールバック

    ai_result = _parse_groq_response(response_json)
    if ai_result is None:
        logger.warning("Groq から有効な結果が得られず: '%s'", item.raw_name[:40])
        return item  # フォールバック

    updated = _apply_ai_result(item, ai_result)
    logger.debug(
        "AI補完完了: '%s' → capacity_ml=%s, quantity=%d, lot=%d",
        item.raw_name[:40],
        updated.capacity_ml,
        updated.quantity,
        updated.lot,
    )
    return updated


# ──────────────────────────────────────────────
# 公開インターフェース（元と完全互換）
# ──────────────────────────────────────────────

async def parse_with_ai(
    parsed_item: ParsedItem,
    api_key:     str | None = None,  # 互換性のため残す・使用しない
) -> ParsedItem:
    if not _needs_ai_parse(parsed_item):
        return parsed_item
    return await _parse_single_with_ai(parsed_item)


async def parse_items_with_ai(
    parsed_items: list[ParsedItem],
    api_key:      str | None = None,  # 互換性のため残す・使用しない
) -> list[ParsedItem]:
    needs = [_needs_ai_parse(item) for item in parsed_items]

    target_items  = [item for item, n in zip(parsed_items, needs) if n]
    skipped_count = len(parsed_items) - len(target_items)

    logger.info(
        "parse_items_with_ai: 全%d件 → AI補完対象=%d件 / スキップ=%d件",
        len(parsed_items), len(target_items), skipped_count,
    )

    if not target_items:
        return parsed_items

    ai_results: list[ParsedItem] = await asyncio.gather(
        *[_parse_single_with_ai(item) for item in target_items],
        return_exceptions=False,
    )

    result: list[ParsedItem] = []
    ai_iter = iter(ai_results)
    for item, needed in zip(parsed_items, needs):
        result.append(next(ai_iter) if needed else item)

    ai_updated = sum(
        1 for orig, updated in zip(parsed_items, result)
        if orig.parsed_by != updated.parsed_by
    )
    logger.info(
        "parse_items_with_ai 完了: AI補完成功=%d件 / フォールバック=%d件",
        ai_updated,
        len(target_items) - ai_updated,
    )
    return result
