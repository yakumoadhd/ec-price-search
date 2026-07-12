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

      const appId       = process.env.RAKUTEN_APPLICATION_ID;
      const accessKey   = process.env.RAKUTEN_ACCESS_KEY;
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
      const rawItems: any[] = data.Items || data.items || [];
      const items = rawItems
        .filter((item: any) => item.itemCode && item.itemName && item.itemPrice > 0)
        .map((item: any) => {
          const price     = parseInt(item.itemPrice, 10) || 0;
          const pointRate = parseInt(item.pointRate, 10) || 1;
          const point     = Math.floor(price * pointRate / 100);

          const affiliateUrl: string =
            item.affiliateUrl ||
            item.itemUrl ||
            `https://item.rakuten.co.jp/${item.itemCode}/`;

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
  // Amazon検索エンドポイント
  // SearXNG(Oracle:8080) → ASIN抽出 → scrape(Oracle:8081)
  // ──────────────────────────────────────────────
  app.post('/api/amazon', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: 'query required' });

      const SEARXNG = 'http://161.33.140.166:8080';
      const SCRAPER = 'http://161.33.140.166:8081';

      // ① SearXNGでAmazon商品URL検索
      const searxUrl = `${SEARXNG}/search?q=${encodeURIComponent(query + ' amazon.co.jp')}&format=json&engines=brave,yahoo`;
      const searxRes = await fetch(searxUrl, { signal: AbortSignal.timeout(10000) });
      if (!searxRes.ok) throw new Error(`SearXNG error: ${searxRes.status}`);
      const searxData = await searxRes.json();

      // ② URLからASIN抽出（重複除去・上位5件）
      const asinSet = new Set<string>();
      const asinRegex = /\/dp\/([A-Z0-9]{10})/;
      for (const result of searxData.results || []) {
        const match = asinRegex.exec(result.url || '');
        if (match) asinSet.add(match[1]);
        if (asinSet.size >= 5) break;
      }

      if (asinSet.size === 0) return res.json({ items: [] });

      // ③ ASINをOracle scraperに並列投げ
      const scrapeResults = await Promise.allSettled(
        [...asinSet].map(asin =>
          fetch(`${SCRAPER}/scrape`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ asin }),
            signal: AbortSignal.timeout(10000),
          }).then(r => r.json())
        )
      );

      // ④ 結果をAffiliateItem形式に変換
      const items = scrapeResults
        .filter(r => r.status === 'fulfilled' && (r as any).value?.price > 0)
        .map((r: any) => {
          const d = r.value;
          return {
            id:              `amazon_${d.asin}`,
            mall:            'amazon' as const,
            raw_name:        d.title || '',
            price:           d.price || 0,
            point:           0,
            shipping_fee:    0,
            coupon_discount: 0,
            effective_total: d.price || 0,
            affiliate_url:   d.affiliateUrl || `https://www.amazon.co.jp/dp/${d.asin}`,
            image_url:       d.imageUrl || '',
            seller_name:     'Amazon',
            review_score:    0,
            review_count:    0,
            capacity:        null,
            unit_price:      d.price || 0,
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
  // Vite（開発）/ 静的ファイル配信（本番）
  // ──────────────────────────────────────────────
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
