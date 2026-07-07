// ================================================================
// GAS-B: Notion会話ログ保存 v1.0
// Notion Webhook -> GAS-B -> BQ (brain_logs / claude_memo要約)
// ================================================================

const PROPS_B       = PropertiesService.getScriptProperties();
const GCP_PROJECT_B = PROPS_B.getProperty('GCP_PROJECT') || 'ec-price-search';
const BQ_DATASET_B  = PROPS_B.getProperty('BQ_DATASET')  || 'claude_context';
const NOTION_TOKEN  = PROPS_B.getProperty('NOTION_TOKEN');
const GROQ_KEYS_B   = PROPS_B.getProperty('GROQ_API_KEYS');

// ============================================================
// エントリーポイント
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    Logger.log('GAS-B受信: ' + JSON.stringify(body).slice(0, 500));

    // Notion Webhook 初回検証（verification_token）
    if (body.verification_token) {
      return ContentService.createTextOutput(
        JSON.stringify({ challenge: body.verification_token })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // page.content_updated イベント処理
    const eventType = body.event?.type || body.type || '';
    if (eventType === 'page.content_updated') {
      const pageId = body.entity?.id || body.data?.id || body.page_id || '';
      if (!pageId) {
        Logger.log('pageId取得失敗: ' + JSON.stringify(body));
        return okResponse();
      }

      // ① Notionページ処理 → BQ brain_logsへ
      processNotionPage(pageId);

      // ② claude_memo summarize_ok → Groq要約 → BQ更新
      processMemoSummarize();
    }

    return okResponse();

  } catch (err) {
    Logger.log('GAS-B エラー: ' + err.message);
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function okResponse() {
  return ContentService.createTextOutput(
    JSON.stringify({ status: 'ok' })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// ① Notionページ取得 → クリーニング → Groq要約 → BQ brain_logs保存
// ============================================================
function processNotionPage(pageId) {
  const raw = fetchNotionBlocks(pageId);
  if (!raw || raw.length < 10) {
    Logger.log('Notionコンテンツ取得失敗 or 空: ' + pageId);
    return;
  }

  const cleaned = cleanContent(raw);
  const summary = summarizeWithGroq(cleaned, 200);
  const now     = new Date().toISOString();
  const xml     = buildBrainXml(pageId, now.slice(0, 10), summary, cleaned);

  const row = {
    insertId: Utilities.getUuid(),
    json: {
      id:              Utilities.getUuid(),
      updated_at:      now,
      page_id:         pageId,
      log_index:       0,
      is_latest:       true,
      content_raw:     cleaned.slice(0, 10000),
      content_summary: summary,
      xml_md:          xml,
    }
  };

  BigQuery.Tabledata.insertAll(
    { rows: [row] },
    GCP_PROJECT_B, BQ_DATASET_B, 'brain_logs'
  );
  Logger.log('GAS-B: brain_logs保存完了 -> ' + pageId);
}

// Notion Blocks APIでブロック取得 → テキスト抽出
function fetchNotionBlocks(pageId) {
  try {
    const cleanId = pageId.replace(/-/g, '');
    const url = 'https://api.notion.com/v1/blocks/' + cleanId + '/children?page_size=100';
    const res = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + NOTION_TOKEN,
        'Notion-Version': '2022-06-28',
      },
      muteHttpExceptions: true,
    });
    const data = JSON.parse(res.getContentText());
    if (!data.results) {
      Logger.log('Notion API失敗: ' + res.getContentText().slice(0, 300));
      return '';
    }
    return extractText(data.results);
  } catch (err) {
    Logger.log('fetchNotionBlocks エラー: ' + err.message);
    return '';
  }
}

// ブロック配列からプレーンテキスト抽出
function extractText(blocks) {
  const lines = [];
  for (const block of blocks) {
    const type = block.type;
    if (!type) continue;
    const content = block[type];
    if (!content) continue;
    // code ブロックはスキップ
    if (type === 'code') continue;
    if (content.rich_text) {
      const text = content.rich_text.map(t => t.plain_text || '').join('');
      if (text.trim()) lines.push(text);
    }
  }
  return lines.join('\n');
}

// クリーニング（コードブロック・インラインコード・区切り線・連続空行剉除）
function cleanContent(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/^[-=]{3,}$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============================================================
// ② claude_memo の summarize_ok → Groq要約 → BQ再保存
// ============================================================
function processMemoSummarize() {
  const memos = fetchSummarizableMemos();
  if (!memos || memos.length === 0) {
    Logger.log('GAS-B: summarize_okメモなし');
    return;
  }
  for (const memo of memos) {
    const summary = summarizeWithGroq(memo.content, 200);
    const now = new Date().toISOString();
    BigQuery.Tabledata.insertAll(
      { rows: [{ insertId: memo.id + '_s', json: {
        id:            Utilities.getUuid(),
        created_at:    now,
        category:      'summary',
        title:         '[要約済] ' + (memo.title || '').slice(0, 80),
        content:       summary,
        summarize_tag: 'summarized',
      }}]},
      GCP_PROJECT_B, BQ_DATASET_B, 'claude_memo'
    );
    Logger.log('GAS-B: メモ要約保存完了 -> ' + memo.id);
  }
}

function fetchSummarizableMemos() {
  try {
    const result = BigQuery.Jobs.query(GCP_PROJECT_B, {
      query: `
        SELECT id, title, content
        FROM \`${GCP_PROJECT_B}.${BQ_DATASET_B}.claude_memo\`
        WHERE summarize_tag = 'summarize_ok'
        ORDER BY created_at DESC
        LIMIT 5
      `,
      useLegacySql: false,
      timeoutMs: 10000,
    });
    if (!result.rows) return [];
    return result.rows.map(row => ({
      id:      row.f[0].v,
      title:   row.f[1].v,
      content: row.f[2].v,
    }));
  } catch (err) {
    Logger.log('fetchSummarizableMemos エラー: ' + err.message);
    return [];
  }
}

// ============================================================
// Groq要約（ローテーション対応）
// ============================================================
function summarizeWithGroq(text, maxChars) {
  const keys = GROQ_KEYS_B ? JSON.parse(GROQ_KEYS_B) : [];
  if (keys.length === 0) {
    Logger.log('GAS-B: Groqキーなし・先頭切り出し');
    return text.slice(0, maxChars);
  }
  const idx    = getGroqKeyIndex(keys.length);
  const apiKey = keys[idx];
  try {
    const prompt =
      `以下を${maxChars}字以内で要約。重要な進捗・決定・地雷を優先して残すこと。\n\n` +
      text.slice(0, 3000);
    const res = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.3,
      }),
      muteHttpExceptions: true,
    });
    const data = JSON.parse(res.getContentText());
    return data.choices?.[0]?.message?.content || text.slice(0, maxChars);
  } catch (err) {
    Logger.log('Groq要約エラー: ' + err.message);
    return text.slice(0, maxChars);
  }
}

