import React, { useState, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { AffiliateItem } from './types';
import { ResultCard } from './components/ResultCard';
import { SearchInput } from './components/SearchInput';
import { FavoritesList } from './components/FavoritesList';
import { DropdownFilter } from './components/DropdownFilter';
import { DisclaimerModal } from './components/DisclaimerModal';
import { SettingsPage } from './components/SettingsPage';
import { PointSettings, loadSettings } from './pointSettings';
import { ArrowUpDown, Settings, Heart, Info } from 'lucide-react';

type SortMode = 'effective' | 'unit';
type AppView = 'main' | 'favorites' | 'settings';

function formatCapacity(ml: number | null | undefined): string | undefined {
  if (!ml || ml <= 0) return undefined;
  if (ml >= 1000 && ml % 1000 === 0) return `${ml / 1000}L`;
  if (ml >= 1000) return `${(ml / 1000).toFixed(1)}L`;
  return `${Math.round(ml)}ml`;
}

interface DebugSnapshot {
  ts: string;
  requestUrl: string;
  status: number;
  contentType: string;
  rawPreview: string;
}

export default function App() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AffiliateItem[]>([]);
  const [amazonResult, setAmazonResult] = useState<AffiliateItem | null>(null);
  const [yodobashiResult, setYodobashiResult] = useState<AffiliateItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('effective');
  const [capacityFilter, setCapacityFilter] = useState<string | null>(null);
  const [capacityOptions, setCapacityOptions] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<AffiliateItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [view, setView] = useState<AppView>('main');
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
  const [settings, setSettings] = useState<PointSettings>(loadSettings());

  // ── デバッグ機能（常時表示）──
  const [showDebugDetail, setShowDebugDetail] = useState(false);
  const [debugSnapshot, setDebugSnapshot] = useState<DebugSnapshot | null>(null);
  const [debugApiData, setDebugApiData] = useState<any>(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const fetchDebugData = useCallback(async () => {
    setDebugLoading(true);
    try {
      const r = await fetch('/api/debug', { signal: AbortSignal.timeout(15000) });
      const data = await r.json();
      setDebugApiData(data);
    } catch (e: any) {
      setDebugApiData({ error: e.message });
    } finally {
      setDebugLoading(false);
    }
  }, []);

  const handleToggleFavorite = useCallback((item: AffiliateItem) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.id === item.id);
      return exists ? prev.filter(f => f.id !== item.id) : [...prev, { ...item }];
    });
  }, []);

  const handleSearch = useCallback(async (overrideQuery?: string) => {
    const searchQuery = (overrideQuery ?? query).trim();
    if (!searchQuery) return;

    setIsLoading(true);
    setError(null);
    setItems([]);
    setAmazonResult(null);
    setYodobashiResult(null);
    setCapacityFilter(null);
    setCapacityOptions([]);

    setSearchHistory(prev =>
      [searchQuery, ...prev.filter(h => h !== searchQuery)].slice(0, 10)
    );

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery)}`,
        { signal: AbortSignal.timeout(30000) }
      );

      if (!response.ok) {
        const ct = response.headers.get('content-type') || '(不明)';
        let raw = '(読み取り不可)';
        try { raw = await response.text(); } catch {}
        setDebugSnapshot({
          ts: new Date().toISOString(),
          requestUrl: `/api/search?q=${encodeURIComponent(searchQuery)}`,
          status: response.status,
          contentType: ct,
          rawPreview: raw.slice(0, 300),
        });
        throw new Error(`検索エラー: ${response.status}`);
      }

      const data = await response.json();

      const allItems: AffiliateItem[] = (data.items || []).map(
        (item: any, i: number) => ({
          ...item,
          id: item.id || `${item.mall}_${i}_${Date.now()}`,
          capacity: formatCapacity(item.capacity_ml),
        })
      );

      const caps = allItems.map(it => it.capacity).filter((c): c is string => !!c);
      const uniqueCaps = [...new Set(caps)].sort();
      setCapacityOptions(uniqueCaps);
      setItems(allItems);

      if (data.amazon) {
        setAmazonResult({
          id: `amazon_searxng_${Date.now()}`,
          rank: 0,
          mall: 'amazon',
          raw_name: data.amazon.raw_name || `Amazon: ${searchQuery}`,
          price: data.amazon.price || 0,
          shipping_fee: 0,
          point: 0,
          coupon_discount: 0,
          effective_total: data.amazon.price || 0,
          total_units: 1,
          unit_price: data.amazon.price || 0,
          affiliate_url: data.amazon.affiliate_url,
          image_url: '',
        });
      }

      if (data.yodobashi) {
        setYodobashiResult({
          id: `yodobashi_${Date.now()}`,
          rank: 0,
          mall: 'yodobashi',
          raw_name: data.yodobashi.raw_name || `ヨドバシ: ${searchQuery}`,
          price: 0,
          shipping_fee: 0,
          point: 0,
          coupon_discount: 0,
          effective_total: 0,
          total_units: 1,
          unit_price: 0,
          affiliate_url: data.yodobashi.affiliate_url,
          image_url: '',
          price_unconfirmed: true,
        } as any);
      }

      if (allItems.length === 0 && !data.amazon) {
        setError('商品が見つかりませんでした');
      }
    } catch (e: any) {
      Sentry.captureException(e, { extra: { query: searchQuery } });
      setError(e.message || '検索に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  const sortedItems = [...items].sort((a, b) => {
    if (sortMode === 'unit') {
      const getUnit = (x: AffiliateItem) => {
        if (typeof x.unit_price === 'number') return x.unit_price;
        if (x.unit_price && typeof x.unit_price === 'object') {
          const u = x.unit_price as any;
          return parseInt(u.integer_part || '0') + parseInt(u.decimal_part || '0') / 100;
        }
        return x.effective_total;
      };
      return getUnit(a) - getUnit(b);
    }
    return a.effective_total - b.effective_total;
  });

  const filteredItems = capacityFilter
    ? sortedItems.filter(item => item.capacity === capacityFilter)
    : sortedItems;

  const favoriteIds = new Set(favorites.map(f => f.id));
  const favoriteNames = favorites.map(f => f.raw_name);

  // ── 常時表示デバッグバー（画面下部固定）──
  const DebugBar = (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-950 border-t border-green-900">

      {/* 展開パネル */}
      {showDebugDetail && (
        <div className="max-h-72 overflow-auto p-3 space-y-3 font-mono text-[10px]">

          <section>
            <p className="text-yellow-400 font-bold mb-1">▼ Last Error Snapshot</p>
            {debugSnapshot ? (
              <div className="bg-gray-900 rounded p-2 space-y-0.5">
                <p className="text-gray-400">🕐 {debugSnapshot.ts}</p>
                <p className="text-gray-300 break-all">📡 {debugSnapshot.requestUrl}</p>
                <p className={debugSnapshot.status >= 500 ? 'text-red-400' : 'text-orange-400'}>
                  📊 HTTP {debugSnapshot.status}
                </p>
                <p className="text-gray-300">📄 {debugSnapshot.contentType}</p>
                <p className="text-yellow-300 whitespace-pre-wrap break-all mt-1">
                  {debugSnapshot.rawPreview}
                </p>
              </div>
            ) : (
              <p className="text-gray-600">エラーなし（検索成功中 or 未実行）</p>
            )}
          </section>

          <section>
            <p className="text-green-400 font-bold mb-1">▼ Backend診断 (/api/debug)</p>
            {debugApiData ? (
              <pre className="bg-gray-900 rounded p-2 text-gray-300 whitespace-pre-wrap break-all">
                {JSON.stringify(debugApiData, null, 2)}
              </pre>
            ) : (
              <p className="text-gray-600">「診断」を押してください</p>
            )}
          </section>

        </div>
      )}

      {/* 常時表示バー本体 */}
      <div className="px-3 py-1.5 flex items-center gap-2">
        <span className="text-green-400 font-mono text-[10px] font-bold shrink-0">🐛</span>

        {debugSnapshot ? (
          <span className={`font-mono text-[10px] shrink-0 font-bold ${
            debugSnapshot.status >= 500 ? 'text-red-400' : 'text-orange-400'
          }`}>
            HTTP {debugSnapshot.status}
          </span>
        ) : (
          <span className="font-mono text-[10px] text-green-600 shrink-0 font-bold">OK</span>
        )}

        <span className="font-mono text-[10px] text-gray-500 truncate flex-1 min-w-0">
          {debugSnapshot ? debugSnapshot.contentType : 'エラーなし'}
        </span>

        <button
          onClick={() => {
            const next = !showDebugDetail;
            setShowDebugDetail(next);
            if (next) fetchDebugData();
          }}
          className="text-[10px] text-green-400 underline shrink-0 active:opacity-60"
        >
          {showDebugDetail ? '▼閉じる' : '▶詳細'}
        </button>

        <button
          onClick={fetchDebugData}
          disabled={debugLoading}
          className="text-[10px] text-blue-400 underline shrink-0 active:opacity-60 disabled:opacity-40"
        >
          {debugLoading ? '...' : '診断'}
        </button>
      </div>
    </div>
  );

  // ── お気に入りページ ──
  if (view === 'favorites') {
    return (
      <>
        <FavoritesList
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          onClose={() => setView('main')}
          query={query}
          setQuery={setQuery}
          handleSearch={handleSearch}
          favoriteNames={favoriteNames}
          searchHistory={searchHistory}
          onSettingsChange={setSettings}
        />
        <DisclaimerModal isOpen={isDisclaimerOpen} onClose={() => setIsDisclaimerOpen(false)} />
        {DebugBar}
      </>
    );
  }

  // ── 設定ページ ──
  if (view === 'settings') {
    return (
      <>
        <SettingsPage
          onClose={() => setView('main')}
          onSettingsChange={setSettings}
          onOpenDisclaimer={() => setIsDisclaimerOpen(true)}
        />
        <DisclaimerModal isOpen={isDisclaimerOpen} onClose={() => setIsDisclaimerOpen(false)} />
        {DebugBar}
      </>
    );
  }

  // ── メイン画面 ──
  return (
    <div className="min-h-screen bg-gray-50 pb-8">

      {/* ヘッダー */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm px-3 py-2">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <span className="text-sm font-bold text-gray-900 shrink-0 tracking-tight select-none">PR</span>
          <div className="flex-1 h-9">
            <SearchInput
              query={query}
              onChange={e => setQuery(e.target.value)}
              onSearch={handleSearch}
              isLoading={isLoading}
              history={searchHistory}
              favoriteNames={favoriteNames}
              placeholder="商品名を入力"
            />
          </div>
          <button
            onClick={() => setView('favorites')}
            className="relative p-1.5 text-gray-500 hover:text-red-500 transition-colors shrink-0"
            aria-label="お気に入り"
          >
            <Heart className="w-5 h-5" />
            {favorites.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {favorites.length > 9 ? '9+' : favorites.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setView('settings')}
            className="p-1.5 text-gray-500 hover:text-gray-900 transition-colors shrink-0"
            aria-label="設定"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-2xl mx-auto px-3 py-3">

        {/* ソート・フィルターバー */}
        {items.length > 0 && !isLoading && (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setSortMode(m => m === 'effective' ? 'unit' : 'effective')}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm shrink-0"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortMode === 'effective' ? '実質価格順' : '単価順'}
            </button>
            {capacityOptions.length > 0 && (
              <div className="h-8 flex-1 min-w-0">
                <DropdownFilter
                  options={capacityOptions}
                  selectedValue={capacityFilter}
                  onChange={val => setCapacityFilter(val || null)}
                />
              </div>
            )}
            <span className="text-xs text-gray-400 shrink-0">{filteredItems.length}件</span>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-3" />
            <span className="text-sm">検索中...</span>
          </div>
        )}

        {error && !isLoading && items.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        )}

        {!isLoading && !error && items.length === 0 && !amazonResult && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-300 select-none">
            <div className="text-5xl mb-4">🛒</div>
            <p className="text-sm text-gray-400">商品名を入力して検索</p>
            <button
              onClick={() => setIsDisclaimerOpen(true)}
              className="mt-8 flex items-center gap-1 text-xs text-gray-300 hover:text-gray-500 transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
              免責事項
            </button>
          </div>
        )}

        {!isLoading && filteredItems.length > 0 && (
          <div className="space-y-2">
            {filteredItems.map(item => (
              <ResultCard
                key={item.id}
                item={item}
                isFavorite={favoriteIds.has(item.id)}
                onToggleFavorite={handleToggleFavorite}
                sortMode={sortMode}
              />
            ))}
          </div>
        )}

        {!isLoading && amazonResult && (
          <div className="mt-3">
            <ResultCard
              key={amazonResult.id}
              item={amazonResult}
              isFavorite={favoriteIds.has(amazonResult.id)}
              onToggleFavorite={handleToggleFavorite}
              sortMode={sortMode}
            />
          </div>
        )}

        {!isLoading && yodobashiResult && (
          <div className="mt-3">
            <a
              href={yodobashiResult.affiliate_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-[#DA4327] flex items-center justify-center shrink-0">
                <span className="text-white text-[11px] font-bold scale-110">ヨ</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">ヨドバシドットコム</p>
                <p className="text-[10px] text-gray-400 mt-0.5">価格は要確認 → ヨドバシで検索する</p>
              </div>
              <span className="text-[10px] bg-orange-100 text-orange-600 font-bold px-2 py-0.5 rounded-full shrink-0">
                要確認
              </span>
            </a>
          </div>
        )}

      </main>

      <DisclaimerModal isOpen={isDisclaimerOpen} onClose={() => setIsDisclaimerOpen(false)} />
      {DebugBar}
    </div>
  );
}
