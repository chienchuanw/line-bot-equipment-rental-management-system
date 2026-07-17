/**
 * 器材借用服務
 * 負責處理器材借用相關的業務邏輯
 */

/**
 * 處理借器材表單訊息
 *
 * 執行順序是刻意設計的：寫入 → 回覆使用者 → 最後才碰日曆。
 *
 * 1. 先回覆再碰日曆：本函式沒有 try/catch，若日曆呼叫在回覆之前拋錯，
 *    使用者在 LINE 那端會完全等不到回應（石沉大海）。
 * 2. 日曆同步刻意不加 try/catch：loans 是唯一真實來源，日曆只是鏡像，
 *    日曆故障不該擋下借器材。例外往上拋，Apps Script 內建機制會自動寄
 *    失敗通知信給 script owner，使用者則完全無感。
 *
 * @param {Object} event - LINE 事件物件
 * @param {string} rawText - 原始訊息文字
 * @param {string} userId - 使用者 ID
 */
function handleBorrowForm_(event, rawText, userId) {
  const loans = getLoansSheet_();
  if (!loans) return replyMessage_(event.replyToken, `找不到工作表：${SHEET_LOANS}`);

  const parsed = parseBorrowMessage_(rawText);
  if (!parsed.ok) return replyMessage_(event.replyToken, parsed.msg);

  // 優先以 LINE API 取得顯示名稱，若失敗則退回 userId
  const username = fetchLineDisplayName_(userId) || userId;
  const now = new Date();

  // 寫入借用紀錄（位置式寫入，欄位順序必須與 LOANS_HEADERS 一致）
  loans.appendRow([
    now,                // ts
    userId,             // userId
    username,           // username
    parsed.items,       // items ← 租用器材
    parsed.borrowedAt,  // borrowedAt ← 租用日期
    parsed.returnedAt,  // returnedAt ← 歸還日期
    ''                  // eventId ← 建立日曆事件後回寫
  ]);
  const rowIndex = loans.getLastRow();

  // 回覆確認訊息（必須在碰日曆之前，否則日曆一爆使用者就石沉大海）
  replyMessage_(event.replyToken,
    [
      '✅ 已建立借用紀錄：',
      `借用人：${username}`,
      `器材：${parsed.items}`,
      `租用日期：${formatDotDate_(parsed.borrowedAt)}`,
      `歸還日期：${formatDotDate_(parsed.returnedAt)}`
    ].join('\n')
  );

  // 日曆同步：失敗時例外往上拋，使用者無感，script owner 收到通知信
  syncNewLoanToCalendar_(loans, rowIndex, {
    userId,
    username,
    items: parsed.items,
    borrowedAt: parsed.borrowedAt,
    returnedAt: parsed.returnedAt
  });
}

/**
 * 將新的借用紀錄同步到 Google 日曆並回寫 eventId
 * @param {GoogleAppsScript.Spreadsheet.Sheet} loans - 借用紀錄工作表
 * @param {number} rowIndex - 該紀錄的列號（1-based）
 * @param {Object} record - { userId, username, items, borrowedAt, returnedAt }
 */
function syncNewLoanToCalendar_(loans, rowIndex, record) {
  // 日曆是給別人看的共用視圖，故套用 users 對照表的名稱而非 LINE 暱稱
  const displayName = resolveDisplayName_(record.userId, record.username, getUserDisplayNameMap_());

  const eventId = createRentalEvent_({
    displayName,
    items: record.items,
    borrowedAt: record.borrowedAt,
    returnedAt: record.returnedAt
  });

  // eventId 為 null 代表 CALENDAR_ID 未設定（功能關閉），不需回寫
  if (eventId) updateRecordEventId_(loans, rowIndex, eventId);
}

/**
 * 解析借器材四行表單格式
 * @param {string} raw - 原始訊息文字
 * @returns {Object} 解析結果 { ok: boolean, msg?: string, items?: string, returnedAt?: Date, borrowedAt?: Date }
 */
function parseBorrowMessage_(raw) {
  // 移除前綴「借器材」
  const text = String(raw || '').replace(/^借器材[ \t]*/i, '').trim();

  // 期望四行格式（允許空行會被過濾）
  // 借器材
  // 租用器材：器材一, 器材二, 器材三
  // 租用日期：YYYY.MM.DD
  // 歸還日期：YYYY.MM.DD
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length < 3) {
    return { ok: false, msg: '格式錯誤：請使用四行格式（借器材：租用器材／租用日期／歸還日期）' };
  }

  // 解析每一行的鍵值對
  const kv = {};
  for (const line of lines) {
    // 支援中英文冒號
    const m = line.match(/^(租用器材|租用日期|歸還日期)\s*[:：]\s*(.+)$/);
    if (!m) return { ok: false, msg: `格式錯誤：無法解析「${line}」` };
    kv[m[1]] = m[2].trim();
  }

  // 檢查必要欄位
  if (!kv['租用器材'] || !kv['租用日期'] || !kv['歸還日期']) {
    return { ok: false, msg: '格式錯誤：三個欄位皆必填（租用器材／租用日期／歸還日期）' };
  }

  // 器材以逗號分隔（中英文逗號）
  const items = kv['租用器材'].split(/[，,]/).map(s => s.trim()).filter(Boolean).join(', ');

  // 解析日期
  const rentDate = parseDotDate_(kv['租用日期']);   // YYYY.MM.DD
  const backDate = parseDotDate_(kv['歸還日期']);   // YYYY.MM.DD
  if (!rentDate || !backDate) {
    return { ok: false, msg: '日期格式錯誤：請用 YYYY.MM.DD（例如 2025.09.03）' };
  }

  // 檢查日期邏輯
  if (startOfDay_(backDate) < startOfDay_(rentDate)) {
    return { ok: false, msg: '日期邏輯錯誤：歸還日期不可早於租用日期' };
  }

  // 正確的欄位映射：
  // 租用器材 → items
  // 租用日期 → borrowedAt
  // 歸還日期 → returnedAt
  return {
    ok: true,
    items,
    borrowedAt: rentDate, // 租用日期
    returnedAt: backDate  // 歸還日期
  };
}
