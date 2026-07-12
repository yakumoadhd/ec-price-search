import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AffiliateItem } from './types';
import { ResultCard } from './components/ResultCard';
import { SearchInput } from './components/SearchInput';
import { FavoritesList } from './components/FavoritesList';
import { DropdownFilter } from './components/DropdownFilter';
import { DisclaimerModal } from './components/DisclaimerModal';
import { SettingsPage } from './components/SettingsPage';
import GoogleLoginButton from './components/GoogleLoginButton';
import { PointSettings, loadSettings } from './pointSettings';
import { fetchSearXNG, SearXNGAllDownError } from './utils/searxngClient';
import { mergeSearXNGResults } from './utils/searxngMerger';
import { ArrowUpDown, Settings, Heart, Info } from 'lucide-react';

type SortMode = 'effective' | 'unit';
type AppView = 'main' | 'favorites' | 'settings';

export default function App() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AffiliateItem[]>([]);
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
  const [isGoogleLoggedIn, setIsGoogleLoggedIn] = useState(false);
  const accessTokenRef = useRef<string | null>(null);

  // LocalStorageからお気に入り・履歴を復元
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pr_favorites');
      if (saved) setFavorites(JSON.parse(saved));
      const hist = localStorage.getItem('pr_history');
      if (hist) setSearchHistory(JSON.parse(hist));
    } catch {}
  }, []);

  // お気に入りをLocalStorageに保存
  useEffect(() => {
    try {
      localStorage.setItem('pr_favorites', JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  const handleGoogleSuccess = (token: string) => {
    accessTokenRef.current = token;
    setIsGoogleLoggedIn(true);
  };

  const handleGoogleExpired = () => {
    accessTokenRef.current = null;
    setIsGoogleLoggedIn(false);
  };

  const handleToggleFavorite = useCallback((item: AffiliateItem) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.id === item.id);
      if (exists) return prev.filter(f => f.id !== item.id);
      return [...prev, { ...item }];
    });
  }, []);

  const handleSearch = useCallback(async (overrideQuery?: string) => {
    const searchQuery = (overrideQuery ?? query).trim();
    if (!searchQuery) return;

    setIsLoading(true);
    setError(null);
    setItems([]);
    setCapacityFilter(null);
    setCapacityOptions([]);

    // 検索履歴を更新
    setSearchHistory(prev => {
      const updated = [searchQuery, ...prev.filter(h => h !== searchQuery)].slice(0, 10);
      try { localStorage.setItem('pr_history', JSON.stringify(updated)); } catch {}
      return updated;
    });

    try {
      // ── 3並列検索: Yahoo / 楽天 / Amazon ──────────────
      const [yahooResult, rakutenResult, amazonResult] = await Promise.allSettled([
        fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        }).then(r => r.json()),
        fetch('/api/rakuten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        }).then(r => r.json()),
        fetch('/api/amazon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: searchQuery }),
        }).then(r => r.json()),
      ]);

      let allItems: AffiliateItem[] = [];

      if (yahooResult.status === 'fulfilled' && yahooResult.value?.items) {
        allItems = [...allItems, ...yahooResult.value.items];
      }
      if (rakutenResult.status === 'fulfilled' && rakutenResult.value?.items) {
        allItems = [...allItems, ...rakutenResult.value.items];
      }
      if (amazonResult.status === 'fulfilled' && amazonResult.value?.items) {
        allItems = [...allItems, ...amazonResult.value.items];
      }

      // IDが未設定の商品にIDを付与
      allItems = allItems.map((item, i) => ({
        ...item,
        id: item.id || `${item.mall}_${i}_${Date.now()}`,
      }));

      // ── 容量ラベル取得 (/api/gemini/capacities) ──────
      if (allItems.length > 0) {
        try {
          const capRes = await fetch('/api/gemini/capacities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: allItems.map(it => ({ rawName: it.raw_name, capacityMl: null })),
            }),
          });
          if (capRes.ok) {
            const capData = await capRes.json();
            if (capData.labels?.length === allItems.length) {
              allItems = allItems.map((item, i) => ({
                ...item,
                capacity: capData.labels[i] || undefined,
              }));
              const opts = [...new Set<string>(
                capData.labels.filter((l: string) => l && l !== '1個')
              )].sort();
              setCapacityOptions(opts);
            }
          }
        } catch {
          // 容量ラベルはnon-fatal
        }
      }

      // ── SearXNG マージ (Step 2-6) ─────────────────────
      try {
        const searxResult = await fetchSearXNG(searchQuery);
        const merged = mergeSearXNGResults(searxResult.data.results, allItems);
        allItems = [...allItems, ...merged.addedItems];
      } catch (e) {
        // SearXNG障害はnon-fatal
        if (!(e instanceof SearXNGAllDownError)) {
          console.warn('[SearXNG]', e);
        }
      }

      // ── effective_totalでソート → rankを付与 ─────────
      allItems.sort((a, b) => a.effective_total - b.effective_total);
      allItems = allItems.map((item, i) => ({ ...item, rank: i + 1 }));

      setItems(allItems);

      if (allItems.length === 0) {
        setError('商品が見つかりませんでした');
      }
    } catch (e: any) {
      setError(e.message || '検索に失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  // ── ソート済み・フィルター済みリスト ────────────────
  const sortedItems = [...items].sort((a, b) => {
    if (sortMode === 'unit') {
      const ua = typeof a.unit_price === 'number' ? a.unit_price : a.effective_total;
      const ub = typeof b.unit_price === 'number' ? b.unit_price : b.effective_total;
      return ua - ub;
    }
    return a.effective_total - b.effective_total;
  });

  const filteredItems = capacityFilter
    ? sortedItems.filter(item => item.capacity === capacityFilter)
    : sortedItems;

  const favoriteNames = favorites.map(f => f.raw_name);

  // ── お気に入りページ ─────────────────────────────────
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
      </>
    );
  }

  // ── 設定ページ ───────────────────────────────────────
  if (view === 'settings') {
    return (
      <>
        <SettingsPage
          onClose={() => setView('main')}
          onSettingsChange={setSettings}
          onOpenDisclaimer={() => setIsDisclaimerOpen(true)}
        />
        <DisclaimerModal isOpen={isDisclaimerOpen} onClose={() => setIsDisclaimerOpen(false)} />
      </>
    );
  }

  // ── メイン画面 ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm px-3 py-2">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          {/* アプリ名 */}
          <span className="text-sm font-bold text-gray-900 shrink-0 tracking-tight">
            PR
          </span>

          {/* 検索バー */}
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

          {/* Googleログイン */}
          <GoogleLoginButton
            onSuccess={handleGoogleSuccess}
            onExpired={handleGoogleExpired}
            isLoggedIn={isGoogleLoggedIn}
          />

          {/* お気に入りボタン */}
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

          {/* 設定ボタン */}
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

            <span className="text-xs text-gray-400 shrink-0">
              {filteredItems.length}件
            </span>
          </div>
        )}

        {/* ローディング */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <div className="w-7 h-7 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mb-3" />
            <span className="text-sm">検索中...</span>
          </div>
        )}

        {/* エラー */}
        {error && !isLoading && items.length === 0 && (
          <div className="text-center py-10 text-gray-500 text-sm">{error}</div>
        )}

        {/* 初期状態（未検索） */}
        {!isLoading && !error && items.length === 0 && (
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

        {/* 検索結果リスト */}
        {!isLoading && filteredItems.length > 0 && (
          <div className="space-y-2">
            {filteredItems.map(item => (
              <ResultCard
                key={item.id}
                item={item}
                isFavorite={favorites.some(f => f.id === item.id)}
                onToggleFavorite={handleToggleFavorite}
                sortMode={sortMode}
              />
            ))}
          </div>
        )}
      </main>

      {/* 免責事項モーダル */}
      <DisclaimerModal
        isOpen={isDisclaimerOpen}
        onClose={() => setIsDisclaimerOpen(false)}
      />
    </div>
  );
}
