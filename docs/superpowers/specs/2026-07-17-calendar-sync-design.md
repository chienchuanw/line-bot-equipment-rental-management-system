# 器材租借 Google 日曆同步 — 設計文件

日期：2026-07-17

## 目標

使用者透過 LINE 成功預約器材時，自動在指定的 Google 日曆建立一個橫跨租借期間的整天事件；使用者刪除或提前歸還紀錄時，日曆同步更新。日曆是給人看的共用視圖，`loans` 工作表仍是唯一的真實來源。

## 非目標

- 不做日曆 → sheet 的反向同步。有人在日曆上手動改動，系統不會知道，也不會回寫。
- 不補建上線前既有紀錄的事件。舊紀錄的 `eventId` 永遠是空的。
- 不處理器材衝突偵測（同一器材同時段被兩人借走）。現行系統本來就不擋，本次不變。
- 不改造測試架構。沿用現行的「複製副本」模式。

## 決策與理由

### 存取模型：日曆分享給 script owner

Apps Script 無法以另一個 Google 帳號的身分執行——`appsscript.json` 是 `executeAs: USER_DEPLOYING`，它永遠以部署者身分執行。因此「指定的 Google 帳號」在實作上的意思是：**把目標日曆的「變更活動」權限分享給執行這個 GAS 專案的帳號**，程式用內建的 `CalendarApp.getCalendarById(CALENDAR_ID)` 寫入。

不需要 OAuth2 library、不需要在 Script Properties 存 refresh token、不需要 service account。事件的建立者會顯示為 script owner 那個帳號。

若日後需求變成「事件的 organizer 必須顯示成另一個帳號」，才需要 OAuth2 flow 或 service account + domain-wide delegation（後者需要 Google Workspace），複雜度高出一個量級。目前不做。

### 事件形式：整天事件，橫跨租借期間

`borrowedAt` / `returnedAt` 只有日期沒有時間（`parseDotDate_` 解析 `YYYY.MM.DD`），與整天事件的粒度一致。租 9/11～9/13 = 一個橫跨三天的整天事件。單日租借 = 一天的整天事件。

不採用定時事件，因為 sheet 根本沒有時間資料，任何時段都是憑空硬編的，且會誤導使用者以為系統知道取件時間。

不採用「每樣器材一個事件」，因為一筆租借會爆出多個事件，`eventId` 變成一對多，刪除同步複雜度大增。

### 事件標題：`{displayName}｜{items}`

`displayName` 為對照表解析後的名稱（見下），`items` 為逗號分隔的器材清單。

### 失敗處理：預約成立，對使用者靜默，例外往上拋讓 GAS 寄信

`loans` 是唯一真實來源，日曆只是鏡像。日曆故障不應該擋下借器材。使用者看到的回覆與現行完全一致，不提日曆的事——那是內部細節。

錯誤進 `console.error` 後**往上拋**，Apps Script 內建機制會自動寄失敗通知信給 script owner。零額外程式碼，且避免「日曆默默漂移兩週沒人發現」。

**「未設定」與「失敗」必須區分**：
- `CALENDAR_ID` 未設定 = 刻意關閉功能，靜默跳過，不拋錯。
- `CALENDAR_ID` 有設定但呼叫失敗 = 拋錯寄信。

否則「ID 打錯」會偽裝成「功能沒開」，永遠不會有人發現。

### 顯示名稱對照表：`users` 工作表

LINE 暱稱是使用者隨時可改的，常是表情符號或綽號，在共用視圖上難以辨識。且 `username` 是借用當下抓的快照（`borrowService.js:20`），使用者改暱稱後舊紀錄不變，同一個人在日曆上可能有多種名字。

對照表存在同一個試算表的 `users` 分頁而非 `config.js`，原因有二：
1. 真實 `userId` 是個人資料，寫進 `config.js` 等於永久留在 git 歷史。
2. 改程式碼要上線需手動在編輯器建立新部署版本；「新增一個常用使用者」不應該付這個成本。放在工作表 = 打一列就好。

不用 Script Properties 存 JSON，因為屬性 UI 沒有驗證，一個逗號打錯整個對照表失效。

### 對照表套用在顯示層，不套用在寫入層

`userId` 一直存在 sheet 裡，所以顯示時解析代表**改對照表能讓所有既有紀錄的顯示一起更新**。若在寫入時就烙進 `username` 欄，之後改對照表只影響新紀錄。

`username` 欄位仍寫入 LINE 暱稱原值——它是借用當下的快照，是有價值的原始資料，不該被對照表覆寫。正名發生在顯示層。

日曆事件是寫入一次就烙住的，這是整天事件的本質，接受。

## 架構

### 新檔案：`src/calendarService.js`

所有 `CalendarApp` 的呼叫**只存在於這個檔案**，沿用現有分層慣例（`sheetService` 獨佔 `SpreadsheetApp`、`lineService` 獨佔 `UrlFetchApp`）。

對外露出四個函式：

