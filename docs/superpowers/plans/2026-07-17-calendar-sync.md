# 器材租借 Google 日曆同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用者成功預約器材時，在指定的 Google 日曆建立橫跨租借期間的整天事件；刪除與提前歸還時同步更新。

**Architecture:** 新增 `calendarService.js` 獨佔所有 `CalendarApp` 呼叫（沿用 `sheetService` 獨佔 `SpreadsheetApp`、`lineService` 獨佔 `UrlFetchApp` 的分層慣例）。`loans` 加 `eventId` 欄位串起 sheet 與日曆。`users` 分頁提供 `userId → displayName` 對照，套用在顯示層。日曆失敗時預約仍成立，例外往上拋讓 GAS 寄信給 script owner。

**Tech Stack:** Google Apps Script (V8)、Google Sheets、Google Calendar (CalendarApp)、Jest、clasp

Spec：`docs/superpowers/specs/2026-07-17-calendar-sync-design.md`

## Global Constraints

- **`src/` 沒有模組系統。** GAS 把 `src/` 所有檔案串成**同一個全域作用域**。`src/` 內**不可以**出現 `require` / `import` / `export`，加了會讓部署的 bot 壞掉。任何函式可直接呼叫任何其他檔案的函式。
- **函式名稱在整個 `src/` 全域唯一。** 兩個檔案有同名 `formatDate_` 是靜默覆蓋，不是作用域錯誤。
- **結尾底線 = GAS 的 private 慣例**（把函式從編輯器的 Run 下拉選單隱藏）。新函式一律加底線，除了 `doGet` / `doPost`。
- **測試不 import `src/`，而是複製副本。** 測試檔把受測函式貼一份進測試檔再測那個副本。**改了 `src/` 就必須同步更新測試檔裡的副本，否則測試全綠是假的。** 每個任務的「改 `src/`」與「改測試副本」視為同一件事，缺一不可。
- **這個 repo 無法做標準的紅燈→綠燈 TDD。** 因為副本就是實作，寫完測試副本它就會通過，「執行測試確認失敗」這一步在此失去意義。因此本計畫的 Step 2 一律改為用 `grep` / `ls` 確認 `src/` **尚未**有對應實作，再於 Step 3 把副本逐字複製進 `src/`。副本與 `src/` 必須逐字一致——這是此模式唯一的正確性保證。
- **註解、文件、測試描述一律用繁體中文。**
- **commit 訊息結尾不加任何 co-author 或 generated-by 標記。**
- 指令：`pnpm test`（全部）、`pnpm test -- tests/unit/dateUtils.test.js`（單檔）、`pnpm test -- -t "測試名稱"`（單一測試）。
- `pnpm lint`、`pnpm test:integration`、`pnpm test:coverage` 在此專案本來就因環境因素失敗，與本次改動無關，**不要試圖修**。
- 欄位映射易錯：使用者的「租用日期」→ `borrowedAt`，「歸還日期」→ `returnedAt`。

## File Structure

| 檔案 | 責任 | 動作 |
| --- | --- | --- |
| `src/dateUtils.js` | 純日期函式 | 加 `addDays_` |
| `src/config.js` | 常數與 `getProp_` | 加 `eventId` 到 `LOANS_HEADERS`、加 `SHEET_USERS` / `USERS_HEADERS` |
| `src/sheetService.js` | 獨佔 `SpreadsheetApp` | 補欄式 migration、`eventId` 讀寫、`getUserDisplayNameMap_` |
| `src/calendarService.js` | **獨佔 `CalendarApp`** | 新建 |
| `src/userService.js` | 顯示名稱解析（無副作用） | 新建 |
| `src/borrowService.js` | 借用邏輯 | 接上日曆 |
| `src/deleteService.js` | 刪除／提前歸還邏輯 | 接上日曆 |
| `src/queryService.js` | 查詢邏輯 | 套用對照表 |
| `tests/mocks/mockCalendar.js` | `CalendarApp` 假物件 | 新建 |
| `tests/mocks/mockSheets.js` | Sheets 假物件 | 不改 |
| `tests/mocks/fixtures.js` | 測試資料 | `loanRecordsToSheetData` 加 `eventId` |
| `tests/mocks/testHelpers.js` | 環境組裝 | 支援 `users` 分頁與 `CalendarApp` |

**任務順序刻意設計成每個 commit 都可安全部署**：先做補欄式 migration（Task 2），再加 `eventId` 欄位（Task 3）。反過來的話中間會存在一個「schema 已改但 migration 仍會清空正式資料」的 commit。

---

### Task 1: `addDays_` 日期工具

整天事件的 `end` 是**排他的**：租 9/11～9/13 必須傳 end = 9/14。把這個 +1 收斂成可單獨測試的純函式，而不是散在各處的裸 `+1`。

**Files:**
- Modify: `src/dateUtils.js`（檔尾新增）
- Test: `tests/unit/dateUtils.test.js`

**Interfaces:**
- Consumes: 無
- Produces: `addDays_(d: Date, n: number) -> Date`（回傳新物件，不修改輸入）

- [ ] **Step 1: 寫失敗的測試**

在 `tests/unit/dateUtils.test.js` 中，把副本函式加在其他副本函式後面（`toDateOrNull_` 之後）：

```javascript
/**
 * 將日期加上指定天數（從 src/dateUtils.js 複製）
 */
function addDays_(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
```

在檔尾新增 describe 區塊：

```javascript
describe('addDays_ - 將日期加上指定天數', () => {
  test('應該在同月內正確加天數', () => {
    const result = addDays_(createDate(2025, 9, 11), 1);
    expect(isSameDay(result, createDate(2025, 9, 12))).toBe(true);
  });

  test('應該正確跨月', () => {
    const result = addDays_(createDate(2025, 9, 30), 1);
    expect(isSameDay(result, createDate(2025, 10, 1))).toBe(true);
  });

  test('應該正確跨年', () => {
    const result = addDays_(createDate(2025, 12, 31), 1);
    expect(isSameDay(result, createDate(2026, 1, 1))).toBe(true);
  });

  test('應該正確處理閏年的 2 月', () => {
    const result = addDays_(createDate(2024, 2, 28), 1);
    expect(isSameDay(result, createDate(2024, 2, 29))).toBe(true);
  });

  test('應該支援負數天數', () => {
    const result = addDays_(createDate(2025, 9, 1), -1);
    expect(isSameDay(result, createDate(2025, 8, 31))).toBe(true);
  });

  test('不應該修改原本的 Date 物件', () => {
    const original = createDate(2025, 9, 11);
    addDays_(original, 5);
    expect(isSameDay(original, createDate(2025, 9, 11))).toBe(true);
  });

  test('應該保留時間為 00:00:00', () => {
    const result = addDays_(createDate(2025, 9, 11), 1);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm test -- tests/unit/dateUtils.test.js -t "addDays_"`

Expected: FAIL —— 副本已在測試檔中定義，所以這一步會**通過**。這是複製副本模式的固有限制：測試檔裡的副本就是實作。改為執行以下指令確認 `src/` 尚未有此函式：

Run: `grep -n "addDays_" src/dateUtils.js`

Expected: 無輸出（函式尚未存在於 `src/`）

- [ ] **Step 3: 在 `src/dateUtils.js` 檔尾新增實作**

```javascript
/**
 * 將日期加上指定天數
 * 主要用途：整天事件的結束日為排他，需要 +1
 * @param {Date} d - 原始日期
 * @param {number} n - 要加的天數（可為負數）
 * @returns {Date} 新的日期物件（不修改原物件）
 */
function addDays_(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm test -- tests/unit/dateUtils.test.js`

Expected: PASS，全部 dateUtils 測試通過

Run: `grep -n "addDays_" src/dateUtils.js`

Expected: 有輸出，且與測試檔副本內容一致

- [ ] **Step 5: Commit**

```bash
git add src/dateUtils.js tests/unit/dateUtils.test.js
git commit -m "feat: add addDays_ date helper for all-day event end date"
```

---

### Task 2: `ensureLoansHeaders_` 改為補欄式 migration

**這是整個計畫最危險的一步，必須在 Task 3 之前完成並部署。**

現況（`src/sheetService.js:46-49`）：

```javascript
if (!same) {
  sheet.clear();
  sheet.getRange(1, 1, 1, LOANS_HEADERS.length).setValues([LOANS_HEADERS]);
}
```

而 `doPost` 每個 request 都呼叫 `ensureLoansHeaders_()`。只要 `LOANS_HEADERS` 加一欄並上線，下一個 LINE 訊息就會清空正式表所有租借紀錄。

本任務**不改 `LOANS_HEADERS`**，只換掉 migration 邏輯。

**Files:**
- Modify: `src/sheetService.js:27-50`
- Test: `tests/unit/sheetService.test.js`

**Interfaces:**
- Consumes: 全域 `SHEET_LOANS`、`LOANS_HEADERS`
- Produces: `ensureLoansHeaders_() -> void`（表頭非前綴時 throw Error）

三分支行為：

| 現況 | 行為 |
| --- | --- |
| 空表（`getLastColumn() === 0`） | 寫入完整表頭 |
| 現有表頭是 `LOANS_HEADERS` 的前綴（含完全相同） | 只補缺的表頭儲存格，不動資料 |
| 表頭非前綴 | `console.error` + throw，**不清空** |

- [ ] **Step 1: 寫失敗的測試**

在 `tests/unit/sheetService.test.js` 的 `describe('ensureLoansHeaders_ ...')` 區塊中，**整個替換**該區塊內的副本函式為：

