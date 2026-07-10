/**
 * searxngMerger.ts
 * Price Ranking — SearXNG（Tier2/Tier3）検索結果を
 * Tier1（EC検索API）結果と統合するためのユーティリティ。
 *
 * 仕様書 v7.0 / ロードマップ Step 2-6 準拠
 *  - ヨドバシドットコム： mall='yodobashi'、実質価格 = 価格 - 価格*10%
 *  - Amazon： mall='amazon'、ASINからアフィリエイトURL・画像URLを生成
 *             価格はSearXNGのsnippetから抽出。取れない場合は破棄。
 *  - その他汎用EC（Tier3）： mall='other'、実質価格 = 価格 + 送料
 *  - 重複排除：Tier1結果と「商品名の類似度」で簡易判定
 */

import { AffiliateItem } from '../types';
import { cleanProductName } from '../productNameCleaner';
import { SearXNGResult } from './searxngClient';

// ─── Amazonアフィリエイト設定 ──────────────────────────────────
const AMAZON_AFFILIATE_TAG = 'ggvssyakumo-22';

/**
 * SearXNGのAmazon URLからASINを抽出する。
 * 例: https://www.amazon.co.jp/dp/B0FR7Q59GQ/ref=... → 'B0FR7Q59GQ'
 * 抽出できなければ null を返す。
 */
export function extractAsinFromUrl(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/dp\/([A-Z0-9]{10})/);
  return m ? m[1] : null;
}

/**
 * ASINからAmazonアフィリエイトURLを生成する。
 * 元URLのパラメータは全部捨て、ASINだけ使ってクリーンなURLを再構築する。
 * tag=ggvssyakumo-22 のみ付与（linkCode/linkId/ref_等は不要・確認済み）。
 */
export function buildAmazonAffiliateUrl(asin: string): string {
  return `https://www.amazon.co.jp/dp/${asin}?tag=${AMAZON_AFFILIATE_TAG}`;
}

/**
 * ASINからAmazon商品画像URLを生成する。
 * AmazonはASINさえあれば画像URLを自動生成できる。
 */
export function buildAmazonImageUrl(asin: string): string {
  return `https://images-na.ssl-images-amazon.com/images/P/${asin}.09.LZZZZZZZ.jpg`;
}

// ─── 価格・送料の抽出 ──────────────────────────────────────────

/**
 * SearXNGのsnippet（content）やtitleから「税込価格」を抽出する。
 * 例: "￥1,280" "1,280円" "1280円(税込)" などに対応。
 * 抽出できなければ null を返す。
 */
export function extractPriceFromText(text: string): number | null {
  if (!text) return null;

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
 * Amazonは 'amazon' を返す。
 * その他は汎用EC（Tier3）として 'other' を返す。
 */
export function detectMallFromSearXNGResult(item: SearXNGResult): 'yodobashi' | 'amazon' | 'other' {
  const url = (item.url || '').toLowerCase();
  const title = item.title || '';

  if (url.includes('yodobashi.com') || title.includes('ヨドバシ')) {
    return 'yodobashi';
  }
  if (url.includes('amazon.co.jp')) {
    return 'amazon';
  }
  return 'other';
}

// ─── 実質価格の計算 ────────────────────────────────────────────

/**
 * ヨドバシドットコムの実質価格を計算する。
 * 実質価格 = 商品価格 - (商品価格 × 10%)
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
 * SearXNGの1件が、既存のTier1結果のいずれかと重複しているかを判定する。
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
 *
 * Amazonの場合：
 *   - URLからASINを抽出してアフィリエイトURL・画像URLを生成
 *   - 価格はSearXNGのsnippetから抽出。取れない場合は null を返す（破棄）。
 *
 * それ以外の場合：
 *   - 価格が取得できなかった場合は null を返す（バナーを生成しない）。
 */
export function convertSearXNGResultToItem(
  result: SearXNGResult,
  index: number
): AffiliateItem | null {
  const priceSource = `${result.title ?? ''} ${result.content ?? ''}`;
  const mall = detectMallFromSearXNGResult(result);

  // ─── Amazon専用処理 ─────────────────────────────────────────
  if (mall === 'amazon') {
    const asin = extractAsinFromUrl(result.url ?? '');
    if (!asin) return null;

    const price = extractPriceFromText(priceSource);
    if (price === null) return null;

    const affiliateUrl = buildAmazonAffiliateUrl(asin);
    const imageUrl = buildAmazonImageUrl(asin);

    return {
      id: `searxng-amazon-${index}`,
      rank: 0,
      mall: 'amazon',
      raw_name: result.title ?? '',
      price,
      shipping_fee: 0,
      point: 0,
      coupon_discount: 0,
      effective_total: price,
      total_units: 1,
      unit_price: price,
      affiliate_url: affiliateUrl,
      image_url: imageUrl,
      capacity: '不明',
    };
  }

  // ─── ヨドバシ・その他 ───────────────────────────────────────
  const price = extractPriceFromText(priceSource);
  if (price === null) return null;

  const shippingFee = extractShippingFromText(priceSource);

  const effectiveTotal =
    mall === 'yodobashi'
      ? calcYodobashiEffectivePrice(price)
      : calcGenericEffectivePrice(price, shippingFee);

  return {
    id: `searxng-${mall}-${index}`,
    rank: 0,
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
  addedItems: AffiliateItem[];
  stats: {
    total: number;
    skippedNoPrice: number;
    skippedDuplicate: number;
    added: number;
  };
}

/**
 * SearXNGの検索結果を、既存のTier1結果（typedData）にマージする。
 */
export function mergeSearXNGResults(
  searxngResults: SearXNGResult[],
  existingItems: AffiliateItem[]
): MergeResult {
  const addedItems: AffiliateItem[] = [];
  let skippedNoPrice = 0;
  let skippedDuplicate = 0;

  searxngResults.forEach((result, i) => {
    if (isDuplicateOfExisting(result.title ?? '', existingItems)) {
      skippedDuplicate++;
      return;
    }
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
