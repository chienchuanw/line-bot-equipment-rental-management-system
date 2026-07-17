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
const { createMockSheet } = require('../mocks/mockSheets');

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
    global.SHEET_USERS = 'users';
    global.LOANS_HEADERS = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt', 'eventId'];
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

      // 如果工作表不存在，建立新的
      if (!sheet) {
        sheet = ss.insertSheet(SHEET_LOANS);
      }

      const lastCol = sheet.getLastColumn();
      const header = lastCol > 0 ? (sheet.getRange(1, 1, 1, lastCol).getValues()[0] || []) : [];
      const headerStr = header.map(String);

      // 去掉尾端空白儲存格：它們只代表別列在該欄有內容，不代表表頭有那一欄
      while (headerStr.length && headerStr[headerStr.length - 1].trim() === '') {
        headerStr.pop();
      }

      // 情況A：空表 → 寫入完整表頭
      if (headerStr.length === 0) {
        sheet.getRange(1, 1, 1, LOANS_HEADERS.length).setValues([LOANS_HEADERS]);
        return;
      }

      // 情況B：重疊範圍全部相符 → 補上缺少的表頭（若有），不動資料
      // 多出來的尾欄（使用者自己加的備註欄）一律容忍
      const overlap = Math.min(headerStr.length, LOANS_HEADERS.length);
      const overlapMatches = LOANS_HEADERS.slice(0, overlap).every((h, i) => h === headerStr[i]);

      if (overlapMatches) {
        const missing = LOANS_HEADERS.slice(headerStr.length);
        if (missing.length) {
          sheet.getRange(1, headerStr.length + 1, 1, missing.length).setValues([missing]);
        }
        return;
      }

      // 情況C：重疊範圍內就對不上 → 欄位錯位，位置式的 appendRow 會寫到錯的欄
      // 拋錯而非清空：在有資料的正式表上 clear() 永遠是錯的選擇，
      // 寧可讓 bot 壞掉並寄通知信，也不要它安靜地把資料燒掉
      console.error('loans 表頭與 LOANS_HEADERS 不符', {
        expected: LOANS_HEADERS,
        actual: headerStr
      });
      throw new Error('loans 工作表的表頭結構異常，請人工檢查');
    }

    test('當工作表不存在時應該建立新工作表', () => {
      env.spreadsheet.getSheetByName = jest.fn(() => null);
      const emptySheet = createMockSheet('loans', []);
      const mockInsertSheet = jest.fn(() => emptySheet);
      env.spreadsheet.insertSheet = mockInsertSheet;

      ensureLoansHeaders_();

      expect(mockInsertSheet).toHaveBeenCalledWith(SHEET_LOANS);
    });

    test('空表時應該寫入完整表頭', () => {
      const emptySheet = createMockSheet('loans', []);
      env.spreadsheet.getSheetByName = jest.fn(() => emptySheet);

      ensureLoansHeaders_();

      expect(emptySheet._getData()[0]).toEqual(LOANS_HEADERS);
    });

    test('表頭完全相同時不應該有任何寫入', () => {
      const dataRow = LOANS_HEADERS.map((h, i) => `值${i}`);
      const sheet = createMockSheet('loans', [[...LOANS_HEADERS], dataRow]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);

      ensureLoansHeaders_();

      expect(sheet.clear).not.toHaveBeenCalled();
      expect(sheet._getData()[1]).toEqual(dataRow);
    });

    test('表頭為前綴時應該只補缺的表頭，且既有資料原封不動', () => {
      // 模擬「舊表頭少一欄」的補欄情境
      const oldHeaders = LOANS_HEADERS.slice(0, LOANS_HEADERS.length - 1);
      const oldDataRow = oldHeaders.map((h, i) => `舊值${i}`);
      const sheet = createMockSheet('loans', [[...oldHeaders], [...oldDataRow]]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);

      ensureLoansHeaders_();

      expect(sheet.clear).not.toHaveBeenCalled();
      expect(sheet._getData()[0]).toEqual(LOANS_HEADERS);
      // 關鍵：既有資料列必須原封不動
      expect(sheet._getData()[1]).toEqual(oldDataRow);
    });

    test('表頭非前綴時應該拋錯且絕不清空資料', () => {
      const sheet = createMockSheet('loans', [
        ['完全', '不對', '的表頭'],
        ['重要', '資料', '不能掉']
      ]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);
      jest.spyOn(console, 'error').mockImplementation(() => { });

      expect(() => ensureLoansHeaders_()).toThrow('loans 工作表的表頭結構異常');

      expect(sheet.clear).not.toHaveBeenCalled();
      expect(sheet._getData()[1]).toEqual(['重要', '資料', '不能掉']);
    });

    test('使用者自己加在尾端的備註欄應該被容忍而非拋錯', () => {
      // 前 N 欄仍然正確，appendRow 的位置式寫入不受影響，
      // getLoanRows_ 用 indexOf 讀取也不受影響 → 不該擋下整個 bot
      const sheet = createMockSheet('loans', [
        [...LOANS_HEADERS, '備註'],
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', '這批器材有刮傷']
      ]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);

      expect(() => ensureLoansHeaders_()).not.toThrow();
      expect(sheet.clear).not.toHaveBeenCalled();
      expect(sheet._getData()[1][7]).toBe('這批器材有刮傷');
    });

    test('只有某一列在多出來的欄有內容時也應該被容忍', () => {
      // getLastColumn() 是「整張表」的最後一欄，不是第 1 列的。
      // 有人在 H 欄某列打了字，表頭讀出來就會多一個空字串尾巴——
      // 那不是結構損壞，不該讓每個 doPost 都拋錯
      const sheet = createMockSheet('loans', [
        [...LOANS_HEADERS],
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', '隨手寫的備註']
      ]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);

      expect(() => ensureLoansHeaders_()).not.toThrow();
      expect(sheet.clear).not.toHaveBeenCalled();
    });

    test('舊表頭 + 別列有雜訊時仍應該正確補欄', () => {
      // 尾端空白必須先去掉，否則會被誤判成「表頭比 LOANS_HEADERS 長」
      const oldHeaders = LOANS_HEADERS.slice(0, LOANS_HEADERS.length - 1);
      const sheet = createMockSheet('loans', [
        [...oldHeaders],
        ['a', 'b', 'c', 'd', 'e', 'f', '', '雜訊']
      ]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);

      ensureLoansHeaders_();

      expect(sheet.clear).not.toHaveBeenCalled();
      expect(sheet._getData()[0]).toEqual(LOANS_HEADERS);
    });

    test('表頭長度相同但內容不同時應該拋錯而非清空', () => {
      const wrongHeaders = LOANS_HEADERS.map((h, i) => (i === 2 ? 'wrongName' : h));
      const sheet = createMockSheet('loans', [wrongHeaders, ['重要', '資料', '不能掉']]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);
      jest.spyOn(console, 'error').mockImplementation(() => { });

      expect(() => ensureLoansHeaders_()).toThrow('loans 工作表的表頭結構異常');
      expect(sheet.clear).not.toHaveBeenCalled();
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
        eventId: safeCell_(row, idx['eventId']),
      }));
    }

    test('應該讀出 eventId 欄位', () => {
      const sheet = createMockSheet('loans', [
        [...LOANS_HEADERS],
        [new Date(2025, 8, 3), 'U111', '張小明', '相機A', new Date(2025, 8, 10), new Date(2025, 8, 12), 'evt-1@google.com']
      ]);

      const rows = getLoanRows_(sheet);

      expect(rows[0].eventId).toBe('evt-1@google.com');
    });

    test('補欄前的舊資料列沒有 eventId 時應該回傳 undefined 而非爆炸', () => {
      // 模擬「表頭已補欄，但既有資料列仍只有 6 格」的真實 migration 後狀態
      const sheet = createMockSheet('loans', [
        [...LOANS_HEADERS],
        [new Date(2025, 8, 3), 'U111', '張小明', '相機A', new Date(2025, 8, 10), new Date(2025, 8, 12)]
      ]);

      const rows = getLoanRows_(sheet);

      expect(rows[0].eventId).toBeUndefined();
      expect(rows[0].userId).toBe('U111');
    });

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

  describe('updateRecordEventId_ - 回寫 eventId', () => {
    /**
     * 更新特定記錄的 eventId
     */
    function updateRecordEventId_(sheet, rowIndex, eventId) {
      try {
        const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        const eventIdIndex = header.indexOf('eventId');

        if (eventIdIndex === -1) {
          console.error('找不到 eventId 欄位');
          return false;
        }

        // 更新指定行的 eventId 欄位（欄位索引+1因為是1-based）
        sheet.getRange(rowIndex, eventIdIndex + 1).setValue(eventId);
        return true;
      } catch (error) {
        console.error('回寫 eventId 時發生錯誤:', error);
        return false;
      }
    }

    test('應該把 eventId 寫入正確的欄位', () => {
      const sheet = createMockSheet('loans', [
        [...LOANS_HEADERS],
        [new Date(2025, 8, 3), 'U111', '張小明', '相機A', new Date(2025, 8, 10), new Date(2025, 8, 12), '']
      ]);

      const result = updateRecordEventId_(sheet, 2, 'evt-new@google.com');

      expect(result).toBe(true);
      expect(sheet._getData()[1][6]).toBe('evt-new@google.com');
    });

    test('不應該動到同一列的其他欄位', () => {
      const sheet = createMockSheet('loans', [
        [...LOANS_HEADERS],
        [new Date(2025, 8, 3), 'U111', '張小明', '相機A', new Date(2025, 8, 10), new Date(2025, 8, 12), '']
      ]);

      updateRecordEventId_(sheet, 2, 'evt-new@google.com');

      expect(sheet._getData()[1][1]).toBe('U111');
      expect(sheet._getData()[1][3]).toBe('相機A');
    });

    test('找不到 eventId 欄位時應該回傳 false 而非拋錯', () => {
      const sheet = createMockSheet('loans', [['ts', 'userId'], ['a', 'b']]);
      jest.spyOn(console, 'error').mockImplementation(() => { });

      const result = updateRecordEventId_(sheet, 2, 'evt-1@google.com');

      expect(result).toBe(false);
    });

    test('發生例外時應該回傳 false 而非往上拋', () => {
      const sheet = createMockSheet('loans', [[...LOANS_HEADERS], ['a']]);
      sheet.getRange = jest.fn(() => { throw new Error('Sheets API error'); });
      jest.spyOn(console, 'error').mockImplementation(() => { });

      const result = updateRecordEventId_(sheet, 2, 'evt-1@google.com');

      expect(result).toBe(false);
    });
  });

  describe('getUserDisplayNameMap_ - 讀取顯示名稱對照表', () => {
    /**
     * 取得 userId → displayName 的對照表
     */
    function getUserDisplayNameMap_() {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(SHEET_USERS);
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
     * 以指定的 users 分頁資料重建測試環境
     */
    function withUserRows(userRows) {
      env = setupTestEnvironment({ userRows });
      global.SpreadsheetApp = { getActiveSpreadsheet: jest.fn(() => env.spreadsheet) };
    }

    test('應該讀出對照表', () => {
      withUserRows([
        ['U1111111111111111', '張小明'],
        ['U2222222222222222', '李小華']
      ]);

      expect(getUserDisplayNameMap_()).toEqual({
        U1111111111111111: '張小明',
        U2222222222222222: '李小華'
      });
    });

    test('users 分頁不存在時應該回傳空物件而非拋錯', () => {
      // 這張表壞掉或還沒建立，都不該讓 bot 停擺
      env = setupTestEnvironment({});
      global.SpreadsheetApp = { getActiveSpreadsheet: jest.fn(() => env.spreadsheet) };

      expect(getUserDisplayNameMap_()).toEqual({});
    });

    test('只有表頭沒有資料時應該回傳空物件', () => {
      withUserRows([]);

      expect(getUserDisplayNameMap_()).toEqual({});
    });

    test('displayName 為空的列應該被跳過', () => {
      withUserRows([
        ['U1111111111111111', '張小明'],
        ['U2222222222222222', '']
      ]);

      expect(getUserDisplayNameMap_()).toEqual({ U1111111111111111: '張小明' });
    });

    test('userId 為空的列應該被跳過', () => {
      withUserRows([
        ['U1111111111111111', '張小明'],
        ['', '孤兒名字']
      ]);

      expect(getUserDisplayNameMap_()).toEqual({ U1111111111111111: '張小明' });
    });

    test('userId 重複時後者應該覆蓋前者', () => {
      withUserRows([
        ['U1111111111111111', '舊名字'],
        ['U1111111111111111', '新名字']
      ]);

      expect(getUserDisplayNameMap_()).toEqual({ U1111111111111111: '新名字' });
    });

    test('應該自動去除前後空白', () => {
      withUserRows([['  U1111111111111111  ', '  張小明  ']]);

      expect(getUserDisplayNameMap_()).toEqual({ U1111111111111111: '張小明' });
    });

    test('表頭缺少必要欄位時應該回傳空物件而非拋錯', () => {
      env = setupTestEnvironment({});
      const brokenSheet = createMockSheet('users', [['id', 'name'], ['U111', '張小明']]);
      env.spreadsheet.getSheetByName = jest.fn((name) => (name === 'users' ? brokenSheet : null));
      global.SpreadsheetApp = { getActiveSpreadsheet: jest.fn(() => env.spreadsheet) };

      expect(getUserDisplayNameMap_()).toEqual({});
    });

    test('欄位順序對調時仍應該正確讀取（靠欄位名而非位置）', () => {
      env = setupTestEnvironment({});
      const swapped = createMockSheet('users', [
        ['displayName', 'userId'],
        ['張小明', 'U1111111111111111']
      ]);
      env.spreadsheet.getSheetByName = jest.fn((name) => (name === 'users' ? swapped : null));
      global.SpreadsheetApp = { getActiveSpreadsheet: jest.fn(() => env.spreadsheet) };

      expect(getUserDisplayNameMap_()).toEqual({ U1111111111111111: '張小明' });
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