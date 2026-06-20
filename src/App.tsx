import { useState, useEffect, useMemo, useCallback } from 'react';
import { SearchInput } from './components/SearchInput';
import { DropdownFilter } from './components/DropdownFilter';
import { ResultCard } from './components/ResultCard';
import { FavoritesList } from './components/FavoritesList';
import { AffiliateItem } from './types';
import { Menu, Search, WifiOff, AlertTriangle, X, Bug, ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react';
import { cleanProductName } from './productNameCleaner';
import { PointSettings, loadSettings, calcEffectiveTotal } from './pointSettings';
import { AnimatePresence, motion } from 'motion/react';
import { fetchSearXNG, SearXNGAllDownError } from './utils/searxngClient';
import { mergeSearXNGResults } from './utils/searxngMerger';
import { GoogleLoginButton } from './components/GoogleLoginButton';

// ──────────────────────────────────────────────
// Toast 通知の種別
// ──────────────────────────────────────────────
type ToastType = 'error' | 'warning' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

// ──────────────────────────────────────────────
// デバッグログの種別
// ──────────────────────────────────────────────
type DebugLevel = 'info' | 'success' | 'warn' | 'error';

interface DebugEntry {
  id: number;
  timestamp: string;      // HH:MM:SS.mmm
  level: DebugLevel;
  label: string;          // 短い見出し（例: "HF 応答"）
  detail: string;         // 生テキスト（エラーオブジェクトの中身など）
}

// ──────────────────────────────────────────────
// server.ts が返す「500ml 48個」「20枚 3個」から
// 入数（×以降の数字）を抽出する
// ──────────────────────────────────────────────
function extractUnitsFromLabel(label: string): number | null {
  if (!label) return null;
  const match = label.match(/(\d+)個$/);
  if (match) {
    const n = parseInt(match[1], 10);
    return n > 0 ? n : null;
  }
  return null;
}

// ──────────────────────────────────────────────
// 現在時刻を HH:MM:SS.mmm 形式で返す
// ──────────────────────────────────────────────
function nowStamp(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

// ──────────────────────────────────────────────
// AggregateError の内訳を読みやすいテキストに変換
// ──────────────────────────────────────────────
function aggregateErrorToText(aggErr: AggregateError): string {
  const lines: string[] = [`AggregateError — ${aggErr.errors.length}件の失敗:`];
  aggErr.errors.forEach((e: unknown, i: number) => {
    if (e instanceof Error) {
      lines.push(`  [${i}] ${e.name}: ${e.message}`);
      // TypeError の場合は CORS/ネットワーク失敗の可能性を明示
      if (e instanceof TypeError) {
        lines.push(`      ↑ TypeError = CORS拒否 or ネットワーク到達不能の可能性`);
      }
    } else {
      lines.push(`  [${i}] ${String(e)}`);
    }
  });
  return lines.join('\n');
}

// ──────────────────────────────────────────────
// Toast コンポーネント
// ──────────────────────────────────────────────
function ToastNotification({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const styles: Record<ToastType, { bg: string; border: string; icon: React.ReactNode }> = {
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: <WifiOff className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />,
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      icon: <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />,
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: <Search className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />,
    },
  };

  const s = styles[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-md ${s.bg} ${s.border} max-w-sm w-full`}
    >
      {s.icon}
      <p className="text-sm font-medium text-gray-800 flex-1 leading-snug">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer shrink-0"
        aria-label="閉じる"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

// ──────────────────────────────────────────────
// デバッグパネル コンポーネント
// ──────────────────────────────────────────────
function DebugPanel({
  logs,
  onClear,
}: {
  logs: DebugEntry[];
  onClear: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  // 全ログをクリップボードにコピー
  const handleCopy = async () => {
    const text = logs
      .map(e => `[${e.timestamp}] [${e.level.toUpperCase()}] ${e.label}\n${e.detail}`)
      .join('\n─────────────────────\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard APIが使えない場合は無視
    }
  };

  const levelStyle: Record<DebugLevel, { badge: string; border: string; bg: string }> = {
    info:    { badge: 'bg-blue-100 text-blue-700',   border: 'border-blue-200',  bg: 'bg-blue-50'   },
    success: { badge: 'bg-green-100 text-green-700', border: 'border-green-200', bg: 'bg-green-50'  },
    warn:    { badge: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-200', bg: 'bg-yellow-50' },
    error:   { badge: 'bg-red-100 text-red-700',     border: 'border-red-200',   bg: 'bg-red-50'    },
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-6 mb-4 rounded-2xl border-2 border-dashed border-gray-300 overflow-hidden font-mono text-xs">

      {/* ヘッダーバー */}
      <div
        className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white cursor-pointer select-none"
        onClick={() => setOpen(v => !v)}
      >
        <Bug className="w-4 h-4 text-yellow-400 shrink-0" />
        <span className="font-bold text-yellow-400 tracking-widest">DEBUG LOG</span>
        <span className="text-gray-400 ml-1">（FireHD10 用・本番前に削除）</span>
        <span className="ml-auto text-gray-300 text-[10px]">{logs.length}件</span>
        {open
          ? <ChevronUp className="w-4 h-4 text-gray-400" />
          : <ChevronDown className="w-4 h-4 text-gray-400" />
        }
      </div>

      {open && (
        <>
          {/* 操作ボタン */}
          <div className="flex gap-2 px-3 py-2 bg-gray-900 border-b border-gray-700">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              {copied ? 'コピー完了！' : '全コピー'}
            </button>
            <button
              onClick={onClear}
              className="flex items-center gap-1 px-3 py-1 rounded-md bg-gray-700 hover:bg-red-700 text-gray-200 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              クリア
            </button>
          </div>

          {/* ログ一覧 */}
          <div className="bg-gray-950 max-h-[60vh] overflow-y-auto divide-y divide-gray-800">
            {logs.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-500">
                ログはまだありません。検索を実行してください。
              </div>
            ) : (
              // 新しいものを上に表示
              [...logs].reverse().map(entry => {
                const s = levelStyle[entry.level];
                return (
                  <div key={entry.id} className={`px-3 py-2 ${s.bg} border-l-4 ${s.border}`}>
                    {/* 1行目：タイムスタンプ ＋ レベルバッジ ＋ 見出し */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-400 text-[10px] shrink-0">{entry.timestamp}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.badge} shrink-0`}>
                        {entry.level.toUpperCase()}
                      </span>
                      <span className="font-bold text-gray-800 break-all">{entry.label}</span>
                    </div>
                    {/* 2行目以降：生テキスト */}
                    {entry.detail && (
                      <pre className="mt-1 text-[11px] text-gray-700 whitespace-pre-wrap break-all leading-relaxed">
                        {entry.detail}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// App
// ──────────────────────────────────────────────

let toastIdCounter = 0;
let debugIdCounter = 0;

export default function App() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [results, setResults] = useState<AffiliateItem[]>([]);
  const [favorites, setFavorites] = useState<AffiliateItem[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [selectedCapacity, setSelectedCapacity] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'effective' | 'unit'>('effective');
  const [showHeader, setShowHeader] = useState(true);
  const [pointSettings, setPointSettings] = useState<PointSettings>(loadSettings);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [debugLogs, setDebugLogs] = useState<DebugEntry[]>([]);
  // Google OAuth2 アクセストークン（メモリのみ・localStorage禁止）
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // ──────────────────────────────────────────────
  // デバッグログ追記ヘルパー
  // ──────────────────────────────────────────────
  const addDebug = useCallback((level: DebugLevel, label: string, detail = '') => {
    const entry: DebugEntry = {
      id: ++debugIdCounter,
      timestamp: nowStamp(),
      level,
      label,
      detail,
    };
    setDebugLogs(prev => [...prev, entry]);
  }, []);

  const clearDebug = useCallback(() => setDebugLogs([]), []);

  // ──────────────────────────────────────────────
  // Toast ヘルパー
  // ──────────────────────────────────────────────
  const addToast = useCallback((message: string, type: ToastType = 'error', durationMs = 6000) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, durationMs);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // スクロールでヘッダー表示/非表示
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;
    const updateScrollDir = () => {
      const scrollY = window.scrollY;
      if (Math.abs(scrollY - lastScrollY) < 5) { ticking = false; return; }
      setShowHeader(scrollY < lastScrollY || scrollY <= 20);
      lastScrollY = scrollY;
      ticking = false;
    };
    const onScroll = () => {
      if (!ticking) { window.requestAnimationFrame(updateScrollDir); ticking = true; }
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ローカルストレージ読み込み
  useEffect(() => {
    try {
      const fav = localStorage.getItem('favorites_db');
      if (fav) setFavorites(JSON.parse(fav));
      const hist = localStorage.getItem('search_history_db');
      if (hist) setSearchHistory(JSON.parse(hist));
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('favorites_db', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('search_history_db', JSON.stringify(searchHistory));
  }, [searchHistory]);

  // ──────────────────────────────────────────────
  // 検索処理
  // ──────────────────────────────────────────────
  const handleSearch = async (overrideQuery?: string) => {
    const q = overrideQuery || query;
    if (!q.trim()) return;
    if (overrideQuery) setQuery(overrideQuery);

    setSearchHistory(prev => {
      const filtered = prev.filter(item => item !== q);
      return [q, ...filtered].slice(0, 5);
    });

    setIsLoading(true);
    setApiError(null);
    setResults([]);
    setSelectedCapacity(null);

    addDebug('info', `検索開始: "${q}"`, `SearXNG（HF + Koyeb）に同時リクエスト送信`);

    // ── フェーズA：SearXNG（Tier2）をバックグラウンドで並行起動 ──
    const searxngPromise = fetchSearXNG(q)
      .then(result => {
        // 成功
        addDebug(
          'success',
          `SearXNG 成功 ✅ 勝者: ${result.winner}`,
          `件数: ${result.data.results.length} 件\n` +
          `query: ${result.data.query}\n` +
          `unresponsive_engines: ${JSON.stringify(result.data.unresponsive_engines ?? [])}`
        );
        return result;
      })
      .catch((err: unknown) => {
        // ── エラー内訳をデバッグログに記録 ──
        if (err instanceof SearXNGAllDownError) {
          // AggregateError の内訳を展開して表示
          const detail = aggregateErrorToText(err.cause);
          addDebug('error', 'SearXNG 両サーバー失敗 ❌', `${err.message}\n\n${detail}`);
          addToast(err.message, 'error');

        } else if (err instanceof Error) {
          // タイムアウト等その他のエラー
          addDebug(
            'error',
            `SearXNG 予期しないエラー: ${err.name}`,
            `message: ${err.message}\nstack: ${err.stack ?? '(なし)'}`
          );
          addToast('SearXNG への接続中に予期しないエラーが発生しました。', 'warning');

        } else {
          addDebug('error', 'SearXNG 不明なエラー', String(err));
          addToast('SearXNG への接続中に不明なエラーが発生しました。', 'warning');
        }
        return null;
      });

    try {
      // ── フェーズA：Tier1 EC検索API ──
      addDebug('info', 'EC検索API リクエスト送信', `endpoint: ec-search-api / keyword: ${q}`);

      const res = await fetch(
        '/api/search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyword: q,
            limit: 30,
            rakuten: { postage_flag: 0 },
            amazon: pointSettings.amazon.isPrime
              ? { prime_only: true }
              : { free_shipping_only: true },
            yahoo: {
              prefecture: pointSettings.yahoo.prefecture || 'tokyo',
            },
          }),
        }
      );

      addDebug(
        res.ok ? 'success' : 'error',
        `EC検索API レスポンス: HTTP ${res.status}`,
        `status: ${res.status} ${res.statusText}\nURL: ${res.url}`
      );

      if (!res.ok) throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);

      const data = await res.json();

      if (data.items && Array.isArray(data.items)) {
        addDebug('info', `EC検索API items: ${data.items.length}件`, '');

        const capacityItems = data.items.map((d: any) => ({
          rawName: d.raw_name || '',
          capacityMl: d.capacity_ml ?? null,
        }));

        let labels: string[] = [];
        try {
          const labelRes = await fetch('/api/gemini/capacities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: capacityItems }),
          });
          if (labelRes.ok) {
            const labelData = await labelRes.json();
            labels = labelData.labels || [];
            addDebug('success', `ラベルAPI 成功: ${labels.length}件`, '');
          } else {
            addDebug('warn', `ラベルAPI 失敗: HTTP ${labelRes.status}`, '');
          }
        } catch (err) {
          addDebug('warn', 'ラベルAPI 例外', err instanceof Error ? err.message : String(err));
        }

        const typedData: AffiliateItem[] = data.items.map((d: any, i: number) => {
          const label = labels[i] || '';
          const extractedUnits = extractUnitsFromLabel(label);
          const correctedUnits = extractedUnits ?? d.total_units ?? 1;
          const rawPrice = d.price ?? 0;
          const computedUnitPrice =
            correctedUnits > 0
              ? Math.round((rawPrice / correctedUnits) * 100) / 100
              : rawPrice;

          return {
            ...d,
            id: d.item_id ? `${d.mall}-${d.item_id}` : `item-${i}`,
            unit_price: computedUnitPrice,
            total_units: correctedUnits,
            capacity: label || (d.capacity_ml ? `${d.capacity_ml}ml 1個` : '不明'),
          };
        });

        // ── フェーズB：SearXNG 結果の取り込み・マージ ──
        const searxngResult = await searxngPromise;
        let finalData: AffiliateItem[] = typedData;

        if (searxngResult) {
          const { addedItems, stats } = mergeSearXNGResults(
            searxngResult.data.results ?? [],
            typedData
          );

          if (addedItems.length > 0) {
            finalData = [...typedData, ...addedItems];
          }

          addDebug(
            'success',
            `SearXNG マージ完了（勝者: ${searxngResult.winner}）`,
            `取得件数: ${stats.total}件\n` +
            `追加: ${stats.added}件\n` +
            `価格未取得でスキップ: ${stats.skippedNoPrice}件\n` +
            `Tier1と重複でスキップ: ${stats.skippedDuplicate}件`
          );
        }

        setResults(finalData);
        addDebug('success', `表示完了: ${finalData.length}件`, '');

      } else {
        addDebug('error', 'EC検索API データ形式不正', `受信データ: ${JSON.stringify(data).slice(0, 300)}`);
        setApiError('APIからのデータ形式が不正です。');
        addToast('検索結果の形式が不正です。しばらくしてから再試行してください。', 'warning');
        setResults([]);
      }
    } catch (e: any) {
      const msg = e.message || '通信エラーが発生しました。';
      addDebug(
        'error',
        `EC検索API 例外: ${e.name ?? 'Error'}`,
        `message: ${msg}\nstack: ${e.stack ?? '(なし)'}`
      );

      // ── Tier1が失敗しても処理を止めず、SearXNG（Tier2/3）でのフォールバックを試みる ──
      addToast('検索エンジンを切り替えて再試行中…', 'warning');

      try {
        const searxngResult = await searxngPromise;

        if (searxngResult && (searxngResult.data.results ?? []).length > 0) {
          // Tier1が空（existingItems = []）の状態でマージし、
          // SearXNG結果のみで結果リストを構築する
          const { addedItems, stats } = mergeSearXNGResults(
            searxngResult.data.results ?? [],
            []
          );

          if (addedItems.length > 0) {
            setResults(addedItems);
            setApiError(null);
            addDebug(
              'success',
              `Tier1失敗 → SearXNGのみで表示（勝者: ${searxngResult.winner}）`,
              `取得件数: ${stats.total}件\n` +
              `追加: ${stats.added}件\n` +
              `価格未取得でスキップ: ${stats.skippedNoPrice}件\n` +
              `Tier1と重複でスキップ: ${stats.skippedDuplicate}件`
            );
            addToast('一部の検索結果のみ表示しています。', 'info');
          } else {
            // SearXNGは応答したが、有効な結果が0件
            addDebug('warn', 'SearXNGフォールバックも0件', `${msg}`);
            setApiError(msg);
            addToast('検索結果が見つかりませんでした。', 'error');
            setResults([]);
          }
        } else {
          // SearXNGも失敗 or 結果なし → 完全に表示できない
          addDebug('error', 'Tier1・SearXNGともに失敗', msg);
          setApiError(msg);
          addToast(msg, 'error');
          setResults([]);
        }
      } catch (fallbackErr: any) {
        addDebug(
          'error',
          `SearXNGフォールバック処理中の例外: ${fallbackErr?.name ?? 'Error'}`,
          `message: ${fallbackErr?.message ?? String(fallbackErr)}`
        );
        setApiError(msg);
        addToast(msg, 'error');
        setResults([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleFavorite = (item: AffiliateItem) => {
    setFavorites(prev => {
      const isFav = prev.some(f => f.id === item.id);
      return isFav ? prev.filter(f => f.id !== item.id) : [...prev, item];
    });
  };

  // 容量フィルター選択肢
  const capacities = useMemo(() => {
    const caps = new Set<string>();
    results.forEach(i => {
      if (i.capacity) caps.add(i.capacity);
    });
    return Array.from(caps).sort();
  }, [results]);

  // お気に入り商品名
  const favoriteNames = useMemo(() => {
    const names = favorites.map(f => cleanProductName(f.raw_name)).filter(Boolean);
    return Array.from(new Set(names)).slice(0, 10);
  }, [favorites]);

  // フィルター＆ソート（ユーザー設定を反映した実質価格を計算）
  // ※ SearXNG由来（yodobashi/other）のアイテムは、すでにマージ時点で
  //   実質価格（ヨドバシ10%還元 等）を計算済みのため、
  //   ユーザーのポイント設定による再計算は行わずそのまま使用する。
  const resultsWithCustomEffective = useMemo(() => {
    return results.map(item => {
      if (item.mall === 'yodobashi' || item.mall === 'other') {
        return item;
      }
      return {
        ...item,
        effective_total: calcEffectiveTotal(
          item.mall,
          item.price,
          item.shipping_fee,
          item.point,
          item.coupon_discount,
          pointSettings,
        ),
      };
    });
  }, [results, pointSettings]);

  const filteredAndSortedResults = useMemo(() => {
    let list = [...resultsWithCustomEffective];

    if (selectedCapacity) {
      list = list.filter(i => i.capacity === selectedCapacity);
    }

    list.sort((a, b) => {
      if (sortMode === 'unit') {
        const getFloat = (item: AffiliateItem) => {
          if (typeof item.unit_price === 'number') return item.unit_price;
          if (typeof item.unit_price === 'string') return parseFloat(item.unit_price);
          if (item.unit_price && typeof item.unit_price === 'object') {
            return (item.unit_price as any).integer_part + (item.unit_price as any).decimal_part / 100;
          }
          return 0;
        };
        return getFloat(a) - getFloat(b);
      }
      return a.effective_total - b.effective_total;
    });

    return list;
  }, [resultsWithCustomEffective, selectedCapacity, sortMode]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-gray-200 pb-10">

      {/* ── Toast 通知エリア（画面上部中央）── */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <ToastNotification toast={toast} onDismiss={dismissToast} />
            </div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── Sticky Header ── */}
      <div
        className={`fixed top-0 left-0 right-0 z-40 bg-gray-50/95 backdrop-blur-md shadow-sm transition-transform duration-300 flex justify-center ${
          showHeader ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <section className="w-full max-w-2xl px-2 mt-2 flex flex-col gap-0 pb-1">
          <div className="flex items-center gap-2 h-[45px] w-full">
            <div className="flex-1 h-full">
              <SearchInput
                query={query}
                onChange={e => setQuery(e.target.value)}
                onSearch={handleSearch}
                isLoading={isLoading}
                history={searchHistory}
                favoriteNames={favoriteNames}
              />
            </div>
            <GoogleLoginButton
              onLogin={(token) => setAccessToken(token)}
              onLogout={() => setAccessToken(null)}
            />
            <button
              id="header-drawer-menu-button"
              onClick={() => setShowFavorites(true)}
              className="relative h-full aspect-square rounded-2xl bg-white border border-gray-200/80 shadow-sm hover:shadow-md transition-all group flex items-center justify-center shrink-0 cursor-pointer"
              title="メニュー"
            >
              <Menu className="w-5 h-5 text-gray-700 group-hover:text-black transition-colors" />
              {favorites.length > 0 && (
                <span className="absolute top-2.5 right-2 w-2 h-2 bg-red-500 rounded-full border border-white animate-pulse" />
              )}
            </button>
          </div>

          {results.length > 0 && capacities.length > 0 && (
            <div className="w-full mt-2 h-[40px]">
              <DropdownFilter
                options={capacities}
                selectedValue={selectedCapacity}
                onChange={setSelectedCapacity}
              />
            </div>
          )}

          {results.length > 0 && (
            <div className="w-full mt-2 h-[40px] flex gap-1 bg-gray-200/60 p-1 rounded-lg border border-gray-100 shadow-inner">
              <button
                id="sort-by-effective-btn"
                onClick={() => setSortMode('effective')}
                className={`flex-1 text-[13px] font-bold h-full rounded-md transition-all cursor-pointer ${
                  sortMode === 'effective' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                実質価格 順
              </button>
              <button
                id="sort-by-unit-btn"
                onClick={() => setSortMode('unit')}
                className={`flex-1 text-[13px] font-bold h-full rounded-md transition-all cursor-pointer ${
                  sortMode === 'unit' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                1個あたり 順
              </button>
            </div>
          )}
        </section>
      </div>

      {/* ── Main Content ── */}
      <main
        className={`max-w-4xl mx-auto px-2 flex flex-col items-center transition-all duration-300 ${
          results.length > 0 ? 'pt-[160px]' : 'pt-[76px]'
        }`}
      >
        <div className="w-full mt-2">
          {isLoading && (
            <div className="w-full h-[50vh] flex flex-col items-center justify-center gap-4 text-gray-500 animate-in fade-in duration-500">
              <div className="w-12 h-12 border-4 border-gray-200 border-t-red-500 rounded-full animate-spin" />
              <p className="text-sm font-bold tracking-wide">検索データを取得中...</p>
            </div>
          )}

          {!isLoading && !apiError && results.length > 0 && selectedCapacity && (
            <section className="w-full max-w-2xl mx-auto px-2 animate-in fade-in slide-in-from-bottom-8 duration-500 flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                {filteredAndSortedResults.map(item => (
                  <ResultCard
                    key={item.id}
                    item={item}
                    isFavorite={favorites.some(f => f.id === item.id)}
                    onToggleFavorite={handleToggleFavorite}
                    sortMode={sortMode}
                  />
                ))}
              </div>
            </section>
          )}

          {!isLoading && !apiError && results.length > 0 && !selectedCapacity && (
            <div className="w-full max-w-2xl mx-auto text-center py-20 text-gray-400 text-sm font-medium tracking-wide flex flex-col items-center justify-center gap-4">
              <span>すべての容量・入数から、ご希望のものを選択してください</span>
            </div>
          )}

          {!isLoading && apiError && (
            <div className="w-full max-w-2xl mx-auto text-center py-10 px-4 text-red-500 text-sm font-bold bg-red-50 rounded-xl border border-red-100">
              <p className="mb-2">APIエラーが発生しました。</p>
              <p className="font-normal text-xs">{apiError}</p>
            </div>
          )}

          {!isLoading && !apiError && results.length === 0 && (
            <div className="w-full max-w-2xl mx-auto text-center py-20 text-gray-400 text-sm font-medium tracking-wide flex flex-col items-center justify-center gap-4 animate-pulse">
              <Search className="w-12 h-12 text-gray-300" />
              <span>比較したい商品の名前やキーワードを入力して検索してください</span>
            </div>
          )}

          {/* ══════════════════════════════════════════
              🐛 デバッグパネル（本番前に削除する）
              ══════════════════════════════════════════ */}
          <DebugPanel logs={debugLogs} onClear={clearDebug} />

        </div>
      </main>

      {/* ── Favorites Overlay ── */}
      <AnimatePresence>
        {showFavorites && (
          <FavoritesList
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
            onClose={() => setShowFavorites(false)}
            query={query}
            setQuery={setQuery}
            handleSearch={q => {
              setShowFavorites(false);
              handleSearch(q);
            }}
            favoriteNames={favoriteNames}
            searchHistory={searchHistory}
            onSettingsChange={setPointSettings}
          />
        )}
      </AnimatePresence>
    </div>
  );
}