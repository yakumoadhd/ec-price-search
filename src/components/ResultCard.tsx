import React from 'react';
import { AffiliateItem, parseUnitPrice } from '../types';
import { Heart } from 'lucide-react';

interface ResultCardProps {
  key?: string | number;
  item: AffiliateItem;
  isFavorite: boolean;
  onToggleFavorite: (item: AffiliateItem) => void;
  sortMode?: 'effective' | 'unit';
}

export function ResultCard({ item, isFavorite, onToggleFavorite, sortMode = 'effective' }: ResultCardProps) {
  const { integer, decimal } = parseUnitPrice(item.unit_price);

  // ──────────────────────────────────────────────
  // モール別テキストアイコン
  // 仕様書 PART3「テキストアイコン仕様」準拠
  // ──────────────────────────────────────────────
  const getMallIcon = (mall: string) => {
    const baseClasses = "w-full h-full rounded-md flex items-center justify-center font-bold";

    switch (mall.toLowerCase()) {
      case 'amazon':
        return (
          <div className={`${baseClasses} bg-[#FF9900] text-white`}>
            <span className="text-[9px] leading-none">A</span>
          </div>
        );
      case 'rakuten':
        return (
          <div className={`${baseClasses} bg-white text-[#BF0000] border border-[#BF0000]/20`}>
            <span className="text-[9px] leading-none">R</span>
          </div>
        );
      case 'yahoo':
        return (
          <div className={`${baseClasses} bg-[#FF6400] text-white`}>
            <span className="text-[8px] leading-none">Y!</span>
          </div>
        );
      case 'yodobashi':
        // ★ ヨドバシ：小文字「y」は大文字（A/R）と並ぶと小さく・上ズレして
        //   見えるため、scale拡大 + わずかな下方向シフトで視覚的に揃える
        return (
          <div className={`${baseClasses} bg-[#D4AF37] text-white`}>
            <span className="text-[9px] leading-none font-bold scale-110 translate-y-[0.5px]">y</span>
          </div>
        );
      default:
        return (
          <div className={`${baseClasses} bg-gray-400 text-white`}>
            <span className="text-[9px] leading-none uppercase">{mall.substring(0, 1)}</span>
          </div>
        );
    }
  };

  return (
    <a 
      href={item.affiliate_url}
      target="_blank"
      rel="noopener noreferrer"
      className="relative group overflow-hidden bg-white hover:bg-gray-50/50 border border-gray-200 shadow-sm hover:shadow-md rounded-[20px] p-2.5 transition-all duration-300 flex items-stretch gap-3 cursor-pointer block select-none"
    >
      {/* Favorite Button (Absolute Top Right Corner) */}
      <div className="absolute top-2.5 right-2.5 z-20 pointer-events-auto">
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFavorite(item); }}
          className="w-[28px] h-[28px] bg-white border border-gray-200 shadow-sm rounded-full flex items-center justify-center text-red-500 hover:bg-gray-50 transition-all hover:scale-105 active:scale-95"
          aria-label="お気に入り"
        >
          {isFavorite ? <Heart className="w-[17px] h-[17px] fill-red-500 mt-[1px]" /> : <Heart className="w-[17px] h-[17px] mt-[1px]" />}
        </button>
      </div>

      {/* Left Column: Image Area */}
      <div className="w-[84px] shrink-0 relative flex flex-col items-stretch">
        <div className="w-full h-full min-h-[90px] bg-white border border-gray-100 shadow-sm rounded-[14px] overflow-hidden relative flex items-center justify-center">
          {item.image_url ? (
            <img src={item.image_url} alt="商品画像" className="w-full h-full object-cover mix-blend-multiply" />
          ) : (
            <div className="text-gray-300 text-[10px] text-center font-medium">No<br/>Image</div>
          )}
        </div>
      </div>

      {/* Right Column: Info */}
      <div className="flex-1 flex flex-col justify-between py-0.5 relative z-10">
        
        <div className="flex flex-col gap-1 items-start">
          {/* Title */}
          <h3 className="text-gray-900 text-[13px] font-medium leading-[1.3] line-clamp-2 w-full mt-0.5 relative pr-7" title={item.raw_name || '商品名不明'}>
            <span className="inline-block w-[14px] h-[14px] align-text-bottom mr-1 bg-white overflow-hidden shrink-0 relative top-[1px]">
               {getMallIcon(item.mall)}
            </span>
            {item.raw_name || '商品名不明'}
          </h3>
          
          {item.capacity && (
            <span className="inline-flex items-center bg-blue-50 text-blue-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded border border-blue-100">
              {item.capacity}
            </span>
          )}
        </div>

        <div className="h-px w-full bg-gray-200 shrink-0 my-1" />

        <div className="flex flex-col">
          {/* Price block */}
          <div className="flex items-stretch w-full h-[34px] gap-1.5">
            <div className="flex-[3] flex flex-col justify-between items-start min-w-0" style={{ containerType: 'inline-size' as any }}>
              <span className="text-[9px] font-bold text-gray-400 leading-none pt-[1px] whitespace-nowrap">実質価格</span>
              <div className="flex items-baseline pb-[1px] w-full">
                <span 
                  className={`font-black leading-none truncate ${sortMode === 'effective' ? 'tracking-tighter text-red-600' : 'tracking-tight text-gray-800'}`}
                  style={{ fontSize: `min(${sortMode === 'effective' ? 20 : 16}px, ${100 / ((item.effective_total.toLocaleString().length + 1) * 0.6)}cqi)` }}
                >
                  {item.effective_total.toLocaleString()}
                </span>
                <span className={`font-bold leading-none ml-[1px] shrink-0 ${sortMode === 'effective' ? 'text-[10px] text-red-500' : 'text-[9px] text-gray-500'}`}>
                  円
                </span>
              </div>
            </div>

            <div className="w-px bg-gray-200 shrink-0 my-[3px]" />

            <div className="flex-[2] flex flex-col justify-between items-start min-w-0" style={{ containerType: 'inline-size' as any }}>
              <span className="text-[9px] font-bold text-gray-400 leading-none pt-[1px] whitespace-nowrap">1個あたり</span>
              <div className="flex items-baseline pb-[1px] w-full">
                <span 
                  className={`leading-none truncate ${sortMode === 'unit' ? 'font-black tracking-tighter text-red-600' : 'font-bold tracking-tight text-gray-800'}`}
                  style={{ fontSize: `min(${sortMode === 'unit' ? 20 : 16}px, ${100 / ((integer.length + 4) * 0.55)}cqi)` }}
                >
                  {integer}
                </span>
                <span className={`font-bold leading-none shrink-0 ${sortMode === 'unit' ? 'text-[10px] text-red-600' : 'text-[9px] text-gray-800'}`}>
                  .{decimal}
                </span>
                <span className={`leading-none ml-[1px] shrink-0 font-medium ${sortMode === 'unit' ? 'text-[10px] text-red-500' : 'text-[9px] text-gray-500'}`}>
                  円
                </span>
              </div>
            </div>

            <div className="flex-[2] h-full min-w-0">
              <div 
                className="bg-red-500 text-white text-[9px] font-bold rounded flex items-center justify-evenly shadow-sm h-full w-full"
              >
                <div className="flex flex-col items-start justify-center">
                  <span className="leading-none mb-[2px]">詳細は</span>
                  <span className="leading-none">こちら</span>
                </div>
                <div className="w-[20px] h-[20px] shrink-0 bg-white rounded-full flex items-center justify-center">
                  <svg className="w-[16px] h-[16px] text-red-500 fill-current ml-[1px]" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </a>
  );
}