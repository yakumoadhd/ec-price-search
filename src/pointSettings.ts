// ═══════════════════════════════════════════════
// ポイント・特典設定の型定義＆デフォルト値
// ═══════════════════════════════════════════════

export interface AmazonSettings {
  isPrime: boolean;           // プライム会員（送料無料）
  hasDPoint: boolean;         // dポイント連携（+0.5%）
  hasMastercard: boolean;     // Amazon Mastercard（+2%）
  usesPaidy: boolean;         // Paidy払い（+5% 上限500pt）
  isSalePeriod: boolean;      // セール期間中（+8%）
  usesTeiki: boolean;         // 定期おトク便（-15%）
}

export interface RakutenSettings {
  hasCard: boolean;           // 楽天カード（+2%）
  hasMobile: boolean;         // 楽天モバイル（+1%）
  hasBank: boolean;           // 楽天銀行+引落（+0.5%）
  hasPremiumCard: boolean;    // 楽天プレミアムカード（+2%追加）
  hasInsurance: boolean;      // 楽天保険（+0.5%）
  hasTravel: boolean;         // 楽天トラベル（+1%）
  hasBeauty: boolean;         // 楽天ビューティ（+0.5%）
  hasEnergyOrFashion: boolean;// 楽天エナジー/ファッション（+0.5%）
  isMarathon: boolean;        // お買い物マラソン/スーパーSALE中
  marathonShops: number;      // 何店舗目（1〜10）
}

export interface YahooSettings {
  usesPayPay: boolean;        // PayPay/PayPayカードで払う（+4%）
  hasLYPPremium: boolean;     // LYPプレミアム会員（+2%）
  hasPayPayCard: boolean;     // PayPayカード保有（+1%）
  hasPayPayCardGold: boolean; // PayPayカードゴールド（+2%）
  hasPayPayBank: boolean;     // PayPay銀行（+0.5%）
  hasSoftbank: boolean;       // ソフトバンク回線（+2%）
  hasYmobile: boolean;        // ワイモバイル回線（+1%）
  isShoppingRankSilver: boolean; // ショッピングランクシルバー以上（感謝デー対象）
  prefecture: string;           // 都道府県（送料計算用）
}

export interface PointSettings {
  amazon: AmazonSettings;
  rakuten: RakutenSettings;
  yahoo: YahooSettings;
}

export const DEFAULT_SETTINGS: PointSettings = {
  amazon: {
    isPrime: false,
    hasDPoint: false,
    hasMastercard: false,
    usesPaidy: false,
    isSalePeriod: false,
    usesTeiki: false,
  },
  rakuten: {
    hasCard: false,
    hasMobile: false,
    hasBank: false,
    hasPremiumCard: false,
    hasInsurance: false,
    hasTravel: false,
    hasBeauty: false,
    hasEnergyOrFashion: false,
    isMarathon: false,
    marathonShops: 1,
  },
  yahoo: {
    usesPayPay: false,
    hasLYPPremium: false,
    hasPayPayCard: false,
    hasPayPayCardGold: false,
    hasPayPayBank: false,
    hasSoftbank: false,
    hasYmobile: false,
    isShoppingRankSilver: false,
    prefecture: 'tokyo',
  },
};

// ═══════════════════════════════════════════════
// アフィリエイトリンク（後で差し替え）
// ═══════════════════════════════════════════════
export const AFFILIATE_LINKS = {
  amazon: {
    prime:      'AFFILIATE_AMAZON_PRIME',
    dpoint:     'AFFILIATE_D_POINT',
    mastercard: 'AFFILIATE_AMAZON_CARD',
    paidy:      'AFFILIATE_PAIDY',
    teiki:      'AFFILIATE_AMAZON_TEIKI',
    featured:   'AFFILIATE_AMAZON_FEATURED', // 下段おすすめ枠
  },
  rakuten: {
    card:           'AFFILIATE_RAKUTEN_CARD',
    premiumCard:    'AFFILIATE_RAKUTEN_PREMIUM_CARD',
    mobile:         'AFFILIATE_RAKUTEN_MOBILE',
    bank:           'AFFILIATE_RAKUTEN_BANK',
    insurance:      'AFFILIATE_RAKUTEN_INSURANCE',
    travel:         'AFFILIATE_RAKUTEN_TRAVEL',
    beauty:         'AFFILIATE_RAKUTEN_BEAUTY',
    energyFashion:  'AFFILIATE_RAKUTEN_ENERGY',
    featured:       'AFFILIATE_RAKUTEN_FEATURED', // 下段おすすめ枠
  },
  yahoo: {
    lypPremium:     'AFFILIATE_LYP_PREMIUM',
    payPayCard:     'AFFILIATE_PAYPAY_CARD',
    payPayCardGold: 'AFFILIATE_PAYPAY_CARD_GOLD',
    payPayBank:     'AFFILIATE_PAYPAY_BANK',
    softbank:       'AFFILIATE_SOFTBANK',
    ymobile:        'AFFILIATE_YMOBILE',
    featured:       'AFFILIATE_YAHOO_FEATURED', // 下段おすすめ枠
  },
};