| 函式 | 行為 |
| --- | --- |
| `getRentalCalendar_()` | 讀 `getProp_('CALENDAR_ID')`；未設定回 `null`；查不到日曆則拋錯 |
| `createRentalEvent_(record)` | 建立整天事件，回傳 `eventId`；日曆未設定回 `null` |
| `deleteRentalEvent_(eventId)` | 刪除事件；`eventId` 空或事件已不存在則靜默跳過 |
| `updateRentalEventEnd_(eventId, newReturnedAt)` | 縮短事件結束日；同上容錯 |

`record` 形狀：`{ userId, username, items, borrowedAt, returnedAt }`。

### `src/dateUtils.js`

新增 `addDays_(d, n)` — 回傳新的 Date，不修改原物件（與 `startOfDay_` 一致）。

存在的理由：`CalendarApp.createAllDayEvent(title, start, end)` 的 `end` 是**排他的**。租 9/11～9/13 必須傳 end = 9/14，否則日曆上會短一天。把這個 +1 收斂成一個可被單獨測試的純函式，而不是散在各處的裸 `+1`。

### `src/config.js`

`LOANS_HEADERS` 尾端加 `eventId`：

```js
const LOANS_HEADERS = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt', 'eventId'];
```

新增 `SHEET_USERS = 'users'` 與 `USERS_HEADERS = ['userId', 'displayName']`。`USERS_HEADERS` 供 `getUserDisplayNameMap_` 以 `header.indexOf` 定位欄位用，**不參與 `ensureLoansHeaders_` 那套自癒／補欄邏輯**。

`CALENDAR_ID` 走既有的 `getProp_`，不新增常數。

### `src/sheetService.js`

- `getLoanRows_` 的映射加上 `eventId: safeCell_(row, idx['eventId'])`。它用 `header.indexOf` 查欄位，位置無關，多加一欄不影響既有讀取。
- 新增 `updateRecordEventId_(sheet, rowIndex, eventId)`，實作比照現有的 `updateRecordReturnDate_`。
- 新增 `getUserDisplayNameMap_()` — 讀 `users` 分頁回傳 `{ userId: displayName }`。
- `ensureLoansHeaders_` 改為補欄式（見下）。

### `src/userService.js`（新檔案）

`resolveDisplayName_(userId, fallbackUsername, nameMap)` — 三段 fallback：對照表 → `fallbackUsername` → `userId`。

`nameMap` 由呼叫端傳入，**一次請求只讀一次 `users` 表**。`replyBorrowedOnDate_` / `replyBorrowedOnMonth_` 在進入時讀好字典再逐列解析，不要每列都去讀表。

## Migration：拆掉 `sheet.clear()` 地雷

`doPost` 每個 request 都呼叫 `ensureLoansHeaders_()`，而它現在長這樣（`sheetService.js:46-49`）：

```js
if (!same) {
  sheet.clear();
  sheet.getRange(1, 1, 1, LOANS_HEADERS.length).setValues([LOANS_HEADERS]);
}
```

**只要 `LOANS_HEADERS` 加上 `eventId` 並上線，下一個 LINE 訊息進來就會清空正式表上所有租借紀錄。**

改為三分支：

| 現況 | 行為 |
| --- | --- |
| 空表（`getLastColumn() === 0`） | 寫入完整表頭（維持現有自癒行為） |
| 現有表頭是 `LOANS_HEADERS` 的前綴 | **只補缺的表頭儲存格，不動資料** |
| 表頭真的對不上（非前綴） | `console.error` + 拋錯，**不清空** |

第三分支是對現有行為的刻意改動。在有資料的正式表上 `clear()` 永遠是錯的選擇；寧可讓 bot 壞掉並寄信，也不要它安靜地把資料燒掉。

這個設計讓部署順序不再重要，也讓未來再加欄位不需要任何手動步驟。

`users` 分頁**不套用**這套自癒邏輯：不自動建表、表不存在就是空字典。這張表壞掉不該讓 bot 停擺。

## 資料流

### 借器材（`handleBorrowForm_`）

順序是關鍵，因為要「使用者靜默、owner 收信」：

```
1. appendRow([..., ''])          ← eventId 先留空
2. replyMessage_(成功訊息)         ← 與現行完全一致，不提日曆
3. createRentalEvent_(...)
4. updateRecordEventId_(...)      ← 回寫 eventId
   └─ 3 或 4 拋錯 → console.error + 往上拋 → GAS 寄信給 owner
```

**先回覆再碰日曆。** 順序反過來的話，日曆一爆使用者就得不到任何回覆——現行 `handleBorrowForm_` 沒有 try/catch，例外會讓 LINE 那端石沉大海。

`eventId` 的列號取自 `appendRow` 後的 `sheet.getLastRow()`。（並行寫入的競態現有程式碼已存在，本次不處理。）

### 刪除／提前歸還（`handleDeleteRecord_`）

