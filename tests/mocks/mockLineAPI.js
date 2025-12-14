/**
 * LINE Messaging API Mock 工具
 * 
 * 模擬 LINE Bot API 的回應，用於測試 LINE 相關功能
 */

/**
 * 建立假的 LINE 使用者資料
 * @param {string} userId - 使用者 ID
 * @param {string} displayName - 顯示名稱
 * @returns {Object} LINE 使用者資料
 */
function createMockLineUser(userId = 'U1234567890abcdef', displayName = '測試使用者') {
  return {
    userId,
    displayName,
    pictureUrl: 'https://example.com/avatar.jpg',
    statusMessage: '測試狀態訊息'
  };
}

/**
 * 建立假的 LINE 訊息事件
 * @param {string} text - 訊息文字
 * @param {string} userId - 使用者 ID
 * @param {string} replyToken - 回覆 token
 * @returns {Object} LINE 訊息事件
 */
function createMockLineMessageEvent(
  text = '測試訊息',
  userId = 'U1234567890abcdef',
  replyToken = 'mock-reply-token-12345'
) {
  return {
    type: 'message',
    message: {
      type: 'text',
      id: 'mock-message-id',
      text
    },
    timestamp: Date.now(),
    source: {
      type: 'user',
      userId
    },
    replyToken,
    mode: 'active'
  };
}

/**
 * 建立假的 LINE Follow 事件
 * @param {string} userId - 使用者 ID
 * @param {string} replyToken - 回覆 token
 * @returns {Object} LINE Follow 事件
 */
function createMockLineFollowEvent(
  userId = 'U1234567890abcdef',
  replyToken = 'mock-reply-token-12345'
) {
  return {
    type: 'follow',
    timestamp: Date.now(),
    source: {
      type: 'user',
      userId
    },
    replyToken,
    mode: 'active'
  };
}

/**
 * 建立假的 LINE Webhook 請求
 * @param {Array<Object>} events - 事件陣列
 * @returns {Object} LINE Webhook 請求
 */
function createMockLineWebhookRequest(events = []) {
  return {
    destination: 'U1234567890abcdef',
    events
  };
}

/**
 * 建立 LINE API 回應的 Mock
 * @param {Object} options - 選項
 * @returns {Object} Mock 回應物件
 */
function createMockLineAPIResponse(options = {}) {
  const {
    statusCode = 200,
    body = {},
    headers = { 'Content-Type': 'application/json' }
  } = options;

  return {
    getResponseCode: jest.fn(() => statusCode),
    getContentText: jest.fn(() => JSON.stringify(body)),
    getHeaders: jest.fn(() => headers)
  };
}

/**
 * 建立 LINE Profile API 的成功回應
 * @param {string} userId - 使用者 ID
 * @param {string} displayName - 顯示名稱
 * @returns {Object} Mock 回應
 */
function createMockLineProfileResponse(userId, displayName) {
  return createMockLineAPIResponse({
    statusCode: 200,
    body: createMockLineUser(userId, displayName)
  });
}

/**
 * 建立 LINE Reply API 的成功回應
 * @returns {Object} Mock 回應
 */
function createMockLineReplyResponse() {
  return createMockLineAPIResponse({
    statusCode: 200,
    body: {}
  });
}

/**
 * 建立 LINE API 錯誤回應
 * @param {number} statusCode - HTTP 狀態碼
 * @param {string} message - 錯誤訊息
 * @returns {Object} Mock 錯誤回應
 */
function createMockLineErrorResponse(statusCode = 400, message = 'Bad Request') {
  return createMockLineAPIResponse({
    statusCode,
    body: {
      message,
      details: []
    }
  });
}

module.exports = {
  createMockLineUser,
  createMockLineMessageEvent,
  createMockLineFollowEvent,
  createMockLineWebhookRequest,
  createMockLineAPIResponse,
  createMockLineProfileResponse,
  createMockLineReplyResponse,
  createMockLineErrorResponse
};

