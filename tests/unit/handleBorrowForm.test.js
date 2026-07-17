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

/**
 * 將日期加上指定天數（從 src/dateUtils.js 複製）
 */
function addDays_(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * 取得 Script Properties 中的設定值（從 src/config.js 複製）
 */
function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * 解析使用者的顯示名稱（從 src/userService.js 複製）
 */
function resolveDisplayName_(userId, fallbackUsername, nameMap) {
  const map = nameMap || {};
  const uid = String(userId || '').trim();

  if (uid && map[uid]) return map[uid];
  return fallbackUsername || userId || '';
}

/**
 * 取得 userId → displayName 的對照表（從 src/sheetService.js 複製）
 */
function getUserDisplayNameMap_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('users');
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
 * 更新特定記錄的 eventId（從 src/sheetService.js 複製）
 */
function updateRecordEventId_(sheet, rowIndex, eventId) {
  try {
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const eventIdIndex = header.indexOf('eventId');

    if (eventIdIndex === -1) {
      console.error('找不到 eventId 欄位');
      return false;
    }

    sheet.getRange(rowIndex, eventIdIndex + 1).setValue(eventId);
    return true;
  } catch (error) {
    console.error('回寫 eventId 時發生錯誤:', error);
    return false;
  }
}

/**
 * 取得器材租借用的目標日曆（從 src/calendarService.js 複製）
 */
function getRentalCalendar_() {
  const calendarId = getProp_('CALENDAR_ID');
  if (!calendarId) return null;

  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) {
    console.error('找不到日曆，請確認 CALENDAR_ID 正確且已分享給此帳號', calendarId);
    throw new Error(`找不到日曆：${calendarId}`);
  }
  return calendar;
}

/**
 * 建立器材租借的整天事件（從 src/calendarService.js 複製）
 */
function createRentalEvent_(record) {
  const calendar = getRentalCalendar_();
  if (!calendar) return null;

  const title = `${record.displayName}｜${record.items}`;
  const start = startOfDay_(record.borrowedAt);
  const end = addDays_(startOfDay_(record.returnedAt), 1);

  const event = calendar.createAllDayEvent(title, start, end);
  return event.getId();
}

// Mock 全域函式
let mockReplyMessage;
let mockGetLoansSheet;
let mockFetchLineDisplayName;

