import os
import json
import requests
import time
from datetime import datetime, timezone
from google.cloud import bigquery

# --- 設定 ---
NOTION_TOKEN = os.environ["NOTION_TOKEN"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
BQ_PROJECT = os.environ.get("GCP_PROJECT_ID", "claude-national-library")
BQ_DATASET = "claude_context"
BQ_TABLE = "startup_context"

HANDOVER_PAGE_ID = "38595bec72e181928422f122ef1e1311"
WAREHOUSE_PAGE_ID = "38e95bec72e18165bd24f9dbc88e25c4"

NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
}


def fetch_notion_page(page_id: str) -> str:
    """NotionページのBlocksをテキストとして取得"""
    url = f"https://api.notion.com/v1/blocks/{page_id}/children?page_size=100"
    res = requests.get(url, headers=NOTION_HEADERS)
    res.raise_for_status()
    blocks = res.json().get("results", [])
    texts = []
    for block in blocks:
        btype = block.get("type", "")
        content = block.get(btype, {})
        rich = content.get("rich_text", [])
        for r in rich:
            texts.append(r.get("plain_text", ""))
    return "\n".join(texts)


def fetch_warehouse_children() -> list:
    """倉庫の子ページIDリストを取得（最新5件）"""
    url = f"https://api.notion.com/v1/blocks/{WAREHOUSE_PAGE_ID}/children?page_size=20"
    res = requests.get(url, headers=NOTION_HEADERS)
    res.raise_for_status()
    blocks = res.json().get("results", [])
    child_pages = [
        b["id"] for b in blocks
        if b.get("type") == "child_page"
    ]
    return child_pages[-5:]  # 最新5件


def summarize_with_gemini(text: str) -> str:
    """Gemini APIでテキストを要約"""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{
            "parts": [{
                "text": f"以下の会話ログを3000文字以内で要約してください。プロジェクト状況・完了タスク・未完了タスク・地雷情報を優先してまとめること:\n\n{text[:30000]}"
            }]
        }],
        "generationConfig": {"maxOutputTokens": 4096}
    }
    res = requests.post(url, json=payload)
    res.raise_for_status()
    data = res.json()
    return data["candidates"][0]["content"]["parts"][0]["text"]


def insert_to_bigquery(handover: str, log_summary: str) -> None:
    """BigQueryにコンテキストをINSERT"""
    client = bigquery.Client(project=BQ_PROJECT)
    table_ref = f"{BQ_PROJECT}.{BQ_DATASET}.{BQ_TABLE}"

    row = {
        "id": datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "handover_memo": handover[:50000],
        "project_status": json.dumps({"source": "github_actions", "updated": datetime.now(timezone.utc).isoformat()}),
        "log_summary": log_summary[:50000],
        "next_tasks": json.dumps([]),
        "landmines": ""
    }

    errors = client.insert_rows_json(table_ref, [row])
    if errors:
        raise RuntimeError(f"BigQuery insert error: {errors}")
    print(f"✅ BigQuery INSERT完了: {row['id']}")


def main():
    print("=== Claude Context Update Pipeline 開始 ===")

    # 1. 引き継ぎメモ取得
    print("📋 引き継ぎメモ取得中...")
    handover = fetch_notion_page(HANDOVER_PAGE_ID)
    print(f"  取得完了: {len(handover)}文字")
    time.sleep(1)

    # 2. 会話ログ倉庫から最新5件取得
    print("🧠 会話ログ倉庫取得中...")
    child_ids = fetch_warehouse_children()
    print(f"  子ページ{len(child_ids)}件取得")

    all_logs = ""
    for i, page_id in enumerate(child_ids):
        print(f"  ログ{i+1}件目取得中...")
        text = fetch_notion_page(page_id)
        all_logs += f"\n\n=== ログ{i+1} ===\n{text}"
        time.sleep(0.5)

    # 3. Geminiで要約
    print("🤖 Gemini要約中...")
    summary = summarize_with_gemini(all_logs)
    print(f"  要約完了: {len(summary)}文字")

    # 4. BigQueryにINSERT
    print("📊 BigQuery INSERT中...")
    insert_to_bigquery(handover, summary)

    print("=== 完了！ ===")


if __name__ == "__main__":
    main()
