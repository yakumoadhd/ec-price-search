import React, { useState, useMemo } from 'react';
import { AffiliateItem } from '../types';
import { ResultCard } from './ResultCard';
import { DropdownFilter } from './DropdownFilter';
import { SearchInput } from './SearchInput';
import { ArrowLeft, ArrowUpDown, Heart, Settings } from 'lucide-react';
import { DisclaimerModal } from './DisclaimerModal';
import { SettingsPage } from './SettingsPage';
import { PointSettings } from '../pointSettings';

interface FavoritesListProps {
  favorites: AffiliateItem[];
  onToggleFavorite: (item: AffiliateItem) => void;
  onClose: () => void;
  query?: string;
  setQuery?: (q: string) => void;
  handleSearch?: (overrideQuery?: string) => void;
  favoriteNames?: string[];
  searchHistory?: string[];
  onSettingsChange?: (s: PointSettings) => void;
}

type SortMode = 'newest' | 'oldest';
type PriceSortMode = 'none' | 'effective' | 'unit';

export function FavoritesList({ 
  favorites, 
  onToggleFavorite, 
  onClose,
  query,
  setQuery,
  handleSearch,
  favoriteNames,
  searchHistory,
  onSettingsChange
}: FavoritesListProps) {
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [sortPriceMode, setSortPriceMode] = useState<'effective' | 'unit'>('effective');
  const [selectedCapacity, setSelectedCapacity] = useState<string | null>(null);
  const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const cycleSortMode = () => {
    if (sortMode === 'newest') setSortMode('oldest');
    else setSortMode('newest');
  };

  // Derive capacities for dropdown
  const capacities = useMemo(() => {
    const caps = new Set<string>();
    favorites.forEach(i => {
      const capKey = i.capacity || `${i.total_units}個/本`;
      caps.add(capKey);
    });
    return Array.from(caps).sort();
  }, [favorites]);

  const filteredAndSortedFavorites = useMemo(() => {
    let list = [...favorites];
    
    // Filter by localQuery (incremental search in favorites)
    if (localQuery) {
      const qLower = localQuery.toLowerCase().trim();
      list = list.filter(i => (i.raw_name || '').toLowerCase().includes(qLower));
    }
    
    // Reverse for 'newest' as the baseline is assumed to be 'oldest' = insertion order
    if (sortMode === 'newest') {
      list = list.reverse();
    }
    
    // Filter by capacity
    if (selectedCapacity) {
      list = list.filter(i => {
        const capKey = i.capacity || `${i.total_units}個/本`;
        return capKey === selectedCapacity;
      });
    }

    // Sort by price if overriding modes exist
    if (sortPriceMode !== 'none') {
      list.sort((a, b) => {
        if (sortPriceMode === 'unit') {
          const getFloat = (item: AffiliateItem) => {
            if (typeof item.unit_price === 'number') return item.unit_price;
            if (typeof item.unit_price === 'string') return parseFloat(item.unit_price);
            return parseFloat(`${item.unit_price.integer_part}.${item.unit_price.decimal_part}`);
          };
          return getFloat(a) - getFloat(b);
        } else {
          return a.effective_total - b.effective_total;
        }
      });
    }

    return list;
  }, [favorites, localQuery, sortMode, sortPriceMode, selectedCapacity]);

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col pt-safe">
      <div className="bg-gray-50/95 backdrop-blur-md pb-0 shadow-sm sticky top-0 z-40 flex justify-center w-full border-b border-gray-200">
        <section className="w-full max-w-2xl px-2 mt-2 flex flex-col gap-0 pb-1">
          <div className="flex items-center justify-between gap-2 h-[40px] w-full">
            <div className="flex items-center gap-1">
              <button 
                onClick={onClose}
                className="p-2 -ml-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                title="戻る"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-lg font-bold text-gray-900 tracking-tight shrink-0">お気に入り</h2>
            </div>
            
            <div className="flex items-center gap-1.5 h-full">
              {favorites.length > 0 && (
                <button 
                  onClick={cycleSortMode}
                  className="flex items-center justify-center h-[40px] aspect-square bg-white border border-gray-200/80 hover:bg-gray-100 rounded-2xl transition-all group shadow-sm"
                  title={sortMode === 'newest' ? '新しい順' : '古い順'}
                >
                  <ArrowUpDown className="w-5 h-5 text-gray-600 group-hover:text-gray-900" />
                </button>
              )}
              <button
                onClick={() => setShowSettings(true)}
                className="flex items-center justify-center h-[40px] aspect-square bg-white border border-gray-200/80 hover:bg-gray-100 rounded-2xl transition-all group shadow-sm"
                title="ポイント設定"
              >
                <Settings className="w-5 h-5 text-gray-600 group-hover:text-gray-900" />
              </button>
            </div>
          </div>

          {/* 検索窓の追加 */}
          <div className="flex items-center gap-2 h-[40px] w-full mt-2">
            <div className="flex-1 h-full">
              <SearchInput 
                query={localQuery} 
                onChange={e => setLocalQuery(e.target.value)} 
                onSearch={() => {}} 
                isLoading={false} 
                history={[]}
                favoriteNames={[]}
                placeholder="お気に入りから検索"
              />
            </div>
          </div>

          {favorites.length > 0 && capacities.length > 0 && (
            <div className="w-full h-[40px]">
              <DropdownFilter 
                options={capacities} 
                selectedValue={selectedCapacity} 
                onChange={setSelectedCapacity} 
              />
            </div>
          )}

          {favorites.length > 0 && (
            <div className="w-full h-[40px] flex gap-1 bg-gray-200/60 p-1 rounded-lg border border-gray-100 shadow-inner mt-2">
              <button 
                onClick={() => setSortPriceMode(prev => prev === 'effective' ? 'none' : 'effective')} 
                className={`flex-1 text-[13px] font-bold h-full rounded-md transition-all ${sortPriceMode === 'effective' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                実質価格 順
              </button>
              <button 
                onClick={() => setSortPriceMode(prev => prev === 'unit' ? 'none' : 'unit')} 
                className={`flex-1 text-[13px] font-bold h-full rounded-md transition-all ${sortPriceMode === 'unit' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                1個あたり 順
              </button>
            </div>
          )}
        </section>
      </div>
      
      <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-hide">
        {favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[50vh] text-gray-400 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center shadow-sm">
              <Heart className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm font-bold tracking-wide">お気に入りに保存された商品はありません</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto flex flex-col gap-3">
            {filteredAndSortedFavorites.map((item) => (
              <ResultCard 
                key={item.id} 
                item={item} 
                isFavorite={true} 
                onToggleFavorite={onToggleFavorite} 
                sortMode={sortPriceMode}
              />
            ))}
          </div>
        )}
      </div>
      {showSettings && (
        <SettingsPage
          onClose={() => setShowSettings(false)}
          onSettingsChange={s => { if (onSettingsChange) onSettingsChange(s); }}
          onOpenDisclaimer={() => { setShowSettings(false); setIsDisclaimerOpen(true); }}
        />
      )}
      <DisclaimerModal isOpen={isDisclaimerOpen} onClose={() => setIsDisclaimerOpen(false)} />
    </div>
  );
}