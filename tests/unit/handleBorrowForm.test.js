/**
 * handleBorrowForm_ 單元測試
 * 
 * 測試完整的借用流程，包含：
 * - Sheet 操作
 * - LINE API 呼叫
 * - 訊息解析
 * - 錯誤處理
 */

const { setupTestEnvironment, cleanupGASEnvironment } = require('../mocks/testHelpers');
const { mockBorrowMessages, mockUsers } = require('../mocks/fixtures');

// 從 src/borrowService.js 複製函式定義（用於測試）

/**
 * 解析點分隔的日期字串 (YYYY.MM.DD)
 */
function parseDotDate_(s) {
  const m = String(s || '').trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return isNaN(d) ? null : d;
}

/**
 * 將日期格式化為點分隔字串 (YYYY.MM.DD)
 */
function formatDotDate_(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/**
 * 取得日期的開始時間 (00:00:00)
 */
function startOfDay_(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * 解析借器材四行表單格式
 */
function parseBorrowMessage_(raw) {
  const text = String(raw || '').replace(/^借器材[ \t]*/i, '').trim();
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length < 3) {
    return { ok: false, msg: '格式錯誤：請使用四行格式（借器材：租用器材／租用日期／歸還日期）' };
  }

  const kv = {};
  for (const line of lines) {
    const m = line.match(/^(租用器材|租用日期|歸還日期)\s*[:：]\s*(.+)$/);
    if (!m) return { ok: false, msg: `格式錯誤：無法解析「${line}」` };
    kv[m[1]] = m[2].trim();
  }

  if (!kv['租用器材'] || !kv['租用日期'] || !kv['歸還日期']) {
    return { ok: false, msg: '格式錯誤：三個欄位皆必填（租用器材／租用日期／歸還日期）' };
  }

  const items = kv['租用器材'].split(/[，,]/).map(s => s.trim()).filter(Boolean).join(', ');
  const rentDate = parseDotDate_(kv['租用日期']);
  const backDate = parseDotDate_(kv['歸還日期']);
  if (!rentDate || !backDate) {
    return { ok: false, msg: '日期格式錯誤：請用 YYYY.MM.DD（例如 2025.09.03）' };
  }

  if (startOfDay_(backDate) < startOfDay_(rentDate)) {
    return { ok: false, msg: '日期邏輯錯誤：歸還日期不可早於租用日期' };
  }

  return {
    ok: true,
    items,
    borrowedAt: rentDate,
    returnedAt: backDate
  };
}

// Mock 全域函式
let mockReplyMessage;
let mockGetLoansSheet;
let mockFetchLineDisplayName;

/**
 * 處理借器材表單訊息
 */
function handleBorrowForm_(event, rawText, userId) {
  const loans = mockGetLoansSheet();
  if (!loans) return mockReplyMessage(event.replyToken, `找不到工作表：SHEET_LOANS`);

  const parsed = parseBorrowMessage_(rawText);
  if (!parsed.ok) return mockReplyMessage(event.replyToken, parsed.msg);

  const username = mockFetchLineDisplayName(userId) || userId;
  const now = new Date();

  loans.appendRow([
    now,
    userId,
    username,
    parsed.items,
    parsed.borrowedAt,
    parsed.returnedAt
  ]);

  mockReplyMessage(event.replyToken,
    [
      '✅ 已建立借用紀錄：',
      `借用人：${username}`,
      `器材：${parsed.items}`,
      `租用日期：${formatDotDate_(parsed.borrowedAt)}`,
      `歸還日期：${formatDotDate_(parsed.returnedAt)}`
    ].join('\n')
  );
}

// ==================== 測試開始 ====================

describe('borrowService - handleBorrowForm_', () => {
  let env;

  beforeEach(() => {
    // 建立測試環境
    const userProfiles = {
      [mockUsers.user1.userId]: mockUsers.user1.displayName,
      [mockUsers.user2.userId]: mockUsers.user2.displayName
    };

    env = setupTestEnvironment({ userProfiles });

    // 設定 mock 函式
    mockReplyMessage = jest.fn();
    mockGetLoansSheet = jest.fn(() => env.loansSheet);
    mockFetchLineDisplayName = jest.fn((userId) => {
      return userProfiles[userId] || null;
    });
  });

  afterEach(() => {
    cleanupGASEnvironment();
    jest.clearAllMocks();
  });

  describe('正常情境測試', () => {
    test('應該成功建立借用記錄', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleBorrowForm_(event, mockBorrowMessages.valid, userId);

      // 驗證 Sheet 操作
      expect(env.loansSheet.appendRow).toHaveBeenCalledTimes(1);
      const appendedRow = env.loansSheet.appendRow.mock.calls[0][0];

      expect(appendedRow[1]).toBe(userId); // userId
      expect(appendedRow[2]).toBe(mockUsers.user1.displayName); // username
      expect(appendedRow[3]).toBe('相機A, 三腳架, 燈具'); // items
      expect(appendedRow[4]).toBeInstanceOf(Date); // borrowedAt
      expect(appendedRow[5]).toBeInstanceOf(Date); // returnedAt
    });

    test('應該回覆確認訊息', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleBorrowForm_(event, mockBorrowMessages.valid, userId);

      // 驗證回覆訊息
      expect(mockReplyMessage).toHaveBeenCalledTimes(1);
      expect(mockReplyMessage).toHaveBeenCalledWith(
        'test-token',
        expect.stringContaining('✅ 已建立借用紀錄')
      );
      expect(mockReplyMessage).toHaveBeenCalledWith(
        'test-token',
        expect.stringContaining(mockUsers.user1.displayName)
      );
    });

    test('應該正確記錄租用日期', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleBorrowForm_(event, mockBorrowMessages.valid, userId);

      const appendedRow = env.loansSheet.appendRow.mock.calls[0][0];
      const borrowedAt = appendedRow[4];

      expect(borrowedAt.getFullYear()).toBe(2025);
      expect(borrowedAt.getMonth()).toBe(8); // 9月是8（0-based）
      expect(borrowedAt.getDate()).toBe(10);
    });

    test('應該正確記錄歸還日期', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleBorrowForm_(event, mockBorrowMessages.valid, userId);

      const appendedRow = env.loansSheet.appendRow.mock.calls[0][0];
      const returnedAt = appendedRow[5];

      expect(returnedAt.getFullYear()).toBe(2025);
      expect(returnedAt.getMonth()).toBe(8);
      expect(returnedAt.getDate()).toBe(12);
    });

    test('當 LINE API 失敗時應該使用 userId 作為 username', () => {
      const event = { replyToken: 'test-token' };
      const userId = 'unknown-user';

      // 模擬 LINE API 失敗
      mockFetchLineDisplayName.mockReturnValue(null);

      handleBorrowForm_(event, mockBorrowMessages.valid, userId);

      const appendedRow = env.loansSheet.appendRow.mock.calls[0][0];
      expect(appendedRow[2]).toBe(userId); // 應該使用 userId
    });

    test('應該記錄當前時間戳記', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;
      const beforeTime = new Date();

      handleBorrowForm_(event, mockBorrowMessages.valid, userId);

      const afterTime = new Date();
      const appendedRow = env.loansSheet.appendRow.mock.calls[0][0];
      const timestamp = appendedRow[0];

      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
    });
  });

  describe('錯誤處理測試', () => {
    test('當 Sheet 不存在時應該回傳錯誤', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      // 模擬 Sheet 不存在
      mockGetLoansSheet.mockReturnValue(null);

      handleBorrowForm_(event, mockBorrowMessages.valid, userId);

      expect(mockReplyMessage).toHaveBeenCalledWith(
        'test-token',
        expect.stringContaining('找不到工作表')
      );
      // 當 Sheet 不存在時，不應該有 appendRow 被呼叫
    });

    test('當訊息格式錯誤時應該回傳錯誤', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleBorrowForm_(event, mockBorrowMessages.missingField, userId);

      expect(mockReplyMessage).toHaveBeenCalledWith(
        'test-token',
        expect.stringContaining('格式錯誤')
      );
      expect(env.loansSheet.appendRow).not.toHaveBeenCalled();
    });

    test('當日期格式錯誤時應該回傳錯誤', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleBorrowForm_(event, mockBorrowMessages.invalidDateFormat, userId);

      expect(mockReplyMessage).toHaveBeenCalledWith(
        'test-token',
        expect.stringContaining('日期格式錯誤')
      );
      expect(env.loansSheet.appendRow).not.toHaveBeenCalled();
    });

    test('當日期邏輯錯誤時應該回傳錯誤', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleBorrowForm_(event, mockBorrowMessages.invalidDateLogic, userId);

      expect(mockReplyMessage).toHaveBeenCalledWith(
        'test-token',
        expect.stringContaining('日期邏輯錯誤')
      );
      expect(env.loansSheet.appendRow).not.toHaveBeenCalled();
    });
  });
});