/**
 * 處理借器材表單訊息（從 src/borrowService.js 複製）
 *
 * 順序：寫入 → 回覆使用者 → 最後才碰日曆
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
    parsed.returnedAt,
    ''                  // eventId ← 建立日曆事件後回寫
  ]);
  const rowIndex = loans.getLastRow();

  // 回覆確認訊息（必須在碰日曆之前，否則日曆一爆使用者就石沉大海）
  mockReplyMessage(event.replyToken,
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
 * 將新的借用紀錄同步到 Google 日曆並回寫 eventId（從 src/borrowService.js 複製）
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
      expect(appendedRow[6]).toBe(''); // eventId ← 建立日曆事件後才回寫
    });

    test('寫入的欄位數應該與 LOANS_HEADERS 一致', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleBorrowForm_(event, mockBorrowMessages.valid, userId);

      // appendRow 是位置式寫入，長度與 LOANS_HEADERS 不符即代表欄位錯位
      const appendedRow = env.loansSheet.appendRow.mock.calls[0][0];
      expect(appendedRow).toHaveLength(7);
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

  describe('日曆同步', () => {
    const CAL_ID = 'foufa@group.calendar.google.com';
    const USER = mockUsers.user1.userId;

    /**
     * 以指定選項重建測試環境（beforeEach 的環境沒有日曆）
     */
    function setupEnv(options = {}) {
      const userProfiles = { [USER]: '阿明🌀' };
      env = setupTestEnvironment({
        userProfiles,
        properties: { LINE_CHANNEL_TOKEN: 'mock-channel-token', ...options.properties },
        calendarId: options.calendarId || null,
        userRows: options.userRows || null
      });
      mockGetLoansSheet = jest.fn(() => env.loansSheet);
      mockFetchLineDisplayName = jest.fn((userId) => userProfiles[userId] || null);
      return env;
    }

    test('借用成功時應該建立日曆事件並回寫 eventId', () => {
      setupEnv({ properties: { CALENDAR_ID: CAL_ID }, calendarId: CAL_ID });
      const event = { replyToken: 'test-token' };

      handleBorrowForm_(event, mockBorrowMessages.validSingleItem, USER);

      expect(env.calendar.createAllDayEvent).toHaveBeenCalledTimes(1);
      // eventId 應該回寫到第 2 列（第 1 列是表頭）的第 7 欄
      expect(env.loansSheet._getData()[1][6]).toBe('evt-1@google.com');
    });

    test('事件的日期範圍應該正確且結束日為排他', () => {
      setupEnv({ properties: { CALENDAR_ID: CAL_ID }, calendarId: CAL_ID });
      const event = { replyToken: 'test-token' };

      // validSingleItem 為 2025.09.10 ~ 2025.09.12
      handleBorrowForm_(event, mockBorrowMessages.validSingleItem, USER);

      const [, start, end] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(start.getDate()).toBe(10);
      expect(end.getDate()).toBe(13); // 12 + 1，排他
    });

    test('事件標題應該套用 users 對照表的名稱而非 LINE 暱稱', () => {
      setupEnv({
        properties: { CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID,
        userRows: [[USER, '張小明']]
      });
      const event = { replyToken: 'test-token' };

      handleBorrowForm_(event, mockBorrowMessages.validSingleItem, USER);

      const [title] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(title).toBe('張小明｜相機A');
    });

    test('未登錄在對照表的使用者事件標題應該退回 LINE 暱稱', () => {
      setupEnv({ properties: { CALENDAR_ID: CAL_ID }, calendarId: CAL_ID });
      const event = { replyToken: 'test-token' };

      handleBorrowForm_(event, mockBorrowMessages.validSingleItem, USER);

      const [title] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(title).toBe('阿明🌀｜相機A');
    });

    test('sheet 的 username 欄位仍應該保留 LINE 暱稱原值（借用當下的快照）', () => {
      setupEnv({
        properties: { CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID,
        userRows: [[USER, '張小明']]
      });
      const event = { replyToken: 'test-token' };

      handleBorrowForm_(event, mockBorrowMessages.validSingleItem, USER);

      // 對照表只影響顯示層，不該覆寫原始快照
      expect(env.loansSheet._getData()[1][2]).toBe('阿明🌀');
    });

    test('CALENDAR_ID 未設定時應該正常完成借用且不建立事件', () => {
      setupEnv({});
      const event = { replyToken: 'test-token' };

      expect(() => handleBorrowForm_(event, mockBorrowMessages.validSingleItem, USER)).not.toThrow();

      expect(env.loansSheet._getData()[1][1]).toBe(USER);
      expect(env.loansSheet._getData()[1][6]).toBe('');
    });

    test('日曆爆掉時使用者仍應該先收到成功回覆，例外才往上拋', () => {
      setupEnv({ properties: { CALENDAR_ID: CAL_ID }, calendarId: CAL_ID });
      env.calendar.createAllDayEvent = jest.fn(() => {
        throw new Error('Calendar service error');
      });
      const event = { replyToken: 'test-token' };

      // 例外往上拋 → Apps Script 會寄失敗通知信給 script owner
      expect(() => handleBorrowForm_(event, mockBorrowMessages.validSingleItem, USER))
        .toThrow('Calendar service error');

      // 但紀錄已成立
      expect(env.loansSheet._getData()[1][1]).toBe(USER);
      // 且使用者已經收到成功回覆（回覆在碰日曆之前）
      expect(mockReplyMessage).toHaveBeenCalledWith(
        'test-token',
        expect.stringContaining('✅ 已建立借用紀錄')
      );
    });

    test('CALENDAR_ID 打錯時應該拋錯而非靜默跳過', () => {
      setupEnv({ properties: { CALENDAR_ID: '打錯的ID' }, calendarId: CAL_ID });
      jest.spyOn(console, 'error').mockImplementation(() => { });
      const event = { replyToken: 'test-token' };

      expect(() => handleBorrowForm_(event, mockBorrowMessages.validSingleItem, USER))
        .toThrow('找不到日曆');

      // 紀錄仍成立，使用者仍收到回覆
      expect(env.loansSheet._getData()[1][1]).toBe(USER);
      expect(mockReplyMessage).toHaveBeenCalledWith(
        'test-token',
        expect.stringContaining('✅ 已建立借用紀錄')
      );
    });

    test('users 分頁不存在時應該正常建立事件並使用 LINE 暱稱', () => {
      setupEnv({ properties: { CALENDAR_ID: CAL_ID }, calendarId: CAL_ID });
      const event = { replyToken: 'test-token' };

      expect(() => handleBorrowForm_(event, mockBorrowMessages.validSingleItem, USER)).not.toThrow();

      const [title] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(title).toBe('阿明🌀｜相機A');
    });
  });
});

