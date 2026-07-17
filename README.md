# LINE Bot 器材租借管理系統

一個基於 LINE Bot + Google Apps Script + Google Sheets 的器材租借管理系統，讓團隊透過 LINE 訊息登記、查詢與取消拍攝器材的借用。

## 目錄

- [專案簡介](#專案簡介)
- [功能特色](#功能特色)
- [開始使用](#開始使用)
  - [事前準備](#事前準備)
  - [安裝與部署](#安裝與部署)
- [使用方式](#使用方式)
  - [指令列表](#指令列表)
  - [借器材](#借器材)
  - [查器材](#查器材)
  - [我的租借與刪除](#我的租借與刪除)
- [設定](#設定)
- [Google 日曆同步](#google-日曆同步)
- [資料結構](#資料結構)
  - [`loans` 工作表](#loans-工作表)
  - [`users` 工作表（選用）](#users-工作表選用)
- [專案結構](#專案結構)
- [本地開發](#本地開發)
  - [使用 clasp 同步程式碼](#使用-clasp-同步程式碼)
  - [測試](#測試)
- [疑難排解](#疑難排解)
- [貢獻](#貢獻)
- [授權條款](#授權條款)

## 專案簡介

適合攝影工作室、學校社團，或任何需要管理共用器材的團隊。使用者不需要安裝任何 App，也不需要開啟試算表，只要在 LINE 中傳送文字指令即可完成登記與查詢；所有資料會自動寫入團隊的 Google 試算表，方便後續統計與稽核。

設計上的幾個重點：

- **無伺服器**：整個系統跑在 Google Apps Script 上，不需要自架主機，也沒有額外費用。
- **試算表即資料庫**：資料存放在 Google Sheets，管理者可以直接開啟試算表檢視或修改。
- **純文字介面**：所有操作都是 LINE 文字指令，指令與回覆皆為繁體中文。

## 功能特色

- **器材借用登記**：以四行格式一次登記多項器材與租借期間。
- **單日查詢**：查詢某一天有哪些器材被借走、由誰借走。
- **月份查詢**：查詢整個月份的租借狀況，並依租用日期排序。
- **我的租借**：列出自己進行中與未來的租借記錄，並附上可操作的編號。
- **取消與提前歸還**：未來的記錄可直接取消；進行中的記錄則調整為提前歸還。
- **使用者識別**：自動透過 LINE API 取得借用者的顯示名稱並記錄。
- **Google 日曆同步**（選用）：登記成功時自動在指定日曆建立橫跨租借期間的整天事件；取消時刪除事件，提前歸還時縮短事件。詳見 [Google 日曆同步](#google-日曆同步)。
- **顯示名稱對照**（選用）：LINE 暱稱常是綽號或表情符號，可透過 `users` 工作表指定固定名稱，套用於日曆與查詢結果。

## 開始使用

### 事前準備

- Node.js >= 18.0.0（僅本地開發與測試需要）
- pnpm >= 8.0.0
- [clasp](https://github.com/google/clasp) >= 3（用於推送程式碼到 Apps Script）
- 一個 Google 帳號與一個 LINE Developers 帳號

```bash
npm install -g @google/clasp
pnpm install
```

### 安裝與部署

**1. 建立 LINE Bot**

前往 [LINE Developers Console](https://developers.line.biz/)，建立 Provider 與 Messaging API Channel，並記下 **Channel Access Token**（長期）。

**2. 建立 Google 試算表**

建立一份新的 Google 試算表。系統會在首次請求時自動建立名為 `loans` 的工作表與標題列，不需要手動建表。

（若要啟用顯示名稱對照，需另外手動建立 `users` 工作表——這張表不會自動建立。詳見[資料結構](#users-工作表選用)。）

**3. 建立 Apps Script 專案**

在該試算表中點選「擴充功能」→「Apps Script」，並記下專案設定中的 **Script ID**。

**4. 推送程式碼**

將 `.clasp.json` 中的 `scriptId` 換成你自己的專案 ID，然後推送：

```bash
clasp login
clasp push
```

**5. 設定 Script Properties**

在 Apps Script 編輯器中點選「專案設定」→「指令碼屬性」，新增 `LINE_CHANNEL_TOKEN`（詳見[設定](#設定)）。

**6. 部署為網頁應用程式**

在 Apps Script 編輯器中點選「部署」→「新增部署作業」，類型選擇「網頁應用程式」，設定執行身分為「我」、存取權限為「任何人」，然後複製產生的 **網頁應用程式網址**。

**7. 設定 Webhook**

回到 LINE Developers Console 的 Messaging API 分頁：

- 將「Webhook URL」設為上一步複製的網址
- 啟用「Use webhook」
- 停用「Auto-reply messages」（避免重複回應）

**8. 測試**

用手機加入 Bot 為好友，傳送「查指令」。如果收到指令說明，表示設定完成。

**9. （選用）啟用 Google 日曆同步**

見 [docs/deployment-calendar-sync.md](docs/deployment-calendar-sync.md)。這一步會引入新的 OAuth 權限範圍，需要重新授權並建立新的部署版本。

## 使用方式

### 指令列表

| 指令 | 格式 | 說明 |
| --- | --- | --- |
| 借器材 | 四行格式（見下方） | 登記器材借用 |
| 查器材 | `查器材 YYYY.MM.DD` | 查詢特定日期的借用狀況 |
| 查器材 | `查器材 YYYY.MM` | 查詢整個月份的借用狀況 |
| 我的租借 | `我的租借` | 列出自己可操作的租借記錄 |
| 刪除 | `刪除 <編號>` | 取消或提前歸還指定編號的記錄 |
| 查指令 | `查指令` | 顯示所有可用指令 |

除了「借器材」之外，指令中的空白都會被忽略，因此 `查器材 2025.09.11` 與 `查器材2025.09.11` 效果相同。

### 借器材

必須完整複製以下四行（包含「借器材」該行）：

```text
借器材
租用器材：相機A, 三腳架, 燈具
租用日期：2025.09.10
歸還日期：2025.09.12
```

注意事項：

- 器材名稱以逗號分隔，中英文逗號皆可
- 日期格式必須是 `YYYY.MM.DD`，使用英文句點
- 冒號可用中文「：」或英文「:」
- 歸還日期不可早於租用日期

### 查器材

查詢單日：只要租借期間涵蓋該日期（含頭尾），就會列出。

```text
查器材 2025.09.11
```

回覆範例：

```text
📅 2025.09.10 ~ 2025.09.12
**張小明**
相機A
三腳架
```

查詢月份：只要租借期間與該月份有重疊，就會列出，並依租用日期排序。

```text
查器材 2025.09
```

### 我的租借與刪除

傳送「我的租借」會列出你**進行中與未來**的記錄，每筆前方帶有編號：

```text
📋 張小明的租借記錄

[1] 2025.09.10 ~ 2025.09.12
相機A, 三腳架

輸入「刪除 <編號>」即可刪除
例如：刪除 1
```

接著以該編號刪除。編號對應的是「我的租借」清單中的順序，而非試算表的列號：

```text
刪除 1
```

刪除的行為取決於記錄的狀態：

- **未來的記錄**（租用日期尚未到）：整筆記錄從試算表中移除。
- **進行中的記錄**（今天落在租借期間內）：記錄保留，但歸還日期改為今天，視為提前歸還。
- **已過期的記錄**：不會出現在清單中，因此無法操作。

使用者只能操作自己的記錄。

## 設定

機密資訊存放在 Apps Script 的 **指令碼屬性（Script Properties）**，不在程式碼或檔案中。

| 屬性名稱 | 說明 | 必填 |
| --- | --- | --- |
| `LINE_CHANNEL_TOKEN` | LINE Bot 的 Channel Access Token，用於回覆訊息與取得使用者名稱 | 是 |
| `LINE_CHANNEL_SECRET` | LINE Bot 的 Channel Secret | 否 |
| `CALENDAR_ID` | 器材租借同步的目標 Google 日曆 ID。未設定即代表關閉日曆同步 | 否 |

> 關於 `LINE_CHANNEL_SECRET`：由於 Apps Script 無法取得完整的 HTTP headers，目前 `verifyLineSignature_` 會計算簽名但**不會實際比對**，一律放行。這是此部署方式的已知限制，設定此屬性目前不會提升安全性。

專案根目錄的 `.env.template` 僅供本地參考，Apps Script 不會讀取這些檔案。

若要調整工作表名稱、欄位順序或錯誤訊息，請修改 `src/config.js` 中的 `SHEET_LOANS`、`LOANS_HEADERS`、`UNKNOWN_CMD_MSG`。

> 注意：寫入是依欄位順序進行的，調整 `LOANS_HEADERS` 時必須同步調整 `borrowService.js` 中的 `appendRow`。新增欄位請一律加在**尾端**——`ensureLoansHeaders_` 會自動補上缺少的標題欄且不動既有資料，但在中間插入欄位會被判定為結構異常而拋錯。

## Google 日曆同步

設定 `CALENDAR_ID` 後，器材登記成功時會自動在該日曆建立一個橫跨租借期間的整天事件，標題為「借用人｜器材清單」。取消未來記錄時事件會一併刪除；提前歸還時事件的結束日會縮短為當天（不刪除，因為器材確實被借出過）。

需要注意的三件事：

- **日曆必須分享給執行這個 GAS 專案的帳號**，權限為「變更活動」。Apps Script 永遠以部署者的身分執行，無法以其他 Google 帳號建立事件。
- **`CalendarApp` 會引入新的 OAuth 權限範圍**，必須在 Apps Script 編輯器重新授權並建立新的部署版本，否則整個 Bot 會停止運作。
- **日曆同步失敗不會影響借用**：記錄照常建立、使用者照常收到成功回覆，錯誤則以 Apps Script 的失敗通知信寄給專案擁有者。

完整步驟與驗證方式見 **[docs/deployment-calendar-sync.md](docs/deployment-calendar-sync.md)**。

## 資料結構

### `loans` 工作表

系統會自動建立，欄位如下：

| 欄位 | 說明 | 範例 |
| --- | --- | --- |
| `ts` | 建立時間戳記 | 2025-09-03 14:30:00 |
| `userId` | LINE 使用者 ID | U1234567890abcdef... |
| `username` | LINE 顯示名稱（借用當下的快照） | 張小明 |
| `items` | 租用器材清單 | 相機A, 三腳架, 燈具 |
| `borrowedAt` | 租用日期 | 2025-09-10 |
| `returnedAt` | 歸還日期 | 2025-09-12 |
| `eventId` | 對應的 Google 日曆事件 ID | evt-xxx@google.com |

使用者輸入的「租用日期」對應 `borrowedAt`，「歸還日期」對應 `returnedAt`。

未啟用日曆同步、或啟用之前就存在的舊記錄，`eventId` 為空白，不影響任何功能。

### `users` 工作表（選用）

需自行建立。用來把 LINE 使用者 ID 對應到固定的顯示名稱：

| 欄位 | 說明 | 範例 |
| --- | --- | --- |
| `userId` | LINE 使用者 ID | U1234567890abcdef... |
| `displayName` | 要顯示的名稱 | 王小明 |

LINE 暱稱是使用者隨時可以改的，常是綽號或表情符號；`username` 欄位又是借用當下的快照，所以同一個人在不同記錄裡可能顯示成不同名字。這張表解決的就是這個問題。

- 名稱在**顯示時**才解析，所以修改對照表會連既有記錄的顯示一起更新。
- 套用於**日曆事件標題**與**查器材**的回覆。「我的租借」與借器材的確認訊息刻意不套用——那是使用者看自己的畫面。
- 找不到對應時退回 LINE 暱稱。這張表不存在時整個功能靜默略過，Bot 照常運作。

## 專案結構

```text
foufa-line-bot/
├── src/
│   ├── appsscript.json     # Apps Script 資訊清單（時區、執行階段、webapp 設定）
│   ├── main.js             # Webhook 入口（doGet / doPost）與指令路由
│   ├── config.js           # 常數與 Script Properties 讀取
│   ├── dateUtils.js        # 日期解析、格式化、比較與加減
│   ├── sheetService.js     # Google Sheets 存取
│   ├── lineService.js      # LINE API 通訊
│   ├── calendarService.js  # Google 日曆存取
│   ├── userService.js      # 顯示名稱解析
│   ├── borrowService.js    # 借用邏輯與表單解析
│   ├── queryService.js     # 日期／月份／個人查詢與指令說明
│   ├── deleteService.js    # 刪除與提前歸還邏輯
│   └── testDebug.js        # 早期手動除錯工具，非正式功能
├── tests/
│   ├── unit/               # 單元測試
│   ├── mocks/              # GAS、LINE API 與日曆的 mock 工具
│   └── setup.js            # Jest 環境設定
├── docs/
│   └── deployment-calendar-sync.md   # 日曆同步部署清單
├── .clasp.json             # clasp 設定（scriptId、rootDir）
├── .claspignore            # 排除不推送到 Apps Script 的檔案
└── jest.config.js
```

各層的職責分明，三個外部服務各有唯一的存取入口：`sheetService.js` 是唯一直接操作 `SpreadsheetApp` 的檔案，`lineService.js` 是唯一直接操作 `UrlFetchApp` 的檔案，`calendarService.js` 是唯一直接操作 `CalendarApp` 的檔案。其餘服務只處理商業邏輯。

`main.js` 中的 `handleEvent_` 是**唯一的指令路由**，新增指令時需要在此加上比對分支，並在對應的服務檔案中實作處理函式。

檔案在本地是 `.js`，clasp 推送後在 Apps Script 中會以 `.gs` 呈現。

### 全域作用域

Apps Script 會將 `src/` 下所有檔案合併到**同一個全域作用域**執行，因此：

- 檔案之間不需要（也不能）使用 `require` / `import` / `export`，加上去會讓部署後的程式壞掉。
- **函式名稱在整個 `src/` 中必須唯一**，同名函式會互相覆蓋而不會報錯。
- 函式名稱結尾的底線（如 `handleEvent_`、`parseDotDate_`）是 GAS 慣例，代表私有函式，作用是不讓它出現在編輯器的「執行」下拉選單中。`doGet` / `doPost` 沒有底線，因為 GAS 必須將它們公開為網頁進入點。

## 本地開發

### 使用 clasp 同步程式碼

```bash
clasp push               # 推送 src/ 到 Apps Script
clasp show-file-status   # 檢查本地與遠端差異
clasp pull               # 拉取遠端變更
clasp open-script        # 開啟 Apps Script 編輯器
clasp tail-logs          # 查看執行記錄（需先設定 Project ID）
```

`clasp push` 只會更新程式碼。LINE Webhook 實際呼叫的是**已部署的版本**，因此推送後仍需在 Apps Script 編輯器中建立新的部署作業，變更才會生效。

### 測試

```bash
pnpm test                                  # 執行所有測試
pnpm test:unit                             # 只執行單元測試
pnpm test:watch                            # 監看模式
pnpm test -- tests/unit/dateUtils.test.js  # 執行單一測試檔案
```

> **重要：測試不會載入 `src/`。** 由於 GAS 沒有模組系統，目前的測試是將受測函式**複製**一份到測試檔案中再進行測試，`tests/` 底下沒有任何程式碼讀取 `src/`。這代表修改 `src/` 中的函式後，必須同步更新對應測試檔案中的副本，否則測試仍然會通過，但驗證的是舊的行為。也因為如此，`pnpm test:coverage` 的覆蓋率永遠是 0%。

以下 script 目前無法使用：

- `pnpm lint` — 已安裝 ESLint，但缺少設定檔。
- `pnpm test:integration` — `tests/integration/` 尚未建立。
- `pnpm test:coverage` — 覆蓋率為 0%，必定低於 `jest.config.js` 中設定的 60% 門檻。

## 疑難排解

**Bot 沒有回應**

- 確認 Webhook URL 指向的是最新的部署版本，且已啟用「Use webhook」
- 確認 `LINE_CHANNEL_TOKEN` 已正確設定於指令碼屬性
- 以瀏覽器開啟網頁應用程式網址，應顯示 `OK`
- 執行 `clasp tail-logs` 或在編輯器中查看「執行項目」記錄
- **若剛啟用日曆同步**：`CalendarApp` 引入了新的 OAuth 權限範圍，未重新授權會導致 `doPost` 整個失敗，不只是日曆不同步。在編輯器中手動執行一次 `doGet` 完成授權，再建立新的部署版本

**日曆上沒有出現事件**

- 確認 `CALENDAR_ID` 已設定。未設定即代表功能關閉，不會有任何錯誤
- 確認日曆已分享給執行專案的帳號，權限為「變更活動」
- 檢查專案擁有者的信箱是否收到 Apps Script 的失敗通知信。日曆同步失敗時，借用記錄仍會正常建立、使用者仍會收到成功回覆，錯誤只會以通知信送出
- 若 `CALENDAR_ID` 打錯，程式會拋錯而非靜默略過，因此一定會收到通知信

**日曆事件比實際租借期間少一天**

- 這不應該發生。Google 的整天事件結束日是排他的，程式已在 `addDays_` 統一處理。若真的發生，檢查 `calendarService.js` 的 `createRentalEvent_` 是否遺漏了 `addDays_(..., 1)`

**推送後行為沒有改變**

- `clasp push` 不會更新已部署的版本，需在編輯器中建立新的部署作業
- 執行 `clasp show-file-status` 確認沒有未推送的變更

**推送時出現 "Project contents must include a manifest file named appsscript"**

- 確認 `appsscript.json` 位於 `src/` 目錄中，且 `.clasp.json` 的 `rootDir` 設為 `src`

**日期格式錯誤**

- 使用 `YYYY.MM.DD` 格式（例如 2025.09.03），注意是英文句點而非中文句號

**無法寫入 Google Sheets**

- 確認 Apps Script 專案已取得試算表的存取權限（首次執行時需授權）

**切換 Google 帳號**

```bash
clasp logout
clasp login
```

## 貢獻

歡迎提交 Issue 與 Pull Request。

1. Fork 此專案
2. 建立功能分支（`git checkout -b feature/your-feature`）
3. 修改程式碼，並同步更新 `tests/unit/` 中對應的函式副本（見[測試](#測試)）
4. 執行 `pnpm test` 確認測試通過
5. 推送分支並開啟 Pull Request

## 授權條款

本專案採用 [MIT](LICENSE) 授權條款。