```javascript
    /**
     * 確保借用紀錄工作表存在且有正確的標題列（從 src/sheetService.js 複製）
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

      // 情況A：空表 → 寫入完整表頭
      if (headerStr.length === 0) {
        sheet.getRange(1, 1, 1, LOANS_HEADERS.length).setValues([LOANS_HEADERS]);
        return;
      }

      // 情況B：現有表頭是 LOANS_HEADERS 的前綴 → 只補缺的表頭，不動資料
      const isPrefix = headerStr.length <= LOANS_HEADERS.length &&
        headerStr.every((h, i) => h === LOANS_HEADERS[i]);

      if (isPrefix) {
        const missing = LOANS_HEADERS.slice(headerStr.length);
        if (missing.length) {
          sheet.getRange(1, headerStr.length + 1, 1, missing.length).setValues([missing]);
        }
        return;
      }

      // 情況C：表頭真的對不上 → 拋錯，絕不清空
      // 在有資料的正式表上 clear() 永遠是錯的選擇；寧可讓 bot 壞掉寄信，也不要安靜燒掉資料
      console.error('loans 表頭與 LOANS_HEADERS 不符，且非前綴關係', {
        expected: LOANS_HEADERS,
        actual: headerStr
      });
      throw new Error('loans 工作表的表頭結構異常，請人工檢查');
    }
```

在同一個 describe 區塊中**替換掉所有既有測試**為：

```javascript
    test('空表時應該寫入完整表頭', () => {
      const emptySheet = createMockSheet('loans', []);
      env.spreadsheet.getSheetByName = jest.fn(() => emptySheet);

      ensureLoansHeaders_();

      expect(emptySheet._getData()[0]).toEqual(LOANS_HEADERS);
    });

    test('工作表不存在時應該建立並寫入表頭', () => {
      env.spreadsheet.getSheetByName = jest.fn(() => null);

      ensureLoansHeaders_();

      expect(env.spreadsheet.insertSheet).toHaveBeenCalledWith('loans');
    });

    test('表頭完全相同時不應該有任何寫入', () => {
      const sheet = createMockSheet('loans', [[...LOANS_HEADERS], ['t', 'u', 'n', 'i', 'b', 'r']]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);
      sheet.clear.mockClear();

      ensureLoansHeaders_();

      expect(sheet.clear).not.toHaveBeenCalled();
      expect(sheet._getData()[1]).toEqual(['t', 'u', 'n', 'i', 'b', 'r']);
    });

    test('表頭為前綴時應該只補缺的表頭，且不動資料', () => {
      // 模擬「舊表頭 5 欄、LOANS_HEADERS 6 欄」的補欄情境
      const oldHeaders = LOANS_HEADERS.slice(0, 5);
      const sheet = createMockSheet('loans', [
        [...oldHeaders],
        ['ts1', 'u1', 'n1', 'i1', 'b1']
      ]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);

      ensureLoansHeaders_();

      expect(sheet.clear).not.toHaveBeenCalled();
      expect(sheet._getData()[0]).toEqual(LOANS_HEADERS);
      // 關鍵：既有資料列必須原封不動
      expect(sheet._getData()[1].slice(0, 5)).toEqual(['ts1', 'u1', 'n1', 'i1', 'b1']);
    });

    test('表頭非前綴時應該拋錯且絕不清空資料', () => {
      const sheet = createMockSheet('loans', [
        ['完全', '不對', '的表頭'],
        ['重要', '資料', '不能掉']
      ]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => ensureLoansHeaders_()).toThrow('loans 工作表的表頭結構異常');

      expect(sheet.clear).not.toHaveBeenCalled();
      expect(sheet._getData()[1]).toEqual(['重要', '資料', '不能掉']);
    });

    test('表頭比 LOANS_HEADERS 長時應該視為非前綴並拋錯', () => {
      const sheet = createMockSheet('loans', [[...LOANS_HEADERS, '多餘欄位'], ['a', 'b']]);
      env.spreadsheet.getSheetByName = jest.fn(() => sheet);
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => ensureLoansHeaders_()).toThrow('loans 工作表的表頭結構異常');
      expect(sheet.clear).not.toHaveBeenCalled();
    });
```

在檔案頂端的 require 加入 `createMockSheet`：

```javascript
const { setupTestEnvironment } = require('../mocks/testHelpers');
const { createMockSheet } = require('../mocks/mockSheets');
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm test -- tests/unit/sheetService.test.js -t "ensureLoansHeaders_"`

Expected: PASS（副本即實作）。改為驗證 `src/` 尚未改：

Run: `grep -n "sheet.clear()" src/sheetService.js`

Expected: 有輸出（第 47 行附近），代表地雷還在

- [ ] **Step 3: 替換 `src/sheetService.js:27-50` 的實作**

```javascript
/**
 * 確保借用紀錄工作表存在且有正確的標題列
 *
 * 三種情況：
 * 1. 空表 → 寫入完整表頭
 * 2. 現有表頭是 LOANS_HEADERS 的前綴 → 只補缺的表頭，不動資料
 * 3. 表頭非前綴 → 拋錯，絕不清空
 *
 * 情況 2 讓「新增欄位」成為安全操作：doPost 每個 request 都會呼叫本函式，
 * 若沿用舊版的 sheet.clear()，LOANS_HEADERS 一改就會清空正式表所有紀錄。
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

  // 情況A：空表 → 寫入完整表頭
  if (headerStr.length === 0) {
    sheet.getRange(1, 1, 1, LOANS_HEADERS.length).setValues([LOANS_HEADERS]);
    return;
  }

  // 情況B：現有表頭是 LOANS_HEADERS 的前綴 → 只補缺的表頭，不動資料
  const isPrefix = headerStr.length <= LOANS_HEADERS.length &&
    headerStr.every((h, i) => h === LOANS_HEADERS[i]);

  if (isPrefix) {
    const missing = LOANS_HEADERS.slice(headerStr.length);
    if (missing.length) {
      sheet.getRange(1, headerStr.length + 1, 1, missing.length).setValues([missing]);
    }
    return;
  }

  // 情況C：表頭真的對不上 → 拋錯，絕不清空
  // 在有資料的正式表上 clear() 永遠是錯的選擇
  console.error('loans 表頭與 LOANS_HEADERS 不符，且非前綴關係', {
    expected: LOANS_HEADERS,
    actual: headerStr
  });
  throw new Error('loans 工作表的表頭結構異常，請人工檢查');
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm test -- tests/unit/sheetService.test.js`

Expected: PASS

Run: `pnpm test`

Expected: PASS（確認沒有波及 `main.test.js` 等其他檔案）

- [ ] **Step 5: Commit**

```bash
git add src/sheetService.js tests/unit/sheetService.test.js
git commit -m "fix: make ensureLoansHeaders_ additive instead of clearing the sheet

doPost 每個 request 都呼叫 ensureLoansHeaders_，舊版在表頭不符時會
sheet.clear()，代表 LOANS_HEADERS 一旦新增欄位就會清空正式表所有
租借紀錄。改為三分支：空表寫表頭、前綴只補欄、非前綴拋錯不清空。"
```

---

### Task 3: `loans` 新增 `eventId` 欄位

有了 Task 2 的補欄式 migration，這一步才是安全的。

**Files:**
- Modify: `src/config.js:12`
- Modify: `src/sheetService.js`（`getLoanRows_` 映射、新增 `updateRecordEventId_`、檔頭註解）
- Modify: `src/borrowService.js:24-31`（`appendRow` 陣列補一格）
- Modify: `tests/mocks/fixtures.js:103-115`
- Modify: `tests/unit/sheetService.test.js`（`global.LOANS_HEADERS` 與副本）
- Modify: `tests/unit/borrowService.test.js`、`tests/unit/handleBorrowForm.test.js`（副本）

**Interfaces:**
- Consumes: 無
- Produces:
  - `LOANS_HEADERS = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt', 'eventId']`
  - `getLoanRows_(sheet) -> Array<{ts, userId, username, items, borrowedAt, returnedAt, eventId}>`
  - `updateRecordEventId_(sheet: Sheet, rowIndex: number, eventId: string) -> boolean`

- [ ] **Step 1: 寫失敗的測試**

在 `tests/unit/sheetService.test.js` 的 `beforeEach` 更新全域常數：

```javascript
    global.LOANS_HEADERS = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt', 'eventId'];
```

在 `describe('getLoanRows_ ...')` 的副本中，映射加上 `eventId`：

```javascript
        eventId: safeCell_(row, idx['eventId']),
```

並新增測試：

```javascript
    test('應該讀出 eventId 欄位', () => {
      const sheet = createMockSheet('loans', [
        [...LOANS_HEADERS],
        [new Date(2025, 8, 3), 'U111', '張小明', '相機A', new Date(2025, 8, 10), new Date(2025, 8, 12), 'evt-1@google.com']
      ]);

      const rows = getLoanRows_(sheet);

      expect(rows[0].eventId).toBe('evt-1@google.com');
    });

    test('舊資料沒有 eventId 欄位時應該回傳 undefined 而非爆炸', () => {
      // 模擬補欄前的舊資料列（只有 6 欄）
      const sheet = createMockSheet('loans', [
        [...LOANS_HEADERS],
        [new Date(2025, 8, 3), 'U111', '張小明', '相機A', new Date(2025, 8, 10), new Date(2025, 8, 12)]
      ]);

      const rows = getLoanRows_(sheet);

      expect(rows[0].eventId).toBeUndefined();
      expect(rows[0].userId).toBe('U111');
    });
```

新增 `describe` 區塊，副本 + 測試：

```javascript
  describe('updateRecordEventId_ - 回寫 eventId', () => {
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

    test('應該把 eventId 寫入正確的欄位', () => {
      const sheet = createMockSheet('loans', [
        [...LOANS_HEADERS],
        [new Date(2025, 8, 3), 'U111', '張小明', '相機A', new Date(2025, 8, 10), new Date(2025, 8, 12), '']
      ]);

      const result = updateRecordEventId_(sheet, 2, 'evt-new@google.com');

      expect(result).toBe(true);
      expect(sheet._getData()[1][6]).toBe('evt-new@google.com');
    });

    test('找不到 eventId 欄位時應該回傳 false 而非拋錯', () => {
      const sheet = createMockSheet('loans', [['ts', 'userId'], ['a', 'b']]);
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = updateRecordEventId_(sheet, 2, 'evt-1@google.com');

      expect(result).toBe(false);
    });
  });
```

更新 `tests/mocks/fixtures.js:103-115`：

