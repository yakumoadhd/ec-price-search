// ① import追加（App.tsx上部）
import { analyzeProductNameWithGemini } from './geminiService';

// ② 401時の再ログイン誘導関数（App()内に追加）
const handleTokenExpired = useCallback(() => {
  setAccessToken(null); // トークンをクリア
  addToast(
    'セッションの有効期限が切れました。再度Googleでログインしてください。',
    'warning',
    8000
  );
  addDebug('warn', 'Gemini: トークン切れ（401）→ 再ログイン誘導', '');
}, [addToast, addDebug]);

// ③ Gemini解析の呼び出し例（handleSearch内など、EC API結果取得後に追加）
//    例：商品名リストの先頭アイテムをGeminiで解析する場合
if (accessToken && data.items?.length > 0) {
  const firstItem = data.items[0];
  addDebug('info', 'Gemini: 商品名解析リクエスト送信', firstItem.raw_name);

  const geminiResult = await analyzeProductNameWithGemini(
    firstItem.raw_name,
    accessToken,
    handleTokenExpired
  );

  if (geminiResult.success) {
    addDebug(
      'success',
      `Gemini: 解析成功 → ブランド:${geminiResult.brand} / 型番:${geminiResult.modelNumber}`,
      `容量: ${geminiResult.capacity}`
    );
    // → 解析結果を表示やフィルタリングに活用
  } else {
    // rate_limited / not_logged_in → 正規表現フォールバックへ（アプリはクラッシュしない）
    addDebug('warn', `Gemini: スキップ（${geminiResult.error}）→ 正規表現処理継続`, '');
  }
}
