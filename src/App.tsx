import React, { useState, useCallback, useMemo, useRef } from 'react';
import { SearchInput } from './components/SearchInput';
import { ResultCard } from './components/ResultCard';
import { FavoritesList } from './components/FavoritesList';
import { SettingsPage } from './components/SettingsPage';
import { DisclaimerModal } from './components/DisclaimerModal';
import GoogleLoginButton from './components/GoogleLoginButton';
import { DropdownFilter } from './components/DropdownFilter';
import { AffiliateItem } from './types';
import { PointSettings, loadSettings } from './pointSettings';
import { Settings, Heart } from 'lucide-react';

const MAX_HISTORY = 20;

type SortMode = 'effective' | 'unit';
type View = 'search' | 'favorites';

function loadHistory(): string[] {
  try { return JSON.parse(localStorage.getItem('search_history') || '[]'); }
  catch { return []; }
}
function saveHistory(h: string[]) {
  try { localStorage.setItem('search_history', JSON.stringify(h)); } catch {}
}
function loadFavorites(): AffiliateItem[] {
  try { return JSON.parse(localStorage.getItem('favorites') || '[]'); }
  catch { return []; }
}
function saveFavorites(favs: AffiliateItem[]) {
  try { localStorage.setItem('favorites', JSON.stringify(favs)); } catch {}
}

