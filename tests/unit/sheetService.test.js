/**
 * sheetService 測試
 *
 * 測試 Google Sheets 操作服務的所有功能：
 * 1. getLoansSheet_ - 取得借用紀錄工作表
 * 2. ensureLoansHeaders_ - 確保工作表存在且有正確的標題列
 * 3. getLoanRows_ - 取得所有借用紀錄資料
 * 4. updateRecordReturnDate_ - 更新特定記錄的歸還日期
 * 5. safeCell_ - 安全地取得儲存格值
 */

const { setupTestEnvironment } = require('../mocks/testHelpers');

// ==================== Mock 函式 ====================

let env;
let mockSpreadsheetApp;

// ==================== 測試主體 ====================

describe('sheetService', () => {
  beforeEach(() => {
    // 建立測試環境
    env = setupTestEnvironment({});

    // Mock SpreadsheetApp
    mockSpreadsheetApp = {
      getActiveSpreadsheet: jest.fn(() => env.spreadsheet)
    };

    global.SpreadsheetApp = mockSpreadsheetApp;
    global.SHEET_LOANS = 'loans';
    global.LOANS_HEADERS = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt'];
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getLoansSheet_ - 取得借用紀錄工作表', () => {
    /**
     * 取得借用紀錄工作表
     */
    function getLoansSheet_() {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      return ss.getSheetByName(SHEET_LOANS) || null;
    }

    test('應該成功取得存在的工作表', () => {
      const sheet = getLoansSheet_();

      expect(sheet).not.toBeNull();
      expect(sheet).toBe(env.loansSheet);
      expect(mockSpreadsheetApp.getActiveSpreadsheet).toHaveBeenCalled();
    });

    test('當工作表不存在時應該回傳 null', () => {
      // Mock getSheetByName 回傳 null
      env.spreadsheet.getSheetByName = jest.fn(() => null);

      const sheet = getLoansSheet_();

      expect(sheet).toBeNull();
    });
  });

  describe('ensureLoansHeaders_ - 確保工作表存在且有正確的標題列', () => {
    /**
     * 確保借用紀錄工作表存在且有正確的標題列
     */
    function ensureLoansHeaders_() {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheet = ss.getSheetByName(SHEET_LOANS);

      if (!sheet) {
        sheet = ss.insertSheet(SHEET_LOANS);
      }

      const lastCol = sheet.getLastColumn();
      const header = lastCol > 0 ? (sheet.getRange(1, 1, 1, lastCol).getValues()[0] || []) : [];
      const headerStr = header.map(String);

      const same = LOANS_HEADERS.length === headerStr.length &&
        LOANS_HEADERS.every((h, i) => h === headerStr[i]);

      if (!same) {
        sheet.clear();
        sheet.getRange(1, 1, 1, LOANS_HEADERS.length).setValues([LOANS_HEADERS]);
      }
    }

    test('當工作表不存在時應該建立新工作表', () => {
      // Mock getSheetByName 回傳 null（工作表不存在）
      env.spreadsheet.getSheetByName = jest.fn(() => null);
      const mockInsertSheet = jest.fn(() => env.loansSheet);
      env.spreadsheet.insertSheet = mockInsertSheet;

      ensureLoansHeaders_();

      expect(mockInsertSheet).toHaveBeenCalledWith(SHEET_LOANS);
    });

    test('當標題列不正確時應該重新設定標題', () => {
      // 設定錯誤的標題
      env.loansSheet.getRange(1, 1, 1, 3).setValues([['wrong', 'header', 'data']]);

      const mockClear = jest.spyOn(env.loansSheet, 'clear');
      const mockSetValues = jest.fn();
      env.loansSheet.getRange = jest.fn((row, col, numRows, numCols) => ({
        getValues: () => [['wrong', 'header', 'data']],
        setValues: mockSetValues
      }));

      ensureLoansHeaders_();

      expect(mockClear).toHaveBeenCalled();
      expect(mockSetValues).toHaveBeenCalledWith([LOANS_HEADERS]);
    });

    test('當標題列正確時不應該修改工作表', () => {
      // 標題已經正確
      const mockClear = jest.spyOn(env.loansSheet, 'clear');

      ensureLoansHeaders_();

      expect(mockClear).not.toHaveBeenCalled();
    });

    test('當工作表為空時應該設定標題', () => {
      // 清空工作表
      env.loansSheet.clear();

      const mockSetValues = jest.fn();
      env.loansSheet.getRange = jest.fn((row, col, numRows, numCols) => ({
        getValues: () => [[]],
        setValues: mockSetValues
      }));

      ensureLoansHeaders_();

      expect(mockSetValues).toHaveBeenCalledWith([LOANS_HEADERS]);
    });
  });

  describe('getLoanRows_ - 取得所有借用紀錄資料', () => {
    /**
     * 安全地取得儲存格值
     */
    function safeCell_(row, i) {
      if (i === -1) return '';
      return row[i];
    }

    /**
     * 取得所有借用紀錄資料
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
      }));
    }

    test('應該正確讀取所有借用紀錄', () => {
      // 建立測試資料
      const date1 = new Date(2025, 8, 1, 0, 0, 0, 0);
      const date2 = new Date(2025, 8, 3, 0, 0, 0, 0);

      env.loansSheet.appendRow([
        new Date(),
        'U123',
        '張小明',
        '相機A, 三腳架',
        date1,
        date2
      ]);

      env.loansSheet.appendRow([
        new Date(),
        'U456',
        '李小華',
        '燈具',
        date1,
        date2
      ]);

      const rows = getLoanRows_(env.loansSheet);

      expect(rows).toHaveLength(2);
      expect(rows[0].userId).toBe('U123');
      expect(rows[0].username).toBe('張小明');
      expect(rows[0].items).toBe('相機A, 三腳架');
      expect(rows[1].userId).toBe('U456');
      expect(rows[1].username).toBe('李小華');
    });

    test('當工作表只有標題列時應該回傳空陣列', () => {
      const rows = getLoanRows_(env.loansSheet);

      expect(rows).toEqual([]);
    });

    test('當工作表為空時應該回傳空陣列', () => {
      env.loansSheet.clear();

      const rows = getLoanRows_(env.loansSheet);

      expect(rows).toEqual([]);
    });

    test('應該正確處理缺少欄位的情況', () => {
      // 建立只有部分欄位的資料
      env.loansSheet.appendRow([
        new Date(),
        'U123',
        '張小明',
        '相機A'
        // 缺少 borrowedAt 和 returnedAt
      ]);

      const rows = getLoanRows_(env.loansSheet);

      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe('U123');
      expect(rows[0].borrowedAt).toBeUndefined();
      expect(rows[0].returnedAt).toBeUndefined();
    });
  });

  describe('updateRecordReturnDate_ - 更新特定記錄的歸還日期', () => {
    /**
     * 更新特定記錄的歸還日期
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

    test('應該成功更新記錄的歸還日期', () => {
      // 建立測試資料
      const date1 = new Date(2025, 8, 1, 0, 0, 0, 0);
      const date2 = new Date(2025, 8, 3, 0, 0, 0, 0);

      env.loansSheet.appendRow([
        new Date(),
        'U123',
        '張小明',
        '相機A',
        date1,
        date2
      ]);

      // 更新歸還日期
      const newDate = new Date(2025, 8, 5, 0, 0, 0, 0);
      const result = updateRecordReturnDate_(env.loansSheet, 2, newDate);

      expect(result).toBe(true);

      // 驗證更新結果
      const data = env.loansSheet.getDataRange().getValues();
      expect(data[1][5]).toEqual(newDate);
    });

    test('當找不到 returnedAt 欄位時應該回傳 false', () => {
      // 建立沒有 returnedAt 欄位的工作表
      env.loansSheet.clear();
      env.loansSheet.getRange(1, 1, 1, 3).setValues([['ts', 'userId', 'username']]);

      const newDate = new Date(2025, 8, 5, 0, 0, 0, 0);
      const result = updateRecordReturnDate_(env.loansSheet, 2, newDate);

      expect(result).toBe(false);
    });
  });

  describe('safeCell_ - 安全地取得儲存格值', () => {
    /**
     * 安全地取得儲存格值
     */
    function safeCell_(row, i) {
      if (i === -1) return '';
      return row[i];
    }

    test('應該正確取得存在的儲存格值', () => {
      const row = ['value1', 'value2', 'value3'];
      const result = safeCell_(row, 1);

      expect(result).toBe('value2');
    });

    test('當索引為 -1 時應該回傳空字串', () => {
      const row = ['value1', 'value2', 'value3'];
      const result = safeCell_(row, -1);

      expect(result).toBe('');
    });

    test('應該正確取得第一個儲存格', () => {
      const row = ['value1', 'value2', 'value3'];
      const result = safeCell_(row, 0);

      expect(result).toBe('value1');
    });

    test('應該正確取得最後一個儲存格', () => {
      const row = ['value1', 'value2', 'value3'];
      const result = safeCell_(row, 2);

      expect(result).toBe('value3');
    });
  });
});