/**
 * queryService 單元測試
 * 
 * 測試查詢服務的各種功能：
 * - 日期查詢（replyBorrowedOnDate_）
 * - 月份查詢（replyBorrowedOnMonth_）
 * - 我的租借（replyMyBorrowRecords_）
 * - 指令說明（helpText_）
 */

const { setupTestEnvironment, cleanupGASEnvironment, createDate } = require('../mocks/testHelpers');
const { mockUsers, mockEquipment, createMockLoanRecord } = require('../mocks/fixtures');

// 從 src/dateUtils.js 複製函式定義
function parseDotDate_(s) {
  const m = String(s || '').trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return isNaN(d) ? null : d;
}

function formatDotDate_(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

function startOfDay_(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toDateOrNull_(v) {
  if (v instanceof Date) return v;
  if (v === null || v === undefined || v === '' || v === false) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function parseDotMonth_(ymDot) {
  const m = String(ymDot || '').trim().match(/^(\d{4})\.(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;

  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 0, 0, 0, 0, 0);

  return { year, month, startDate, endDate };
}

// 從 src/sheetService.js 複製函式定義
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

// Mock 全域函式
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

let mockReplyMessage;
let mockGetLoansSheet;
let mockFetchLineDisplayName;

// 從 src/queryService.js 複製函式定義
function replyBorrowedOnDate_(replyToken, ymdDot) {
  const loans = mockGetLoansSheet();
  if (!loans) return mockReplyMessage(replyToken, `找不到工作表：SHEET_LOANS`);

  const target = parseDotDate_(ymdDot);
  if (!target) return mockReplyMessage(replyToken, '日期格式錯誤，請用 YYYY.MM.DD');

  const rows = getLoanRows_(loans);

  // 一次請求只讀一次 users 分頁，不要每列都讀
  const nameMap = getUserDisplayNameMap_();

  const list = rows.filter(r => {
    const rentStart = toDateOrNull_(r.borrowedAt);
    const rentEnd = toDateOrNull_(r.returnedAt);
    if (!rentStart || !rentEnd) return false;
    const d = startOfDay_(target);
    return startOfDay_(rentStart) <= d && d <= startOfDay_(rentEnd);
  });

  if (!list.length) {
    return mockReplyMessage(replyToken, '暫無借用資訊，請確認工作室是否有拍攝。');
  }

  // 查器材是群組共用視圖，故套用 users 對照表讓別人認得出是誰
  const msg = list.map(r => {
    const username = resolveDisplayName_(r.userId, r.username, nameMap);
    const itemsArr = String(r.items || '').split(/[，,]/).map(s => s.trim()).filter(Boolean);
    const itemsBlock = itemsArr.length ? itemsArr.join('\n') : '（無器材資料）';
    const rentStart = formatDotDate_(toDateOrNull_(r.borrowedAt));
    const rentEnd = formatDotDate_(toDateOrNull_(r.returnedAt));
    const dateRange = `📅 ${rentStart} ~ ${rentEnd}`;
    return `${dateRange}\n**${username}**\n${itemsBlock}`;
  }).join('\n\n');

  mockReplyMessage(replyToken, msg);
}

function replyBorrowedOnMonth_(replyToken, ymDot) {
  const loans = mockGetLoansSheet();
  if (!loans) return mockReplyMessage(replyToken, `找不到工作表：SHEET_LOANS`);

  const monthInfo = parseDotMonth_(ymDot);
  if (!monthInfo) return mockReplyMessage(replyToken, '月份格式錯誤，請用 YYYY.MM');

  const rows = getLoanRows_(loans);

  // 一次請求只讀一次 users 分頁，不要每列都讀
  const nameMap = getUserDisplayNameMap_();

  const list = rows.filter(r => {
    const rentStart = toDateOrNull_(r.borrowedAt);
    const rentEnd = toDateOrNull_(r.returnedAt);
    if (!rentStart || !rentEnd) return false;

    const borrowStart = startOfDay_(rentStart);
    const borrowEnd = startOfDay_(rentEnd);
    const monthStart = startOfDay_(monthInfo.startDate);
    const monthEnd = startOfDay_(monthInfo.endDate);

    return borrowStart <= monthEnd && borrowEnd >= monthStart;
  });

  if (!list.length) {
    const monthText = `${monthInfo.year} / ${monthInfo.month}`;
    return mockReplyMessage(replyToken, `${monthText} 暫無器材借用紀錄。`);
  }

  list.sort((a, b) => {
    const dateA = toDateOrNull_(a.borrowedAt);
    const dateB = toDateOrNull_(b.borrowedAt);
    return dateA - dateB;
  });

  const monthText = `${monthInfo.year} / ${monthInfo.month} 器材租借`;
  // 同上：共用視圖套用對照表
  const msg = list.map(r => {
    const username = resolveDisplayName_(r.userId, r.username, nameMap);
    const itemsArr = String(r.items || '').split(/[，,]/).map(s => s.trim()).filter(Boolean);
    const itemsBlock = itemsArr.length ? itemsArr.join('\n') : '（無器材資料）';
    const rentStart = formatDotDate_(toDateOrNull_(r.borrowedAt));
    const rentEnd = formatDotDate_(toDateOrNull_(r.returnedAt));
    const dateRange = `📅 ${rentStart} ~ ${rentEnd}`;
    return `${dateRange}\n**${username}**\n${itemsBlock}`;
  }).join('\n\n');

  const fullMessage = `${monthText}\n\n${msg}`;
  mockReplyMessage(replyToken, fullMessage);
}

function replyMyBorrowRecords_(replyToken, userId) {
  const loans = mockGetLoansSheet();
  if (!loans) return mockReplyMessage(replyToken, `找不到工作表：SHEET_LOANS`);

  const username = mockFetchLineDisplayName(userId) || '您';
  const rows = getLoanRows_(loans);
  const today = startOfDay_(new Date());

  const myActiveRecords = rows
    .map((record, index) => ({ ...record, rowIndex: index + 2 }))
    .filter(r => {
      const isMyRecord = r.userId === userId;
      const returnDate = toDateOrNull_(r.returnedAt);
      const isActiveOrFuture = returnDate && startOfDay_(returnDate) >= today;
      return isMyRecord && isActiveOrFuture;
    });

  if (!myActiveRecords.length) {
    return mockReplyMessage(replyToken, '您目前沒有可操作的租借記錄。');
  }

  const recordList = myActiveRecords.map((r, index) => {
    const itemsArr = String(r.items || '').split(/[，,]/).map(s => s.trim()).filter(Boolean);
    const itemsBlock = itemsArr.length ? itemsArr.join(', ') : '（無器材資料）';
    const rentStart = formatDotDate_(toDateOrNull_(r.borrowedAt));
    const rentEnd = formatDotDate_(toDateOrNull_(r.returnedAt));
    return `[${index + 1}] ${rentStart} ~ ${rentEnd}\n${itemsBlock}`;
  }).join('\n\n');

  const helpText = '\n\n輸入「刪除 <編號>」即可刪除\n例如：刪除 1';
  const fullMessage = `📋 ${username}的租借記錄\n\n${recordList}${helpText}`;
  mockReplyMessage(replyToken, fullMessage);
}

function helpText_() {
  return [
    '可用指令與範例：',
    '',
    '1) 借器材（請複製下方四行格式，包含「借器材」）',
    '借器材',
    '租用器材：器材一, 器材二, 器材三',
    '租用日期：2025.09.10',
    '歸還日期：2025.09.12',
    '',
    '2) 查器材 <YYYY.MM.DD> 或 <YYYY.MM>',
    '範例：查器材 2025.09.11（查特定日期）',
    '範例：查器材 2025.09（查整個月份）',
    '',
    '3) 我的租借',
    '查看您的未來租借記錄，並進行刪除',
    '',
    '4) 查指令',
    '顯示所有指令與使用範例'
  ].join('\n');
}

// ==================== 測試開始 ====================

describe('queryService', () => {
  let env;

  beforeEach(() => {
    // 建立測試資料
    const loanRecords = [
      // 記錄 1: user1 在 2025.09.10-12 借用相機和三腳架
      createMockLoanRecord({
        userId: mockUsers.user1.userId,
        username: mockUsers.user1.displayName,
        items: `${mockEquipment.camera}, ${mockEquipment.tripod}`,
        borrowedAt: createDate(2025, 9, 10),
        returnedAt: createDate(2025, 9, 12)
      }),
      // 記錄 2: user2 在 2025.09.11-13 借用燈具
      createMockLoanRecord({
        userId: mockUsers.user2.userId,
        username: mockUsers.user2.displayName,
        items: mockEquipment.light,
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      }),
      // 記錄 3: user1 在 2025.09.15-17 借用收音設備（未來記錄）
      createMockLoanRecord({
        userId: mockUsers.user1.userId,
        username: mockUsers.user1.displayName,
        items: mockEquipment.microphone,
        borrowedAt: createDate(2025, 9, 15),
        returnedAt: createDate(2025, 9, 17)
      }),
      // 記錄 4: user2 在 2025.10.01-03 借用鏡頭組（跨月記錄）
      createMockLoanRecord({
        userId: mockUsers.user2.userId,
        username: mockUsers.user2.displayName,
        items: mockEquipment.lens,
        borrowedAt: createDate(2025, 10, 1),
        returnedAt: createDate(2025, 10, 3)
      })
    ];

    const userProfiles = {
      [mockUsers.user1.userId]: mockUsers.user1.displayName,
      [mockUsers.user2.userId]: mockUsers.user2.displayName
    };

    env = setupTestEnvironment({ loanRecords, userProfiles });

    // 設定 mock 函式
    mockReplyMessage = jest.fn();
    mockGetLoansSheet = jest.fn(() => env.loansSheet);
    mockFetchLineDisplayName = jest.fn((userId) => userProfiles[userId] || null);
  });

  afterEach(() => {
    cleanupGASEnvironment();
    jest.clearAllMocks();
  });

  describe('replyBorrowedOnDate_ - 日期查詢', () => {
    test('應該正確查詢指定日期的借用記錄', () => {
      const replyToken = 'test-token';

      // 查詢 2025.09.11（應該找到記錄 1 和 2）
      replyBorrowedOnDate_(replyToken, '2025.09.11');

      expect(mockReplyMessage).toHaveBeenCalledTimes(1);
      const message = mockReplyMessage.mock.calls[0][1];

      // 應該包含兩筆記錄
      expect(message).toContain(mockUsers.user1.displayName);
      expect(message).toContain(mockUsers.user2.displayName);
      expect(message).toContain(mockEquipment.camera);
      expect(message).toContain(mockEquipment.light);
    });

    test('應該正確顯示日期範圍', () => {
      const replyToken = 'test-token';

      replyBorrowedOnDate_(replyToken, '2025.09.11');

      const message = mockReplyMessage.mock.calls[0][1];
      expect(message).toContain('📅 2025.09.10 ~ 2025.09.12');
      expect(message).toContain('📅 2025.09.11 ~ 2025.09.13');
    });

    test('當日期沒有借用記錄時應該回傳提示訊息', () => {
      const replyToken = 'test-token';

      // 查詢 2025.09.20（沒有記錄）
      replyBorrowedOnDate_(replyToken, '2025.09.20');

      expect(mockReplyMessage).toHaveBeenCalledWith(
        replyToken,
        '暫無借用資訊，請確認工作室是否有拍攝。'
      );
    });

    test('當日期格式錯誤時應該回傳錯誤訊息', () => {
      const replyToken = 'test-token';

      replyBorrowedOnDate_(replyToken, '2025-09-11'); // 錯誤格式

      expect(mockReplyMessage).toHaveBeenCalledWith(
        replyToken,
        '日期格式錯誤，請用 YYYY.MM.DD'
      );
    });

    test('當 Sheet 不存在時應該回傳錯誤', () => {
      const replyToken = 'test-token';
      mockGetLoansSheet.mockReturnValue(null);

      replyBorrowedOnDate_(replyToken, '2025.09.11');

      expect(mockReplyMessage).toHaveBeenCalledWith(
        replyToken,
        expect.stringContaining('找不到工作表')
      );
    });

    test('應該正確處理租用期間的邊界日期', () => {
      const replyToken = 'test-token';

      // 查詢租用開始日（2025.09.10）
      replyBorrowedOnDate_(replyToken, '2025.09.10');
      expect(mockReplyMessage.mock.calls[0][1]).toContain(mockUsers.user1.displayName);

      jest.clearAllMocks();

      // 查詢租用結束日（2025.09.12）
      replyBorrowedOnDate_(replyToken, '2025.09.12');
      expect(mockReplyMessage.mock.calls[0][1]).toContain(mockUsers.user1.displayName);
    });
  });

  describe('replyBorrowedOnMonth_ - 月份查詢', () => {
    test('應該正確查詢指定月份的借用記錄', () => {
      const replyToken = 'test-token';

      // 查詢 2025.09（應該找到記錄 1, 2, 3）
      replyBorrowedOnMonth_(replyToken, '2025.09');

      expect(mockReplyMessage).toHaveBeenCalledTimes(1);
      const message = mockReplyMessage.mock.calls[0][1];

      // 應該包含月份標題
      expect(message).toContain('2025 / 9 器材租借');

      // 應該包含三筆記錄
      expect(message).toContain(mockEquipment.camera);
      expect(message).toContain(mockEquipment.light);
      expect(message).toContain(mockEquipment.microphone);
    });

    test('應該按租用日期排序', () => {
      const replyToken = 'test-token';

      replyBorrowedOnMonth_(replyToken, '2025.09');

      const message = mockReplyMessage.mock.calls[0][1];

      // 檢查順序：記錄 1 (09.10) -> 記錄 2 (09.11) -> 記錄 3 (09.15)
      const cameraIndex = message.indexOf(mockEquipment.camera);
      const lightIndex = message.indexOf(mockEquipment.light);
      const micIndex = message.indexOf(mockEquipment.microphone);

      expect(cameraIndex).toBeLessThan(lightIndex);
      expect(lightIndex).toBeLessThan(micIndex);
    });

    test('當月份沒有借用記錄時應該回傳提示訊息', () => {
      const replyToken = 'test-token';

      // 查詢 2025.08（沒有記錄）
      replyBorrowedOnMonth_(replyToken, '2025.08');

      expect(mockReplyMessage).toHaveBeenCalledWith(
        replyToken,
        '2025 / 8 暫無器材借用紀錄。'
      );
    });

    test('當月份格式錯誤時應該回傳錯誤訊息', () => {
      const replyToken = 'test-token';

      replyBorrowedOnMonth_(replyToken, '2025-09'); // 錯誤格式

      expect(mockReplyMessage).toHaveBeenCalledWith(
        replyToken,
        '月份格式錯誤，請用 YYYY.MM'
      );
    });

    test('應該正確處理跨月租借記錄', () => {
      const replyToken = 'test-token';

      // 查詢 2025.10（記錄 4 從 10.01 開始）
      replyBorrowedOnMonth_(replyToken, '2025.10');

      const message = mockReplyMessage.mock.calls[0][1];
      expect(message).toContain(mockEquipment.lens);
    });
  });

  describe('replyMyBorrowRecords_ - 我的租借', () => {
    test('應該正確查詢使用者的未來租借記錄', () => {
      const replyToken = 'test-token';
      const userId = mockUsers.user1.userId;

      // Mock 當前日期為 2025.09.01（所有記錄都是未來的）
      const RealDate = Date;
      global.Date = class extends RealDate {
        constructor() {
          super();
          return new RealDate(2025, 8, 1, 0, 0, 0, 0); // 9月是8（0-based）
        }
      };
      global.Date.now = RealDate.now;

      replyMyBorrowRecords_(replyToken, userId);

      const message = mockReplyMessage.mock.calls[0][1];

      // 應該包含標題
      expect(message).toContain(`📋 ${mockUsers.user1.displayName}的租借記錄`);

      // 應該包含 user1 的兩筆記錄
      expect(message).toContain(mockEquipment.camera);
      expect(message).toContain(mockEquipment.microphone);

      // 不應該包含 user2 的記錄
      expect(message).not.toContain(mockEquipment.light);

      // 應該包含刪除提示
      expect(message).toContain('輸入「刪除 <編號>」即可刪除');

      global.Date = RealDate;
    });

    test('應該正確編號記錄', () => {
      const replyToken = 'test-token';
      const userId = mockUsers.user1.userId;

      const RealDate = Date;
      global.Date = class extends RealDate {
        constructor() {
          super();
          return new RealDate(2025, 8, 1, 0, 0, 0, 0);
        }
      };
      global.Date.now = RealDate.now;

      replyMyBorrowRecords_(replyToken, userId);

      const message = mockReplyMessage.mock.calls[0][1];

      // 應該有編號 [1] 和 [2]
      expect(message).toContain('[1]');
      expect(message).toContain('[2]');

      global.Date = RealDate;
    });

    test('應該只顯示未來和進行中的記錄', () => {
      const replyToken = 'test-token';
      const userId = mockUsers.user1.userId;

      // Mock 當前日期為 2025.09.13（記錄 1 的歸還日期是 09.12，已過期；記錄 3 的租用日期是 09.15，是未來）
      const RealDate = Date;
      let callCount = 0;
      global.Date = class extends RealDate {
        constructor(...args) {
          super();
          // 只有在呼叫 new Date() 時（無參數）才回傳 mock 日期
          if (args.length === 0) {
            callCount++;
            return new RealDate(2025, 8, 13, 0, 0, 0, 0);
          }
          // 其他情況使用原本的參數
          return new RealDate(...args);
        }
      };
      global.Date.now = RealDate.now;

      replyMyBorrowRecords_(replyToken, userId);

      const message = mockReplyMessage.mock.calls[0][1];

      // 應該只包含記錄 3（收音設備，09.15-17）
      expect(message).toContain(mockEquipment.microphone);
      expect(message).toContain('[1]'); // 只有一筆記錄
      expect(message).not.toContain('[2]'); // 不應該有第二筆

      // 不應該包含記錄 1（相機，09.10-12，已過期）
      expect(message).not.toContain(mockEquipment.camera);

      global.Date = RealDate;
    });

    test('當沒有可操作的記錄時應該回傳提示訊息', () => {
      const replyToken = 'test-token';
      const userId = mockUsers.user3.userId; // user3 沒有記錄

      replyMyBorrowRecords_(replyToken, userId);

      expect(mockReplyMessage).toHaveBeenCalledWith(
        replyToken,
        '您目前沒有可操作的租借記錄。'
      );
    });

    test('當 LINE API 失敗時應該使用「您」作為預設名稱', () => {
      const replyToken = 'test-token';
      const userId = 'unknown-user';

      mockFetchLineDisplayName.mockReturnValue(null);

      // 建立一筆未來的測試記錄
      const futureDate1 = new Date(2099, 11, 1, 0, 0, 0, 0); // 2099.12.01
      const futureDate2 = new Date(2099, 11, 3, 0, 0, 0, 0); // 2099.12.03

      env.loansSheet.appendRow([
        new Date(),
        userId,
        userId,
        '測試器材',
        futureDate1,
        futureDate2
      ]);

      replyMyBorrowRecords_(replyToken, userId);

      const message = mockReplyMessage.mock.calls[0][1];
      expect(message).toContain('📋 您的租借記錄');
    });

    test('當 Sheet 不存在時應該回傳錯誤', () => {
      const replyToken = 'test-token';
      const userId = mockUsers.user1.userId;

      mockGetLoansSheet.mockReturnValue(null);

      replyMyBorrowRecords_(replyToken, userId);

      expect(mockReplyMessage).toHaveBeenCalledWith(
        replyToken,
        expect.stringContaining('找不到工作表')
      );
    });
  });

  describe('helpText_ - 指令說明', () => {
    test('應該回傳完整的指令說明', () => {
      const text = helpText_();

      // 應該包含所有指令
      expect(text).toContain('借器材');
      expect(text).toContain('查器材');
      expect(text).toContain('我的租借');
      expect(text).toContain('查指令');
    });

    test('應該包含借器材的範例格式', () => {
      const text = helpText_();

      expect(text).toContain('租用器材：');
      expect(text).toContain('租用日期：');
      expect(text).toContain('歸還日期：');
    });

    test('應該包含查器材的範例', () => {
      const text = helpText_();

      expect(text).toContain('YYYY.MM.DD');
      expect(text).toContain('YYYY.MM');
    });
  });

  describe('顯示名稱對照表', () => {
    const USER = 'U1111111111111111';

    /**
     * 以指定的 users 分頁資料重建測試環境
     */
    function setupEnv(userRows) {
      env = setupTestEnvironment({
        loanRecords: [
          createMockLoanRecord({
            userId: USER,
            username: '阿明🌀',
            items: mockEquipment.camera,
            borrowedAt: createDate(2025, 9, 11),
            returnedAt: createDate(2025, 9, 13)
          })
        ],
        userRows
      });
      mockGetLoansSheet = jest.fn(() => env.loansSheet);
      mockReplyMessage = jest.fn();
      return env;
    }

    test('查器材（日）應該顯示對照表的名稱而非 LINE 暱稱', () => {
      setupEnv([[USER, '張小明']]);

      replyBorrowedOnDate_('test-token', '2025.09.11');

      const [, msg] = mockReplyMessage.mock.calls[0];
      expect(msg).toContain('張小明');
      expect(msg).not.toContain('阿明🌀');
    });

    test('查器材（月）也應該套用對照表', () => {
      setupEnv([[USER, '張小明']]);

      replyBorrowedOnMonth_('test-token', '2025.09');

      const [, msg] = mockReplyMessage.mock.calls[0];
      expect(msg).toContain('張小明');
      expect(msg).not.toContain('阿明🌀');
    });

    test('未命中對照表時應該顯示 username', () => {
      setupEnv([['U9999999999999999', '別人']]);

      replyBorrowedOnDate_('test-token', '2025.09.11');

      const [, msg] = mockReplyMessage.mock.calls[0];
      expect(msg).toContain('阿明🌀');
    });

    test('users 分頁不存在時應該正常顯示 username 而非爆炸', () => {
      setupEnv(null);

      expect(() => replyBorrowedOnDate_('test-token', '2025.09.11')).not.toThrow();

      const [, msg] = mockReplyMessage.mock.calls[0];
      expect(msg).toContain('阿明🌀');
    });

    test('使用者改了 LINE 暱稱後，既有紀錄的顯示也應該跟著正名', () => {
      // 解析發生在顯示層，故舊紀錄裡的暱稱快照不影響顯示結果
      env = setupTestEnvironment({
        loanRecords: [
          createMockLoanRecord({
            userId: USER,
            username: '阿明',      // 舊紀錄的暱稱快照
            items: mockEquipment.camera,
            borrowedAt: createDate(2025, 9, 11),
            returnedAt: createDate(2025, 9, 11)
          }),
          createMockLoanRecord({
            userId: USER,
            username: '明哥🔥',    // 新紀錄的暱稱快照
            items: mockEquipment.tripod,
            borrowedAt: createDate(2025, 9, 11),
            returnedAt: createDate(2025, 9, 11)
          })
        ],
        userRows: [[USER, '張小明']]
      });
      mockGetLoansSheet = jest.fn(() => env.loansSheet);
      mockReplyMessage = jest.fn();

      replyBorrowedOnDate_('test-token', '2025.09.11');

      const [, msg] = mockReplyMessage.mock.calls[0];
      expect(msg).not.toContain('阿明');
      expect(msg).not.toContain('明哥🔥');
      expect(msg.match(/張小明/g)).toHaveLength(2);
    });

    test('一次查詢只應該讀一次 users 分頁（不可每列都讀）', () => {
      env = setupTestEnvironment({
        loanRecords: [
          createMockLoanRecord({
            userId: USER,
            username: '阿明🌀',
            borrowedAt: createDate(2025, 9, 11),
            returnedAt: createDate(2025, 9, 11)
          }),
          createMockLoanRecord({
            userId: 'U2222222222222222',
            username: '阿華',
            borrowedAt: createDate(2025, 9, 11),
            returnedAt: createDate(2025, 9, 11)
          })
        ],
        userRows: [[USER, '張小明']]
      });
      mockGetLoansSheet = jest.fn(() => env.loansSheet);
      mockReplyMessage = jest.fn();

      replyBorrowedOnDate_('test-token', '2025.09.11');

      const usersCalls = env.spreadsheet.getSheetByName.mock.calls.filter(([name]) => name === 'users');
      expect(usersCalls).toHaveLength(1);
    });

    test('我的租借刻意不套用對照表（那是使用者看自己的畫面）', () => {
      // 我的租借只列出 returnedAt >= today 的紀錄，故必須用未來日期
      env = setupTestEnvironment({
        loanRecords: [
          createMockLoanRecord({
            userId: USER,
            username: '阿明🌀',
            items: mockEquipment.camera,
            borrowedAt: createDate(2099, 12, 1),
            returnedAt: createDate(2099, 12, 3)
          })
        ],
        userRows: [[USER, '張小明']]
      });
      mockGetLoansSheet = jest.fn(() => env.loansSheet);
      mockReplyMessage = jest.fn();
      mockFetchLineDisplayName = jest.fn(() => '阿明🌀');

      replyMyBorrowRecords_('test-token', USER);

      const [, msg] = mockReplyMessage.mock.calls[0];
      expect(msg).toContain('阿明🌀');
      expect(msg).not.toContain('張小明');
    });
  });
});

