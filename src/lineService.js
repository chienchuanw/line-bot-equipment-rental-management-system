/**
 * LINE Messaging API 服務
 * 負責所有與 LINE Bot API 相關的通訊操作
 */

/**
 * 回覆文字訊息給使用者
 * @param {string} replyToken - LINE 回覆 token
 * @param {string} text - 要回覆的文字內容
 */
function replyMessage_(replyToken, text) {
  const token = getProp_('LINE_CHANNEL_TOKEN');
  const url = `${LINE_API_BASE_URL}/message/reply`;
  const payload = {
    replyToken,
    messages: [{ type: 'text', text: String(text).slice(0, 5000) }],
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true,
  });
}

/**
 * 以 User ID 取得使用者的顯示名稱
 * @param {string} userId - LINE 使用者 ID
 * @returns {string|null} 使用者顯示名稱，失敗時回傳 null
 */
function fetchLineDisplayName_(userId) {
  try {
    if (!userId || userId === 'unknown') return null;
    const token = getProp_('LINE_CHANNEL_TOKEN');
    const url = `${LINE_API_BASE_URL}/profile/${encodeURIComponent(userId)}`;
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return null;
    const json = JSON.parse(res.getContentText() || '{}');
    return json.displayName || null;
  } catch (_) {
    return null;
  }
}
