// ============================================================
// GAS-B v10.2.1 - Notion🧠 → BigQuery パイプライン
// v10.2 → v10.2.1 変更点:
//   ① getChildPageIds() で lastEditedTime も取得するよう追加
//   ② latestPage 選出を「createdTime 降順、同値なら lastEditedTime 降順」に変更
//      → 同名ページが複数あっても必ず最新のページを取得できる
// ============================================================

const PROPS = PropertiesService.getScriptProperties();
const GCP_PROJECT    = PROPS.getProperty('GCP_PROJECT')  || 'ec-price-search';
const BQ_DATASET     = PROPS.getProperty('BQ_DATASET')   || 'claude_context';
const NOTION_TOKEN   = PROPS.getProperty('NOTION_TOKEN');
const NOTION_VERSION = '2022-06-28';
const GROQ_MODEL     = PROPS.getProperty('GROQ_MODEL')   || 'llama-3.3-70b-versatile';
const COEIROINK_URL  = PROPS.getProperty('COEIROINK_URL');

const BRAIN_PAGE_ID  = '38e95bec72e18165bd24f9dbc88e25c4';
const BRAIN_LOGS_MAX = 5;
const LOCK_WAIT_MS   = 30000;

// ============================================================
// Gropキー
// ============================================================
function getGroqKeys() {
  return [
    PROPS.getProperty('GROQ_API_KEY_01'), PROPS.getProperty('GROQ_API_KEY_02'),
    PROPS.getProperty('GROQ_API_KEY_03'), PROPS.getProperty('GROQ_API_KEY_04'),
    PROPS.getProperty('GROQ_API_KEY_05'), PROPS.getProperty('GROQ_API_KEY_06'),
    PROPS.getProperty('GROQ_API_KEY_07'), PROPS.getProperty('GROQ_API_KEY_08'),
  ].filter(Boolean);
}

