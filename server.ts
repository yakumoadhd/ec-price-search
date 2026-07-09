import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// ══════════════════════════════════════════════════════
// 商品名から「規格」と「入数」を正規表現で確実に抽出する
// Gemini不使用・即時処理・全商品種別対応
//
// 対応パターン（ユーザー確認済み）:
//   「350ml×24本/1ケース」   → 350ml 24個
//   「500ml缶×48本 2ケース」 → 500ml 48個
//   「500ml缶×2ケース」      → 500ml 48個（1ケース=24個）
//   「500ml×48本/2ケース」   → 500ml 48個
//   「500ml×48本（2ケース）」→ 500ml 48個
//   「500ml1ケース」          → 500ml 24個（1ケース=24個）
//   「500ml×24本×2ケース（48本）」→ 500ml 48個
//   「不織布マスク 20枚×3袋」 → 20枚 3個
//   「ポテトチップス 60g×24袋」→ 60g 24個
// ══════════════════════════════════════════════════════
function extractCapacityLabel(rawName: string): { label: string; totalUnits: number } {
  const name = rawName;

  // ──────────────────────────────────────────────
  // STEP 1: 規格（容量・サイズ）を抽出
  // ──────────────────────────────────────────────
  let specStr: string | null = null;

  // ml / mL / ML
  const mlMatch = name.match(/(\d+(?:\.\d+)?)\s*[mM][lL]/);
  if (mlMatch) specStr = `${parseFloat(mlMatch[1])}ml`;

  // L / l（リットル）— 「ml」より後にチェック
  if (!specStr) {
    const lMatch = name.match(/(\d+(?:\.\d+)?)\s*[Ll](?!\w)/);
    if (lMatch) specStr = `${lMatch[1]}L`;
  }

  // kg
  if (!specStr) {
    const kgMatch = name.match(/(\d+(?:\.\d+)?)\s*kg/i);
    if (kgMatch) specStr = `${kgMatch[1]}kg`;
  }

  // g（kgの後にチェック）
  if (!specStr) {
    const gMatch = name.match(/(\d+(?:\.\d+)?)\s*g(?!\w)/);
    if (gMatch) specStr = `${gMatch[1]}g`;
  }

  // ──────────────────────────────────────────────
  // STEP 2: 入数（個数）を抽出
  //
  // 【入数単位】何個届くか: 本・缶・個・袋・箱・冊・食・パック・セット
  // 【規格単位】1つの仕様: 枚・粒・錠・包・片
  //   → 「20枚×3袋」の場合: 20枚=規格, 3袋=入数
  //
  // 優先順位:
  //   P1. 入数単位の全マッチから最大値（48本 vs 24本 → 48）
  //   P2. 「N(単位) × Mケース」明示計算（24本×2ケース → 48）
  //   P3. ケース数のみ → ×24（業界標準: 1ケース=24個）
  //   P4. 入数が取れない場合 → 1個
  // ──────────────────────────────────────────────
  const COUNT_UNITS = '本|缶|個|袋|箱|冊|食|パック|セット';

  let totalUnits: number | null = null;

  // P1: 入数単位の全マッチから最大値を採用
  const countMatches = [...name.matchAll(new RegExp(`(\\d+)\\s*(${COUNT_UNITS})`, 'g'))];
  if (countMatches.length > 0) {
    const counts = countMatches.map(m => parseInt(m[1], 10));
    totalUnits = Math.max(...counts);
  }

  // P2: 「N(単位) × Mケース」の計算
  // 例: 「24本×2ケース」「24缶×2ケース」
  const perCaseMatch = name.match(
    new RegExp(`(\\d+)\\s*(?:${COUNT_UNITS})[^\\d]*[×xX*]\\s*(\\d+)\\s*ケース`)
  );
  if (perCaseMatch) {
    const calc = parseInt(perCaseMatch[1], 10) * parseInt(perCaseMatch[2], 10);
    if (!totalUnits || calc > totalUnits) totalUnits = calc;
  }

  // P3: ケース数のみの場合（1ケース=24個）
  // 例: 「×2ケース」「2ケース入り」「1ケース」
  if (!totalUnits) {
    const caseOnlyMatch = name.match(/[×xX*]?\s*(\d+)\s*ケース/);
    if (caseOnlyMatch) {
      totalUnits = parseInt(caseOnlyMatch[1], 10) * 24;
    }
  }

  // specStr未確定の場合: 「枚・粒・錠・包・片」を規格として使う
  // 例: 「不織布マスク 20枚×3袋」→ specStr=20枚, totalUnits=3（P1で処理済み）
  if (!specStr) {
    const specUnitMatch = name.match(/((\d+)\s*(枚|粒|錠|包|片))/);
    if (specUnitMatch) {
      specStr = `${specUnitMatch[2]}${specUnitMatch[3]}`;
    }
  }

  // P4: 入数が取れなかった場合
  if (!totalUnits || totalUnits <= 0) totalUnits = 1;

  // ──────────────────────────────────────────────
  // STEP 3: ラベル生成（入数単位はすべて「個」に統一）
  // ──────────────────────────────────────────────
  const unitsLabel = totalUnits === 1 ? '1個' : `${totalUnits}個`;

  if (specStr) {
    return { label: `${specStr} ${unitsLabel}`, totalUnits };
  }
  return { label: unitsLabel, totalUnits };
}


async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '8080', 10);

  app.use(express.json());

  // ──────────────────────────────────────────────
  // 容量・入数ラベル抽出 API
  // Gemini不使用・正規表現で即時処理
  // ──────────────────────────────────────────────
  app.post('/api/gemini/capacities', async (req, res) => {
    try {
      const items: { rawName: string; capacityMl: number | null }[] = req.body.items || [];

      if (items.length === 0) {
        return res.json({ labels: [] });
      }

      const labels = items.map(item => {
        const result = extractCapacityLabel(item.rawName);
        return result.label;
      });

      res.json({ labels });

    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Proxy search request to the external API
  app.post('/api/search', async (req, res) => {
    try {
      const response = await fetch('https://ec-search-api-826846133648.asia-northeast1.run.app/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();