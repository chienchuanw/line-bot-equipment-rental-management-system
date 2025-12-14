/**
 * 應用程式設定與常數
 * 集中管理所有設定值，方便維護與修改
 *
 * 必要的 Script Properties：
 * - LINE_CHANNEL_TOKEN (必填) - LINE Bot 的 Channel Access Token
 * - LINE_CHANNEL_SECRET (選填) - LINE Bot 的 Channel Secret，用於簽名驗證
 */

// === 工作表設定 ===
const SHEET_LOANS = 'loans';
const LOANS_HEADERS = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt'];

// === 訊息設定 ===
const UNKNOWN_CMD_MSG = '目前沒有此指令，請使用「查指令」查看指令範例';

// === LINE API 設定 ===
const LINE_API_BASE_URL = 'https://api.line.me/v2/bot';

/**
 * 取得 Script Properties 中的設定值
 * @param {string} key - 設定鍵值
 * @returns {string|null} 設定值
 */
function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