// ============================================================
// エントリポイント（Notionの子ページ追加がトリガー）
// ============================================================
function doPost(e) {
  try {
    runPipeline();
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('ERROR: ' + err.message);
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// ロック付きラッパー（多重実行防止）
// ============================================================
function runPipeline() {
  const lock = LockService.getScriptLock();
  let hasLock = false;
  try {
    hasLock = lock.tryLock(LOCK_WAIT_MS);
    if (!hasLock) {
      Logger.log('⚠️ ロック取得失敗（他インスタンスみ実行中）→ 今回はスキップ');
      return;
    }
    runPipelineInner();
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

// ============================================================
// メインパイプライン本体
// ============================================================
function runPipelineInner() {
  Logger.log('=== GAS-B v10.2.1 開始 ===');

  // Step1: BQ brain_logs 最新5件取得
  const past5 = getPast5BrainLogs();
  Logger.log('BQ past5取得: ' + past5.length + '件');

  // Step2: ローテーションindex取得
  const idx = getRotationIndex();

  // Step3: Notion🧠の子ページを全取得 → 最新1件特定
  // ★v10.2.1修正: createdTime降順→同値ならlastEditedTime降順で最新を確実に取得
  const childPages = getChildPageIds(BRAIN_PAGE_ID);
  if (childPages.length === 0) {
    Logger.log('子ページなし → claude_memo要約のみ実行して終了');
    summarizeMemos(idx + 20);
    speakCoeiroink();
    return;
  }

  const latestPage = childPages.reduce(function(a, b) {
    const aCreated = new Date(a.createdTime || 0).getTime();
    const bCreated = new Date(b.createdTime || 0).getTime();
    if (bCreated !== aCreated) return bCreated > aCreated ? b : a;
    // createdTime が同値（または両方null）の場合は lastEditedTime で判定
    const aEdited = new Date(a.lastEditedTime || 0).getTime();
    const bEdited = new Date(b.lastEditedTime || 0).getTime();
    return bEdited > aEdited ? b : a;
  });
  Logger.log('最新ページ: 「' + latestPage.title + '」 created=' + latestPage.createdTime + ' edited=' + latestPage.lastEditedTime);

  // Step4: 最新子ページのテキスト取得 → ノイズ除去
  const rawText = fetchPageText(latestPage.id);
  const cleaned = removeNoise(rawText);
  Logger.log('ほぼ生データ取得完了: ' + cleaned.length + '字');

  // Step5: brain_logs に保存
  const bqLatest = past5.find(function(e) { return e.is_latest; }) || null;

  // 新セッション判定（Notion createdTime vs BQ updated_at）
  let isNew = true;
  if (bqLatest && latestPage.createdTime && bqLatest.updated_at) {
    isNew = new Date(latestPage.createdTime).getTime() > new Date(bqLatest.updated_at).getTime();
    Logger.log('新セッション判定: ' + isNew + ' (Notion=' + latestPage.createdTime + ' / BQ=' + bqLatest.updated_at + ')');
  }

  if (isNew) {
    if (bqLatest) {
      let bqLatestSummary;
      if (!bqLatest.content_raw || bqLatest.content_raw.length <= 200) {
        bqLatestSummary = bqLatest.content_summary || bqLatest.content_raw || '';
      } else {
        bqLatestSummary = callGroqSummary(idx, bqLatest.content_raw, 200) || bqLatest.content_raw.substring(0, 200);
      }
      demoteLatest(bqLatestSummary);
      Logger.log('旧is_latest降格完了');
    }
    const newSummary = callGroqSummary(idx + 10, cleaned, 200) || cleaned.substring(0, 200);
    insertBrainLog(latestPage.title, cleaned, newSummary, true);
    Logger.log('新brain_log INSERT完了: 「' + latestPage.title + '」');
    cleanupBrainLogs();
  } else {
    Logger.log('同一セッション → brain_logs スキップ');
  }

  // Step5.5: startup_context / handover_raw を更新
  updateStartupContext(latestPage.title, cleaned);

  // Step5.6: Notion子ページをアーカイブ（最新1件以外を全削除）
  archiveChildPages(childPages, latestPage.id);

  // Step6: claude_memo の summarize_ok を要約 → BQ UPDATE
  summarizeMemos(idx + 20);

  // Step7: COEIROINK で音声出力
  speakCoeiroink();

  Logger.log('=== GAS-B v10.2.1 完了 ✅ ===');
}

// ============================================================
// Notion子ページをアーカイブ（最新1件以外を全削除）
// ============================================================
function archiveChildPages(childPages, keepPageId) {
  let archivedCount = 0;
  childPages.forEach(function(page) {
    if (page.id === keepPageId) return;

    let attempt = 0;
    let success = false;
    while (attempt < 3 && !success) {
      attempt++;
      try {
        const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages/' + page.id, {
          method: 'PATCH',
          headers: {
            'Authorization':  'Bearer ' + NOTION_TOKEN,
            'Notion-Version': NOTION_VERSION,
            'Content-Type':   'application/json'
          },
          payload: JSON.stringify({ archived: true }),
          muteHttpExceptions: true
        });
        const code = res.getResponseCode();
        if (code === 200) {
          archivedCount++;
          success = true;
        } else if (code === 429) {
          const headers = res.getHeaders() || {};
          const retryAfter = parseInt(headers['Retry-After'] || headers['retry-after'] || '2', 10);
          Logger.log('429 rate limit[' + page.id + '] → ' + retryAfter + '秒待機（試行' + attempt + '/3）');
          Utilities.sleep((retryAfter + 1) * 1000);
        } else {
          Logger.log('アーカイブ失敗[' + page.id + ']: ' + code + ' ' + res.getContentText());
          break;
        }
      } catch (e) {
        Logger.log('アーカイブ例外[' + page.id + ']: ' + e.message);
        break;
      }
    }
    Utilities.sleep(350);
  });
  Logger.log('Notion子ページアーカイブ完了: ' + archivedCount + '件（最新1件保持）');
}

// ============================================================
// startup_context / handover_raw を更新
// ============================================================
function updateStartupContext(title, cleanedText) {
  try {
    const memoValue = ('--- 最新ログ「' + title + '」---\n' + cleanedText).substring(0, 50000);

    const updateResult = BigQuery.Jobs.query({
      query:
        'UPDATE `' + GCP_PROJECT + '.' + BQ_DATASET + '.startup_context` ' +
        'SET handover_memo = @memo, updated_at = CURRENT_TIMESTAMP() ' +
        'WHERE true',
      useLegacySql: false,
      timeoutMs: 20000,
      parameterMode: 'NAMED',
      queryParameters: [
        { name: 'memo', parameterType: { type: 'STRING' }, parameterValue: { value: memoValue } }
      ]
    }, GCP_PROJECT);

    const affected = updateResult.numDmlAffectedRows ? parseInt(updateResult.numDmlAffectedRows, 10) : 0;

    if (affected === 0) {
      Logger.log('startup_context: 対象行0件 → INSERTにフォールバック');
      BigQuery.Jobs.query({
        query:
          'INSERT INTO `' + GCP_PROJECT + '.' + BQ_DATASET + '.startup_context` ' +
          '(id, updated_at, handover_memo) VALUES (@id, CURRENT_TIMESTAMP(), @memo)',
        useLegacySql: false,
        timeoutMs: 20000,
        parameterMode: 'NAMED',
        queryParameters: [
          { name: 'id',   parameterType: { type: 'STRING' }, parameterValue: { value: Utilities.getUuid() } },
          { name: 'memo', parameterType: { type: 'STRING' }, parameterValue: { value: memoValue } }
        ]
      }, GCP_PROJECT);
      Logger.log('startup_context INSERT完了（新規行作成）');
    } else {
      Logger.log('startup_context.handover_memo 更新完了（' + affected + '行）');
    }

    BigQuery.Jobs.query({
      query:
        'INSERT INTO `' + GCP_PROJECT + '.' + BQ_DATASET + '.handover_raw` ' +
        '(id, updated_at, source, content) ' +
        'VALUES (@id, CURRENT_TIMESTAMP(), \'brain\', @content)',
      useLegacySql: false,
      timeoutMs: 20000,
      parameterMode: 'NAMED',
      queryParameters: [
        { name: 'id',      parameterType: { type: 'STRING' }, parameterValue: { value: Utilities.getUuid() } },
        { name: 'content', parameterType: { type: 'STRING' }, parameterValue: { value: cleanedText.substring(0, 50000) } }
      ]
    }, GCP_PROJECT);
    Logger.log('handover_raw INSERT完了');

    BigQuery.Jobs.query({
      query:
        'DELETE FROM `' + GCP_PROJECT + '.' + BQ_DATASET + '.handover_raw` ' +
        'WHERE id NOT IN (' +
        '  SELECT id FROM `' + GCP_PROJECT + '.' + BQ_DATASET + '.handover_raw` ' +
        '  ORDER BY updated_at DESC LIMIT 5)',
      useLegacySql: false,
      timeoutMs: 20000
    }, GCP_PROJECT);
    Logger.log('handover_raw クリーンアップ完了');

  } catch (e) {
    Logger.log('updateStartupContext エラー: ' + e.message);
  }
}

// ============================================================
// ノイズ除去
// ============================================================
const NOISE_PATTERNS = [
  /^Claudeが応答(中です|を完了しました)$/,
  /^Searched available tools$/,
  /.*連携を使用しました.*/,
  /^読み込まれたツール.*/,
  /^(Execute|Get)\s+[A-Za-z ]+$/,
  /^\d+秒間思考しました$/,
  /^もっと表示$/,
  /^\d+個のコマンドを実行しました$/,
];

function removeNoise(text) {
  if (!text) return '';
  const lines = text.split('\n').filter(function(line) {
    const t = line.trim();
    if (!t) return true;
    return !NOISE_PATTERNS.some(function(re) { return re.test(t); });
  });
  const deduped = [];
  lines.forEach(function(line) {
    const t = line.trim();
    if (t && deduped.length > 0 && deduped[deduped.length - 1].trim() === t) return;
    deduped.push(line);
  });
  return deduped.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ============================================================
// Groq 要約
// ============================================================
function callGroqSummary(startIdx, text, maxChars) {
  const keys = getGroqKeys();
  if (!keys.length) return text.substring(0, maxChars);
  const prompt =
    '以下を' + maxChars + '字以内に超圧縮してください。\n' +
    '「いつ・何をやったか・結果・次のタスク」を簡潔に。箇条書きOK。\n\n' +
    text.substring(0, 3000);

  for (let i = 0; i < keys.length; i++) {
    try {
      const key = keys[(startIdx + i) % keys.length];
      const res = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + key },
        payload: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400
        }),
        muteHttpExceptions: true
      });
      const data = JSON.parse(res.getContentText());
      if (res.getResponseCode() === 200 && data.choices && data.choices[0]) {
        return data.choices[0].message.content;
      }
      Logger.log('Groq[' + i + '] NG(' + res.getResponseCode() + ')');
    } catch (e) {
      Logger.log('Groq[' + i + '] 例外: ' + e.message);
    }
    Utilities.sleep(1000);
  }
  return text.substring(0, maxChars);
}