// ═══════════════════════════════════════════════
// 日付自動判定ユーティリティ
// ═══════════════════════════════════════════════

/** 今日が楽天「5と0のつく日」か */
export function isRakutenBonusDay(): boolean {
  const d = new Date().getDate();
  return d % 5 === 0; // 5, 10, 15, 20, 25, 30
}

/** 今日がYahoo!「5のつく日」か */
export function isYahoo5Day(): boolean {
  const d = new Date().getDate();
  return [5, 15, 25].includes(d);
}

/** 今日が日曜日か */
export function isSunday(): boolean {
  return new Date().getDay() === 0;
}

/** 今日がYahoo!感謝デー（11・22日）か */
export function isYahooKanshaDay(): boolean {
  const d = new Date().getDate();
  return [11, 22].includes(d);
}

// ═══════════════════════════════════════════════
// 実質価格再計算
// ═══════════════════════════════════════════════

export function calcEffectiveTotal(
  mall: 'amazon' | 'rakuten' | 'yahoo',
  price: number,
  shippingFee: number,
  apiPoint: number,        // APIが返す最大ポイント（参考値）
  couponDiscount: number,
  settings: PointSettings,
): number {
  let shipping = shippingFee;
  let discountRate = 0; // 割引率（%）
  let pointRate = 0;    // ポイント還元率（%）

  if (mall === 'amazon') {
    const s = settings.amazon;
    if (s.isPrime) shipping = 0;
    pointRate += s.hasDPoint ? 0.5 : 0;
    pointRate += s.hasMastercard ? 2 : 0;
    pointRate += s.usesPaidy ? 5 : 0;
    pointRate += s.isSalePeriod ? 8 : 0;
    if (s.usesTeiki) discountRate += 15;
  }

  if (mall === 'rakuten') {
    const s = settings.rakuten;
    // 基本1%
    pointRate += 1;
    pointRate += s.hasCard ? 2 : 0;
    pointRate += s.hasPremiumCard ? 2 : 0;
    pointRate += s.hasMobile ? 1 : 0;
    pointRate += s.hasBank ? 0.5 : 0;
    pointRate += s.hasInsurance ? 0.5 : 0;
    pointRate += s.hasTravel ? 1 : 0;
    pointRate += s.hasBeauty ? 0.5 : 0;
    pointRate += s.hasEnergyOrFashion ? 0.5 : 0;
    // マラソン倍率（2店舗目から+1倍ずつ、最大+9）
    if (s.isMarathon && s.marathonShops > 1) {
      pointRate += Math.min(s.marathonShops - 1, 9);
    }
    // 5と0のつく日（楽天カードが必要）
    if (s.hasCard && isRakutenBonusDay()) pointRate += 2;
  }

  if (mall === 'yahoo') {
    const s = settings.yahoo;
    // 基本1%
    pointRate += 1;
    pointRate += s.usesPayPay ? 4 : 0;
    pointRate += s.hasLYPPremium ? 2 : 0;
    pointRate += s.hasPayPayCard ? 1 : 0;
    pointRate += s.hasPayPayCardGold ? 1 : 0; // ゴールドは+1上乗せ
    pointRate += s.hasPayPayBank ? 0.5 : 0;
    pointRate += s.hasSoftbank ? 2 : 0;
    pointRate += s.hasYmobile ? 1 : 0;
    // 5のつく日
    if (isYahoo5Day()) pointRate += 4;
    // プレミアムな日曜日（LYP会員 & 日曜）
    if (s.hasLYPPremium && isSunday()) pointRate += 5;
    // 感謝デー（シルバー以上 & 11・22日）
    if (s.isShoppingRankSilver && isYahooKanshaDay()) pointRate += 5;
  }

  const basePrice = price * (1 - discountRate / 100);
  const pointValue = basePrice * (pointRate / 100);
  return Math.round(basePrice + shipping - couponDiscount - pointValue);
}

