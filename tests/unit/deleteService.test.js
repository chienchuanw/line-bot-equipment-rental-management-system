/**
 * deleteService 測試
 *
 * 測試刪除服務的所有功能：
 * 1. handleDeleteRecord_ - 處理刪除記錄請求
 * 2. validateRecordOperation_ - 驗證記錄是否可操作
 */

const { mockUsers, createMockLoanRecord } = require('../mocks/fixtures');
const { setupTestEnvironment, isSameDay } = require('../mocks/testHelpers');
const { createMockCalendarEvent } = require('../mocks/mockCalendar');

// ==================== 輔助函式 ====================
// 從原始檔案複製必要的函式

/**
 * 建立日期物件（月份使用 1-based）
 */
function createDate(year, month, day) {
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * 解析點分隔日期格式 YYYY.MM.DD
 */
function parseDotDate_(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  if (m < 1 || m > 12) return null;
  const date = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return date;
}

/**
 * 格式化日期為點分隔格式 YYYY.MM.DD
 */
function formatDotDate_(date) {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

/**
 * 將日期時間歸零到當天 00:00:00
 */
function startOfDay_(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * 轉換為 Date 物件或 null
 */
function toDateOrNull_(v) {
  if (v === null || v === undefined || v === '' || v === false) return null;
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : v;
  }
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// 從 src/config.js 複製
const LOANS_HEADERS = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt', 'eventId'];

/**
 * 安全地取得儲存格值（從 src/sheetService.js 複製）
 */
function safeCell_(row, i) {
  if (i === -1) return '';
  return row[i];
}

/**
 * 取得所有借用紀錄資料（從 src/sheetService.js 複製）
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
 * 刪除器材租借的日曆事件（從 src/calendarService.js 複製）
 */
function deleteRentalEvent_(eventId) {
  if (!eventId) return false;

  const calendar = getRentalCalendar_();
  if (!calendar) return false;

  const event = calendar.getEventById(eventId);
  if (!event) return false;

  event.deleteEvent();
  return true;
}

/**
 * 縮短器材租借事件的結束日（從 src/calendarService.js 複製）
 */
function updateRentalEventEnd_(eventId, newReturnedAt) {
  if (!eventId) return false;

  const calendar = getRentalCalendar_();
  if (!calendar) return false;

  const event = calendar.getEventById(eventId);
  if (!event) return false;

  const start = event.getAllDayStartDate();
  event.setAllDayDates(start, addDays_(startOfDay_(newReturnedAt), 1));
  return true;
}

// ==================== Mock 函式 ====================

let mockReplyMessage;
let mockGetLoansSheet;
let env;

// ==================== 測試主體 ====================

describe('deleteService', () => {
  beforeEach(() => {
    // 建立測試環境
    env = setupTestEnvironment({});

    // Mock 函式
    mockReplyMessage = jest.fn();
    mockGetLoansSheet = jest.fn(() => env.loansSheet);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateRecordOperation_ - 驗證記錄操作', () => {
    /**
     * 驗證記錄是否可以被操作
     */
    function validateRecordOperation_(record, userId) {
      if (record.userId !== userId) {
        return { canProcess: false, reason: '只能操作自己的租借記錄' };
      }

      const returnDate = toDateOrNull_(record.returnedAt);
      if (!returnDate) {
        return { canProcess: false, reason: '記錄日期格式錯誤' };
      }

      const today = startOfDay_(new Date());
      if (startOfDay_(returnDate) < today) {
        return { canProcess: false, reason: '無法操作已過期的租借記錄' };
      }

      return { canProcess: true };
    }

    test('應該允許操作自己的未來記錄', () => {
      const futureDate = new Date(2099, 11, 31, 0, 0, 0, 0);
      const record = {
        userId: mockUsers.user1.userId,
        returnedAt: futureDate
      };

      const result = validateRecordOperation_(record, mockUsers.user1.userId);

      expect(result.canProcess).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test('應該拒絕操作別人的記錄', () => {
      const futureDate = new Date(2099, 11, 31, 0, 0, 0, 0);
      const record = {
        userId: mockUsers.user1.userId,
        returnedAt: futureDate
      };

      const result = validateRecordOperation_(record, mockUsers.user2.userId);

      expect(result.canProcess).toBe(false);
      expect(result.reason).toBe('只能操作自己的租借記錄');
    });

    test('應該拒絕操作已過期的記錄', () => {
      const pastDate = new Date(2020, 0, 1, 0, 0, 0, 0);
      const record = {
        userId: mockUsers.user1.userId,
        returnedAt: pastDate
      };

      const result = validateRecordOperation_(record, mockUsers.user1.userId);

      expect(result.canProcess).toBe(false);
      expect(result.reason).toBe('無法操作已過期的租借記錄');
    });

    test('應該拒絕操作日期格式錯誤的記錄', () => {
      const record = {
        userId: mockUsers.user1.userId,
        returnedAt: 'invalid-date'
      };

      const result = validateRecordOperation_(record, mockUsers.user1.userId);

      expect(result.canProcess).toBe(false);
      expect(result.reason).toBe('記錄日期格式錯誤');
    });

    test('應該拒絕操作沒有歸還日期的記錄', () => {
      const record = {
        userId: mockUsers.user1.userId,
        returnedAt: null
      };

      const result = validateRecordOperation_(record, mockUsers.user1.userId);

      expect(result.canProcess).toBe(false);
      expect(result.reason).toBe('記錄日期格式錯誤');
    });

    test('應該允許操作今天到期的記錄', () => {
      const today = startOfDay_(new Date());
      const record = {
        userId: mockUsers.user1.userId,
        returnedAt: today
      };

      const result = validateRecordOperation_(record, mockUsers.user1.userId);

      expect(result.canProcess).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  });

  describe('handleDeleteRecord_ - 處理刪除記錄', () => {
    /**
     * 更新記錄的歸還日期
     */
    function updateRecordReturnDate_(sheet, rowIndex, newReturnDate) {
      try {
        const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const returnedAtIndex = header.indexOf('returnedAt');

        if (returnedAtIndex === -1) {
          console.error('找不到 returnedAt 欄位');
          return false;
        }

        sheet.getRange(rowIndex, returnedAtIndex + 1).setValue(newReturnDate);
        return true;
      } catch (error) {
        console.error('更新歸還日期時發生錯誤:', error);
        return false;
      }
    }

    /**
     * 處理刪除器材記錄請求（從 src/deleteService.js 複製）
     *
     * 日曆同步刻意放在 try/catch 之外，且在回覆使用者之後
     */
    function handleDeleteRecord_(event, recordIndex, userId) {
      const loans = mockGetLoansSheet();
      if (!loans) return mockReplyMessage(event.replyToken, `找不到工作表：loans`);

      const index = parseInt(recordIndex, 10);
      if (isNaN(index) || index < 1) {
        return mockReplyMessage(event.replyToken, '記錄編號格式錯誤，請輸入正確的數字。');
      }

      const rows = getLoanRows_(loans);
      const today = startOfDay_(new Date());

      const myActiveRecords = rows
        .map((record, rowIndex) => ({ ...record, sheetRowIndex: rowIndex + 2 }))
        .filter(r => {
          const isMyRecord = r.userId === userId;
          const returnDate = toDateOrNull_(r.returnedAt);
          const isActiveOrFuture = returnDate && startOfDay_(returnDate) >= today;
          return isMyRecord && isActiveOrFuture;
        });

      if (index > myActiveRecords.length) {
        return mockReplyMessage(event.replyToken, `記錄編號 ${index} 不存在，請先使用「我的租借」查看可操作的記錄。`);
      }

      const recordToProcess = myActiveRecords[index - 1];

      // eventId 必須在 deleteRow 之前讀出來，列一旦刪掉就取不到了
      const eventId = recordToProcess.eventId;

      const borrowDate = toDateOrNull_(recordToProcess.borrowedAt);
      const returnDate = toDateOrNull_(recordToProcess.returnedAt);
      const isFutureRecord = borrowDate && startOfDay_(borrowDate) > today;

      // 記錄實際發生了什麼，供 try/catch 之外的日曆同步使用
      let calendarAction = null;

      try {
        const itemsArr = String(recordToProcess.items || '').split(/[，,]/).map(s => s.trim()).filter(Boolean);
        const itemsBlock = itemsArr.length ? itemsArr.join(', ') : '（無器材資料）';
        const rentStart = formatDotDate_(borrowDate);
        const rentEnd = formatDotDate_(returnDate);

        if (isFutureRecord) {
          loans.deleteRow(recordToProcess.sheetRowIndex);

          const successMessage = [
            '✅ 已取消未來租借記錄',
            '',
            `📅 ${rentStart} ~ ${rentEnd}`,
            itemsBlock,
            '',
            '記錄已從系統中移除。'
          ].join('\n');

          mockReplyMessage(event.replyToken, successMessage);
          calendarAction = 'delete';

        } else {
          const success = updateRecordReturnDate_(loans, recordToProcess.sheetRowIndex, today);

          if (success) {
            const todayStr = formatDotDate_(today);
            const successMessage = [
              '✅ 已提前歸還器材',
              '',
              `📅 ${rentStart} ~ ${todayStr}`,
              itemsBlock,
              '',
              '租借期間已調整為提前歸還。'
            ].join('\n');

            mockReplyMessage(event.replyToken, successMessage);
            calendarAction = 'shorten';
          } else {
            mockReplyMessage(event.replyToken, '更新租借記錄時發生錯誤，請稍後再試。');
          }
        }

      } catch (error) {
        console.error('處理記錄時發生錯誤:', error);
        // return 而非往下走：sheet 操作失敗時不該再嘗試同步日曆
        return mockReplyMessage(event.replyToken, '處理記錄時發生錯誤，請稍後再試。');
      }

      // 日曆同步：刻意放在 try/catch 之外且在回覆之後
      // 提前歸還是縮短事件而非刪除，因為器材確實被借出過，那段歷史該留在日曆上
      if (calendarAction === 'delete') {
        deleteRentalEvent_(eventId);
      } else if (calendarAction === 'shorten') {
        updateRentalEventEnd_(eventId, today);
      }
    }

    test('應該成功刪除未來的租借記錄', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      // 建立一筆未來的記錄
      const futureDate1 = new Date(2099, 11, 1, 0, 0, 0, 0);
      const futureDate2 = new Date(2099, 11, 3, 0, 0, 0, 0);

      env.loansSheet.appendRow([
        new Date(),
        userId,
        mockUsers.user1.displayName,
        '相機A, 三腳架',
        futureDate1,
        futureDate2
      ]);

      // 記錄刪除前的行數
      const rowsBefore = env.loansSheet.getDataRange().getValues().length;

      handleDeleteRecord_(event, '1', userId);

      // 驗證回覆訊息
      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('✅ 已取消未來租借記錄'));
      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('相機A, 三腳架'));

      // 驗證記錄已被刪除
      const rowsAfter = env.loansSheet.getDataRange().getValues().length;
      expect(rowsAfter).toBe(rowsBefore - 1);
    });

    test('應該成功提前歸還進行中的租借記錄', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      // 建立一筆進行中的記錄（今天開始，未來結束）
      const today = startOfDay_(new Date());
      const futureDate = new Date(2099, 11, 31, 0, 0, 0, 0);

      env.loansSheet.appendRow([
        new Date(),
        userId,
        mockUsers.user1.displayName,
        '燈具',
        today,
        futureDate
      ]);

      handleDeleteRecord_(event, '1', userId);

      // 驗證回覆訊息
      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('✅ 已提前歸還器材'));
      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('燈具'));
    });

    test('當記錄編號格式錯誤時應該回傳錯誤', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleDeleteRecord_(event, 'abc', userId);

      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', '記錄編號格式錯誤，請輸入正確的數字。');
    });

    test('當記錄編號為 0 時應該回傳錯誤', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleDeleteRecord_(event, '0', userId);

      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', '記錄編號格式錯誤，請輸入正確的數字。');
    });

    test('當記錄編號為負數時應該回傳錯誤', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      handleDeleteRecord_(event, '-1', userId);

      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', '記錄編號格式錯誤，請輸入正確的數字。');
    });

    test('當記錄編號不存在時應該回傳錯誤', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      // 沒有建立任何記錄

      handleDeleteRecord_(event, '1', userId);

      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('記錄編號 1 不存在'));
    });

    test('當記錄編號超出範圍時應該回傳錯誤', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      // 建立一筆記錄
      const futureDate1 = new Date(2099, 11, 1, 0, 0, 0, 0);
      const futureDate2 = new Date(2099, 11, 3, 0, 0, 0, 0);

      env.loansSheet.appendRow([
        new Date(),
        userId,
        mockUsers.user1.displayName,
        '相機A',
        futureDate1,
        futureDate2
      ]);

      // 嘗試刪除第 2 筆記錄（不存在）
      handleDeleteRecord_(event, '2', userId);

      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('記錄編號 2 不存在'));
    });

    test('當 Sheet 不存在時應該回傳錯誤', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      mockGetLoansSheet.mockReturnValue(null);

      handleDeleteRecord_(event, '1', userId);

      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('找不到工作表'));
    });

    test('應該只能刪除自己的記錄', () => {
      const event = { replyToken: 'test-token' };
      const user1Id = mockUsers.user1.userId;
      const user2Id = mockUsers.user2.userId;

      // user1 建立一筆記錄
      const futureDate1 = new Date(2099, 11, 1, 0, 0, 0, 0);
      const futureDate2 = new Date(2099, 11, 3, 0, 0, 0, 0);

      env.loansSheet.appendRow([
        new Date(),
        user1Id,
        mockUsers.user1.displayName,
        '相機A',
        futureDate1,
        futureDate2
      ]);

      // user2 嘗試刪除 user1 的記錄
      handleDeleteRecord_(event, '1', user2Id);

      // 應該回傳記錄不存在（因為 user2 沒有可操作的記錄）
      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('記錄編號 1 不存在'));
    });

    test('應該不能刪除已過期的記錄', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      // 建立一筆已過期的記錄
      const pastDate1 = new Date(2020, 0, 1, 0, 0, 0, 0);
      const pastDate2 = new Date(2020, 0, 3, 0, 0, 0, 0);

      env.loansSheet.appendRow([
        new Date(),
        userId,
        mockUsers.user1.displayName,
        '相機A',
        pastDate1,
        pastDate2
      ]);

      handleDeleteRecord_(event, '1', userId);

      // 應該回傳記錄不存在（因為已過期的記錄不在可操作列表中）
      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('記錄編號 1 不存在'));
    });

    test('應該正確處理多個器材的記錄', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      const futureDate1 = new Date(2099, 11, 1, 0, 0, 0, 0);
      const futureDate2 = new Date(2099, 11, 3, 0, 0, 0, 0);

      env.loansSheet.appendRow([
        new Date(),
        userId,
        mockUsers.user1.displayName,
        '相機A, 三腳架, 燈具',
        futureDate1,
        futureDate2
      ]);

      handleDeleteRecord_(event, '1', userId);

      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('相機A, 三腳架, 燈具'));
    });

    test('應該正確處理中文逗號分隔的器材', () => {
      const event = { replyToken: 'test-token' };
      const userId = mockUsers.user1.userId;

      const futureDate1 = new Date(2099, 11, 1, 0, 0, 0, 0);
      const futureDate2 = new Date(2099, 11, 3, 0, 0, 0, 0);

      env.loansSheet.appendRow([
        new Date(),
        userId,
        mockUsers.user1.displayName,
        '相機A，三腳架，燈具',
        futureDate1,
        futureDate2
      ]);

      handleDeleteRecord_(event, '1', userId);

      expect(mockReplyMessage).toHaveBeenCalledWith('test-token', expect.stringContaining('相機A, 三腳架, 燈具'));
    });

    describe('日曆同步', () => {
      const CAL_ID = 'foufa@group.calendar.google.com';
      const USER = mockUsers.user1.userId;

      /**
       * 以指定的租借紀錄與日曆事件重建測試環境
       */
      function setupEnv(loanRecords, options = {}) {
        env = setupTestEnvironment({
          loanRecords,
          properties: {
            LINE_CHANNEL_TOKEN: 'mock-channel-token',
            ...(options.noCalendarId ? {} : { CALENDAR_ID: CAL_ID })
          },
          calendarId: CAL_ID,
          calendarEvents: options.calendarEvents || {}
        });
        mockGetLoansSheet = jest.fn(() => env.loansSheet);
        return env;
      }

      /**
       * 建立一筆未來的租借紀錄
       */
      function futureRecord(eventId) {
        return createMockLoanRecord({
          userId: USER,
          items: '相機A',
          borrowedAt: new Date(2099, 11, 1, 0, 0, 0, 0),
          returnedAt: new Date(2099, 11, 3, 0, 0, 0, 0),
          eventId
        });
      }

      /**
       * 建立一筆進行中的租借紀錄（今天在租期內）
       */
      function inProgressRecord(eventId) {
        const today = startOfDay_(new Date());
        return createMockLoanRecord({
          userId: USER,
          items: '相機A',
          borrowedAt: addDays_(today, -2),
          returnedAt: addDays_(today, 5),
          eventId
        });
      }

      test('刪除未來紀錄時應該刪掉日曆事件', () => {
        setupEnv([futureRecord('evt-1@google.com')], {
          calendarEvents: {
            'evt-1@google.com': createMockCalendarEvent(
              'evt-1@google.com', '張小明｜相機A',
              new Date(2099, 11, 1), new Date(2099, 11, 4)
            )
          }
        });

        handleDeleteRecord_({ replyToken: 'test-token' }, '1', USER);

        expect(env.calendar._getEvents()['evt-1@google.com']._isDeleted()).toBe(true);
        // 只剩表頭
        expect(env.loansSheet._getData().length).toBe(1);
      });

      test('提前歸還時應該縮短事件而非刪除', () => {
        const mockEvent = createMockCalendarEvent(
          'evt-2@google.com', '張小明｜相機A',
          addDays_(startOfDay_(new Date()), -2), addDays_(startOfDay_(new Date()), 6)
        );
        setupEnv([inProgressRecord('evt-2@google.com')], {
          calendarEvents: { 'evt-2@google.com': mockEvent }
        });

        handleDeleteRecord_({ replyToken: 'test-token' }, '1', USER);

        expect(mockEvent.deleteEvent).not.toHaveBeenCalled();
        expect(mockEvent.setAllDayDates).toHaveBeenCalled();
      });

      test('提前歸還的事件結束日應該為今天的隔天（排他）', () => {
        const mockEvent = createMockCalendarEvent(
          'evt-2@google.com', '張小明｜相機A',
          addDays_(startOfDay_(new Date()), -2), addDays_(startOfDay_(new Date()), 6)
        );
        setupEnv([inProgressRecord('evt-2@google.com')], {
          calendarEvents: { 'evt-2@google.com': mockEvent }
        });

        handleDeleteRecord_({ replyToken: 'test-token' }, '1', USER);

        const [, end] = mockEvent.setAllDayDates.mock.calls[0];
        expect(isSameDay(end, addDays_(startOfDay_(new Date()), 1))).toBe(true);
      });

      test('eventId 為空的舊紀錄應該正常刪除且不碰日曆', () => {
        setupEnv([futureRecord('')]);

        expect(() => handleDeleteRecord_({ replyToken: 'test-token' }, '1', USER)).not.toThrow();

        expect(env.loansSheet._getData().length).toBe(1);
        expect(env.calendar.getEventById).not.toHaveBeenCalled();
      });

      test('事件已被手動從日曆刪除時仍應該讓使用者刪掉紀錄', () => {
        // 不能因為日曆找不到就讓使用者刪不掉自己的紀錄
        setupEnv([futureRecord('已經不存在@google.com')]);

        expect(() => handleDeleteRecord_({ replyToken: 'test-token' }, '1', USER)).not.toThrow();

        expect(env.loansSheet._getData().length).toBe(1);
        expect(mockReplyMessage).toHaveBeenCalledWith(
          'test-token',
          expect.stringContaining('已取消未來租借記錄')
        );
      });

      test('CALENDAR_ID 未設定時應該正常刪除紀錄', () => {
        setupEnv([futureRecord('evt-1@google.com')], { noCalendarId: true });

        expect(() => handleDeleteRecord_({ replyToken: 'test-token' }, '1', USER)).not.toThrow();

        expect(env.loansSheet._getData().length).toBe(1);
      });

      test('日曆爆掉時使用者仍應該收到成功回覆而非錯誤訊息', () => {
        setupEnv([futureRecord('evt-1@google.com')]);
        env.calendar.getEventById = jest.fn(() => {
          throw new Error('Calendar service error');
        });

        // 例外往上拋 → Apps Script 寄通知信給 script owner
        expect(() => handleDeleteRecord_({ replyToken: 'test-token' }, '1', USER))
          .toThrow('Calendar service error');

        // 關鍵：使用者收到的是成功訊息，不是「處理記錄時發生錯誤」。
        // 若日曆同步被包在 try/catch 裡，這裡就會誤報錯誤，
        // 但紀錄其實已經刪成功了，使用者會重試造成更多混亂。
        expect(mockReplyMessage).toHaveBeenCalledWith(
          'test-token',
          expect.stringContaining('已取消未來租借記錄')
        );
        expect(mockReplyMessage).not.toHaveBeenCalledWith(
          'test-token',
          expect.stringContaining('處理記錄時發生錯誤')
        );
      });

      test('eventId 應該在 deleteRow 之前讀出（列刪掉後就取不到）', () => {
        setupEnv([futureRecord('evt-1@google.com')], {
          calendarEvents: {
            'evt-1@google.com': createMockCalendarEvent(
              'evt-1@google.com', '張小明｜相機A',
              new Date(2099, 11, 1), new Date(2099, 11, 4)
            )
          }
        });

        handleDeleteRecord_({ replyToken: 'test-token' }, '1', USER);

        // 列已刪除，但日曆仍收到正確的 eventId
        expect(env.loansSheet._getData().length).toBe(1);
        expect(env.calendar.getEventById).toHaveBeenCalledWith('evt-1@google.com');
      });
    });
  });
});

