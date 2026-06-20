import React, { useState, useRef, useEffect } from 'react';
import { Search, History, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SearchInputProps {
  query: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearch: (overrideQuery?: string) => void;
  isLoading: boolean;
  history: string[];
  favoriteNames: string[];
  placeholder?: string;
}

export function SearchInput({ query, onChange, onSearch, isLoading, history, favoriteNames, placeholder = "商品名を入力" }: SearchInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch();
      setIsFocused(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (val: string) => {
    onSearch(val);
    setIsFocused(false);
  };

  const showDropdown = isFocused && (history.length > 0 || favoriteNames.length > 0);

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full h-full relative"
      ref={containerRef}
    >
      <div className="relative flex items-center bg-white rounded-2xl border border-gray-200/80 p-1.5 shadow-sm hover:shadow-md transition-shadow duration-300 pl-4 h-full relative z-20">
        <input
          type="text"
          value={query}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder}
          className="w-full h-full bg-transparent text-gray-900 placeholder-gray-400 text-base font-medium outline-none"
          autoComplete="off"
        />
        <button
          onClick={() => { onSearch(); setIsFocused(false); }}
          disabled={isLoading || !query.trim()}
          className={`h-full aspect-square ml-1 rounded-xl transition-all flex items-center justify-center ${
            !query.trim() ? 'text-gray-400 hover:text-gray-500' : 'text-gray-900 hover:text-black active:scale-95 bg-gray-100 hover:bg-gray-200'
          }`}
          aria-label="検索"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Search className="w-5 h-5" />
          )}
        </button>
      </div>

      <AnimatePresence>
        {showDropdown && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute top-[calc(100%+8px)] left-0 w-full bg-white border border-gray-200 shadow-lg rounded-2xl overflow-hidden z-50 flex flex-col pt-1 pb-1 max-h-[60vh] overflow-y-auto"
          >
            {history.length > 0 && (
              <div className="flex flex-col">
                <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  検索履歴
                </div>
                {history.map((h, i) => (
                  <button
                    key={`hist-${i}`}
                    onClick={() => handleSelect(h)}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors w-full"
                  >
                    <History className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-[13px] text-gray-700 font-medium truncate flex-1">{h}</span>
                  </button>
                ))}
              </div>
            )}
            
            {history.length > 0 && favoriteNames.length > 0 && (
               <div className="h-px bg-gray-100 my-1 mx-2" />
            )}

            {favoriteNames.length > 0 && (
              <div className="flex flex-col">
                <div className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  お気に入り
                </div>
                {favoriteNames.map((f, i) => (
                  <button
                    key={`fav-${i}`}
                    onClick={() => handleSelect(f)}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors w-full"
                  >
                    <Heart className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-[13px] text-gray-700 font-medium truncate flex-1">{f}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
