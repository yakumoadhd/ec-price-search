/**
 * searxngClient.ts
 * Price Ranking — SearXNG トリプル構成フェッチ関数
 *
 * v7.03 変更点：
 *  Hugging Face SearXNG サブを第3冗長として再導入
 *  Oracle はTODOのまま維持
 */

// ─── エンドポイント定数 ────────────────────────────────────────

/** Oracle Cloud（メイン・Always Free VM） */
const ORACLE_BASE_URL =
  "http://161.33.140.166:8080/search"; // TODO: OracleインスタンスのパブリックIP/ドメインに置き換える

/** Koyeb（サブ） */
const KOYEB_BASE_URL =
  "https://civic-marilin-ggvss-a16849cf.koyeb.app/search";

/** Hugging Face（第3サブ・v7.03 再導入） */
const HF_BASE_URL =
  "https://ggvssyakumo01-prdocker2.hf.space/search";

const API_KEY = "PR_2026_xK9mQzL4vN8pRjW2";

// ─── 型定義 ───────────────────────────────────────────────────

export interface SearXNGResult {
  url: string;
  title: string;
  content: string;
  engine: string;
  score?: number;
  [key: string]: unknown;
}

export interface SearXNGResponse {
  query: string;
  number_of_results: number;
  results: SearXNGResult[];
  answers?: string[];
  infoboxes?: unknown[];
  suggestions?: string[];
  unresponsive_engines?: string[];
}

export interface SearXNGFetchResult {
  data: SearXNGResponse;
  winner: "oracle" | "koyeb" | "huggingface";
}

export class SearXNGAllDownError extends Error {
  constructor(public readonly cause: AggregateError) {
    super("全ての SearXNG サーバーが応答しませんでした。しばらくしてから再試行してください。");
    this.name = "SearXNGAllDownError";
  }
}

// ─── メイン関数 ───────────────────────────────────────────────

export async function fetchSearXNG(
  query: string,
  timeoutMs = 8000
): Promise<SearXNGFetchResult> {

  const controllerOracle = new AbortController();
  const controllerKoyeb  = new AbortController();
  const controllerHF     = new AbortController();

  const timeoutId = setTimeout(() => {
    controllerOracle.abort();
    controllerKoyeb.abort();
    controllerHF.abort();
  }, timeoutMs);

  const params = new URLSearchParams({
    q:       query,
    format:  "json",
    api_key: API_KEY,
  });

  const makeRequest = async (
    baseUrl: string,
    signal: AbortSignal,
    label: "oracle" | "koyeb" | "huggingface"
  ): Promise<SearXNGFetchResult> => {
    const response = await fetch(`${baseUrl}?${params.toString()}`, { signal });
    if (!response.ok) {
      throw new Error(`[${label}] HTTP ${response.status}: ${response.statusText}`);
    }
    const data: SearXNGResponse = await response.json();
    return { data, winner: label };
  };

  const reqOracle = makeRequest(ORACLE_BASE_URL, controllerOracle.signal, "oracle").then(
    (result) => { controllerKoyeb.abort(); controllerHF.abort(); return result; }
  );

  const reqKoyeb = makeRequest(KOYEB_BASE_URL, controllerKoyeb.signal, "koyeb").then(
    (result) => { controllerOracle.abort(); controllerHF.abort(); return result; }
  );

  const reqHF = makeRequest(HF_BASE_URL, controllerHF.signal, "huggingface").then(
    (result) => { controllerOracle.abort(); controllerKoyeb.abort(); return result; }
  );

  try {
    const result = await Promise.any([reqOracle, reqKoyeb, reqHF]);
    return result;
  } catch (error) {
    if (error instanceof AggregateError) {
      throw new SearXNGAllDownError(error);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
