/**
 * searxngMerger.ts
 * Price Ranking — SearXNG（Tier2/Tier3）検索結果を
 * Tier1（EC検索API）結果と統合するためのユーティリティ。
 *
 * 仕様書 v7.0 / ロードマップ Step 2-6 準拠
 *  - ヨドバシドットコム： mall='yodobashi'、実質価格 = 価格 - 価格*10%
 *  - その他汎用EC（Tier3）： mall='other'、実質価格 = 価格 + 送料
 *  - 重複排除：Tier1結果と「商品名の類似度」で簡易判定
 */

import { AffiliateItem } from '../types';
import { cleanProductName } from '../productNameCleaner';
import { SearXNGResult } from './searxngClient';

// ─── 価格・送料の抽出 ──────────────────────────────────────────

/**
 * SearXNGのsnippet（content）やtitleから「税込価格」を抽出する。
 * 例: "￥1,280" "1,280円" "1280円(税込)" などに対応。
 * 抽出できなければ null を返す。
 */
export function extractPriceFromText(text: string): number | null {
  if (!text) return null;

  // 「￥1,280」「¥1,280」「1,280円」などにマッチ
  const patterns = [
    /[￥¥]\s*([\d,]{3,})/,
    /([\d,]{3,})\s*円/,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const num = parseInt(m[1].replace(/,/g, ''), 10);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
}

/**
 * SearXNGのsnippetから送料情報を抽出する。
 * 「送料無料」「送料込み」→ 0
 * 「送料500円」のような明示額 → その額
 * 取得できなければ null（不明）を返す。
 */
export function extractShippingFromText(text: string): number | null {
  if (!text) return null;

  if (/送料無料|送料込/.test(text)) return 0;

  const m = text.match(/送料\s*[￥¥]?\s*([\d,]{1,6})\s*円?/);
  if (m) {
    const num = parseInt(m[1].replace(/,/g, ''), 10);
    if (!isNaN(num)) return num;
  }
  return null;
}

// ─── モール判定 ────────────────────────────────────────────────

/**
 * SearXNGの結果（URLまたはtitle）からモールを判定する。
 * ヨドバシドットコムは別格扱いで 'yodobashi' を返す。
 * その他は汎用EC（Tier3）として 'other' を返す。
 */
export function detectMallFromSearXNGResult(item: SearXNGResult): 'yodobashi' | 'other' {
  const url = (item.url || '').toLowerCase();
  const title = item.title || '';

  if (url.includes('yodobashi.com') || title.includes('ヨドバシ')) {
    return 'yodobashi';
  }
  return 'other';
}

// ─── 実質価格の計算 ────────────────────────────────────────────

/**
 * ヨドバシドットコムの実質価格を計算する。
 * 実質価格 = 商品価格 - (商品価格 × 10%)
 * （ヨドバシゴールドポイント還元 10% を想定した簡易計算）
 */
export function calcYodobashiEffectivePrice(price: number): number {
  return Math.round(price - price * 0.1);
}

/**
 * 汎用EC（Tier3）の実質価格を計算する。
 * 実質価格 = 商品価格 + 送料（不明な場合は送料0として扱う）
 */
export function calcGenericEffectivePrice(price: number, shippingFee: number | null): number {
  return price + (shippingFee ?? 0);
}

// ─── 重複排除 ──────────────────────────────────────────────────

/**
 * 2つの商品名がどの程度似ているかを簡易判定する。
 * cleanProductName() で正規化した上で、
 * 短い方の文字列が長い方に含まれていれば「同一商品の可能性が高い」と判定する。
 *
 * 厳密なJANコード比較は行わない（SearXNG側にJANコードが
 * 含まれないケースが多いため、商品名ベースの簡易判定とする）。
 */
export function isLikelySameProduct(nameA: string, nameB: string): boolean {
  const a = cleanProductName(nameA).trim();
  const b = cleanProductName(nameB).trim();

  if (!a || !b) return false;
  if (a === b) return true;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length < 2) return false;

  return longer.includes(shorter);
}