function getGroqKeyIndex(total) {
  try {
    const result = BigQuery.Jobs.query(GCP_PROJECT_B, {
      query: `SELECT current_index FROM \`${GCP_PROJECT_B}.${BQ_DATASET_B}.rotation_counter\`
              WHERE service = 'groq' ORDER BY updated_at DESC LIMIT 1`,
      useLegacySql: false,
      timeoutMs: 5000,
    });
    const current = result.rows?.[0]?.f?.[0]?.v ? parseInt(result.rows[0].f[0].v) : 0;
    const next    = (current + 1) % total;
    BigQuery.Tabledata.insertAll(
      { rows: [{ insertId: 'groq_b_' + Date.now(), json: {
        service:       'groq',
        current_index: next,
        updated_at:    new Date().toISOString(),
      }}]},
      GCP_PROJECT_B, BQ_DATASET_B, 'rotation_counter'
    );
    return current;
  } catch (err) {
    Logger.log('getGroqKeyIndex エラー: ' + err.message);
    return 0;
  }
}

// ============================================================
// XMLフォーマット生成
// ============================================================
function buildBrainXml(pageId, dateStr, summary, raw) {
  return '<brain_log>\n' +
    '  <meta>\n' +
    '    <page_id>' + pageId + '</page_id>\n' +
    '    <created_at>' + dateStr + '</created_at>\n' +
    '    <is_latest>true</is_latest>\n' +
    '  </meta>\n' +
    '  <summary>' + summary + '</summary>\n' +
    '  <body>\n' +
    raw.slice(0, 2000) + '\n' +
    '  </body>\n' +
    '</brain_log>';
}

// ============================================================
// テスト関数（GASエディタからプレーク）
// ============================================================
function testGasBSummarize() {
  Logger.log('=== GAS-B summarize テスト ===');
  processMemoSummarize();
  Logger.log('=== 完了 ===');
}
