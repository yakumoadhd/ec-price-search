// ============================================================
// BigQuery × GAS × Groq(メイン)/Gemini(フォールバック) パイプライン v8.0
// GAS ID: 1UhK9vJAX4dW6ivpP4J3ade1_xOXpVraZ81CCiVYFCu_9MX6e0jhNWxDb
// ============================================================

const PROPS = PropertiesService.getScriptProperties();
const GCP_PROJECT  = PROPS.getProperty('GCP_PROJECT')  || 'ec-price-search';
const BQ_DATASET   = PROPS.getProperty('BQ_DATASET')   || 'claude_context';
const NOTION_TOKEN = PROPS.getProperty('NOTION_TOKEN');
const NOTION_VERSION = '2022-06-28';
const GROQ_MODEL = PROPS.getProperty('GROQ_MODEL') || 'llama-3.3-70b-versatile';

const BRAIN_PAGE_ID    = '38e95bec72e18165bd24f9dbc88e25c4';
const HANDOVER_PAGE_ID = '38595bec72e181b58103ccb42a7f0387';
const LIBRARY_PAGE_ID  = '38995bec72e181578b9cdb40b3e07d71';

function getGroqKeys() {
  return [
    PROPS.getProperty('GROQ_API_KEY_01'),
    PROPS.getProperty('GROQ_API_KEY_02'),
    PROPS.getProperty('GROQ_API_KEY_03'),
    PROPS.getProperty('GROQ_API_KEY_04'),
    PROPS.getProperty('GROQ_API_KEY_05'),
    PROPS.getProperty('GROQ_API_KEY_06'),
    PROPS.getProperty('GROQ_API_KEY_07'),
    PROPS.getProperty('GROQ_API_KEY_08'),
  ].filter(Boolean);
}

function getGeminiKeys() {
  return [
    PROPS.getProperty('GEMINI_KEY_1'),
    PROPS.getProperty('GEMINI_KEY_2'),
    PROPS.getProperty('GEMINI_KEY_3'),
    PROPS.getProperty('GEMINI_KEY_4'),
    PROPS.getProperty('GEMINI_KEY_5'),
    PROPS.getProperty('GEMINI_KEY_6'),
    PROPS.getProperty('GEMINI_KEY_7'),
    PROPS.getProperty('GEMINI_KEY_8'),
  ].filter(Boolean);
}