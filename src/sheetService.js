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
 * - eventId: 對應的 Google 日曆事件 ID
 *            （上線前的舊紀錄、或建立時同步失敗過的紀錄為空）
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
 *
 * 要守住的不變量只有一個：**前 LOANS_HEADERS.length 欄必須剛好是 LOANS_HEADERS**，
 * 因為 borrowService 的 appendRow 是位置式寫入。
 *
 * 由此推出三種情況：
 * A. 空表 → 寫入完整表頭
 * B. 重疊範圍全部相符 → 補上缺少的表頭（若有），不動資料
 * C. 重疊範圍內有任何一欄對不上 → 拋錯，絕不清空
 *
 * 情況 B 讓「在尾端新增欄位」成為安全操作：doPost 每個 request 都會呼叫本函式，
 * 若沿用舊版「表頭不符就 sheet.clear()」的做法，LOANS_HEADERS 一旦新增欄位並
 * 上線，下一個 LINE 訊息就會清空正式表上所有租借紀錄。
 *
 * 注意 getLastColumn() 是「整張表」的最後一欄而非第 1 列的：使用者只要在
 * 任何一列的 H 欄打了備註，headerStr 就會多出尾巴。那不是結構損壞，
 * 讀取靠 header.indexOf 完全不受影響，故一律容忍多出來的尾欄——
 * 否則有人加個備註欄就會讓整個 bot 每個 request 都拋錯。
 */
function ensureLoansHeaders_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_LOANS);

  // 如果工作表不存在，建立新的
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LOANS);
  }

  const lastCol = sheet.getLastColumn();
  const header = lastCol > 0 ? (sheet.getRange(1, 1, 1, lastCol).getValues()[0] || []) : [];
  const headerStr = header.map(String);

  // 去掉尾端空白儲存格：它們只代表別列在該欄有內容，不代表表頭有那一欄
  while (headerStr.length && headerStr[headerStr.length - 1].trim() === '') {
    headerStr.pop();
  }

  // 情況A：空表 → 寫入完整表頭
  if (headerStr.length === 0) {
    sheet.getRange(1, 1, 1, LOANS_HEADERS.length).setValues([LOANS_HEADERS]);
    return;
  }

  // 情況B：重疊範圍全部相符 → 補上缺少的表頭（若有），不動資料
  // 多出來的尾欄（使用者自己加的備註欄）一律容忍
  const overlap = Math.min(headerStr.length, LOANS_HEADERS.length);
  const overlapMatches = LOANS_HEADERS.slice(0, overlap).every((h, i) => h === headerStr[i]);

  if (overlapMatches) {
    const missing = LOANS_HEADERS.slice(headerStr.length);
    if (missing.length) {
      sheet.getRange(1, headerStr.length + 1, 1, missing.length).setValues([missing]);
    }
    return;
  }

  // 情況C：重疊範圍內就對不上 → 欄位錯位，位置式的 appendRow 會寫到錯的欄
  // 拋錯而非清空：在有資料的正式表上 clear() 永遠是錯的選擇，
  // 寧可讓 bot 壞掉並寄通知信，也不要它安靜地把資料燒掉
  console.error('loans 表頭與 LOANS_HEADERS 不符', {
    expected: LOANS_HEADERS,
    actual: headerStr
  });
  throw new Error('loans 工作表的表頭結構異常，請人工檢查');
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
    eventId: safeCell_(row, idx['eventId']),
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
 * 更新特定記錄的 eventId
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 工作表物件
 * @param {number} rowIndex - 要更新的行號（1-based）
 * @param {string} eventId - Google 日曆事件 ID
 * @returns {boolean} 更新是否成功
 */
function updateRecordEventId_(sheet, rowIndex, eventId) {
  try {
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const eventIdIndex = header.indexOf('eventId');

    if (eventIdIndex === -1) {
      console.error('找不到 eventId 欄位');
      return false;
    }

    // 更新指定行的 eventId 欄位（欄位索引+1因為是1-based）
    sheet.getRange(rowIndex, eventIdIndex + 1).setValue(eventId);
    return true;
  } catch (error) {
    console.error('回寫 eventId 時發生錯誤:', error);
    return false;
  }
}

/**
 * 取得 userId → displayName 的對照表
 *
 * users 分頁為選配：不存在就回傳空物件，所有名稱一律 fallback 回 LINE 暱稱。
 * 刻意不自動建表、不套用 ensureLoansHeaders_ 那套自癒邏輯——
 * 這張表壞掉或還沒建立，都不該讓 bot 停擺。
 *
 * 呼叫端應該一次請求只呼叫一次，不要每列都呼叫。
 *
 * @returns {Object<string, string>} 對照表；分頁不存在或表頭異常時回傳 {}
 */
function getUserDisplayNameMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_USERS);
  if (!sheet) return {};

  const rng = sheet.getDataRange().getValues();
  if (!rng || rng.length < 2) return {};

  const header = rng.shift().map(String);
  const idIdx = header.indexOf('userId');
  const nameIdx = header.indexOf('displayName');
  if (idIdx === -1 || nameIdx === -1) return {};

  const map = {};
  rng.forEach(row => {
    const uid = String(row[idIdx] || '').trim();
    const name = String(row[nameIdx] || '').trim();
    if (uid && name) map[uid] = name;
  });
  return map;
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
