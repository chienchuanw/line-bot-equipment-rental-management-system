/**
 * Google Sheets 操作服務
 * 負責所有與試算表相關的資料存取操作
 *
 * 借用紀錄工作表欄位結構：
 * - ts: 建立時間戳記
 * - userId: LINE 使用者 ID
 * - username: 使用者 LINE 顯示名稱
 * - items: 租用器材清單
 * - borrowedAt: 租用日期（對應使用者輸入的「租用日期」）
 * - returnedAt: 歸還日期（對應使用者輸入的「歸還日期」）
 */

/**
 * 取得借用紀錄工作表
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null} 工作表物件
 */
function getLoansSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_LOANS) || null;
}

/**
 * 確保借用紀錄工作表存在且有正確的標題列
 * 如果工作表不存在會自動建立，標題不正確會重新設定
 */
function ensureLoansHeaders_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LOANS);

  // 如果工作表不存在，建立新的
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LOANS);
  }

  // 檢查標題列是否正確
  const lastCol = sheet.getLastColumn();
  const header = lastCol > 0 ? (sheet.getRange(1, 1, 1, lastCol).getValues()[0] || []) : [];
  const headerStr = header.map(String);

  // 比較標題是否完全相同
  const same = LOANS_HEADERS.length === headerStr.length &&
    LOANS_HEADERS.every((h, i) => h === headerStr[i]);

  // 如果標題不正確，重新設定
  if (!same) {
    sheet.clear();
    sheet.getRange(1, 1, 1, LOANS_HEADERS.length).setValues([LOANS_HEADERS]);
  }
}

/**
 * 取得所有借用紀錄資料
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 工作表物件
 * @returns {Array<Object>} 借用紀錄陣列
 */
function getLoanRows_(sheet) {
  const rng = sheet.getDataRange().getValues();
  if (!rng || rng.length < 2) return [];

  const header = rng.shift().map(String);
  const idx = {};
  LOANS_HEADERS.forEach((h) => { idx[h] = header.indexOf(h); });

  return rng.map(row => ({
    ts: safeCell_(row, idx['ts']),
    userId: safeCell_(row, idx['userId']),
    username: safeCell_(row, idx['username']),
    items: safeCell_(row, idx['items']),
    borrowedAt: safeCell_(row, idx['borrowedAt']),
    returnedAt: safeCell_(row, idx['returnedAt']),
  }));
}

/**
 * 更新特定記錄的歸還日期
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 工作表物件
 * @param {number} rowIndex - 要更新的行號（1-based）
 * @param {Date} newReturnDate - 新的歸還日期
 * @returns {boolean} 更新是否成功
 */
function updateRecordReturnDate_(sheet, rowIndex, newReturnDate) {
  try {
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const returnedAtIndex = header.indexOf('returnedAt');

    if (returnedAtIndex === -1) {
      console.error('找不到 returnedAt 欄位');
      return false;
    }

    // 更新指定行的 returnedAt 欄位（欄位索引+1因為是1-based）
    sheet.getRange(rowIndex, returnedAtIndex + 1).setValue(newReturnDate);
    return true;
  } catch (error) {
    console.error('更新歸還日期時發生錯誤:', error);
    return false;
  }
}

/**
 * 安全地取得儲存格值
 * @param {Array} row - 資料列
 * @param {number} i - 欄位索引
 * @returns {any} 儲存格值
 */
function safeCell_(row, i) {
  if (i === -1) return '';
  return row[i];
}