// ============================================================
// BigQuery ヘルパー
// ============================================================
function getPast5BrainLogs() {
  const result = BigQuery.Jobs.query({
    query:
      'SELECT id, title, content_raw, content_summary, is_latest, ' +
      'FORMAT_TIMESTAMP(\'%Y-%m-%dT%H:%M:%SZ\', updated_at) AS updated_at ' +
      'FROM `' + GCP_PROJECT + '.' + BQ_DATASET + '.brain_logs` ' +
      'ORDER BY updated_at DESC LIMIT 5',
    useLegacySql: false,
    timeoutMs: 15000
  }, GCP_PROJECT);
  if (!result.rows) return [];
  return result.rows.map(function(r) {
    return {
      id:              r.f[0].v,
      title:           r.f[1].v,
      content_raw:     r.f[2].v || '',
      content_summary: r.f[3].v || '',
      is_latest:       r.f[4].v === 'true' || r.f[4].v === true,
      updated_at:      r.f[5].v
    };
  });
}

function demoteLatest(newSummary) {
  BigQuery.Jobs.query({
    query:
      'UPDATE `' + GCP_PROJECT + '.' + BQ_DATASET + '.brain_logs` ' +
      'SET is_latest = false, content_summary = @summary WHERE is_latest = true',
    useLegacySql: false,
    timeoutMs: 20000,
    parameterMode: 'NAMED',
    queryParameters: [
      { name: 'summary', parameterType: { type: 'STRING' }, parameterValue: { value: newSummary } }
    ]
  }, GCP_PROJECT);
}