```javascript
function loanRecordsToSheetData(records) {
  const headers = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt', 'eventId'];
  const rows = records.map(record => [
    record.ts,
    record.userId,
    record.username,
    record.items,
    record.borrowedAt,
    record.returnedAt,
    record.eventId || ''
  ]);

  return [headers, ...rows];
}
```

並在 `createMockLoanRecord` 的解構與回傳加入 `eventId`：

```javascript
  const {
    userId = mockUsers.user1.userId,
    username = mockUsers.user1.username,
    items = `${mockEquipment.camera}, ${mockEquipment.tripod}`,
    borrowedAt = new Date(2025, 8, 10), // 2025.09.10
    returnedAt = new Date(2025, 8, 12),  // 2025.09.12
    ts = new Date(2025, 8, 3, 14, 30, 0), // 2025.09.03 14:30:00
    eventId = ''
  } = options;

  return {
    ts,
    userId,
    username,
    items,
    borrowedAt,
    returnedAt,
    eventId
  };
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `grep -n "eventId" src/config.js src/sheetService.js src/borrowService.js`

Expected: 無輸出（`src/` 尚未有 `eventId` 的概念）

Run: `pnpm test -- tests/unit/sheetService.test.js`

Expected: 部分 FAIL —— `fixtures.js` 已改為 7 欄，`sheetService.test.js` 其他 describe 區塊中未更新的副本仍會與新的 fixture 資料不符。逐一更新那些副本直到通過。

- [ ] **Step 3: 修改 `src/`**

`src/config.js:12`：

```javascript
const LOANS_HEADERS = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt', 'eventId'];
```

`src/sheetService.js` 檔頭註解補一行：

```javascript
 * - eventId: 對應的 Google 日曆事件 ID（同步失敗或上線前的舊紀錄為空）
```

`src/sheetService.js` 的 `getLoanRows_` 映射加上：

```javascript
    eventId: safeCell_(row, idx['eventId']),
```

`src/sheetService.js` 新增函式（放在 `updateRecordReturnDate_` 之後）：

```javascript
/**
 * 更新特定記錄的 eventId
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 工作表物件
 * @param {number} rowIndex - 要更新的行號（1-based）
 * @param {string} eventId - Google 日曆事件 ID
 * @returns {boolean} 更新是否成功
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
```

`src/borrowService.js:24-31` 的 `appendRow` 補一格（**位置式寫入，必須與 `LOANS_HEADERS` 同步**）：

```javascript
  // 寫入借用紀錄（欄位順序固定，必須與 LOANS_HEADERS 一致）
  loans.appendRow([
    now,                // ts
    userId,             // userId
    username,           // username
    parsed.items,       // items ← 租用器材
    parsed.borrowedAt,  // borrowedAt ← 租用日期
    parsed.returnedAt,  // returnedAt ← 歸還日期
    ''                  // eventId ← 建立日曆事件後回寫
  ]);
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm test`

Expected: PASS。若 `borrowService.test.js` / `handleBorrowForm.test.js` 因 `appendRow` 的陣列長度斷言而失敗，同步更新那些測試檔中的副本與斷言（預期 7 個元素、第 7 個為 `''`）。

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/sheetService.js src/borrowService.js tests/
git commit -m "feat: add eventId column to loans sheet

為日曆同步預留欄位。getLoanRows_ 以 header.indexOf 定位欄位，多加一欄
不影響既有讀取；appendRow 是位置式寫入，故一併補上第 7 格。
依賴前一個 commit 的補欄式 migration，否則上線會清空正式資料。"
```

---

### Task 4: `CalendarApp` 測試假物件

Task 5 之前必須先有假物件，否則沒東西可測。

**Files:**
- Create: `tests/mocks/mockCalendar.js`
- Modify: `tests/mocks/testHelpers.js`

**Interfaces:**
- Produces:
  - `createMockCalendarEvent(id, title, startDate, endDate) -> MockEvent`
  - `createMockCalendar(id, events?) -> MockCalendar`
  - `createMockCalendarApp(calendars?) -> MockCalendarApp`
  - `setupTestEnvironment({ loanRecords, properties, userProfiles, userRows, calendarId })` 額外回傳 `{ CalendarApp, calendar }`

- [ ] **Step 1: 建立 `tests/mocks/mockCalendar.js`**

```javascript
/**
 * Google Calendar Mock 工具
 *
 * 模擬 CalendarApp，讓我們可以在本地環境測試日曆同步邏輯
 */

/**
 * 建立假的日曆事件物件
 * @param {string} id - 事件 ID
 * @param {string} title - 事件標題
 * @param {Date} startDate - 開始日期
 * @param {Date} endDate - 結束日期（整天事件為排他）
 * @returns {Object} Mock Event 物件
 */
function createMockCalendarEvent(id, title, startDate, endDate) {
  let _start = startDate;
  let _end = endDate;
  let _deleted = false;

  return {
    getId: jest.fn(() => id),
    getTitle: jest.fn(() => title),
    getAllDayStartDate: jest.fn(() => _start),
    getAllDayEndDate: jest.fn(() => _end),

    setAllDayDates: jest.fn((start, end) => {
      _start = start;
      _end = end;
    }),

    deleteEvent: jest.fn(() => {
      _deleted = true;
    }),

    // 測試用：檢查是否已被刪除
    _isDeleted: () => _deleted
  };
}

/**
 * 建立假的日曆物件
 * @param {string} id - 日曆 ID
 * @param {Object} events - 既有事件集合 { eventId: mockEvent }
 * @returns {Object} Mock Calendar 物件
 */
function createMockCalendar(id, events = {}) {
  let seq = 0;

  return {
    getId: jest.fn(() => id),

    createAllDayEvent: jest.fn((title, start, end) => {
      seq += 1;
      const eventId = `evt-${seq}@google.com`;
      const event = createMockCalendarEvent(eventId, title, start, end);
      events[eventId] = event;
      return event;
    }),

    getEventById: jest.fn((eventId) => events[eventId] || null),

    // 測試用：取得內部事件集合
    _getEvents: () => events
  };
}

/**
 * 建立 CalendarApp Mock
 * @param {Object} calendars - 日曆集合 { calendarId: mockCalendar }
 * @returns {Object} Mock CalendarApp
 */
function createMockCalendarApp(calendars = {}) {
  return {
    getCalendarById: jest.fn((id) => calendars[id] || null)
  };
}

module.exports = {
  createMockCalendarEvent,
  createMockCalendar,
  createMockCalendarApp
};
```

- [ ] **Step 2: 擴充 `tests/mocks/testHelpers.js`**

檔頭 require 加入：

```javascript
const { createMockCalendar, createMockCalendarApp } = require('./mockCalendar');
```

`setupGASEnvironment` 改為支援 `users` 分頁與日曆（**現況硬寫死只建 `loans` 一張表**）：

```javascript
function setupGASEnvironment(options = {}) {
  const {
    sheetData = [],
    userSheetData = null,
    properties = {},
    urlResponses = {},
    calendarId = null,
    calendarEvents = {}
  } = options;

  // 建立 Mock Sheet
  const loansSheet = createMockSheet('loans', sheetData);

  // users 分頁為選配：不傳就代表該分頁不存在（getSheetByName 回 null）
  const sheets = { loans: loansSheet };
  let usersSheet = null;
  if (userSheetData) {
    usersSheet = createMockSheet('users', userSheetData);
    sheets.users = usersSheet;
  }

  const spreadsheet = createMockSpreadsheet(sheets);
  const SpreadsheetApp = createMockSpreadsheetApp(spreadsheet);

  // 建立 Mock PropertiesService
  const PropertiesService = createMockPropertiesService(properties);

  // 建立 Mock UrlFetchApp
  const UrlFetchApp = createMockUrlFetchApp(urlResponses);

  // 建立 Mock CalendarApp：calendarId 為 null 代表沒有可用日曆
  const calendar = calendarId ? createMockCalendar(calendarId, calendarEvents) : null;
  const CalendarApp = createMockCalendarApp(calendarId ? { [calendarId]: calendar } : {});

  // 設定為全域變數（模擬 GAS 環境）
  global.SpreadsheetApp = SpreadsheetApp;
  global.PropertiesService = PropertiesService;
  global.UrlFetchApp = UrlFetchApp;
  global.CalendarApp = CalendarApp;

  return {
    SpreadsheetApp,
    PropertiesService,
    UrlFetchApp,
    CalendarApp,
    loansSheet,
    usersSheet,
    calendar,
    spreadsheet
  };
}
```

`cleanupGASEnvironment` 加一行：

```javascript
  global.CalendarApp = undefined;