/**
 * SearXNGの1件が、既存のTier1結果（typedData）のいずれかと
 * 重複しているかを判定する。
 */
export function isDuplicateOfExisting(
  searxngTitle: string,
  existingItems: AffiliateItem[]
): boolean {
  return existingItems.some(item => isLikelySameProduct(searxngTitle, item.raw_name));
}

// ─── SearXNG結果 → AffiliateItem 変換 ──────────────────────────

/**
 * SearXNGの検索結果1件を AffiliateItem（画面表示用データ）に変換する。
 * 価格・送料が取得できなかった場合は null を返し、
 * 呼び出し側でバナーを生成しないようにする。
 *
 * @param result    SearXNGの1件分の結果
 * @param index     ユニークID生成用のインデックス
 */
export function convertSearXNGResultToItem(
  result: SearXNGResult,
  index: number
): AffiliateItem | null {
  const priceSource = `${result.title ?? ''} ${result.content ?? ''}`;
  const price = extractPriceFromText(priceSource);

  // 価格が取得できない結果はバナーを作らない（仕様書 Tier2/3 仕様）
  if (price === null) return null;

  const mall = detectMallFromSearXNGResult(result);
  const shippingFee = extractShippingFromText(priceSource);

  const effectiveTotal =
    mall === 'yodobashi'
      ? calcYodobashiEffectivePrice(price)
      : calcGenericEffectivePrice(price, shippingFee);

  return {
    id: `searxng-${mall}-${index}`,
    rank: 0, // 並び順はソート処理で再計算されるため初期値は0
    mall: mall === 'yodobashi' ? 'yodobashi' : 'other',
    raw_name: result.title ?? '',
    price,
    shipping_fee: shippingFee ?? 0,
    point: 0,
    coupon_discount: 0,
    effective_total: effectiveTotal,
    total_units: 1,
    unit_price: effectiveTotal,
    affiliate_url: result.url ?? '',
    image_url: '',
    capacity: '不明',
  };
}

// ─── メインのマージ処理 ────────────────────────────────────────

export interface MergeResult {
  /** 重複排除・変換済みのSearXNG由来アイテム */
  addedItems: AffiliateItem[];
  /** 取得した件数・価格未取得でスキップした件数・重複でスキップした件数 */
  stats: {
    total: number;
    skippedNoPrice: number;
    skippedDuplicate: number;
    added: number;
  };
}

/**
 * SearXNGの検索結果を、既存のTier1結果（typedData）にマージする。
 *
 * 処理の流れ：
 *  1. SearXNG結果をループし、価格が取得できないものはスキップ
 *  2. 既存結果（Tier1）と商品名が極めて近いものは重複としてスキップ
 *  3. 残ったものを AffiliateItem に変換して addedItems に積む
 *
 * @param searxngResults  SearXNGから取得した検索結果一覧
 * @param existingItems   既にTier1で取得済みのアイテム一覧
 */
export function mergeSearXNGResults(
  searxngResults: SearXNGResult[],
  existingItems: AffiliateItem[]
): MergeResult {
  const addedItems: AffiliateItem[] = [];
  let skippedNoPrice = 0;
  let skippedDuplicate = 0;

  searxngResults.forEach((result, i) => {
    // 既存（Tier1）との重複チェックは「変換前」のtitleで行う
    if (isDuplicateOfExisting(result.title ?? '', existingItems)) {
      skippedDuplicate++;
      return;
    }
    // 既に追加済みのSearXNG結果同士の重複もチェック
    if (isDuplicateOfExisting(result.title ?? '', addedItems)) {
      skippedDuplicate++;
      return;
    }

    const converted = convertSearXNGResultToItem(result, i);
    if (!converted) {
      skippedNoPrice++;
      return;
    }

    addedItems.push(converted);
  });

  return {
    addedItems,
    stats: {
      total: searxngResults.length,
      skippedNoPrice,
      skippedDuplicate,
      added: addedItems.length,
    },
  };
}