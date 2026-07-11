// src/App.tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AffiliateItem, parseUnitPrice } from './types';
import { analyzeProductNameWithGemini, GeminiAnalyzeResponse } from './geminiService';
import GoogleLoginButton from './components/GoogleLoginButton';

const API_BASE = '';
const MAX_RETRIES = 2;

const formatPrice = (price: number): string =>
  new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(price);

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface AppState {
  query: string;
  items: AffiliateItem[];
  isLoading: boolean;
  error: string | null;
  geminiResult: GeminiAnalyzeResponse | null;
  isGeminiLoading: boolean;
}

const MALL_LABEL: Record<AffiliateItem['mall'], string> = {
  amazon: 'Amazon',
  rakuten: '楽天',
  yahoo: 'Yahoo!',
  yodobashi: 'ヨドバシ',
  other: 'その他',
};

const MALL_COLOR: Record<AffiliateItem['mall'], string> = {
  amazon: 'bg-orange-100 text-orange-700',
  rakuten: 'bg-red-100 text-red-700',
  yahoo: 'bg-purple-100 text-purple-700',
  yodobashi: 'bg-yellow-100 text-yellow-700',
  other: 'bg-gray-100 text-gray-600',
};

function App() {
  const [state, setState] = useState<AppState>({
    query: '',
    items: [],
    isLoading: false,
    error: null,
    geminiResult: null,
    isGeminiLoading: false,
  });

  const [inputValue, setInputValue] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleTokenExpired = useCallback(() => {
    setToken(null);
    setIsLoggedIn(false);
    setState(prev => ({ ...prev, error: 'セッションが期限切れです。再ログインしてください。' }));
  }, []);

  const handleLoginSuccess = useCallback((accessToken: string) => {
    setToken(accessToken);
    setIsLoggedIn(true);
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const runGeminiAnalysis = useCallback(async (query: string, accessToken: string) => {
    setState(prev => ({ ...prev, isGeminiLoading: true }));
    const result = await analyzeProductNameWithGemini(query, accessToken, handleTokenExpired);
    setState(prev => ({ ...prev, geminiResult: result, isGeminiLoading: false }));
  }, [handleTokenExpired]);

  const handleSearch = useCallback(async (retryCount = 0) => {
    const q = inputValue.trim();
    if (!q) return;
    if (!isLoggedIn || !token) {
      setState(prev => ({ ...prev, error: 'Googleアカウントでログインしてください。' }));
      return;
    }
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    setState(prev => ({ ...prev, isLoading: true, error: null, items: [], geminiResult: null, query: q }));
    try {
      const response = await fetch(`${API_BASE}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ query: q }),
        signal: abortControllerRef.current.signal,
      });
      if (response.status === 401) { handleTokenExpired(); return; }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as any).error || `サーバーエラー: ${response.status}`);
      }
      const data = await response.json();
      const rawItems: AffiliateItem[] = (data.items || data.results || []).map(
        (item: AffiliateItem, i: number) => ({ ...item, id: `${i}` })
      );
      setState(prev => ({ ...prev, items: rawItems, isLoading: false }));
      if (q) runGeminiAnalysis(q, token);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      if (retryCount < MAX_RETRIES) {
        await sleep(1000 * (retryCount + 1));
        return handleSearch(retryCount + 1);
      }
      setState(prev => ({ ...prev, isLoading: false, error: err.message || '検索中にエラーが発生しました。' }));
    }
  }, [inputValue, isLoggedIn, token, handleTokenExpired, runGeminiAnalysis]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  useEffect(() => {
    return () => { abortControllerRef.current?.abort(); };
  }, []);

  const { query, items, isLoading, error, geminiResult, isGeminiLoading } = state;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">🛒 EC価格比較</h1>
          <GoogleLoginButton
            onSuccess={handleLoginSuccess}
            onExpired={handleTokenExpired}
            isLoggedIn={isLoggedIn}
          />
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="商品名を入力..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
            disabled={isLoading}
          />
          <button
            onClick={() => handleSearch()}
            disabled={isLoading || !inputValue.trim()}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isLoading ? '検索中…' : '検索'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            ⚠️ {error}
          </div>
        )}

        {isLoading && (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3" />
            <p className="text-gray-400">検索中...</p>
          </div>
        )}

        {(isGeminiLoading || geminiResult) && (
          <div className="mb-5 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <p className="text-sm font-semibold text-purple-700 mb-1">🤖 Gemini 商品名解析</p>
            {isGeminiLoading ? (
              <p className="text-purple-500 text-sm animate-pulse">解析中...</p>
            ) : geminiResult && geminiResult.success ? (
              <div className="flex flex-wrap gap-3 text-sm text-gray-700">
                {geminiResult.brand && (
                  <span>🏷️ <span className="font-medium">ブランド:</span> {geminiResult.brand}</span>
                )}
                {geminiResult.modelNumber && (
                  <span>🔢 <span className="font-medium">型番:</span> {geminiResult.modelNumber}</span>
                )}
                {geminiResult.capacity && (
                  <span>📦 <span className="font-medium">容量:</span> {geminiResult.capacity}</span>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">
                解析結果なし ({geminiResult ? geminiResult.error : ''})
              </p>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div>
            <p className="text-sm text-gray-500 mb-3">「{query}」 — {items.length}件</p>
            <div className="space-y-3">
              {items.map((item) => {
                const up = parseUnitPrice(item.unit_price);
                const itemKey = item.id !== undefined ? item.id : String(item.rank);
                return (
                  
                    key={itemKey}
                    href={item.affiliate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block bg-white rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all p-4"
                  >
                    <div className="flex gap-3">
                      <div className="shrink-0 w-8 text-center">
                        <span className="text-xl font-bold text-gray-300">
                          {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : item.rank}
                        </span>
                      </div>
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt={item.raw_name}
                          className="w-16 h-16 object-contain rounded-lg border border-gray-100 shrink-0"
                          loading="lazy"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${MALL_COLOR[item.mall]}`}>
                            {MALL_LABEL[item.mall]}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 line-clamp-2 mb-2">
                          {item.raw_name}
                        </p>
                        <div className="flex flex-wrap items-end gap-3">
                          <div>
                            <p className="text-xs text-gray-400">販売価格</p>
                            <p className="text-lg font-bold text-blue-600">{formatPrice(item.price)}</p>
                          </div>
                          {item.shipping_fee > 0 && (
                            <p className="text-xs text-gray-400 mb-1">+送料 {formatPrice(item.shipping_fee)}</p>
                          )}
                          {item.shipping_fee === 0 && (
                            <span className="text-xs text-green-600 font-medium mb-1">送料無料</span>
                          )}
                          {item.point > 0 && (
                            <p className="text-xs text-orange-500 mb-1">P{item.point}還元</p>
                          )}
                          <div className="ml-auto text-right">
                            <p className="text-xs text-gray-400">実質合計</p>
                            <p className="text-base font-bold text-green-600">{formatPrice(item.effective_total)}</p>
                          </div>
                        </div>
                        {item.total_units > 0 && (
                          <p className="text-xs text-gray-400 mt-1">
                            単価: {up.integer}.{up.decimal}円 / {item.total_units}個
                          </p>
                        )}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {!isLoading && query && items.length === 0 && !error && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🔍</p>
            <p>「{query}」の検索結果が見つかりませんでした。</p>
          </div>
        )}

        {!query && !isLoading && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-4">🛒</p>
            <p className="text-lg">商品名を入力して価格を比較しよう！</p>
            {!isLoggedIn && (
              <p className="text-sm mt-2 text-orange-400">
                ※ 検索にはGoogleログインが必要です
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