```

`setupTestEnvironment` 改為：

```javascript
function setupTestEnvironment(options = {}) {
  const {
    loanRecords = [],
    properties = {
      LINE_CHANNEL_TOKEN: 'mock-channel-token'
    },
    userProfiles = {},
    userRows = null,
    calendarId = null,
    calendarEvents = {}
  } = options;

  // 轉換租借記錄為 Sheet 資料格式
  const sheetData = loanRecordsToSheetData(loanRecords);

  // userRows 為 [[userId, displayName], ...]；不傳代表 users 分頁不存在
  const userSheetData = userRows
    ? [['userId', 'displayName'], ...userRows]
    : null;

  // 設定 LINE API 環境
  const lineEnv = setupLineAPIEnvironment({ userProfiles });

  // 設定 GAS 環境
  const gasEnv = setupGASEnvironment({
    sheetData,
    userSheetData,
    properties,
    urlResponses: lineEnv.urlResponses,
    calendarId,
    calendarEvents
  });

  return {
    ...gasEnv,
    ...lineEnv
  };
}
```

`module.exports` 不需改動（既有匯出已涵蓋）。

在 `tests/setup.js` 的全域 mock 區塊加入：

```javascript
global.CalendarApp = undefined;
```

- [ ] **Step 3: 執行測試確認沒有回歸**

Run: `pnpm test`

Expected: PASS —— 這是純增量的 mock 擴充，既有測試不傳新參數時行為與先前完全一致（`users` 分頁不存在、無日曆）。

- [ ] **Step 4: Commit**

```bash
git add tests/mocks/mockCalendar.js tests/mocks/testHelpers.js tests/setup.js
git commit -m "test: add CalendarApp mock and users sheet support to test helpers"
```

---

### Task 5: `calendarService.js`

**Files:**
- Create: `src/calendarService.js`
- Test: `tests/unit/calendarService.test.js`

**Interfaces:**
- Consumes: `getProp_`（config.js）、`addDays_` / `startOfDay_`（dateUtils.js）、全域 `CalendarApp`
- Produces:
  - `getRentalCalendar_() -> Calendar | null`（未設定 `CALENDAR_ID` 回 `null`；設定了但找不到日曆則 throw）
  - `createRentalEvent_({displayName, items, borrowedAt, returnedAt}) -> string | null`（回傳 eventId；無日曆回 `null`）
  - `deleteRentalEvent_(eventId: string) -> boolean`
  - `updateRentalEventEnd_(eventId: string, newReturnedAt: Date) -> boolean`

**與 spec 的細節差異：** spec 寫 `createRentalEvent_(record)` 的 record 含 `userId`/`username`。改為傳入已解析好的 `displayName`，讓 `calendarService` 不需要知道對照表的存在——名稱解析是呼叫端的責任。邊界更乾淨，且 `calendarService` 的測試不需要 `users` 分頁。

- [ ] **Step 1: 寫失敗的測試**

建立 `tests/unit/calendarService.test.js`：

```javascript
/**
 * calendarService 測試
 *
 * 測試 Google 日曆同步的所有功能：
 * 1. getRentalCalendar_ - 取得目標日曆
 * 2. createRentalEvent_ - 建立整天事件
 * 3. deleteRentalEvent_ - 刪除事件
 * 4. updateRentalEventEnd_ - 縮短事件結束日
 *
 * 重要：整天事件的 end 為「排他」，租 9/11~9/13 必須傳 end = 9/14
 */

const { setupTestEnvironment, createDate, isSameDay } = require('../mocks/testHelpers');

let env;

// ==================== 從 src/dateUtils.js 複製 ====================

