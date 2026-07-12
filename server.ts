import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

// ══════════════════════════════════════════════════════
// 商品名から「規格」と「入数」を正規表現で確実に抽出する
// Gemini不使用・即時処理・全商品種別対応
// ══════════════════════════════════════════════════════
function extractCapacityLabel(rawName: string): { label: string; totalUnits: number } {
  const name = rawName;

  let specStr: string | null = null;

  const mlMatch = name.match(/(\d+(?:\.\d+)?)\s*[mM][lL]/);
  if (mlMatch) specStr = `${parseFloat(mlMatch[1])}ml`;

  if (!specStr) {
    const lMatch = name.match(/(\d+(?:\.\d+)?)\s*[Ll](?!\w)/);
    if (lMatch) specStr = `${lMatch[1]}L`;
  }

  if (!specStr) {
    const kgMatch = name.match(/(\d+(?:\.\d+)?)\s*kg/i);
    if (kgMatch) specStr = `${kgMatch[1]}kg`;
  }

  if (!specStr) {
    const gMatch = name.match(/(\d+(?:\.\d+)?)\s*g(?!\w)/);
    if (gMatch) specStr = `${gMatch[1]}g`;
  }

  const COUNT_UNITS = '本|缶|個|袋|箱|冊|食|パック|セット';
  let totalUnits: number | null = null;

  const countMatches = [...name.matchAll(new RegExp(`(\\d+)\\s*(${COUNT_UNITS})`, 'g'))];
  if (countMatches.length > 0) {
    const counts = countMatches.map(m => parseInt(m[1], 10));
    totalUnits = Math.max(...counts);
  }

  const perCaseMatch = name.match(
    new RegExp(`(\\d+)\\s*(?:${COUNT_UNITS})[^\\d]*[×xX*]\\s*(\\d+)\\s*ケース`)
  );
  if (perCaseMatch) {
    const calc = parseInt(perCaseMatch[1], 10) * parseInt(perCaseMatch[2], 10);
    if (!totalUnits || calc > totalUnits) totalUnits = calc;
  }

  if (!totalUnits) {
    const caseOnlyMatch = name.match(/[×xX*]?\s*(\d+)\s*ケース/);
    if (caseOnlyMatch) {
      totalUnits = parseInt(caseOnlyMatch[1], 10) * 24;
    }
  }

  if (!specStr) {
    const specUnitMatch = name.match(/((\d+)\s*(枚|粒|錠|包|片))/);
    if (specUnitMatch) {
      specStr = `${specUnitMatch[2]}${specUnitMatch[3]}`;
    }
  }

  if (!totalUnits || totalUnits <= 0) totalUnits = 1;

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
  // ──────────────────────────────────────────────
  app.post('/api/gemini/capacities', async (req, res) => {
    try {
      const items: { rawName: string; capacityMl: number | null }[] = req.body.items || [];
      if (items.length === 0) return res.json({ labels: [] });
      const labels = items.map(item => extractCapacityLabel(item.rawName).label);
      res.json({ labels });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────────
  // Yahoo 検索中継（ec-search-api経由）
  // ──────────────────────────────────────────────
  app.post('/api/search', async (req, res) => {
    try {
      const response = await fetch('https://ec-search-api-826846133648.asia-northeast1.run.app/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: req.body.query || req.body.keyword }),
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ──────────────────────────────────────────────
// 楽天市場 商品検索エンドポイント
// ──────────────────────────────────────────────
app.post('/api/rakuten', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });

    const appId      = process.env.RAKUTEN_APPLICATION_ID;
    const accessKey  = process.env.RAKUTEN_ACCESS_KEY;
    const affiliateId = process.env.RAKUTEN_AFFILIATE_ID;
    if (!appId)     return res.status(500).json({ error: 'RAKUTEN_APPLICATION_ID not set' });
    if (!accessKey) return res.status(500).json({ error: 'RAKUTEN_ACCESS_KEY not set' });

    const params = new URLSearchParams({
      applicationId: appId,
      accessKey:     accessKey,
      keyword:       query,
      hits:          '20',
      sort:          'standard',
      formatVersion: '2',
      ...(affiliateId ? { affiliateId } : {}),
    });

    const response = await fetch(
      `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?${params}`
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Rakuten API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    // 楽天API（新旧共通）は Items（大文字I）で返す
    const rawItems: any[] = data.Items || data.items || [];
    const items = rawItems
      .filter((item: any) => item.itemCode && item.itemName && item.itemPrice > 0)
      .map((item: any) => {
        const price     = parseInt(item.itemPrice, 10) || 0;
        const pointRate = parseInt(item.pointRate,  10) || 1;
        const point     = Math.floor(price * pointRate / 100);

        // アフィリエイトURL: affiliateUrl優先、なければitemUrl
        const affiliateUrl: string =
          item.affiliateUrl ||
          item.itemUrl ||
          `https://item.rakuten.co.jp/${item.itemCode}/`;

        // 画像URL: mediumImageUrls は [{imageUrl: "..."}, ...] 形式
        let imageUrl = '';
        const imgs = item.mediumImageUrls;
        if (Array.isArray(imgs) && imgs.length > 0) {
          const first = imgs[0];
          imageUrl = (typeof first === 'string') ? first : (first?.imageUrl || '');
        }

        return {
          id:              `rakuten_${item.itemCode}`,
          mall:            'rakuten' as const,
          raw_name:        item.itemName,
          price,
          point,
          shipping_fee:    0,
          coupon_discount: 0,
          effective_total: price - point,
          affiliate_url:   affiliateUrl,
          image_url:       imageUrl,
          seller_name:     item.shopName || '',
          review_score:    parseFloat(item.reviewAverage) || 0,
          review_count:    parseInt(item.reviewCount, 10) || 0,
          capacity:        null,
          unit_price:      price,
          total_units:     1,
          rank:            0,
        };
      });

    res.json({ items });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

  // ──────────────────────────────────────────────
  // Amazon スクレイパー中継エンドポイント
  // Oracle A1のPuppeteerスクレイパーに中継
  // ──────────────────────────────────────────────
  app.post('/api/amazon', async (req, res) => {
    try {
      const { asin } = req.body;
      if (!asin) return res.status(400).json({ error: 'ASIN required' });

      const scraperUrl = 'http://161.33.140.166:8081/scrape';
      const response = await fetch(scraperUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asin }),
      });
      if (!response.ok) throw new Error(`Scraper error: ${response.status}`);
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

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
