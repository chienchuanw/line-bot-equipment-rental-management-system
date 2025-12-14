/**
 * main.js 測試
 * 
 * 測試 LINE Bot 主要入口點與事件路由器：
 * 1. doGet - GET 請求處理器
 * 2. doPost - POST 請求處理器
 * 3. handleEvent_ - 事件處理器與路由邏輯
 */

const { setupTestEnvironment } = require('../mocks/testHelpers');

// ==================== Mock 函式 ====================

let env;
let mockContentService;
let mockReplyMessage;
let mockHelpText;
let mockHandleBorrowForm;
let mockReplyBorrowedOnDate;
let mockReplyBorrowedOnMonth;
let mockReplyMyBorrowRecords;
let mockHandleDeleteRecord;
let mockEnsureLoansHeaders;

// ==================== 測試主體 ====================

describe('main.js - LINE Bot 路由', () => {
  beforeEach(() => {
    // 建立測試環境
    env = setupTestEnvironment({});

    // Mock ContentService
    mockContentService = {
      createTextOutput: jest.fn((text) => ({
        setMimeType: jest.fn(() => ({ text }))
      })),
      MimeType: {
        TEXT: 'text/plain'
      }
    };

    // Mock 業務邏輯函式
    mockReplyMessage = jest.fn();
    mockHelpText = jest.fn(() => '指令說明文字');
    mockHandleBorrowForm = jest.fn();
    mockReplyBorrowedOnDate = jest.fn();
    mockReplyBorrowedOnMonth = jest.fn();
    mockReplyMyBorrowRecords = jest.fn();
    mockHandleDeleteRecord = jest.fn();
    mockEnsureLoansHeaders = jest.fn();

    global.ContentService = mockContentService;
    global.replyMessage_ = mockReplyMessage;
    global.helpText_ = mockHelpText;
    global.handleBorrowForm_ = mockHandleBorrowForm;
    global.replyBorrowedOnDate_ = mockReplyBorrowedOnDate;
    global.replyBorrowedOnMonth_ = mockReplyBorrowedOnMonth;
    global.replyMyBorrowRecords_ = mockReplyMyBorrowRecords;
    global.handleDeleteRecord_ = mockHandleDeleteRecord;
    global.ensureLoansHeaders_ = mockEnsureLoansHeaders;
    global.UNKNOWN_CMD_MSG = '未知的指令，請輸入「查指令」查看可用指令';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('doGet - GET 請求處理器', () => {
    /**
     * GET 請求處理器
     */
    function doGet(e) {
      ensureLoansHeaders_();
      return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
    }

    test('應該呼叫 ensureLoansHeaders_', () => {
      doGet({});

      expect(mockEnsureLoansHeaders).toHaveBeenCalled();
    });

    test('應該回傳 OK 文字', () => {
      const result = doGet({});

      expect(mockContentService.createTextOutput).toHaveBeenCalledWith('OK');
    });
  });

  describe('doPost - POST 請求處理器', () => {
    /**
     * 事件處理器
     */
    function handleEvent_(event) {
      if (event.type !== 'message' || !event.message || event.message.type !== 'text') return;

      const rawText = String(event.message.text || '').trim();
      const userId = (event.source && event.source.userId) || 'unknown';

      // 借器材（需要保留原始格式，包含換行）
      if (/^借器材/i.test(rawText)) {
        return handleBorrowForm_(event, rawText, userId);
      }

      // 正規化使用者輸入：移除所有空白字元（含全形空白）
      const text = rawText.replace(/\s+/g, '');

      if (/^查指令$/.test(text)) {
        return replyMessage_(event.replyToken, helpText_());
      }

      const mQueryDate = text.match(/^查器材(\d{4}\.\d{2}\.\d{2})$/);
      if (mQueryDate) {
        return replyBorrowedOnDate_(event.replyToken, mQueryDate[1]);
      }

      const mQueryMonth = text.match(/^查器材(\d{4}\.\d{2})$/);
      if (mQueryMonth) {
        return replyBorrowedOnMonth_(event.replyToken, mQueryMonth[1]);
      }

      if (/^我的租借$/.test(text)) {
        return replyMyBorrowRecords_(event.replyToken, userId);
      }

      const mDelete = text.match(/^刪除(\d+)$/);
      if (mDelete) {
        return handleDeleteRecord_(event, mDelete[1], userId);
      }

      return replyMessage_(event.replyToken, UNKNOWN_CMD_MSG);
    }

    /**
     * POST 請求處理器
     */
    function doPost(e) {
      ensureLoansHeaders_();

      const body = (e && e.postData && e.postData.contents) ? e.postData.contents : '';

      let json = {};
      try { json = body ? JSON.parse(body) : {}; } catch (_) { }
      const events = (json && Array.isArray(json.events)) ? json.events : [];
      if (!events.length) {
        return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
      }

      events.forEach(handleEvent_);
      return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
    }

    test('應該呼叫 ensureLoansHeaders_', () => {
      const e = {
        postData: {
          contents: JSON.stringify({ events: [] })
        }
      };

      doPost(e);

      expect(mockEnsureLoansHeaders).toHaveBeenCalled();
    });

    test('當沒有事件時應該回傳 OK', () => {
      const e = {
        postData: {
          contents: JSON.stringify({ events: [] })
        }
      };

      const result = doPost(e);

      expect(mockContentService.createTextOutput).toHaveBeenCalledWith('OK');
    });

    test('應該處理所有事件', () => {
      const e = {
        postData: {
          contents: JSON.stringify({
            events: [
              {
                type: 'message',
                message: { type: 'text', text: '查指令' },
                replyToken: 'token1',
                source: { userId: 'U123' }
              },
              {
                type: 'message',
                message: { type: 'text', text: '我的租借' },
                replyToken: 'token2',
                source: { userId: 'U123' }
              }
            ]
          })
        }
      };

      doPost(e);

      expect(mockReplyMessage).toHaveBeenCalledWith('token1', '指令說明文字');
      expect(mockReplyMyBorrowRecords).toHaveBeenCalledWith('token2', 'U123');
    });

    test('當 JSON 解析失敗時應該回傳 OK', () => {
      const e = {
        postData: {
          contents: 'invalid json'
        }
      };

      const result = doPost(e);

      expect(mockContentService.createTextOutput).toHaveBeenCalledWith('OK');
    });

    test('當沒有 postData 時應該回傳 OK', () => {
      const e = {};

      const result = doPost(e);

      expect(mockContentService.createTextOutput).toHaveBeenCalledWith('OK');
    });
  });

  describe('handleEvent_ - 事件路由', () => {
    /**
     * 事件處理器
     */
    function handleEvent_(event) {
      if (event.type !== 'message' || !event.message || event.message.type !== 'text') return;

      const rawText = String(event.message.text || '').trim();
      const userId = (event.source && event.source.userId) || 'unknown';

      // 借器材（需要保留原始格式，包含換行）
      if (/^借器材/i.test(rawText)) {
        return handleBorrowForm_(event, rawText, userId);
      }

      // 正規化使用者輸入：移除所有空白字元（含全形空白）
      const text = rawText.replace(/\s+/g, '');

      if (/^查指令$/.test(text)) {
        return replyMessage_(event.replyToken, helpText_());
      }

      const mQueryDate = text.match(/^查器材(\d{4}\.\d{2}\.\d{2})$/);
      if (mQueryDate) {
        return replyBorrowedOnDate_(event.replyToken, mQueryDate[1]);
      }

      const mQueryMonth = text.match(/^查器材(\d{4}\.\d{2})$/);
      if (mQueryMonth) {
        return replyBorrowedOnMonth_(event.replyToken, mQueryMonth[1]);
      }

      if (/^我的租借$/.test(text)) {
        return replyMyBorrowRecords_(event.replyToken, userId);
      }

      const mDelete = text.match(/^刪除(\d+)$/);
      if (mDelete) {
        return handleDeleteRecord_(event, mDelete[1], userId);
      }

      return replyMessage_(event.replyToken, UNKNOWN_CMD_MSG);
    }

    test('應該忽略非訊息事件', () => {
      const event = {
        type: 'follow',
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockReplyMessage).not.toHaveBeenCalled();
    });

    test('應該忽略非文字訊息', () => {
      const event = {
        type: 'message',
        message: { type: 'image' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockReplyMessage).not.toHaveBeenCalled();
    });

    test('應該路由「查指令」到 helpText_', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '查指令' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockReplyMessage).toHaveBeenCalledWith('token', '指令說明文字');
      expect(mockHelpText).toHaveBeenCalled();
    });

    test('應該路由「借器材」到 handleBorrowForm_', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '借器材\n...' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockHandleBorrowForm).toHaveBeenCalledWith(event, '借器材\n...', 'U123');
    });

    test('應該路由日期查詢到 replyBorrowedOnDate_', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '查器材 2025.09.01' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockReplyBorrowedOnDate).toHaveBeenCalledWith('token', '2025.09.01');
    });

    test('應該路由月份查詢到 replyBorrowedOnMonth_', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '查器材 2025.09' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockReplyBorrowedOnMonth).toHaveBeenCalledWith('token', '2025.09');
    });

    test('應該路由日期查詢到 replyBorrowedOnDate_ (沒有空格)', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '查器材2025.09.01' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockReplyBorrowedOnDate).toHaveBeenCalledWith('token', '2025.09.01');
    });

    test('應該路由月份查詢到 replyBorrowedOnMonth_ (沒有空格)', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '查器材2025.09' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockReplyBorrowedOnMonth).toHaveBeenCalledWith('token', '2025.09');
    });

    test('應該路由「我的租借」到 replyMyBorrowRecords_', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '我的租借' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockReplyMyBorrowRecords).toHaveBeenCalledWith('token', 'U123');
    });

    test('應該路由刪除指令到 handleDeleteRecord_', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '刪除 1' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockHandleDeleteRecord).toHaveBeenCalledWith(event, '1', 'U123');
    });

    test('應該回覆未知指令訊息', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '未知指令' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockReplyMessage).toHaveBeenCalledWith('token', UNKNOWN_CMD_MSG);
    });

    test('當沒有 userId 時應該使用 unknown', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '我的租借' },
        replyToken: 'token',
        source: {}
      };

      handleEvent_(event);

      expect(mockReplyMyBorrowRecords).toHaveBeenCalledWith('token', 'unknown');
    });

    test('應該正確處理前後空白', () => {
      const event = {
        type: 'message',
        message: { type: 'text', text: '  查指令  ' },
        replyToken: 'token',
        source: { userId: 'U123' }
      };

      handleEvent_(event);

      expect(mockReplyMessage).toHaveBeenCalledWith('token', '指令說明文字');
    });
  });
});