export default function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AffiliateItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('effective');
  const [selectedCapacity, setSelectedCapacity] = useState<string | null>(null);
  const [view, setView] = useState<View>('search');
  const [favorites, setFavorites] = useState<AffiliateItem[]>(loadFavorites);
  const [searchHistory, setSearchHistory] = useState<string[]>(loadHistory);
  const [settings, setSettings] = useState<PointSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const accessTokenRef = useRef<string | null>(null);

  // ── Google OAuth ──────────────────────────────────
  const handleLoginSuccess = useCallback((token: string) => {
    accessTokenRef.current = token;
    setIsLoggedIn(true);
  }, []);

  const handleLoginExpired = useCallback(() => {
    accessTokenRef.current = null;
    setIsLoggedIn(false);
  }, []);

  // ── お気に入り ────────────────────────────────────
  const handleToggleFavorite = useCallback((item: AffiliateItem) => {
    setFavorites(prev => {
      const exists = prev.some(f => f.id === item.id);
      const next = exists ? prev.filter(f => f.id !== item.id) : [...prev, item];
      saveFavorites(next);
      return next;
    });
  }, []);

  const favoriteIds = useMemo(() => new Set(favorites.map(f => f.id)), [favorites]);
  const favoriteNames = useMemo(() =>
    [...new Set(favorites.map(f => f.raw_name || '').filter(Boolean))],
    [favorites]
  );

  // ── 検索 ─────────────────────────────────────────
  const handleSearch = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;

    setIsLoading(true);
    setError(null);
    setResults([]);
    setSelectedCapacity(null);

    if (overrideQuery !== undefined) setQuery(overrideQuery);

    setSearchHistory(prev => {
      const next = [q, ...prev.filter(h => h !== q)].slice(0, MAX_HISTORY);
      saveHistory(next);
      return next;
    });

    try {
      // ✅ Yahoo・楽天・Amazonを並列で同時取得
      const [yahooResult, rakutenResult, amazonResult] = await Promise.allSettled([
        fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }),
        fetch('/api/rakuten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }),
        fetch('/api/amazon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        }),
      ]);

      const allItems: AffiliateItem[] = [];

      // Yahoo結果をマージ
      if (yahooResult.status === 'fulfilled' && yahooResult.value.ok) {
        const data = await yahooResult.value.json();
        allItems.push(...(data.items || data.results || []) as AffiliateItem[]);
      }

      // 楽天結果をマージ
      if (rakutenResult.status === 'fulfilled' && rakutenResult.value.ok) {
        const data = await rakutenResult.value.json();
        allItems.push(...(data.items || []) as AffiliateItem[]);
      }

      // Amazon結果をマージ
      if (amazonResult.status === 'fulfilled' && amazonResult.value.ok) {
        const data = await amazonResult.value.json();
        allItems.push(...(data.items || []) as AffiliateItem[]);
      }

      setResults(allItems);
      if (allItems.length === 0) {
        setError('検索結果が見つかりませんでした。別のキーワードを試してください。');
      }
    } catch {
      setError('検索中にエラーが発生しました。しばらくしてから再試行してください。');
    } finally {
      setIsLoading(false);
    }
  }, [query]);

  // ── ソート・フィルター ─────────────────────────────
  const capacities = useMemo(() => {
    const caps = new Set<string>();
    results.forEach(item => {
      const capKey = item.capacity || (item.total_units ? `${item.total_units}個/本` : null);
      if (capKey) caps.add(capKey);
    });
    return Array.from(caps).sort();
  }, [results]);

  const sortedResults = useMemo(() => {
    let list = [...results];

    if (selectedCapacity) {
      list = list.filter(item => {
        const capKey = item.capacity || (item.total_units ? `${item.total_units}個/本` : null);
        return capKey === selectedCapacity;
      });
    }

    list.sort((a, b) => {
      if (sortMode === 'unit') {
        const getUnit = (item: AffiliateItem): number => {
          if (typeof item.unit_price === 'number') return item.unit_price;
          if (typeof item.unit_price === 'string') return parseFloat(item.unit_price) || 0;
          if (item.unit_price && typeof item.unit_price === 'object') {
            return parseFloat(`${item.unit_price.integer_part}.${item.unit_price.decimal_part}`) || 0;
          }
          return 0;
        };
        return getUnit(a) - getUnit(b);
      }
      return (a.effective_total || 0) - (b.effective_total || 0);
    });

    return list;
  }, [results, sortMode, selectedCapacity]);

  // ── Settings ──────────────────────────────────────
  const handleSettingsChange = useCallback((s: PointSettings) => {
    setSettings(s);
  }, []);

  // ── お気に入りビュー ──────────────────────────────
  if (view === 'favorites') {
    return (
      <FavoritesList
        favorites={favorites}
        onToggleFavorite={handleToggleFavorite}
        onClose={() => setView('search')}
        query={query}
        setQuery={setQuery}
        handleSearch={handleSearch}
        favoriteNames={favoriteNames}
        searchHistory={searchHistory}
        onSettingsChange={handleSettingsChange}
      />
    );
  }

  // ── メインビュー ──────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-gray-50/95 backdrop-blur-md sticky top-0 z-40 border-b border-gray-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-3 py-2 flex flex-col gap-2">

          {/* 1行目 */}
          <div className="flex items-center gap-2 h-[40px]">
            <h1 className="text-[17px] font-black text-gray-900 tracking-tight shrink-0">
              💰 Price Ranking
            </h1>
            <div className="flex-1" />

            <GoogleLoginButton
              onSuccess={handleLoginSuccess}
              onExpired={handleLoginExpired}
              isLoggedIn={isLoggedIn}
            />

            <button
              onClick={() => setView('favorites')}
              className="relative flex items-center justify-center h-[36px] aspect-square bg-white border border-gray-200 hover:bg-gray-100 rounded-2xl transition-all shadow-sm"
              title="お気に入り"
            >
              <Heart className="w-5 h-5 text-red-400" />
              {favorites.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {favorites.length > 99 ? '99+' : favorites.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center justify-center h-[36px] aspect-square bg-white border border-gray-200 hover:bg-gray-100 rounded-2xl transition-all shadow-sm"
              title="ポイント設定"
            >
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* 2行目：検索窓 */}
          <div className="h-[44px] w-full">
            <SearchInput
              query={query}
              onChange={e => setQuery(e.target.value)}
              onSearch={handleSearch}
              isLoading={isLoading}
              history={searchHistory}
              favoriteNames={favoriteNames}
            />
          </div>

          {/* 3行目：フィルター + ソート */}
          {results.length > 0 && (
            <div className="flex items-center gap-2 h-[36px]">
              {capacities.length > 0 && (
                <div className="flex-1 h-full">
                  <DropdownFilter
                    options={capacities}
                    selectedValue={selectedCapacity}
                    onChange={setSelectedCapacity}
                  />
                </div>
              )}
              <div className="flex gap-1 bg-gray-200/60 p-1 rounded-lg border border-gray-100 shadow-inner h-full shrink-0">
                <button
                  onClick={() => setSortMode('effective')}
                  className={`px-3 text-[11px] font-bold h-full rounded-md transition-all ${
                    sortMode === 'effective' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  実質価格
                </button>
                <button
                  onClick={() => setSortMode('unit')}
                  className={`px-3 text-[11px] font-bold h-full rounded-md transition-all ${
                    sortMode === 'unit' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                  }`}
                >
                  1個あたり
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="flex-1 px-3 py-4 max-w-2xl mx-auto w-full">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-gray-500">最安値を検索中…</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <span className="text-4xl">😕</span>
            <p className="text-sm font-bold text-center">{error}</p>
          </div>
        )}

        {!isLoading && !error && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
            <span className="text-5xl">🔍</span>
            <p className="text-sm font-bold">商品名を入力して検索してください</p>
            <p className="text-[11px] text-gray-300 text-center">
              Amazon・楽天・Yahoo!・ヨドバシを<br />一気に比較できます
            </p>
          </div>
        )}

        {!isLoading && sortedResults.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-gray-400 font-medium px-1">
              {sortedResults.length}件
              {selectedCapacity && (
                <span className="ml-1 text-blue-500">（{selectedCapacity}）</span>
              )}
            </p>
            {sortedResults.map(item => (
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
      </main>

      {showSettings && (
        <SettingsPage
          onClose={() => setShowSettings(false)}
          onSettingsChange={handleSettingsChange}
          onOpenDisclaimer={() => {
            setShowSettings(false);
            setIsDisclaimerOpen(true);
          }}
        />
      )}

      <DisclaimerModal
        isOpen={isDisclaimerOpen}
        onClose={() => setIsDisclaimerOpen(false)}
      />
    </div>
  );
}
