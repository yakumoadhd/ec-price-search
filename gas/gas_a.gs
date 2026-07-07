// ============================================================
// GAS-A: Claudeメモ保存 v1.0
// Claude -> n8n WF-A -> GAS-A -> BigQuery claude_memo
// ============================================================

const PROPS_A = PropertiesService.getScriptProperties();
const GCP_PROJECT_A = PROPS_A.getProperty('GCP_PROJECT') || 'ec-price-search';
const BQ_DATASET_A  = PROPS_A.getProperty('BQ_DATASET')  || 'claude_context';

function doPostA(e) { return handleMemoRequest(e); }
function doGetA(e)  { return handleMemoRequest(e); }

function handleMemoRequest(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      body = e.parameter;
    }

    const action = body.action || 'saveMemo';

    if (action === 'saveMemo') {
      return saveMemo(body);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'Unknown action: ' + action })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

// プレーンテキストを受け取ってBQに保存
function saveMemo(body) {
  const text     = body.text     || body.content || '';
  const category = body.category || 'その他';
  const title    = body.title    || '無題';
  const summarizeTag = body.summarize_tag || 'summarize_ok';

  if (!text) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: 'text is required' })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  // XML+MD変換
  const now = new Date().toISOString();
  const formatted = buildMemoXml(category, title, now.substring(0, 10), summarizeTag, text);

  const row = {
    insertId: Utilities.getUuid(),
    json: {
      id:           Utilities.getUuid(),
      created_at:   now,
      category:     category,
      title:        title,
      content:      formatted,
      summarize_tag: summarizeTag
    }
  };

  BigQuery.Tabledata.insertAll(
    { rows: [row] },
    GCP_PROJECT_A, BQ_DATASET_A, 'claude_memo'
  );

  Logger.log('GAS-A: memo saved -> ' + title);
  return ContentService.createTextOutput(
    JSON.stringify({ status: 'ok', action: 'saveMemo', title: title, summarize_tag: summarizeTag })
  ).setMimeType(ContentService.MimeType.JSON);
}

// XML+MDフォーマット生成
function buildMemoXml(category, title, dateStr, summarizeTag, bodyText) {
  return '<memo>\n' +
    '  <meta>\n' +
    '    <tag>' + summarizeTag + '</tag>\n' +
    '    <category>' + category + '</category>\n' +
    '    <title>' + title + '</title>\n' +
    '    <created_at>' + dateStr + '</created_at>\n' +
    '  </meta>\n' +
    '  <body>\n' +
    bodyText + '\n' +
    '  </body>\n' +
    '</memo>';
}

// テスト用
function testSaveMemo() {
  const result = saveMemo({
    text: '## テスト\nGAS-A動作確認',
    category: 'テスト',
    title: 'GAS-Aテスト',
    summarize_tag: 'no_summarize'
  });
  Logger.log(result.getContent());
}