日曆操作必須放在**現有那個 try/catch 之外**（`deleteService.js:51-98`）。否則日曆的例外會被它接住，回覆使用者「處理記錄時發生錯誤」，但其實紀錄已經刪成功了——使用者會重試，造成更多混亂。

- **未來紀錄**：先讀出 `eventId` → `deleteRow` → 回覆 → `deleteRentalEvent_(eventId)`
- **進行中紀錄**：`updateRecordReturnDate_` → 回覆 → `updateRentalEventEnd_(eventId, today)`

提前歸還是**縮短**事件而非刪除，因為器材確實被借出過，那段歷史該留在日曆上。

`eventId` 必須在 `deleteRow` **之前**讀出來，列刪掉後就取不到了。

### 容錯

以下情況一律靜默跳過日曆操作、sheet 照常完成：

- `eventId` 為空（上線前的舊紀錄，或建立時同步失敗過的紀錄）
- `getEventById` 回 `null`（有人手動從日曆刪掉了）

不能因為日曆找不到就讓使用者刪不掉自己的紀錄。

### 查器材（`replyBorrowedOnDate_` / `replyBorrowedOnMonth_`）

進入時讀一次 `getUserDisplayNameMap_()`，`queryService.js:35` 與 `:96` 的 `r.username || r.userId` 改為 `resolveDisplayName_(r.userId, r.username, nameMap)`。

### 刻意不套用對照表的地方

- `我的租借`（`queryService.js:124`）
- `借器材` 的確認回覆（`borrowService.js:37`）

這兩個是使用者看自己的畫面，用他自己設的暱稱稱呼他反而自然。對照表的目的是**讓別人認得出是誰**。

## 測試

沿用複製副本模式：測試檔把受測函式複製一份進測試檔再測那個副本（`tests/unit/dateUtils.test.js` 開頭即註明「從 src/dateUtils.js 複製」）。

**這代表改完 `src/` 後測試全綠沒有意義，除非同步更新測試檔裡的副本。** 任何對 `src/` 的改動，在對應 `tests/unit/` 的副本更新前都視為未完成。

### 需要更新副本的測試檔

`dateUtils.test.js`、`sheetService.test.js`、`borrowService.test.js`、`deleteService.test.js`、`queryService.test.js`

### 新增

- `tests/unit/calendarService.test.js`
- `tests/unit/userService.test.js`
- `tests/mocks/testHelpers.js`：增加 `CalendarApp` 假物件（`getCalendarById` / `createAllDayEvent` / `getEventById`，以及 event 的 `deleteEvent` / `setAllDayDates`），`setupTestEnvironment` 增加 `users` 分頁假資料與 `calendarEvents` 參數。

### 重點測案

| 區域 | 測案 |
| --- | --- |
| `addDays_` | 跨月、跨年、不修改原 Date 物件 |
| 整天事件 | end 為排他（9/11～9/13 傳 end=9/14）、單日租借 |
| migration | 前綴補欄不動資料、空表寫表頭、非前綴拋錯且不清空 |
| 借器材 | 日曆爆掉時 sheet 仍成立且使用者收到成功回覆；`CALENDAR_ID` 未設定時靜默跳過不拋錯 |
| 刪除 | 未來紀錄刪事件、提前歸還縮短事件、`eventId` 空時不爆炸、事件已不存在時不爆炸 |
| 對照表 | 命中、未命中退回 `username`、`username` 也空退回 `userId`、`users` 表不存在時不爆炸 |

`pnpm lint`、`pnpm test:integration`、`pnpm test:coverage` 三個指令在此專案本來就因環境因素失敗，與本次改動無關。

## 部署

`clasp push` 只上傳程式碼，**不會讓改動生效**。建立新的部署版本是編輯器裡的手動步驟。

1. 備份現有 `loans` 工作表
2. 目標日曆分享給 script owner，權限選「變更活動」
3. 建立 `users` 分頁，填入 `userId | displayName` 表頭與常用使用者（`userId` 可從 `loans` 表既有紀錄取得）
4. Script Properties 設定 `CALENDAR_ID`
5. `clasp push`
6. **在 Apps Script 編輯器重新授權** — `CalendarApp` 引入新的 OAuth scope。web app 綁著既有授權部署，scope 一變若未重新授權，`doPost` 會整個失敗
7. 建立新的部署版本
8. 用 `clasp tail-logs` 觀察第一筆實際借用

步驟 6 是這次部署最容易漏掉的一步，且失敗模式是**整個 bot 停擺**，不只是日曆不同步。

## 風險

| 風險 | 緩解 |
| --- | --- |
| `LOANS_HEADERS` 改動清空正式資料 | 補欄式 migration + 部署前備份 |
| 新 OAuth scope 未授權導致 bot 全掛 | 部署清單步驟 6；部署後立即用 `doGet` 驗證 |
| 測試副本與 `src/` 漂移 | 每個 `src/` 改動都同步更新對應副本，視為同一件工作 |
| 日曆與 sheet 長期漂移 | 失敗時拋錯寄信；`eventId` 空的紀錄可日後補建 |
