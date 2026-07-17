/**
 * 應用程式設定與常數
 * 集中管理所有設定值，方便維護與修改
 *
 * 必要的 Script Properties：
 * - LINE_CHANNEL_TOKEN (必填) - LINE Bot 的 Channel Access Token
 * - LINE_CHANNEL_SECRET (選填) - LINE Bot 的 Channel Secret，用於簽名驗證
 * - CALENDAR_ID (選填) - 器材租借同步的目標日曆 ID。未設定即代表關閉日曆同步
 */

// === 工作表設定 ===
const SHEET_LOANS = 'loans';
// 新增欄位一律加在尾端：ensureLoansHeaders_ 靠「現有表頭是否為前綴」判斷是否只補欄，
// 在中間插入欄位會被判定為非前綴而拋錯
const LOANS_HEADERS = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt', 'eventId'];

// users 分頁：userId → displayName 對照表，讓共用視圖顯示認得出來的名字
// 刻意不套用 ensureLoansHeaders_ 的自癒／補欄邏輯——分頁不存在就是空字典，
// 這張表壞掉不該讓 bot 停擺
const SHEET_USERS = 'users';
// 供 getUserDisplayNameMap_ 以 header.indexOf 定位欄位，故欄位順序不影響讀取
const USERS_HEADERS = ['userId', 'displayName'];

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