export function loadSettings(): PointSettings {
  try {
    const raw = localStorage.getItem('point_settings_v1');
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: PointSettings): void {
  localStorage.setItem('point_settings_v1', JSON.stringify(s));
}

// ═══════════════════════════════════════════════
// 最大還元率・現在還元率の計算（円グラフ用）
// ═══════════════════════════════════════════════

export interface RateInfo {
  current: number;  // ユーザー設定済み還元率合計(%)
  max: number;      // 理論上の最大還元率(%)
}

export function calcRateInfo(mall: 'amazon' | 'rakuten' | 'yahoo', settings: PointSettings): RateInfo {
  if (mall === 'amazon') {
    const s = settings.amazon;
    const max = 0.5 + 2 + 5 + 8 + 15; // dP + MC + Paidy + sale + teiki
    let current = 0;
    current += s.hasDPoint ? 0.5 : 0;
    current += s.hasMastercard ? 2 : 0;
    current += s.usesPaidy ? 5 : 0;
    current += s.isSalePeriod ? 8 : 0;
    current += s.usesTeiki ? 15 : 0;
    return { current: Math.round(current * 10) / 10, max };
  }
  if (mall === 'rakuten') {
    const s = settings.rakuten;
    const max = 1 + 2 + 2 + 1 + 0.5 + 0.5 + 1 + 0.5 + 0.5 + 9 + 2; // 全SPU + マラソン10店 + 5の日
    let current = 1; // 基本
    current += s.hasCard ? 2 : 0;
    current += s.hasPremiumCard ? 2 : 0;
    current += s.hasMobile ? 1 : 0;
    current += s.hasBank ? 0.5 : 0;
    current += s.hasInsurance ? 0.5 : 0;
    current += s.hasTravel ? 1 : 0;
    current += s.hasBeauty ? 0.5 : 0;
    current += s.hasEnergyOrFashion ? 0.5 : 0;
    if (s.isMarathon && s.marathonShops > 1) current += Math.min(s.marathonShops - 1, 9);
    if (s.hasCard && isRakutenBonusDay()) current += 2;
    return { current: Math.round(current * 10) / 10, max: Math.round(max * 10) / 10 };
  }
  // yahoo
  const s = settings.yahoo;
  const autoBonus = (isYahoo5Day() ? 4 : 0) + (isSunday() && s.hasLYPPremium ? 5 : 0) + (isYahooKanshaDay() && s.isShoppingRankSilver ? 5 : 0);
  const max = 1 + 4 + 2 + 1 + 1 + 0.5 + 2 + 1 + 4 + 5 + 5; // 全項目 + 5の日 + 日曜 + 感謝デー
  let current = 1;
  current += s.usesPayPay ? 4 : 0;
  current += s.hasLYPPremium ? 2 : 0;
  current += s.hasPayPayCard && !s.hasPayPayCardGold ? 1 : 0;
  current += s.hasPayPayCardGold ? 2 : 0;
  current += s.hasPayPayBank ? 0.5 : 0;
  current += s.hasSoftbank ? 2 : 0;
  current += s.hasYmobile ? 1 : 0;
  current += autoBonus;
  return { current: Math.round(current * 10) / 10, max: Math.round(max * 10) / 10 };
}

// 都道府県リスト（Yahoo! 送料パラメータ用）
export const PREFECTURES: { label: string; value: string }[] = [
  { label: '北海道', value: 'hokkaido' },
  { label: '青森県', value: 'aomori' },
  { label: '岩手県', value: 'iwate' },
  { label: '宮城県', value: 'miyagi' },
  { label: '秋田県', value: 'akita' },
  { label: '山形県', value: 'yamagata' },
  { label: '福島県', value: 'fukushima' },
  { label: '茨城県', value: 'ibaraki' },
  { label: '栃木県', value: 'tochigi' },
  { label: '群馬県', value: 'gunma' },
  { label: '埼玉県', value: 'saitama' },
  { label: '千葉県', value: 'chiba' },
  { label: '東京都', value: 'tokyo' },
  { label: '神奈川県', value: 'kanagawa' },
  { label: '新潟県', value: 'niigata' },
  { label: '富山県', value: 'toyama' },
  { label: '石川県', value: 'ishikawa' },
  { label: '福井県', value: 'fukui' },
  { label: '山梨県', value: 'yamanashi' },
  { label: '長野県', value: 'nagano' },
  { label: '岐阜県', value: 'gifu' },
  { label: '静岡県', value: 'shizuoka' },
  { label: '愛知県', value: 'aichi' },
  { label: '三重県', value: 'mie' },
  { label: '滋賀県', value: 'shiga' },
  { label: '京都府', value: 'kyoto' },
  { label: '大阪府', value: 'osaka' },
  { label: '兵庫県', value: 'hyogo' },
  { label: '奈良県', value: 'nara' },
  { label: '和歌山県', value: 'wakayama' },
  { label: '鳥取県', value: 'tottori' },
  { label: '島根県', value: 'shimane' },
  { label: '岡山県', value: 'okayama' },
  { label: '広島県', value: 'hiroshima' },
  { label: '山口県', value: 'yamaguchi' },
  { label: '徳島県', value: 'tokushima' },
  { label: '香川県', value: 'kagawa' },
  { label: '愛媛県', value: 'ehime' },
  { label: '高知県', value: 'kochi' },
  { label: '福岡県', value: 'fukuoka' },
  { label: '佐賀県', value: 'saga' },
  { label: '長崎県', value: 'nagasaki' },
  { label: '熊本県', value: 'kumamoto' },
  { label: '大分県', value: 'oita' },
  { label: '宮崎県', value: 'miyazaki' },
  { label: '鹿児島県', value: 'kagoshima' },
  { label: '沖縄県', value: 'okinawa' },
];