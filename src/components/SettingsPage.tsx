import React, { useState, useEffect } from 'react';
import {
  PointSettings, AmazonSettings, RakutenSettings, YahooSettings,
  DEFAULT_SETTINGS, AFFILIATE_LINKS,
  isRakutenBonusDay, isYahoo5Day, isSunday, isYahooKanshaDay,
  loadSettings, saveSettings,
  calcRateInfo, PREFECTURES,
} from '../pointSettings';
import { ArrowLeft, ExternalLink, Zap } from 'lucide-react';

interface SettingsPageProps {
  onClose: () => void;
  onSettingsChange: (s: PointSettings) => void;
  onOpenDisclaimer: () => void;
}

type Tab = 'amazon' | 'rakuten' | 'yahoo';

function isPlaceholder(url: string) { return url.startsWith('AFFILIATE_'); }

// ─── 円グラフ ──────────────────────────────────────
function RateDonut({ current, max }: { current: number; max: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(current / max, 1) * circ;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="currentColor" strokeWidth="4"
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)" />
    </svg>
  );
}

// ─── 還元率バナー ──────────────────────────────────
function RateBanner({ mall, settings }: { mall: Tab; settings: PointSettings }) {
  const { current, max } = calcRateInfo(mall, settings);
  const loss = Math.round((max - current) * 10) / 10;
  const color = mall === 'amazon' ? 'text-orange-500' : 'text-red-500';
  const bg = mall === 'amazon' ? 'bg-orange-50 border-orange-100' : 'bg-red-50 border-red-100';

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${bg} mb-1`}>
      <div className={`${color} shrink-0`}>
        <RateDonut current={current} max={max} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className={`text-[22px] font-black ${color} leading-none`}>{current}%</span>
          <span className="text-[13px] text-gray-400 font-bold">/ 最大 {max}%</span>
        </div>
        {loss > 0 ? (
          <p className="text-[11px] text-gray-500 mt-0.5">
            あと <span className="font-extrabold text-red-500">{loss}%</span> お得にできます！
          </p>
        ) : (
          <p className="text-[11px] text-green-600 font-bold mt-0.5">🎉 最大還元率を達成中！</p>
        )}
      </div>
    </div>
  );
}

// ─── チェック行 ───────────────────────────────────
interface CheckRowProps {
  label: string;
  sub?: string;
  badge: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  affiliateUrl?: string;
  affiliateLabel?: string;
}

function CheckRow({ label, sub, badge, checked, onChange, affiliateUrl, affiliateLabel }: CheckRowProps) {
  const showLink = !checked && affiliateUrl && !isPlaceholder(affiliateUrl);
  return (
    <div className={`rounded-2xl border transition-all duration-200 overflow-hidden
      ${checked ? 'border-green-200 bg-green-50/60' : 'border-gray-200 bg-white'}`}>
      <button onClick={() => onChange(!checked)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all
          ${checked ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-white'}`}>
          {checked && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[13px] font-bold text-gray-800 block leading-tight">{label}</span>
          {sub && <span className="text-[11px] text-gray-400 leading-tight">{sub}</span>}
        </div>
        <span className={`shrink-0 text-[11px] font-extrabold px-2 py-0.5 rounded-full
          ${checked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{badge}</span>
      </button>
      {showLink && (
        <a href={affiliateUrl} target="_blank" rel="noopener noreferrer sponsored"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-50 border-t border-amber-100 text-amber-700 text-[12px] font-bold hover:bg-amber-100 transition-colors group">
          <Zap className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">未登録 → {affiliateLabel || `${label}に申し込む`}</span>
          <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" />
        </a>
      )}
    </div>
  );
}

// ─── 日付バナー ───────────────────────────────────
function DateBanner({ icon, text, color }: { icon: string; text: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-bold ${color}`}>
      <span>{icon}</span><span>{text}</span>
    </div>
  );
}

// ─── おすすめアフィリエイト枠 ─────────────────────
const FEATURED_CONFIG: Record<Tab, { title: string; desc: string; cta: string; url: string; color: string; emoji: string }> = {
  amazon:  { title: 'Amazonプライム',  desc: '送料無料・映画・音楽・読み放題。まず30日無料体験！', cta: '30日間無料で試す', url: AFFILIATE_LINKS.amazon.featured,  color: 'from-orange-400 to-amber-500', emoji: '📦' },
  rakuten: { title: '楽天カード',      desc: '楽天市場で還元率+2%。年会費永年無料で新規ポイントも大量！', cta: '今すぐ申し込む（無料）', url: AFFILIATE_LINKS.rakuten.featured, color: 'from-red-500 to-rose-600',    emoji: '💳' },
  yahoo:   { title: 'LYPプレミアム',   desc: '月508円で常時+2%。日曜日はさらに+5%！LINEスタンプも。', cta: '無料期間で試してみる', url: AFFILIATE_LINKS.yahoo.featured,   color: 'from-red-600 to-pink-500',    emoji: '⭐' },
};