function insertBrainLog(title, contentRaw, contentSummary, isLatest) {
  BigQuery.Jobs.query({
    query:
      'INSERT INTO `' + GCP_PROJECT + '.' + BQ_DATASET + '.brain_logs` ' +
      '(id, updated_at, log_index, title, content_raw, content_summary, is_latest) ' +
      'VALUES (@id, CURRENT_TIMESTAMP(), 0, @title, @content_raw, @content_summary, @is_latest)',
    useLegacySql: false,
    timeoutMs: 20000,
    parameterMode: 'NAMED',
    queryParameters: [
      { name: 'id',              parameterType: { type: 'STRING' }, parameterValue: { value: Utilities.getUuid() } },
      { name: 'title',           parameterType: { type: 'STRING' }, parameterValue: { value: title } },
      { name: 'content_raw',     parameterType: { type: 'STRING' }, parameterValue: { value: contentRaw.substring(0, 50000) } },
      { name: 'content_summary', parameterType: { type: 'STRING' }, parameterValue: { value: contentSummary } },
      { name: 'is_latest',       parameterType: { type: 'BOOL'   }, parameterValue: { value: isLatest } }
    ]
  }, GCP_PROJECT);
}

function cleanupBrainLogs() {
  try {
    BigQuery.Jobs.query({
      query:
        'DELETE FROM `' + GCP_PROJECT + '.' + BQ_DATASET + '.brain_logs` ' +
        'WHERE id NOT IN (' +
        '  SELECT id FROM `' + GCP_PROJECT + '.' + BQ_DATASET + '.brain_logs` ' +
        '  ORDER BY updated_at DESC LIMIT ' + BRAIN_LOGS_MAX + ')',
      useLegacySql: false,
      timeoutMs: 20000
    }, GCP_PROJECT);
    Logger.log('brain_logs クリーンアップ完了');
  } catch (e) {
    Logger.log('cleanup エラー: ' + e.message);
  }
}

function getRotationIndex() {
  try {
    const r = BigQuery.Jobs.query({
      query: 'SELECT current_index FROM `' + GCP_PROJECT + '.' + BQ_DATASET + '.rotation_counter` LIMIT 1',
      useLegacySql: false, timeoutMs: 10000
    }, GCP_PROJECT);
    const idx = (r.rows && r.rows.length > 0) ? parseInt(r.rows[0].f[0].v, 10) : 0;

    BigQuery.Jobs.query({
      query:
        'UPDATE `' + GCP_PROJECT + '.' + BQ_DATASET + '.rotation_counter` ' +
        'SET current_index = ' + (idx + 1) + ', updated_at = CURRENT_TIMESTAMP() WHERE true',
      useLegacySql: false,
      timeoutMs: 20000
    }, GCP_PROJECT);

    return idx;
  } catch (e) {
    Logger.log('getRotationIndex エラー: ' + e.message);
    return 0;
  }
}

