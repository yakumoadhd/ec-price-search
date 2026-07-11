// src/App.tsx
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SearchResult, RankingItem, GeminiAnalysis } from './types';
import { analyzeProductNameWithGemini } from './geminiService';
import GoogleLoginButton from './components/GoogleLoginButton';

// ===== 型定義 =====
interface SearchState {
  query: string;
  results: SearchResult[];
  ranking: RankingItem[];
  isLoading: boolean;
  error: string | null;
  geminiAnalysis: GeminiAnalysis | null;
  isGeminiLoading: boolean;
  geminiError: string | null;
}

// ===== 定数 =====
const API_BASE = '';
const MAX_RETRIES = 2;

// ===== ユーティリティ =====
const formatPrice = (price: number): string => {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(price);
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ===== メインコンポーネント =====
export default function App() {
  const [state, setState] = useState<SearchState>({
    query: '',
    results: [],
    ranking: [],
    isLoading: false,
    error: null,
    geminiAnalysis: null,
    isGeminiLoading: false,
    geminiError: null,
  });

  const [inputValue, setInputValue] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // トークン期限切れハンドラ
  const handleTokenExpired = useCallback(() => {
    setToken(null);
    setIsLoggedIn(false);
    setState(prev => ({
      ...prev,
      error: 'セッションが期限切れです。再ログインしてください。',
    }));
  }, []);

  // Googleログイン成功時
  const handleLoginSuccess = useCallback((accessToken: string) => {
    setToken(accessToken);
    setIsLoggedIn(true);
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // 検索実行
  const handleSearch = useCallback(async (retryCount = 0) => {
    if (!inputValue.trim()) return;
    if (!isLoggedIn || !token) {
      setState(prev => ({
        ...prev,
        error: 'Googleアカウントでログインしてください。',
      }));
      return;
    }

    // 前のリクエストをキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
      results: [],
      ranking: [],
      geminiAnalysis: null,
      geminiError: null,
      query: inputValue.trim(),
    }));

    try {
      const response = await fetch(`${API_BASE}/api/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ query: inputValue.trim() }),
        signal: abortControllerRef.current.signal,
      });

      if (response.status === 401) {
        handleTokenExpired();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `サーバーエラー: ${response.status}`);
      }

      const data = await response.json();
      setState(prev => ({
        ...prev,
        results: data.results || [],
        ranking: data.ranking || [],
        isLoading: false,
      }));

      // Gemini分析を非同期で実行
      if (data.results && data.results.length > 0) {
        runGeminiAnalysis(inputValue.trim(), data.results, token);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;

      if (retryCount < MAX_RETRIES) {
        await sleep(1000 * (retryCount + 1));
        return handleSearch(retryCount + 1);
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err.message || '検索中にエラーが発生しました。',
      }));
    }
  }, [inputValue, isLoggedIn, token, handleTokenExpired]);

  // Gemini分析
  const runGeminiAnalysis = useCallback(async (
    query: string,
    results: SearchResult[],
    accessToken: string
  ) => {
    setState(prev => ({ ...prev, isGeminiLoading: true, geminiError: null }));
    try {
      const analysis = await analyzeProductNameWithGemini(query, results, accessToken);
      setState(prev => ({
        ...prev,
        geminiAnalysis: analysis,
        isGeminiLoading: false,
      }));
    } catch (err: any) {
      if (err.message?.includes('401') || err.message?.includes('expired')) {
        handleTokenExpired();
        return;
      }
      setState(prev => ({
        ...prev,
        geminiError: err.message || 'Gemini分析中にエラーが発生しました。',
        isGeminiLoading: false,
      }));
    }
  }, [handleTokenExpired]);

  // Enterキー対応
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">🛒 EC価格比較</h1>
          <GoogleLoginButton
            onSuccess={handleLoginSuccess}
            onExpired={handleTokenExpired}
            isLoggedIn={isLoggedIn}
          />
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* 検索バー */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="商品名を入力してください..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={state.isLoading}
          />
          <button
            onClick={() => handleSearch()}
            disabled={state.isLoading || !inputValue.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {state.isLoading ? '検索中...' : '検索'}
          </button>
        </div>

        {/* エラー表示 */}
        {state.error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            ⚠️ {state.error}
          </div>
        )}

        {/* ローディング */}
        {state.isLoading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-500">検索中...</p>
          </div>
        )}

        {/* Gemini分析結果 */}
        {(state.geminiAnalysis || state.isGeminiLoading) && (
          <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <h2 className="text-lg font-semibold text-purple-800 mb-2">
              🤖 Gemini AI 分析
            </h2>
            {state.isGeminiLoading ? (
              <p className="text-purple-600 animate-pulse">分析中...</p>
            ) : state.geminiAnalysis ? (
              <div className="space-y-2">
                {state.geminiAnalysis.normalizedName && (
                  <p className="text-gray-700">
                    <span className="font-medium">正規化名:</span>{' '}
                    {state.geminiAnalysis.normalizedName}
                  </p>
                )}
                {state.geminiAnalysis.summary && (
                  <p className="text-gray-700">
                    <span className="font-medium">まとめ:</span>{' '}
                    {state.geminiAnalysis.summary}
                  </p>
                )}
                {state.geminiAnalysis.recommendation && (
                  <p className="text-green-700">
                    <span className="font-medium">💡 おすすめ:</span>{' '}
                    {state.geminiAnalysis.recommendation}
                  </p>
                )}
              </div>
            ) : null}
            {state.geminiError && (
              <p className="text-red-600 text-sm">⚠️ {state.geminiError}</p>
            )}
          </div>
        )}

        {/* ランキング */}
        {state.ranking.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">
              📊 価格ランキング
            </h2>
            <div className="space-y-2">
              {state.ranking.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm border border-gray-100"
                >
                  <span className="text-2xl font-bold text-gray-400 w-8 text-center">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{item.title}</p>
                    <p className="text-sm text-gray-500">{item.store}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-600">{formatPrice(item.price)}</p>
                    {item.shipping !== undefined && (
                      <p className="text-xs text-gray-400">
                        {item.shipping === 0 ? '送料無料' : `+送料${formatPrice(item.shipping)}`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 検索結果一覧 */}
        {state.results.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-700 mb-3">
              🔍 検索結果 ({state.results.length}件)
            </h2>
            <div className="space-y-3">
              {state.results.map((result, index) => (
                <div
                  key={index}
                  className="p-4 bg-white rounded-lg shadow-sm border border-gray-100 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline line-clamp-2"
                      >
                        {result.title}
                      </a>
                      {result.description && (
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {result.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1 truncate">{result.url}</p>
                    </div>
                    {result.price !== undefined && result.price !== null && (
                      <div className="text-right shrink-0">
                        <p className="font-bold text-blue-600 text-lg">
                          {formatPrice(result.price)}
                        </p>
                        {result.store && (
                          <p className="text-xs text-gray-500">{result.store}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 結果なし */}
        {!state.isLoading && state.query && state.results.length === 0 && !state.error && (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">🔍</p>
            <p>「{state.query}」の検索結果が見つかりませんでした。</p>
          </div>
        )}

        {/* 初期状態 */}
        {!state.query && !state.isLoading && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-5xl mb-4">🛒</p>
            <p className="text-lg">商品名を入力して価格を比較しよう！</p>
            {!isLoggedIn && (
              <p className="text-sm mt-2 text-orange-500">
                ※ 検索にはGoogleログインが必要です
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