function FeaturedAffiliate({ mall }: { mall: Tab }) {
  const cfg = FEATURED_CONFIG[mall];
  if (isPlaceholder(cfg.url)) return null;
  return (
    <a href={cfg.url} target="_blank" rel="noopener noreferrer sponsored"
      className={`block w-full rounded-2xl bg-gradient-to-r ${cfg.color} text-white p-4 shadow-md hover:shadow-lg transition-all active:scale-[0.98]`}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{cfg.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold opacity-70 mb-0.5">PR・広告</div>
          <div className="text-[14px] font-black leading-tight">{cfg.title}</div>
          <div className="text-[11px] opacity-90 mt-0.5 leading-snug">{cfg.desc}</div>
        </div>
      </div>
      <div className="mt-3 bg-white/20 rounded-xl py-2 text-center text-[12px] font-extrabold">{cfg.cta}</div>
    </a>
  );
}

// ─── Amazonタブ ──────────────────────────────────
function AmazonTab({ s, settings, onChange }: { s: AmazonSettings; settings: PointSettings; onChange: (s: AmazonSettings) => void }) {
  const set = (key: keyof AmazonSettings, val: boolean) => onChange({ ...s, [key]: val });
  return (
    <div className="flex flex-col gap-3">
      <RateBanner mall="amazon" settings={settings} />
      <p className="text-[11px] text-gray-400 font-medium px-1">加入・設定している項目にチェックを入れると実質価格に自動反映されます。</p>

      <CheckRow label="Amazonプライム会員" sub="対象商品の送料が無料に・検索結果も送料無料のみ表示" badge="送料無料"
        checked={s.isPrime} onChange={v => set('isPrime', v)}
        affiliateUrl={AFFILIATE_LINKS.amazon.prime} affiliateLabel="30日無料体験はこちら" />
      <CheckRow label="dポイント連携済み" sub="Amazonポイントと二重取り" badge="+0.5%"
        checked={s.hasDPoint} onChange={v => set('hasDPoint', v)}
        affiliateUrl={AFFILIATE_LINKS.amazon.dpoint} affiliateLabel="dアカウント連携の方法はこちら" />
      <CheckRow label="Amazon Mastercard保有" sub="プライム会員なら常時2%還元" badge="+2%"
        checked={s.hasMastercard} onChange={v => set('hasMastercard', v)}
        affiliateUrl={AFFILIATE_LINKS.amazon.mastercard} affiliateLabel="年会費永年無料で申し込む" />
      <CheckRow label="Paidy（あと払い）で支払う" sub="毎月最大5%還元・上限500pt" badge="+5%"
        checked={s.usesPaidy} onChange={v => set('usesPaidy', v)}
        affiliateUrl={AFFILIATE_LINKS.amazon.paidy} affiliateLabel="Paidyのキャンペーンを見る" />
      <CheckRow label="定期おトク便で購入" sub="3種以上同時で最大15%オフ" badge="-15%"
        checked={s.usesTeiki} onChange={v => set('usesTeiki', v)}
        affiliateUrl={AFFILIATE_LINKS.amazon.teiki} affiliateLabel="定期おトク便の詳細を見る" />

      <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 transition-all
        ${s.isSalePeriod ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}`}>
        <button onClick={() => set('isSalePeriod', !s.isSalePeriod)} className="flex items-center gap-3 flex-1 text-left">
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all
            ${s.isSalePeriod ? 'bg-orange-500 border-orange-500' : 'border-gray-300 bg-white'}`}>
            {s.isSalePeriod && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <div className="flex-1">
            <span className="text-[13px] font-bold text-gray-800 block">現在セール期間中</span>
            <span className="text-[11px] text-gray-400">スマイルSALE・プライムデーなど手動で設定</span>
          </div>
          <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full shrink-0
            ${s.isSalePeriod ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>+8%</span>
        </button>
      </div>

      <FeaturedAffiliate mall="amazon" />
    </div>
  );
}

// ─── 楽天タブ ─────────────────────────────────────
function RakutenTab({ s, settings, onChange }: { s: RakutenSettings; settings: PointSettings; onChange: (s: RakutenSettings) => void }) {
  const set = (key: keyof RakutenSettings, val: boolean | number) => onChange({ ...s, [key]: val });
  const bonusDay = isRakutenBonusDay();
  const today = new Date().getDate();
  return (
    <div className="flex flex-col gap-3">
      <RateBanner mall="rakuten" settings={settings} />
      <p className="text-[11px] text-gray-400 font-medium px-1">SPU（スーパーポイントアップ）の加入状況を設定してください。</p>
      {bonusDay && <DateBanner icon="🎯" text={`今日は${today}日（5と0のつく日）！楽天カード払いで +2% 自動加算中`} color="bg-red-50 text-red-600 border border-red-100" />}

      <div className="text-[11px] font-extrabold text-gray-500 px-1 mt-1">── SPU 設定 ──</div>
      <CheckRow label="楽天カード" sub="楽天市場で最重要・5と0のつく日も対象" badge="+2%"
        checked={s.hasCard} onChange={v => set('hasCard', v)}
        affiliateUrl={AFFILIATE_LINKS.rakuten.card} affiliateLabel="楽天カードに申し込む（無料）" />
      <CheckRow label="楽天プレミアムカード" sub="楽天カードと合算でさらに上乗せ" badge="+2%"
        checked={s.hasPremiumCard} onChange={v => set('hasPremiumCard', v)}
        affiliateUrl={AFFILIATE_LINKS.rakuten.premiumCard} affiliateLabel="楽天プレミアムカードを見る" />
      <CheckRow label="楽天モバイル" sub="回線契約でSPU倍率アップ" badge="+1%"
        checked={s.hasMobile} onChange={v => set('hasMobile', v)}
        affiliateUrl={AFFILIATE_LINKS.rakuten.mobile} affiliateLabel="楽天モバイルの料金を見る" />
      <CheckRow label="楽天銀行＋楽天カード引落" sub="楽天銀行口座からカード引落でポイントアップ" badge="+0.5%"
        checked={s.hasBank} onChange={v => set('hasBank', v)}
        affiliateUrl={AFFILIATE_LINKS.rakuten.bank} affiliateLabel="楽天銀行に口座開設する" />
      <CheckRow label="楽天保険" sub="楽天保険商品の申込でSPU対象" badge="+0.5%"
        checked={s.hasInsurance} onChange={v => set('hasInsurance', v)}
        affiliateUrl={AFFILIATE_LINKS.rakuten.insurance} affiliateLabel="楽天保険を見る" />
      <CheckRow label="楽天トラベル" sub="年1回以上の利用でSPU対象" badge="+1%"
        checked={s.hasTravel} onChange={v => set('hasTravel', v)}
        affiliateUrl={AFFILIATE_LINKS.rakuten.travel} affiliateLabel="楽天トラベルを見る" />
      <CheckRow label="楽天ビューティ" sub="月1回以上の利用でSPU対象" badge="+0.5%"
        checked={s.hasBeauty} onChange={v => set('hasBeauty', v)}
        affiliateUrl={AFFILIATE_LINKS.rakuten.beauty} affiliateLabel="楽天ビューティを見る" />
      <CheckRow label="楽天エナジー / 楽天ファッション" sub="いずれか利用でSPU対象" badge="+0.5%"
        checked={s.hasEnergyOrFashion} onChange={v => set('hasEnergyOrFashion', v)}
        affiliateUrl={AFFILIATE_LINKS.rakuten.energyFashion} affiliateLabel="楽天エナジーを見る" />

      <div className="text-[11px] font-extrabold text-gray-500 px-1 mt-1">── お買い物マラソン ──</div>
      <div className={`rounded-2xl border px-4 py-3 transition-all ${s.isMarathon ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
        <button onClick={() => set('isMarathon', !s.isMarathon)} className="flex items-center gap-3 w-full text-left">
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all
            ${s.isMarathon ? 'bg-red-500 border-red-500' : 'border-gray-300 bg-white'}`}>
            {s.isMarathon && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
          </div>
          <div className="flex-1">
            <span className="text-[13px] font-bold text-gray-800 block">お買い物マラソン / スーパーSALE中</span>
            <span className="text-[11px] text-gray-400">開催中のときにONにしてください</span>
          </div>
          <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full shrink-0
            ${s.isMarathon ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>最大+9%</span>
        </button>
        {s.isMarathon && (
          <div className="mt-3 pt-3 border-t border-red-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] font-bold text-gray-700">何店舗目？</span>
              <span className="text-[14px] font-black text-red-600">{s.marathonShops}店舗目 → +{Math.min(s.marathonShops - 1, 9)}%</span>
            </div>
            <input type="range" min={1} max={10} value={s.marathonShops}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('marathonShops', parseInt(e.target.value))}
              className="w-full accent-red-500" />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>1店舗（+0%）</span><span>10店舗（+9%）</span>
            </div>
          </div>
        )}
      </div>

      <FeaturedAffiliate mall="rakuten" />
    </div>
  );
}

// ─── Yahoo!タブ ───────────────────────────────────
function YahooTab({ s, settings, onChange, onOpenDisclaimer }: {
  s: YahooSettings; settings: PointSettings;
  onChange: (s: YahooSettings) => void;
  onOpenDisclaimer: () => void;
}) {
  const set = (key: keyof YahooSettings, val: boolean | string) => onChange({ ...s, [key]: val });
  const day5 = isYahoo5Day();
  const sunday = isSunday();
  const kanshaDay = isYahooKanshaDay();
  const today = new Date().getDate();
  const autoBonus = (day5 ? 4 : 0) + (sunday && s.hasLYPPremium ? 5 : 0) + (kanshaDay && s.isShoppingRankSilver ? 5 : 0);

  return (
    <div className="flex flex-col gap-3">
      <RateBanner mall="yahoo" settings={settings} />
      <p className="text-[11px] text-gray-400 font-medium px-1">支払い方法や会員サービスを設定すると実質価格に反映されます。</p>

      {/* 都道府県 */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[13px] font-black text-blue-700">📍 お住まいの都道府県</span>
          <span className="text-[10px] text-blue-400 font-medium">送料計算にのみ使用します</span>
        </div>
        <select
          value={s.prefecture}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set('prefecture', e.target.value)}
          className="w-full bg-white border border-blue-200 rounded-xl px-3 py-2 text-[13px] font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300">
          {PREFECTURES.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* 自動判定バナー */}
      {day5 && <DateBanner icon="📅" text={`今日は${today}日（5のつく日）！ +4% 自動加算中`} color="bg-red-50 text-red-600 border border-red-100" />}
      {sunday && s.hasLYPPremium && <DateBanner icon="🌟" text="今日は日曜日！プレミアムな日曜日 +5% 適用中" color="bg-purple-50 text-purple-600 border border-purple-100" />}
      {kanshaDay && s.isShoppingRankSilver && <DateBanner icon="🎉" text={`今日は${today}日（ヤフショ感謝デー）！+5% 適用中`} color="bg-blue-50 text-blue-600 border border-blue-100" />}
      {autoBonus > 0 && (
        <div className="bg-gradient-to-r from-red-500 to-pink-500 rounded-2xl px-4 py-2 text-white text-[12px] font-extrabold text-center shadow">
          🎯 今日の自動加算ボーナス合計: +{autoBonus}%
        </div>
      )}

      <div className="text-[11px] font-extrabold text-gray-500 px-1 mt-1">── 支払い方法 ──</div>
      <CheckRow label="PayPay / PayPayカードで払う" sub="PayPay残高・クレジット・PayPayカード" badge="+4%"
        checked={s.usesPayPay} onChange={v => set('usesPayPay', v)}
        affiliateUrl={AFFILIATE_LINKS.yahoo.payPayCard} affiliateLabel="PayPayカードを申し込む" />
      <CheckRow label="PayPayカード保有" sub="基本還元+1%（ゴールドと排他）" badge="+1%"
        checked={s.hasPayPayCard && !s.hasPayPayCardGold} onChange={v => set('hasPayPayCard', v)}
        affiliateUrl={AFFILIATE_LINKS.yahoo.payPayCard} affiliateLabel="PayPayカードを申し込む" />
      <CheckRow label="PayPayカードゴールド" sub="さらに+1%上乗せ" badge="+2%"
        checked={s.hasPayPayCardGold} onChange={v => { onChange({ ...s, hasPayPayCardGold: v, hasPayPayCard: v ? false : s.hasPayPayCard }); }}
        affiliateUrl={AFFILIATE_LINKS.yahoo.payPayCardGold} affiliateLabel="PayPayカードゴールドを見る" />
      <CheckRow label="PayPay銀行" sub="口座連携で還元率アップ" badge="+0.5%"
        checked={s.hasPayPayBank} onChange={v => set('hasPayPayBank', v)}
        affiliateUrl={AFFILIATE_LINKS.yahoo.payPayBank} affiliateLabel="PayPay銀行に口座開設する" />

      <div className="text-[11px] font-extrabold text-gray-500 px-1 mt-1">── 会員・回線サービス ──</div>
      <CheckRow label="LYPプレミアム会員" sub="月508円・常時+2%・日曜日+5%など" badge="+2%〜"
        checked={s.hasLYPPremium} onChange={v => set('hasLYPPremium', v)}
        affiliateUrl={AFFILIATE_LINKS.yahoo.lypPremium} affiliateLabel="LYPプレミアムを試してみる" />
      <CheckRow label="ソフトバンク回線ユーザー" sub="スーパーPayPayクーポンなど特別優遇" badge="+2%"
        checked={s.hasSoftbank} onChange={v => { onChange({ ...s, hasSoftbank: v, hasYmobile: v ? false : s.hasYmobile }); }}
        affiliateUrl={AFFILIATE_LINKS.yahoo.softbank} affiliateLabel="ソフトバンクを見る" />
      <CheckRow label="ワイモバイル回線ユーザー" sub="Enjoyパック特典あり" badge="+1%"
        checked={s.hasYmobile} onChange={v => { onChange({ ...s, hasYmobile: v, hasSoftbank: v ? false : s.hasSoftbank }); }}
        affiliateUrl={AFFILIATE_LINKS.yahoo.ymobile} affiliateLabel="ワイモバイルを見る" />
      <CheckRow label="ショッピングランク：シルバー以上" sub="11日・22日（ヤフショ感謝デー）対象" badge="+5%（感謝デー）"
        checked={s.isShoppingRankSilver} onChange={v => set('isShoppingRankSilver', v)} />

      <FeaturedAffiliate mall="yahoo" />

      {/* 規約ボタン（目立たない最下部） */}
      <button onClick={onOpenDisclaimer}
        className="mt-2 text-[11px] text-gray-300 hover:text-gray-400 underline text-center py-2 transition-colors">
        利用規約・免責事項
      </button>
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────
export function SettingsPage({ onClose, onSettingsChange, onOpenDisclaimer }: SettingsPageProps) {
  const [tab, setTab] = useState<Tab>('amazon');
  const [settings, setSettings] = useState<PointSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
    onSettingsChange(settings);
  }, [settings]);

  const updateAmazon  = (s: AmazonSettings)  => setSettings((prev: PointSettings) => ({ ...prev, amazon: s }));
  const updateRakuten = (s: RakutenSettings) => setSettings((prev: PointSettings) => ({ ...prev, rakuten: s }));
  const updateYahoo   = (s: YahooSettings)   => setSettings((prev: PointSettings) => ({ ...prev, yahoo: s }));

  const TABS = [
    { id: 'amazon'  as Tab, label: 'Amazon', emoji: '📦', activeColor: 'text-orange-600 bg-orange-50 border-orange-200' },
    { id: 'rakuten' as Tab, label: '楽天',   emoji: '🛍', activeColor: 'text-red-600 bg-red-50 border-red-200' },
    { id: 'yahoo'   as Tab, label: 'Yahoo!', emoji: '⭐', activeColor: 'text-red-700 bg-red-50 border-red-200' },
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-gray-50 flex flex-col">
      <div className="bg-gray-50/95 backdrop-blur-md shadow-sm sticky top-0 z-40 border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-3 py-2 flex items-center gap-2 h-[48px]">
          <button onClick={onClose} className="p-2 -ml-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-[16px] font-extrabold text-gray-900 tracking-tight flex-1">ポイント・特典の設定</h2>
          <span className="text-[11px] text-gray-400 font-medium">実質価格に自動反映</span>
        </div>
        <div className="max-w-2xl mx-auto px-3 pb-2 flex gap-1.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl border text-[12px] font-extrabold transition-all
                ${tab === t.id ? t.activeColor : 'border-gray-200 bg-white text-gray-500'}`}>
              <span>{t.emoji}</span><span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 max-w-2xl mx-auto w-full">
        {tab === 'amazon'  && <AmazonTab  s={settings.amazon}  settings={settings} onChange={updateAmazon} />}
        {tab === 'rakuten' && <RakutenTab s={settings.rakuten} settings={settings} onChange={updateRakuten} />}
        {tab === 'yahoo'   && <YahooTab   s={settings.yahoo}   settings={settings} onChange={updateYahoo} onOpenDisclaimer={onOpenDisclaimer} />}
      </div>
    </div>
  );
}