// ============================================================
// claude_memo の summarize_ok を要約 → UPDATE
// ============================================================
function summarizeMemos(startIdx) {
  const result = BigQuery.Jobs.query({
    query:
      'SELECT id, title, content FROM `' + GCP_PROJECT + '.' + BQ_DATASET + '.claude_memo` ' +
      'WHERE summarize_tag = \'summarize_ok\' ORDER BY created_at DESC LIMIT 10',
    useLegacySql: false, timeoutMs: 15000
  }, GCP_PROJECT);

  if (!result.rows || result.rows.length === 0) {
    Logger.log('claude_memo: summarize_ok なし');
    return;
  }

  result.rows.forEach(function(r, i) {
    const id      = r.f[0].v;
    const title   = r.f[1].v;
    const content = r.f[2].v;
    try {
      const summary = callGroqSummary(startIdx + i, content, 500) || content.substring(0, 500);
      BigQuery.Jobs.query({
        query:
          'UPDATE `' + GCP_PROJECT + '.' + BQ_DATASET + '.claude_memo` ' +
          'SET content = @content, summarize_tag = \'summarized\' WHERE id = @id',
        useLegacySql: false, timeoutMs: 20000,
        parameterMode: 'NAMED',
        queryParameters: [
          { name: 'content', parameterType: { type: 'STRING' }, parameterValue: { value: summary } },
          { name: 'id',      parameterType: { type: 'STRING' }, parameterValue: { value: id } }
        ]
      }, GCP_PROJECT);
      Logger.log('claude_memo 要約完了: 「' + title + '」');
    } catch (e) {
      Logger.log('claude_memo 要約失敗: 「' + title + '」 ' + e.message);
    }
  });
}

// ============================================================
// Notion ヘルパー
// ============================================================
// ★v10.2.1修正: lastEditedTime も取得するよう追加
function getChildPageIds(pageId) {
  const pages = [];
  let cursor  = null;
  do {
    let url = 'https://api.notion.com/v1/blocks/' + pageId + '/children?page_size=100';
    if (cursor) url += '&start_cursor=' + cursor;
    const res  = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': NOTION_VERSION },
      muteHttpExceptions: true
    });
    const data = JSON.parse(res.getContentText());
    (data.results || []).forEach(function(block) {
      if (block.type === 'child_page') {
        pages.push({
          id:             block.id,
          title:          block.child_page.title || '無題',
          createdTime:    block.created_time      || null,
          lastEditedTime: block.last_edited_time  || null  // ★追加
        });
      }
    });
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return pages;
}

function fetchPageText(pageId) {
  const res  = UrlFetchApp.fetch(
    'https://api.notion.com/v1/blocks/' + pageId + '/children?page_size=100', {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + NOTION_TOKEN, 'Notion-Version': NOTION_VERSION },
    muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText());
  let text   = '';
  (data.results || []).forEach(function(block) {
    const type = block.type;
    if (block[type] && block[type].rich_text) {
      block[type].rich_text.forEach(function(rt) { text += rt.plain_text; });
      text += '\n';
    }
  });
  return text.trim();
}

// ============================================================
// COEIROINK 音声出力
// ============================================================
function speakCoeiroink() {
  if (!COEIROINK_URL) {
    Logger.log('COEIROINK_URL未設定 → スキップ');
    return;
  }
  try {
    const text        = 'リリンの中に、おじさんの、大きいの入っちゃった！しゅごい♡';
    const speakerUuid = PROPS.getProperty('COEIROINK_SPEAKER_UUID') || '';
    const styleId     = parseInt(PROPS.getProperty('COEIROINK_STYLE_ID') || '0', 10);
    const queryRes = UrlFetchApp.fetch(COEIROINK_URL + '/v1/predict_and_generate_audio', {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify({
        speakerUuid:        speakerUuid,
        styleId:            styleId,
        text:               text,
        prosodyDetail:      null,
        volumeScale:        1.0,
        outputSamplingRate: 44100
      }),
      muteHttpExceptions: true
    });
    Logger.log('COEIROINK レスポンス: ' + queryRes.getResponseCode());
  } catch (e) {
    Logger.log('COEIROINK エラー: ' + e.message);
  }
}

// ============================================================
// デバッグ用手動実行
// ============================================================
function debugRun() {
  runPipeline();
}
