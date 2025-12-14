/**
 * LINE Bot 主要入口點與事件路由器
 *
 * 負責處理 LINE Webhook 請求並將事件路由到對應的處理函式
 */

/**
 * GET 請求處理器（用於瀏覽器測試）
 * 首次部署時會自動建立工作表與標題
 */
function doGet(e) {
  ensureLoansHeaders_(); // 首次部署時自動建表＋補標題
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

/**
 * POST 請求處理器（LINE Webhook 入口）
 * 接收 LINE 平台發送的事件並進行處理
 */
function doPost(e) {
  ensureLoansHeaders_();

  const body = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
  const valid = verifyLineSignature_(body, e); // 在 GAS 無 header 仍放行

  if (!valid) {
    return ContentService.createTextOutput('Signature invalid').setMimeType(ContentService.MimeType.TEXT);
  }

  // 解析 JSON 格式的請求內容
  let json = {};
  try { json = body ? JSON.parse(body) : {}; } catch (_) { }
  const events = (json && Array.isArray(json.events)) ? json.events : [];
  if (!events.length) {
    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  }

  // 處理每個事件
  events.forEach(handleEvent_);
  return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
}

/**
 * LINE 簽名驗證（在 GAS 環境下的最佳努力實作）
 * 由於 GAS 難以取得完整的 HTTP headers，此處僅做基本驗證
 * @param {string} body - 請求內容
 * @param {Object} e - 請求事件物件（目前未使用）
 * @returns {boolean} 驗證結果
 */
function verifyLineSignature_(body, e) {
  // GAS 幾乎拿不到 headers；此處若 body 存在則計算簽名但不強制比對（為相容性）
  if (!body) return true;
  const secret = getProp_('LINE_CHANNEL_SECRET') || '';
  try {
    Utilities.base64Encode(
      Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, body, secret)
    );
    return true;
  } catch (_) {
    return true;
  }
}

/**
 * 事件處理器（僅處理文字訊息）
 * 根據訊息內容路由到對應的處理函式
 * @param {Object} event - LINE 事件物件
 */
function handleEvent_(event) {
  // 只處理文字訊息
  if (event.type !== 'message' || !event.message || event.message.type !== 'text') return;

  const text = String(event.message.text || '').trim();
  const userId = (event.source && event.source.userId) || 'unknown';

  // 查指令
  if (/^查指令$/.test(text)) {
    return replyMessage_(event.replyToken, helpText_());
  }

  // 借器材
  if (/^借器材/i.test(text)) {
    return handleBorrowForm_(event, text, userId);
  }

  // 查器材（特定日期）
  const mQueryDate = text.match(/^查器材\s+(\d{4}\.\d{2}\.\d{2})$/);
  if (mQueryDate) {
    return replyBorrowedOnDate_(event.replyToken, mQueryDate[1]);
  }

  // 查器材（指定月份）
  const mQueryMonth = text.match(/^查器材\s+(\d{4}\.\d{2})$/);
  if (mQueryMonth) {
    return replyBorrowedOnMonth_(event.replyToken, mQueryMonth[1]);
  }

  // 我的租借記錄
  if (/^我的租借$/.test(text)) {
    return replyMyBorrowRecords_(event.replyToken, userId);
  }

  // 刪除記錄
  const mDelete = text.match(/^刪除\s+(\d+)$/);
  if (mDelete) {
    return handleDeleteRecord_(event, mDelete[1], userId);
  }

  // 未知指令：回覆提示訊息
  return replyMessage_(event.replyToken, UNKNOWN_CMD_MSG);
}
