# 專案進度快照

最後更新：2026-07-17

## 目前狀態

Google 日曆同步功能已完成並 merge 進 `dev`（PR #5，rebase-merge，14 commits）。287 個單元測試全綠。**尚未部署上線**——需依 `deployment-calendar-sync.md` 手動建立新部署版本。

## 本次工作範圍（PR #5，closes #4）

器材預約成功時自動在指定 Google 日曆建立橫跨租借期間的整天事件；取消時刪除、提前歸還時縮短。同時新增 `users` 工作表把 LINE 使用者 ID 對應到固定顯示名稱，套用於日曆標題與 `查器材` 回覆。

新增檔案：

- `src/calendarService.js` — 獨佔 `CalendarApp`，四個函式
- `src/userService.js` — `resolveDisplayName_` 純函式
- `tests/mocks/mockCalendar.js` — `CalendarApp` 測試假物件
- `docs/deployment-calendar-sync.md` — 部署清單
- `docs/superpowers/specs/2026-07-17-calendar-sync-design.md` — 設計文件
- `docs/superpowers/plans/2026-07-17-calendar-sync.md` — 實作計畫

資料模型變更：`loans` 新增 `eventId` 欄位（第 7 欄）；新增選配的 `users` 分頁。

## 關鍵決策（詳見 spec 與 PR #5 的 Understanding 章節）

- **日曆分享給 script owner** 而非以指定帳號身分建立事件——GAS 永遠以部署者身分執行，後者需 OAuth2 或 service account。
- **顯示名稱在顯示層解析**，改對照表能讓既有紀錄一起正名；`username` 欄位保留借用當下的 LINE 暱稱快照。
- **日曆失敗不擋借用**：順序為「寫入 → 回覆 → 碰日曆」，日曆呼叫在 try/catch 之外，例外往上拋讓 Apps Script 寄失敗通知信。
- **`CALENDAR_ID` 未設定 = 功能關閉；設定但找不到 = 拋錯**，避免打錯 ID 偽裝成功能沒開。
- **`ensureLoansHeaders_` 改為補欄式**：拆掉舊版 `sheet.clear()` 在加欄位時會清空正式表的地雷。判準是「前 N 欄需剛好相符」，容忍尾端多出來的備註欄。

## 待辦（已開 issue 追蹤）

- **#6** — `eventId` 回寫在並行請求下可能寫到錯誤的列（本 PR 新引入，需 `LockService`）
- **#7** — `doPost` 的 `events.forEach` 在單一事件拋錯時會漏處理同批後續事件（本 PR 新引入的設計缺口）
- **#8** — `toDateOrNull_` 的測試副本與 `src` 對 `0` 的處理相反（既有漂移）

## 下一步

1. 依 `docs/deployment-calendar-sync.md` 部署——**最容易漏的是重新授權**（`CalendarApp` 引入新 OAuth scope，漏掉會讓整個 bot 停擺，不只日曆不同步）。
2. 部署後依部署清單的驗證項目逐一確認。
3. 視情況處理 #6 / #7 / #8。

## 已知的專案體質（非本次新增）

- **測試不 import `src/`，而是複製副本。** 改 `src/` 必須同步更新測試副本，否則測試全綠無意義。`CLAUDE.md` 有詳述，並記錄了 `toDateOrNull_` 的既有漂移作為警示。
- `pnpm lint` / `test:integration` / `test:coverage` 因環境因素本來就失敗，與程式碼無關。