function startOfDay_(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays_(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// ==================== 從 src/config.js 複製 ====================

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// ==================== 從 src/calendarService.js 複製 ====================

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

function createRentalEvent_(record) {
  const calendar = getRentalCalendar_();
  if (!calendar) return null;

  const title = `${record.displayName}｜${record.items}`;
  const start = startOfDay_(record.borrowedAt);
  const end = addDays_(startOfDay_(record.returnedAt), 1);

  const event = calendar.createAllDayEvent(title, start, end);
  return event.getId();
}

function deleteRentalEvent_(eventId) {
  if (!eventId) return false;

  const calendar = getRentalCalendar_();
  if (!calendar) return false;

  const event = calendar.getEventById(eventId);
  if (!event) return false;

  event.deleteEvent();
  return true;
}

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

// ==================== 測試主體 ====================

describe('calendarService', () => {
  const CAL_ID = 'foufa@group.calendar.google.com';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getRentalCalendar_ - 取得目標日曆', () => {
    test('CALENDAR_ID 未設定時應該回傳 null（功能等同關閉）', () => {
      env = setupTestEnvironment({ properties: {} });

      expect(getRentalCalendar_()).toBeNull();
    });

    test('CALENDAR_ID 有設定且日曆存在時應該回傳日曆', () => {
      env = setupTestEnvironment({
        properties: { CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });

      expect(getRentalCalendar_()).toBe(env.calendar);
    });

    test('CALENDAR_ID 有設定但找不到日曆時應該拋錯（不可偽裝成功能沒開）', () => {
      env = setupTestEnvironment({
        properties: { CALENDAR_ID: '打錯的ID' },
        calendarId: CAL_ID
      });
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => getRentalCalendar_()).toThrow('找不到日曆');
    });
  });

  describe('createRentalEvent_ - 建立整天事件', () => {
    beforeEach(() => {
      env = setupTestEnvironment({
        properties: { CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });
    });

    test('結束日應該為排他（租 9/11~9/13 傳 end=9/14）', () => {
      createRentalEvent_({
        displayName: '張小明',
        items: '相機A, 三腳架',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      });

      const [, start, end] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(isSameDay(start, createDate(2025, 9, 11))).toBe(true);
      expect(isSameDay(end, createDate(2025, 9, 14))).toBe(true);
    });

    test('單日租借應該建立一天的整天事件', () => {
      createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 11)
      });

      const [, start, end] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(isSameDay(start, createDate(2025, 9, 11))).toBe(true);
      expect(isSameDay(end, createDate(2025, 9, 12))).toBe(true);
    });

    test('標題應該為「displayName｜items」', () => {
      createRentalEvent_({
        displayName: '張小明',
        items: '相機A, 三腳架',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      });

      const [title] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(title).toBe('張小明｜相機A, 三腳架');
    });

    test('應該回傳新建事件的 eventId', () => {
      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      });

      expect(eventId).toBe('evt-1@google.com');
    });

    test('CALENDAR_ID 未設定時應該回傳 null 且不拋錯', () => {
      env = setupTestEnvironment({ properties: {} });

      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      });

      expect(eventId).toBeNull();
    });
  });

  describe('deleteRentalEvent_ - 刪除事件', () => {
    test('應該刪除指定的事件', () => {
      env = setupTestEnvironment({
        properties: { CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });
      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      });

      const result = deleteRentalEvent_(eventId);

      expect(result).toBe(true);
      expect(env.calendar._getEvents()[eventId]._isDeleted()).toBe(true);
    });

    test('eventId 為空時應該靜默回傳 false（上線前的舊紀錄）', () => {
      env = setupTestEnvironment({
        properties: { CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });

      expect(deleteRentalEvent_('')).toBe(false);
      expect(env.calendar.getEventById).not.toHaveBeenCalled();
    });

    test('事件已被手動刪除時應該回傳 false 而非拋錯', () => {
      env = setupTestEnvironment({
        properties: { CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });

      expect(deleteRentalEvent_('不存在的事件@google.com')).toBe(false);
    });

    test('CALENDAR_ID 未設定時應該回傳 false 且不拋錯', () => {
      env = setupTestEnvironment({ properties: {} });

      expect(deleteRentalEvent_('evt-1@google.com')).toBe(false);
    });
  });

  describe('updateRentalEventEnd_ - 縮短事件結束日', () => {
    test('提前歸還應該把結束日縮短為指定日期的隔天（排他）', () => {
      env = setupTestEnvironment({
        properties: { CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });
      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 20)
      });

      const result = updateRentalEventEnd_(eventId, createDate(2025, 9, 13));

      expect(result).toBe(true);
      const event = env.calendar._getEvents()[eventId];
      const [start, end] = event.setAllDayDates.mock.calls[0];
      expect(isSameDay(start, createDate(2025, 9, 11))).toBe(true);
      expect(isSameDay(end, createDate(2025, 9, 14))).toBe(true);
    });

    test('事件不存在時應該回傳 false 而非拋錯', () => {
      env = setupTestEnvironment({
        properties: { CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });

      expect(updateRentalEventEnd_('不存在@google.com', createDate(2025, 9, 13))).toBe(false);
    });

    test('eventId 為空時應該靜默回傳 false', () => {
      env = setupTestEnvironment({
        properties: { CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });

      expect(updateRentalEventEnd_('', createDate(2025, 9, 13))).toBe(false);
    });
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm test -- tests/unit/calendarService.test.js`

Expected: PASS（副本即實作）。改為驗證 `src/calendarService.js` 尚未存在：

Run: `ls src/calendarService.js`

Expected: `No such file or directory`

- [ ] **Step 3: 建立 `src/calendarService.js`**

```javascript
/**
 * Google 日曆同步服務
 *
 * 本檔案獨佔所有 CalendarApp 的呼叫，其他檔案不得直接使用 CalendarApp
 * （沿用 sheetService 獨佔 SpreadsheetApp、lineService 獨佔 UrlFetchApp 的分層慣例）
 *
 * 必要的 Script Properties：
 * - CALENDAR_ID (選填) - 目標日曆 ID。未設定即代表關閉日曆同步功能
 *
 * 前置設定：目標日曆必須分享給執行本 GAS 專案的帳號，權限為「變更活動」
 */

/**
 * 取得器材租借用的目標日曆
 *
 * 「未設定」與「失敗」是兩件事：
 * - CALENDAR_ID 未設定 → 回傳 null，代表刻意關閉功能，呼叫端靜默跳過
 * - CALENDAR_ID 有設定但找不到日曆 → 拋錯，否則「ID 打錯」會偽裝成「功能沒開」
 *
 * @returns {GoogleAppsScript.Calendar.Calendar|null} 日曆物件，未設定時回傳 null
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
 * 建立器材租借的整天事件
 * @param {Object} record - { displayName, items, borrowedAt, returnedAt }
 * @returns {string|null} 事件 ID；日曆未設定時回傳 null
 */
function createRentalEvent_(record) {
  const calendar = getRentalCalendar_();
  if (!calendar) return null;

  const title = `${record.displayName}｜${record.items}`;
  const start = startOfDay_(record.borrowedAt);
  // 整天事件的 end 為排他：租 9/11~9/13 必須傳 9/14，否則日曆上會短一天
  const end = addDays_(startOfDay_(record.returnedAt), 1);

  const event = calendar.createAllDayEvent(title, start, end);
  return event.getId();
}

/**
 * 刪除器材租借的日曆事件
 *
 * eventId 為空（上線前的舊紀錄、或建立時同步失敗過）
 * 或事件已被手動從日曆刪除時，一律靜默跳過。
 * 不能因為日曆找不到就讓使用者刪不掉自己的紀錄。
 *
 * @param {string} eventId - 事件 ID
 * @returns {boolean} 是否實際刪除了事件
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
 * 縮短器材租借事件的結束日（提前歸還）
 *
 * 提前歸還是縮短事件而非刪除，因為器材確實被借出過，
 * 那段歷史該留在日曆上。
 *
 * @param {string} eventId - 事件 ID
 * @param {Date} newReturnedAt - 新的歸還日期
 * @returns {boolean} 是否實際更新了事件
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
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm test -- tests/unit/calendarService.test.js`

Expected: PASS

確認 `src/` 的實作與測試副本一致（複製副本模式的關鍵檢查）：

Run: `grep -c "function " src/calendarService.js`

Expected: `4`

- [ ] **Step 5: Commit**

```bash
git add src/calendarService.js tests/unit/calendarService.test.js
git commit -m "feat: add calendarService for Google Calendar sync

獨佔所有 CalendarApp 呼叫。整天事件的 end 為排他，故一律 +1。
CALENDAR_ID 未設定 = 功能關閉（靜默跳過）；有設定但找不到日曆 = 拋錯，
避免 ID 打錯偽裝成功能沒開。eventId 空或事件已不存在時靜默跳過。"
```

---

### Task 6: `users` 分頁與顯示名稱解析

**Files:**
- Modify: `src/config.js`（加 `SHEET_USERS` / `USERS_HEADERS`）
- Modify: `src/sheetService.js`（加 `getUserDisplayNameMap_`）
- Create: `src/userService.js`
- Test: `tests/unit/userService.test.js`
- Modify: `tests/unit/sheetService.test.js`

**Interfaces:**
- Consumes: 全域 `SpreadsheetApp`、`SHEET_USERS`
- Produces:
  - `SHEET_USERS = 'users'`、`USERS_HEADERS = ['userId', 'displayName']`
  - `getUserDisplayNameMap_() -> Object<string, string>`（表不存在回 `{}`）
  - `resolveDisplayName_(userId, fallbackUsername, nameMap) -> string`

`getUserDisplayNameMap_` 放在 `sheetService.js` 是因為它碰 `SpreadsheetApp`，必須遵守分層規則。`resolveDisplayName_` 是純函式，放 `userService.js`。

**`users` 分頁刻意不套用 `ensureLoansHeaders_` 那套自癒邏輯**：不自動建表、表不存在就是空字典。這張表壞掉不該讓 bot 停擺。

- [ ] **Step 1: 寫失敗的測試**

建立 `tests/unit/userService.test.js`：

```javascript
/**
 * userService 測試
 *
 * 測試顯示名稱解析：
 * LINE 暱稱是使用者隨時可改的，且 username 是借用當下的快照。
 * 對照表讓共用視圖（日曆、查器材）顯示認得出來的名字。
 *
 * 三段 fallback：對照表 → fallbackUsername → userId
 */

// ==================== 從 src/userService.js 複製 ====================

function resolveDisplayName_(userId, fallbackUsername, nameMap) {
  const map = nameMap || {};
  const uid = String(userId || '').trim();

  if (uid && map[uid]) return map[uid];
  return fallbackUsername || userId || '';
}

// ==================== 測試主體 ====================

describe('userService', () => {
  describe('resolveDisplayName_ - 解析顯示名稱', () => {
    const nameMap = {
      U1111111111111111: '張小明',
      U2222222222222222: '李小華'
    };

    test('命中對照表時應該回傳指定名稱', () => {
      expect(resolveDisplayName_('U1111111111111111', '阿明🌀', nameMap)).toBe('張小明');
    });

    test('未命中對照表時應該退回 username', () => {
      expect(resolveDisplayName_('U9999999999999999', '路人甲', nameMap)).toBe('路人甲');
    });

    test('未命中且 username 為空時應該退回 userId', () => {
      expect(resolveDisplayName_('U9999999999999999', '', nameMap)).toBe('U9999999999999999');
    });

    test('對照表為 null 時應該退回 username 而非拋錯', () => {
      expect(resolveDisplayName_('U1111111111111111', '阿明🌀', null)).toBe('阿明🌀');
    });

    test('對照表為空物件時應該退回 username', () => {
      expect(resolveDisplayName_('U1111111111111111', '阿明🌀', {})).toBe('阿明🌀');
    });

    test('userId 前後有空白時仍應該命中對照表', () => {
      expect(resolveDisplayName_('  U1111111111111111  ', '阿明🌀', nameMap)).toBe('張小明');
    });

    test('全部都空時應該回傳空字串而非 undefined', () => {
      expect(resolveDisplayName_('', '', {})).toBe('');
    });
  });
});
```

在 `tests/unit/sheetService.test.js` 的 `beforeEach` 加入：

```javascript
    global.SHEET_USERS = 'users';
```

並新增 describe 區塊：

```javascript
  describe('getUserDisplayNameMap_ - 讀取顯示名稱對照表', () => {
    /**
     * 取得 userId → displayName 對照表（從 src/sheetService.js 複製）
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

    test('應該讀出對照表', () => {
      env = setupTestEnvironment({
        userRows: [
          ['U1111111111111111', '張小明'],
          ['U2222222222222222', '李小華']
        ]
      });
      global.SpreadsheetApp = { getActiveSpreadsheet: jest.fn(() => env.spreadsheet) };

      expect(getUserDisplayNameMap_()).toEqual({
        U1111111111111111: '張小明',
        U2222222222222222: '李小華'
      });
    });

    test('users 分頁不存在時應該回傳空物件而非拋錯', () => {
      env = setupTestEnvironment({});
      global.SpreadsheetApp = { getActiveSpreadsheet: jest.fn(() => env.spreadsheet) };

      expect(getUserDisplayNameMap_()).toEqual({});
    });

    test('只有表頭沒有資料時應該回傳空物件', () => {
      env = setupTestEnvironment({ userRows: [] });
      global.SpreadsheetApp = { getActiveSpreadsheet: jest.fn(() => env.spreadsheet) };

      expect(getUserDisplayNameMap_()).toEqual({});
    });

    test('displayName 為空的列應該被跳過', () => {
      env = setupTestEnvironment({
        userRows: [
          ['U1111111111111111', '張小明'],
          ['U2222222222222222', '']
        ]
      });
      global.SpreadsheetApp = { getActiveSpreadsheet: jest.fn(() => env.spreadsheet) };

      expect(getUserDisplayNameMap_()).toEqual({ U1111111111111111: '張小明' });
    });

    test('userId 重複時後者應該覆蓋前者', () => {
      env = setupTestEnvironment({
        userRows: [
          ['U1111111111111111', '舊名字'],
          ['U1111111111111111', '新名字']
        ]
      });
      global.SpreadsheetApp = { getActiveSpreadsheet: jest.fn(() => env.spreadsheet) };

      expect(getUserDisplayNameMap_()).toEqual({ U1111111111111111: '新名字' });
    });
  });
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `ls src/userService.js`

Expected: `No such file or directory`

- [ ] **Step 3: 修改 `src/`**

`src/config.js` 的工作表設定區塊改為：

```javascript
// === 工作表設定 ===
const SHEET_LOANS = 'loans';
const LOANS_HEADERS = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt', 'eventId'];

// users 分頁：userId → displayName 對照表
// 刻意不套用 ensureLoansHeaders_ 的自癒邏輯——表不存在就是空字典，
// 這張表壞掉不該讓 bot 停擺
const SHEET_USERS = 'users';
const USERS_HEADERS = ['userId', 'displayName'];
```

`src/sheetService.js` 新增（放在 `updateRecordEventId_` 之後）：

```javascript
/**
 * 取得 userId → displayName 的對照表
 *
 * users 分頁為選配：不存在就回傳空物件，所有名稱一律 fallback。
 * 呼叫端應該一次請求只呼叫一次，不要每列都呼叫。
 *
 * @returns {Object<string, string>} 對照表；分頁不存在或格式異常時回傳 {}
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
```

建立 `src/userService.js`：

```javascript
/**
 * 使用者顯示名稱服務
 *
 * LINE 暱稱是使用者隨時可改的，常是表情符號或綽號，在共用視圖上難以辨識。
 * 且 username 欄位是借用當下抓的快照，使用者改暱稱後舊紀錄不變。
 *
 * 對照表存在 users 分頁而非 config.js，原因：
 * 1. 真實 userId 是個人資料，寫進程式碼等於永久留在 git 歷史
 * 2. 改程式碼要上線需手動建立新部署版本；新增一個使用者不該付這個成本
 *
 * 解析發生在顯示層而非寫入層，所以改對照表能讓既有紀錄的顯示一起更新。
 * username 欄位仍保留 LINE 暱稱原值——那是有價值的原始快照。
 */

/**
 * 解析使用者的顯示名稱
 * 三段 fallback：對照表 → fallbackUsername → userId
 *
 * @param {string} userId - LINE 使用者 ID
 * @param {string} fallbackUsername - 對照表未命中時使用的名稱（通常是紀錄裡的 username）
 * @param {Object<string, string>} nameMap - getUserDisplayNameMap_() 的結果
 * @returns {string} 顯示名稱
 */
function resolveDisplayName_(userId, fallbackUsername, nameMap) {
  const map = nameMap || {};
  const uid = String(userId || '').trim();

  if (uid && map[uid]) return map[uid];
  return fallbackUsername || userId || '';
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm test -- tests/unit/userService.test.js tests/unit/sheetService.test.js`

Expected: PASS

Run: `pnpm test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/sheetService.js src/userService.js tests/unit/userService.test.js tests/unit/sheetService.test.js
git commit -m "feat: add users sheet and display name resolver

userId → displayName 對照表存在 users 分頁，新增一人只需打一列，
不用改程式碼、不用重新部署，真實 userId 也不會進 git。
解析發生在顯示層，改對照表能讓既有紀錄的顯示一起更新。"
```

---

### Task 7: `borrowService` 接上日曆

**順序是關鍵**：先回覆使用者，再碰日曆。反過來的話日曆一爆使用者就得不到任何回覆（現行 `handleBorrowForm_` 沒有 try/catch）。

日曆同步**刻意不加 try/catch**——例外往上拋，Apps Script 內建機制會自動寄失敗通知信給 script owner。使用者看到的回覆與現行完全一致，不提日曆的事。

**Files:**
- Modify: `src/borrowService.js:12-43`
- Test: `tests/unit/borrowService.test.js`、`tests/unit/handleBorrowForm.test.js`

**Interfaces:**
- Consumes: `createRentalEvent_`、`updateRecordEventId_`、`getUserDisplayNameMap_`、`resolveDisplayName_`
- Produces: `syncNewLoanToCalendar_(loans, rowIndex, record) -> void`

- [ ] **Step 1: 寫失敗的測試**

在 `tests/unit/borrowService.test.js` 中更新 `handleBorrowForm_` 的副本（見 Step 3 的 `src/` 實作，副本必須逐字一致），並新增測試：

```javascript
  describe('日曆同步', () => {
    const CAL_ID = 'foufa@group.calendar.google.com';

    test('借用成功時應該建立日曆事件並回寫 eventId', () => {
      const env = setupTestEnvironment({
        properties: { LINE_CHANNEL_TOKEN: 'mock-token', CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID,
        userProfiles: { U1111111111111111: '阿明🌀' }
      });

      const event = global.testHelpers.createLineEvent(
        '借器材\n租用器材：相機A\n租用日期：2025.09.11\n歸還日期：2025.09.13',
        'U1111111111111111'
      );

      handleBorrowForm_(event, event.message.text, 'U1111111111111111');

      expect(env.calendar.createAllDayEvent).toHaveBeenCalled();
      // eventId 應該回寫到第 2 列（第 1 列是表頭）的第 7 欄
      expect(env.loansSheet._getData()[1][6]).toBe('evt-1@google.com');
    });

    test('事件標題應該套用 users 對照表的名稱而非 LINE 暱稱', () => {
      const env = setupTestEnvironment({
        properties: { LINE_CHANNEL_TOKEN: 'mock-token', CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID,
        userProfiles: { U1111111111111111: '阿明🌀' },
        userRows: [['U1111111111111111', '張小明']]
      });

      const event = global.testHelpers.createLineEvent(
        '借器材\n租用器材：相機A\n租用日期：2025.09.11\n歸還日期：2025.09.13',
        'U1111111111111111'
      );

      handleBorrowForm_(event, event.message.text, 'U1111111111111111');

      const [title] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(title).toBe('張小明｜相機A');
    });

    test('sheet 的 username 欄位仍應該保留 LINE 暱稱原值（快照）', () => {
      const env = setupTestEnvironment({
        properties: { LINE_CHANNEL_TOKEN: 'mock-token', CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID,
        userProfiles: { U1111111111111111: '阿明🌀' },
        userRows: [['U1111111111111111', '張小明']]
      });

      const event = global.testHelpers.createLineEvent(
        '借器材\n租用器材：相機A\n租用日期：2025.09.11\n歸還日期：2025.09.13',
        'U1111111111111111'
      );

      handleBorrowForm_(event, event.message.text, 'U1111111111111111');

      expect(env.loansSheet._getData()[1][2]).toBe('阿明🌀');
    });

    test('CALENDAR_ID 未設定時應該正常完成借用且不建立事件', () => {
      const env = setupTestEnvironment({
        properties: { LINE_CHANNEL_TOKEN: 'mock-token' },
        userProfiles: { U1111111111111111: '阿明🌀' }
      });

      const event = global.testHelpers.createLineEvent(
        '借器材\n租用器材：相機A\n租用日期：2025.09.11\n歸還日期：2025.09.13',
        'U1111111111111111'
      );

      expect(() => handleBorrowForm_(event, event.message.text, 'U1111111111111111')).not.toThrow();
      expect(env.loansSheet._getData()[1][1]).toBe('U1111111111111111');
      expect(env.loansSheet._getData()[1][6]).toBe('');
    });

    test('日曆爆掉時使用者仍應該先收到成功回覆，例外才往上拋', () => {
      const env = setupTestEnvironment({
        properties: { LINE_CHANNEL_TOKEN: 'mock-token', CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID,
        userProfiles: { U1111111111111111: '阿明🌀' }
      });
      env.calendar.createAllDayEvent = jest.fn(() => {
        throw new Error('Calendar service error');
      });

      const event = global.testHelpers.createLineEvent(
        '借器材\n租用器材：相機A\n租用日期：2025.09.11\n歸還日期：2025.09.13',
        'U1111111111111111'
      );

      // 例外往上拋 → Apps Script 會寄失敗通知信給 script owner
      expect(() => handleBorrowForm_(event, event.message.text, 'U1111111111111111')).toThrow('Calendar service error');

      // 但紀錄已成立，且使用者已經收到回覆
      expect(env.loansSheet._getData()[1][1]).toBe('U1111111111111111');
      const replyCall = env.UrlFetchApp.fetch.mock.calls.find(
        ([url]) => url === 'https://api.line.me/v2/bot/message/reply'
      );
      expect(replyCall).toBeDefined();
      expect(replyCall[1].payload).toContain('已建立借用紀錄');
    });
  });
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm test -- tests/unit/borrowService.test.js -t "日曆同步"`

Expected: FAIL —— 副本尚未包含日曆同步邏輯

- [ ] **Step 3: 修改 `src/borrowService.js`**

替換 `handleBorrowForm_`（第 12-43 行）並新增 `syncNewLoanToCalendar_`：

```javascript
/**
 * 處理借器材表單訊息
 *
 * 順序是關鍵：先寫入 → 先回覆使用者 → 最後才碰日曆。
 * 日曆同步刻意不加 try/catch：loans 是唯一真實來源，日曆只是鏡像，
 * 日曆故障不該擋下借器材。例外往上拋讓 Apps Script 寄失敗通知信給
 * script owner，使用者則完全無感。
 *
 * @param {Object} event - LINE 事件物件
 * @param {string} rawText - 原始訊息文字
 * @param {string} userId - 使用者 ID
 */
function handleBorrowForm_(event, rawText, userId) {
  const loans = getLoansSheet_();
  if (!loans) return replyMessage_(event.replyToken, `找不到工作表：${SHEET_LOANS}`);

  const parsed = parseBorrowMessage_(rawText);
  if (!parsed.ok) return replyMessage_(event.replyToken, parsed.msg);

  // 優先以 LINE API 取得顯示名稱，若失敗則退回 userId
  const username = fetchLineDisplayName_(userId) || userId;
  const now = new Date();

  // 寫入借用紀錄（欄位順序固定，必須與 LOANS_HEADERS 一致）
  loans.appendRow([
    now,                // ts
    userId,             // userId
    username,           // username
    parsed.items,       // items ← 租用器材
    parsed.borrowedAt,  // borrowedAt ← 租用日期
    parsed.returnedAt,  // returnedAt ← 歸還日期
    ''                  // eventId ← 建立日曆事件後回寫
  ]);
  const rowIndex = loans.getLastRow();

  // 回覆確認訊息（必須在碰日曆之前，否則日曆一爆使用者就石沉大海）
  replyMessage_(event.replyToken,
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
 * 將新的借用紀錄同步到 Google 日曆並回寫 eventId
 * @param {GoogleAppsScript.Spreadsheet.Sheet} loans - 借用紀錄工作表
 * @param {number} rowIndex - 該紀錄的列號（1-based）
 * @param {Object} record - { userId, username, items, borrowedAt, returnedAt }
 */
function syncNewLoanToCalendar_(loans, rowIndex, record) {
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
```

在 `tests/unit/borrowService.test.js` 中，把上述兩個函式**逐字複製**為副本（連同 `resolveDisplayName_`、`getUserDisplayNameMap_`、`createRentalEvent_`、`updateRecordEventId_`、`getRentalCalendar_` 等依賴的副本一併加入該測試檔）。

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm test -- tests/unit/borrowService.test.js`

Expected: PASS

Run: `pnpm test`

Expected: PASS。`handleBorrowForm.test.js` 若有 `appendRow` 的斷言需同步更新為 7 欄。

- [ ] **Step 5: Commit**

```bash
git add src/borrowService.js tests/unit/borrowService.test.js tests/unit/handleBorrowForm.test.js
git commit -m "feat: create calendar event when a rental is booked

順序刻意設計為「寫入 → 回覆 → 同步日曆」：先回覆使用者，日曆一爆才不會
讓 LINE 那端石沉大海。日曆同步不加 try/catch，例外往上拋讓 Apps Script
寄通知信給 script owner，使用者則完全無感。"
```

---

### Task 8: `deleteService` 接上日曆

日曆操作必須放在**現有那個 try/catch 之外**（`deleteService.js:51-98`）。否則日曆的例外會被它接住，回覆使用者「處理記錄時發生錯誤」，但其實紀錄已經刪成功了——使用者會重試，造成更多混亂。

`eventId` 必須在 `deleteRow` **之前**讀出來，列刪掉後就取不到了。

**Files:**
- Modify: `src/deleteService.js:17-99`
- Test: `tests/unit/deleteService.test.js`

**Interfaces:**
- Consumes: `deleteRentalEvent_`、`updateRentalEventEnd_`
- Produces: 無新的對外函式

- [ ] **Step 1: 寫失敗的測試**

在 `tests/unit/deleteService.test.js` 更新 `handleDeleteRecord_` 副本（見 Step 3），並新增：

```javascript
  describe('日曆同步', () => {
    const CAL_ID = 'foufa@group.calendar.google.com';
    const USER = 'U1111111111111111';

    test('刪除未來紀錄時應該刪掉日曆事件', () => {
      const future = createMockLoanRecord({
        userId: USER,
        borrowedAt: new Date(2099, 0, 10),
        returnedAt: new Date(2099, 0, 12),
        eventId: 'evt-1@google.com'
      });
      const mockEvent = createMockCalendarEvent('evt-1@google.com', '張小明｜相機A', new Date(2099, 0, 10), new Date(2099, 0, 13));
      const env = setupTestEnvironment({
        loanRecords: [future],
        properties: { LINE_CHANNEL_TOKEN: 'mock-token', CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID,
        calendarEvents: { 'evt-1@google.com': mockEvent }
      });

      const event = global.testHelpers.createLineEvent('刪除 1', USER);
      handleDeleteRecord_(event, '1', USER);

      expect(mockEvent.deleteEvent).toHaveBeenCalled();
      expect(env.loansSheet._getData().length).toBe(1); // 只剩表頭
    });

    test('提前歸還時應該縮短事件而非刪除', () => {
      const today = new Date();
      const inProgress = createMockLoanRecord({
        userId: USER,
        borrowedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2),
        returnedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 5),
        eventId: 'evt-2@google.com'
      });
      const mockEvent = createMockCalendarEvent('evt-2@google.com', '張小明｜相機A', inProgress.borrowedAt, inProgress.returnedAt);
      setupTestEnvironment({
        loanRecords: [inProgress],
        properties: { LINE_CHANNEL_TOKEN: 'mock-token', CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID,
        calendarEvents: { 'evt-2@google.com': mockEvent }
      });

      const event = global.testHelpers.createLineEvent('刪除 1', USER);
      handleDeleteRecord_(event, '1', USER);

      expect(mockEvent.deleteEvent).not.toHaveBeenCalled();
      expect(mockEvent.setAllDayDates).toHaveBeenCalled();
    });

    test('eventId 為空的舊紀錄應該正常刪除且不碰日曆', () => {
      const future = createMockLoanRecord({
        userId: USER,
        borrowedAt: new Date(2099, 0, 10),
        returnedAt: new Date(2099, 0, 12),
        eventId: ''
      });
      const env = setupTestEnvironment({
        loanRecords: [future],
        properties: { LINE_CHANNEL_TOKEN: 'mock-token', CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });

      const event = global.testHelpers.createLineEvent('刪除 1', USER);

      expect(() => handleDeleteRecord_(event, '1', USER)).not.toThrow();
      expect(env.loansSheet._getData().length).toBe(1);
      expect(env.calendar.getEventById).not.toHaveBeenCalled();
    });

    test('事件已被手動從日曆刪除時仍應該讓使用者刪掉紀錄', () => {
      const future = createMockLoanRecord({
        userId: USER,
        borrowedAt: new Date(2099, 0, 10),
        returnedAt: new Date(2099, 0, 12),
        eventId: '不存在@google.com'
      });
      const env = setupTestEnvironment({
        loanRecords: [future],
        properties: { LINE_CHANNEL_TOKEN: 'mock-token', CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });

      const event = global.testHelpers.createLineEvent('刪除 1', USER);

      expect(() => handleDeleteRecord_(event, '1', USER)).not.toThrow();
      expect(env.loansSheet._getData().length).toBe(1);
    });

    test('日曆爆掉時使用者仍應該先收到成功回覆', () => {
      const future = createMockLoanRecord({
        userId: USER,
        borrowedAt: new Date(2099, 0, 10),
        returnedAt: new Date(2099, 0, 12),
        eventId: 'evt-3@google.com'
      });
      const env = setupTestEnvironment({
        loanRecords: [future],
        properties: { LINE_CHANNEL_TOKEN: 'mock-token', CALENDAR_ID: CAL_ID },
        calendarId: CAL_ID
      });
      env.calendar.getEventById = jest.fn(() => {
        throw new Error('Calendar service error');
      });

      const event = global.testHelpers.createLineEvent('刪除 1', USER);

      expect(() => handleDeleteRecord_(event, '1', USER)).toThrow('Calendar service error');

      // 關鍵：使用者收到的是成功訊息，不是「處理記錄時發生錯誤」
      const replyCall = env.UrlFetchApp.fetch.mock.calls.find(
        ([url]) => url === 'https://api.line.me/v2/bot/message/reply'
      );
      expect(replyCall[1].payload).toContain('已取消未來租借記錄');
      expect(replyCall[1].payload).not.toContain('發生錯誤');
    });
  });
```

檔頭 require 加入：

```javascript
const { createMockCalendarEvent } = require('../mocks/mockCalendar');
const { createMockLoanRecord } = require('../mocks/fixtures');
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm test -- tests/unit/deleteService.test.js -t "日曆同步"`

Expected: FAIL —— 副本尚未包含日曆同步邏輯

- [ ] **Step 3: 修改 `src/deleteService.js`**

替換 `handleDeleteRecord_`（第 17-99 行）：

```javascript
/**
 * 處理刪除器材記錄請求
 *
 * 日曆同步刻意放在 try/catch 之外，且在回覆使用者之後。
 * 若放進 try/catch，日曆的例外會被接住並回覆「處理記錄時發生錯誤」，
 * 但其實紀錄已經刪成功了——使用者會重試，造成更多混亂。
 *
 * @param {Object} event - LINE 事件物件
 * @param {string} recordIndex - 記錄編號（從1開始）
 * @param {string} userId - 使用者 ID
 */
function handleDeleteRecord_(event, recordIndex, userId) {
  const loans = getLoansSheet_();
  if (!loans) return replyMessage_(event.replyToken, `找不到工作表：${SHEET_LOANS}`);

  const index = parseInt(recordIndex, 10);
  if (isNaN(index) || index < 1) {
    return replyMessage_(event.replyToken, '記錄編號格式錯誤，請輸入正確的數字。');
  }

  const rows = getLoanRows_(loans);
  const today = startOfDay_(new Date());

  // 取得使用者的可操作記錄（進行中和未來的記錄）
  const myActiveRecords = rows
    .map((record, rowIndex) => ({ ...record, sheetRowIndex: rowIndex + 2 })) // +2 因為有標題行
    .filter(r => {
      const isMyRecord = r.userId === userId;
      const returnDate = toDateOrNull_(r.returnedAt);
      const isActiveOrFuture = returnDate && startOfDay_(returnDate) >= today;
      return isMyRecord && isActiveOrFuture;
    });

  // 檢查記錄是否存在
  if (index > myActiveRecords.length) {
    return replyMessage_(event.replyToken, `記錄編號 ${index} 不存在，請先使用「我的租借」查看可操作的記錄。`);
  }

  const recordToProcess = myActiveRecords[index - 1];

  // eventId 必須在 deleteRow 之前讀出來，列刪掉後就取不到了
  const eventId = recordToProcess.eventId;

  // 判斷記錄類型：未來記錄 vs 進行中記錄
  const borrowDate = toDateOrNull_(recordToProcess.borrowedAt);
  const returnDate = toDateOrNull_(recordToProcess.returnedAt);
  const isFutureRecord = borrowDate && startOfDay_(borrowDate) > today;

  // 記錄實際發生了什麼，供 try/catch 之外的日曆同步使用
  let calendarAction = null;

  try {
    // 格式化記錄資訊（用於回覆訊息）
    const itemsArr = String(recordToProcess.items || '').split(/[，,]/).map(s => s.trim()).filter(Boolean);
    const itemsBlock = itemsArr.length ? itemsArr.join(', ') : '（無器材資料）';
    const rentStart = formatDotDate_(borrowDate);
    const rentEnd = formatDotDate_(returnDate);

    if (isFutureRecord) {
      // 情況A：未來記錄 - 直接刪除整筆記錄
      loans.deleteRow(recordToProcess.sheetRowIndex);

      const successMessage = [
        '✅ 已取消未來租借記錄',
        '',
        `📅 ${rentStart} ~ ${rentEnd}`,
        itemsBlock,
        '',
        '記錄已從系統中移除。'
      ].join('\n');

      replyMessage_(event.replyToken, successMessage);
      calendarAction = 'delete';

    } else {
      // 情況B：進行中記錄 - 修改 returnedAt 為今天（提前歸還）
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

        replyMessage_(event.replyToken, successMessage);
        calendarAction = 'shorten';
      } else {
        replyMessage_(event.replyToken, '更新租借記錄時發生錯誤，請稍後再試。');
      }
    }

  } catch (error) {
    // 記錄錯誤並回覆使用者
    console.error('處理記錄時發生錯誤:', error);
    return replyMessage_(event.replyToken, '處理記錄時發生錯誤，請稍後再試。');
  }

  // 日曆同步：刻意放在 try/catch 之外且在回覆之後
  // 失敗時例外往上拋，使用者無感，script owner 收到 Apps Script 的通知信
  if (calendarAction === 'delete') {
    deleteRentalEvent_(eventId);
  } else if (calendarAction === 'shorten') {
    updateRentalEventEnd_(eventId, today);
  }
}
```

**注意：** `catch` 區塊改為 `return replyMessage_(...)`，避免錯誤發生後仍往下執行日曆同步。

同步更新 `tests/unit/deleteService.test.js` 中的副本（逐字一致），並加入 `deleteRentalEvent_` / `updateRentalEventEnd_` / `getRentalCalendar_` / `getProp_` / `addDays_` 的副本。

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm test -- tests/unit/deleteService.test.js`

Expected: PASS

Run: `pnpm test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/deleteService.js tests/unit/deleteService.test.js
git commit -m "feat: sync calendar on record deletion and early return

未來紀錄刪除 → 刪事件；提前歸還 → 縮短事件結束日（器材確實被借出過，
那段歷史該留在日曆上）。日曆操作放在既有 try/catch 之外並在回覆之後，
否則日曆的例外會被接住並誤報「處理記錄時發生錯誤」，但紀錄其實已刪成功。
eventId 在 deleteRow 之前讀出，列刪掉後就取不到了。"
```

---

### Task 9: `queryService` 套用顯示名稱對照表

**一次請求只讀一次 `users` 表**，在函式進入時讀好字典再逐列解析，不要每列都去讀表。

**Files:**
- Modify: `src/queryService.js:34-35`、`src/queryService.js:95-96`
- Test: `tests/unit/queryService.test.js`

**Interfaces:**
- Consumes: `getUserDisplayNameMap_`、`resolveDisplayName_`
- Produces: 無新的對外函式

**刻意不套用的地方**（不要改）：
- `replyMyBorrowRecords_`（`queryService.js:124`）
- `borrowService` 的確認回覆

這兩個是使用者看自己的畫面，用他自己設的暱稱稱呼他反而自然。對照表的目的是讓**別人**認得出是誰。

- [ ] **Step 1: 寫失敗的測試**

在 `tests/unit/queryService.test.js` 更新副本並新增：

```javascript
  describe('顯示名稱對照表', () => {
    test('查器材（日）應該顯示對照表的名稱而非 LINE 暱稱', () => {
      const env = setupTestEnvironment({
        loanRecords: [createMockLoanRecord({
          userId: 'U1111111111111111',
          username: '阿明🌀',
          items: '相機A',
          borrowedAt: new Date(2025, 8, 11),
          returnedAt: new Date(2025, 8, 13)
        })],
        userRows: [['U1111111111111111', '張小明']]
      });

      replyBorrowedOnDate_('test-reply-token', '2025.09.11');

      const replyCall = env.UrlFetchApp.fetch.mock.calls.find(
        ([url]) => url === 'https://api.line.me/v2/bot/message/reply'
      );
      expect(replyCall[1].payload).toContain('張小明');
      expect(replyCall[1].payload).not.toContain('阿明🌀');
    });

    test('未命中對照表時應該顯示 username', () => {
      const env = setupTestEnvironment({
        loanRecords: [createMockLoanRecord({
          userId: 'U9999999999999999',
          username: '路人甲',
          items: '相機A',
          borrowedAt: new Date(2025, 8, 11),
          returnedAt: new Date(2025, 8, 13)
        })],
        userRows: [['U1111111111111111', '張小明']]
      });

      replyBorrowedOnDate_('test-reply-token', '2025.09.11');

      const replyCall = env.UrlFetchApp.fetch.mock.calls.find(
        ([url]) => url === 'https://api.line.me/v2/bot/message/reply'
      );
      expect(replyCall[1].payload).toContain('路人甲');
    });

    test('users 分頁不存在時應該正常顯示 username 而非爆炸', () => {
      const env = setupTestEnvironment({
        loanRecords: [createMockLoanRecord({
          userId: 'U1111111111111111',
          username: '阿明🌀',
          items: '相機A',
          borrowedAt: new Date(2025, 8, 11),
          returnedAt: new Date(2025, 8, 13)
        })]
      });

      expect(() => replyBorrowedOnDate_('test-reply-token', '2025.09.11')).not.toThrow();

      const replyCall = env.UrlFetchApp.fetch.mock.calls.find(
        ([url]) => url === 'https://api.line.me/v2/bot/message/reply'
      );
      expect(replyCall[1].payload).toContain('阿明🌀');
    });

    test('查器材（月）也應該套用對照表', () => {
      const env = setupTestEnvironment({
        loanRecords: [createMockLoanRecord({
          userId: 'U1111111111111111',
          username: '阿明🌀',
          items: '相機A',
          borrowedAt: new Date(2025, 8, 11),
          returnedAt: new Date(2025, 8, 13)
        })],
        userRows: [['U1111111111111111', '張小明']]
      });

      replyBorrowedOnMonth_('test-reply-token', '2025.09');

      const replyCall = env.UrlFetchApp.fetch.mock.calls.find(
        ([url]) => url === 'https://api.line.me/v2/bot/message/reply'
      );
      expect(replyCall[1].payload).toContain('張小明');
    });

    test('一次查詢只應該讀一次 users 分頁（不可每列都讀）', () => {
      const env = setupTestEnvironment({
        loanRecords: [
          createMockLoanRecord({
            userId: 'U1111111111111111',
            username: '阿明🌀',
            borrowedAt: new Date(2025, 8, 11),
            returnedAt: new Date(2025, 8, 13)
          }),
          createMockLoanRecord({
            userId: 'U2222222222222222',
            username: '阿華',
            borrowedAt: new Date(2025, 8, 11),
            returnedAt: new Date(2025, 8, 13)
          })
        ],
        userRows: [['U1111111111111111', '張小明']]
      });

      replyBorrowedOnDate_('test-reply-token', '2025.09.11');

      // getSheetByName('users') 應該只被呼叫一次
      const usersCalls = env.spreadsheet.getSheetByName.mock.calls.filter(([name]) => name === 'users');
      expect(usersCalls.length).toBe(1);
    });
  });
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `pnpm test -- tests/unit/queryService.test.js -t "顯示名稱對照表"`

Expected: FAIL

- [ ] **Step 3: 修改 `src/queryService.js`**

在 `replyBorrowedOnDate_` 中，把 `const rows = getLoanRows_(loans);`（第 18 行）之後改為：

```javascript
  const rows = getLoanRows_(loans);

  // 一次請求只讀一次 users 分頁，不要每列都讀
  const nameMap = getUserDisplayNameMap_();
```

並把第 34-35 行改為：

```javascript
  const msg = list.map(r => {
    const username = resolveDisplayName_(r.userId, r.username, nameMap);
```

在 `replyBorrowedOnMonth_` 中，把 `const rows = getLoanRows_(loans);`（第 64 行）之後改為：

```javascript
  const rows = getLoanRows_(loans);

  // 一次請求只讀一次 users 分頁，不要每列都讀
  const nameMap = getUserDisplayNameMap_();
```

並把第 95-96 行改為：

```javascript
  const msg = list.map(r => {
    const username = resolveDisplayName_(r.userId, r.username, nameMap);
```

**`replyMyBorrowRecords_` 完全不改。**

同步更新 `tests/unit/queryService.test.js` 中的副本。

- [ ] **Step 4: 執行測試確認通過**

Run: `pnpm test -- tests/unit/queryService.test.js`

Expected: PASS

Run: `pnpm test`

Expected: PASS，全部測試通過

- [ ] **Step 5: Commit**

```bash
git add src/queryService.js tests/unit/queryService.test.js
git commit -m "feat: apply display name map to 查器材 replies

查器材 是群組共用視圖，跟日曆是同一個可讀性問題。一次請求只讀一次
users 分頁。我的租借 刻意不套用——那是使用者看自己的畫面。"
```

---

### Task 10: 文件與部署清單

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Create: `docs/deployment-calendar-sync.md`

**Interfaces:** 無

- [ ] **Step 1: 更新 `CLAUDE.md`**

在「Layers」區塊加入：

```markdown
- `calendarService.js` — all Google Calendar access. Nothing else touches `CalendarApp`.
- `userService.js` — display name resolution (`resolveDisplayName_`), pure.
```

在「Data model」區塊，把欄位順序更新為：

```markdown
`ts | userId | username | items | borrowedAt | returnedAt | eventId`
```

並**替換**現有關於 `ensureLoansHeaders_` 的警告段落為：

```markdown
`ensureLoansHeaders_` is now additive: an existing header that is a *prefix* of `LOANS_HEADERS` gets the missing header cells appended, leaving data untouched. A header that genuinely doesn't match (non-prefix) throws rather than clearing — on a populated production sheet, `clear()` is never the right answer. Adding a column to `LOANS_HEADERS` is therefore safe, but `appendRow` in `borrowService.js` is still positional and must change with it.

A second sheet, `users` (`userId | displayName`), maps LINE user IDs to human-readable names. It is deliberately *not* self-healing: if the sheet is missing, `getUserDisplayNameMap_` returns `{}` and every name falls back to the LINE nickname. Names resolve at display time (calendar event titles, `查器材` replies) — never at write time, so the `username` column keeps the original LINE nickname snapshot.
```

在「Configuration」區塊加入：

```markdown
`CALENDAR_ID` (optional) is the target Google Calendar. **Unset means the calendar sync feature is off** — every calendar call silently no-ops. Set-but-wrong throws, so a typo'd ID can't masquerade as "feature not enabled". The calendar must be shared with the script owner's account with "Make changes to events" permission; GAS always runs as the deployer (`executeAs: USER_DEPLOYING`), so there is no way to act as a different Google account without OAuth2 or a service account.

Adding `CalendarApp` introduced a **new OAuth scope**. A web app is deployed against its existing authorization — after any scope change you must re-authorize in the Apps Script editor and create a new deployment version, or `doPost` fails outright.
```

- [ ] **Step 2: 建立 `docs/deployment-calendar-sync.md`**

```markdown
# 日曆同步功能部署清單

`clasp push` 只上傳程式碼，**不會讓改動生效**。建立新的部署版本是編輯器裡的手動步驟。

## 步驟

1. **備份現有 `loans` 工作表**（複製一份分頁即可）
2. **目標日曆分享給 script owner**，權限選「變更活動」
3. **建立 `users` 分頁**，A1 打 `userId`、B1 打 `displayName`，填入常用使用者
   （`userId` 可從 `loans` 表的既有紀錄取得）
4. **Script Properties 設定 `CALENDAR_ID`**（日曆設定頁面的「日曆 ID」）
5. `clasp push`
6. **在 Apps Script 編輯器重新授權** — `CalendarApp` 引入新的 OAuth scope。
   web app 綁著既有授權部署，scope 一變若未重新授權，`doPost` 會整個失敗
7. **建立新的部署版本**
8. 用瀏覽器打開 web app URL（`doGet`）確認回傳 `OK`
9. 用 `clasp tail-logs` 觀察第一筆實際借用

## 最容易漏掉的一步

**步驟 6。** 失敗模式是**整個 bot 停擺**，不只是日曆不同步。

## 驗證

- `loans` 表應該多出 `eventId` 欄位（G 欄），**既有資料列完全不變**
- 借一筆器材 → 日曆上出現整天事件，標題為「名字｜器材」
- 事件的日期範圍應該正確涵蓋租用日到歸還日（含頭尾）
- `刪除 <n>` 未來紀錄 → 日曆事件消失
- `查器材` 的回覆應該顯示 `users` 分頁指定的名稱

## 回滾

日曆同步出問題時，**清空 Script Properties 的 `CALENDAR_ID` 即可關閉功能**，
不需要回滾程式碼。`loans` 的 `eventId` 欄位留著不影響任何既有功能。
```

- [ ] **Step 3: 更新 `README.md`**

在指令表或功能說明中補上日曆同步的一句話說明，並連結到 `docs/deployment-calendar-sync.md`。維持 README 現有的語氣與結構。

- [ ] **Step 4: 確認測試仍通過**

Run: `pnpm test`

Expected: PASS（純文件改動，不應影響測試）

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md docs/deployment-calendar-sync.md
git commit -m "doc: document calendar sync, users sheet, and deployment steps"
```

---

## 完成後

所有任務完成後：

1. `pnpm test` 全綠
2. 逐一比對每個 `src/` 函式與測試檔副本是否一致（複製副本模式的固有風險）
3. 按 `docs/deployment-calendar-sync.md` 部署
4. 開 PR 到 `dev`（依專案規則，不直接 merge）
