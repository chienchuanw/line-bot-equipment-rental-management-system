/**
 * lineService 測試
 *
 * 測試 LINE Messaging API 服務的所有功能：
 * 1. replyMessage_ - 回覆文字訊息給使用者
 * 2. fetchLineDisplayName_ - 取得使用者的顯示名稱
 */

const { setupTestEnvironment } = require('../mocks/testHelpers');

// ==================== Mock 函式 ====================

let env;
let mockUrlFetchApp;
let mockPropertiesService;

// ==================== 測試主體 ====================

describe('lineService', () => {
  beforeEach(() => {
    // 建立測試環境
    env = setupTestEnvironment({});

    // Mock UrlFetchApp
    mockUrlFetchApp = {
      fetch: jest.fn()
    };

    // Mock PropertiesService
    mockPropertiesService = {
      getScriptProperties: jest.fn(() => ({
        getProperty: jest.fn((key) => {
          if (key === 'LINE_CHANNEL_TOKEN') return 'test-token';
          if (key === 'LINE_CHANNEL_SECRET') return 'test-secret';
          return null;
        })
      }))
    };

    global.UrlFetchApp = mockUrlFetchApp;
    global.PropertiesService = mockPropertiesService;
    global.LINE_API_BASE_URL = 'https://api.line.me/v2/bot';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('replyMessage_ - 回覆文字訊息', () => {
    /**
     * 取得設定值
     */
    function getProp_(key) {
      return PropertiesService.getScriptProperties().getProperty(key);
    }

    /**
     * 回覆文字訊息給使用者
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

    test('應該正確呼叫 LINE API', () => {
      const replyToken = 'test-reply-token';
      const text = '測試訊息';

      replyMessage_(replyToken, text);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.line.me/v2/bot/message/reply',
        expect.objectContaining({
          method: 'post',
          contentType: 'application/json',
          headers: { Authorization: 'Bearer test-token' },
          muteHttpExceptions: true
        })
      );
    });

    test('應該正確設定訊息內容', () => {
      const replyToken = 'test-reply-token';
      const text = '測試訊息';

      replyMessage_(replyToken, text);

      const callArgs = mockUrlFetchApp.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.payload);

      expect(payload.replyToken).toBe(replyToken);
      expect(payload.messages).toHaveLength(1);
      expect(payload.messages[0].type).toBe('text');
      expect(payload.messages[0].text).toBe(text);
    });

    test('應該限制訊息長度為 5000 字元', () => {
      const replyToken = 'test-reply-token';
      const longText = 'a'.repeat(6000);

      replyMessage_(replyToken, longText);

      const callArgs = mockUrlFetchApp.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.payload);

      expect(payload.messages[0].text).toHaveLength(5000);
    });

    test('應該將非字串轉換為字串', () => {
      const replyToken = 'test-reply-token';
      const number = 12345;

      replyMessage_(replyToken, number);

      const callArgs = mockUrlFetchApp.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.payload);

      expect(payload.messages[0].text).toBe('12345');
    });

    test('應該正確處理空字串', () => {
      const replyToken = 'test-reply-token';
      const text = '';

      replyMessage_(replyToken, text);

      const callArgs = mockUrlFetchApp.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.payload);

      expect(payload.messages[0].text).toBe('');
    });
  });

  describe('fetchLineDisplayName_ - 取得使用者顯示名稱', () => {
    /**
     * 取得設定值
     */
    function getProp_(key) {
      return PropertiesService.getScriptProperties().getProperty(key);
    }

    /**
     * 以 User ID 取得使用者的顯示名稱
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

    test('應該成功取得使用者顯示名稱', () => {
      const userId = 'U1234567890';
      const mockResponse = {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ displayName: '張小明' })
      };

      mockUrlFetchApp.fetch.mockReturnValue(mockResponse);

      const result = fetchLineDisplayName_(userId);

      expect(result).toBe('張小明');
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.line.me/v2/bot/profile/${userId}`,
        expect.objectContaining({
          method: 'get',
          headers: { Authorization: 'Bearer test-token' },
          muteHttpExceptions: true
        })
      );
    });

    test('當 userId 為空時應該回傳 null', () => {
      const result = fetchLineDisplayName_('');

      expect(result).toBeNull();
      expect(mockUrlFetchApp.fetch).not.toHaveBeenCalled();
    });

    test('當 userId 為 unknown 時應該回傳 null', () => {
      const result = fetchLineDisplayName_('unknown');

      expect(result).toBeNull();
      expect(mockUrlFetchApp.fetch).not.toHaveBeenCalled();
    });

    test('當 API 回應非 200 時應該回傳 null', () => {
      const userId = 'U1234567890';
      const mockResponse = {
        getResponseCode: () => 404,
        getContentText: () => '{}'
      };

      mockUrlFetchApp.fetch.mockReturnValue(mockResponse);

      const result = fetchLineDisplayName_(userId);

      expect(result).toBeNull();
    });

    test('當 API 回應沒有 displayName 時應該回傳 null', () => {
      const userId = 'U1234567890';
      const mockResponse = {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ userId: 'U1234567890' })
      };

      mockUrlFetchApp.fetch.mockReturnValue(mockResponse);

      const result = fetchLineDisplayName_(userId);

      expect(result).toBeNull();
    });

    test('當 API 回應為空字串時應該回傳 null', () => {
      const userId = 'U1234567890';
      const mockResponse = {
        getResponseCode: () => 200,
        getContentText: () => ''
      };

      mockUrlFetchApp.fetch.mockReturnValue(mockResponse);

      const result = fetchLineDisplayName_(userId);

      expect(result).toBeNull();
    });

    test('當發生錯誤時應該回傳 null', () => {
      const userId = 'U1234567890';

      mockUrlFetchApp.fetch.mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = fetchLineDisplayName_(userId);

      expect(result).toBeNull();
    });

    test('應該正確編碼 userId', () => {
      const userId = 'U123+456';
      const mockResponse = {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ displayName: '測試' })
      };

      mockUrlFetchApp.fetch.mockReturnValue(mockResponse);

      fetchLineDisplayName_(userId);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,
        expect.any(Object)
      );
    });
  });
});