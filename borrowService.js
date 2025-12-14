/**
 * 器材借用服務
 * 負責處理器材借用相關的業務邏輯
 */

/**
 * 處理借器材表單訊息
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

  // 寫入借用紀錄（欄位順序固定）
  loans.appendRow([
    now,                // ts
    userId,             // userId
    username,           // username
    parsed.items,       // items ← 租用器材
    parsed.borrowedAt,  // borrowedAt ← 租用日期
    parsed.returnedAt   // returnedAt ← 歸還日期
  ]);

  // 回覆確認訊息
  replyMessage_(event.replyToken,
    [
      '✅ 已建立借用紀錄：',
      `借用人：${username}`,
      `器材：${parsed.items}`,
      `租用日期：${formatDotDate_(parsed.borrowedAt)}`,
      `歸還日期：${formatDotDate_(parsed.returnedAt)}`
    ].join('\n')
  );
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
