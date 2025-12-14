# LINE Bot 器材租借管理系統

一個基於 LINE Bot + Google Apps Script + Google Sheets 的器材租借管理系統，讓團隊可以輕鬆管理拍攝器材的借用與歸還。

## 功能特色

- **器材借用登記**：透過 LINE 訊息四行格式快速登記器材借用
- **日期查詢**：查詢特定日期的器材借用狀況
- **Google Sheets 整合**：所有資料自動儲存到 Google 試算表
- **使用者識別**：自動記錄借用者的 LINE 顯示名稱
- **簡單易用**：直覺的指令介面，無需複雜操作

## 快速開始

### 1. 建立 LINE Bot

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 建立新的 Provider 和 Messaging API Channel
3. 記錄以下資訊：
   - **Channel Access Token** (長期)
   - **Channel Secret** (選用，用於驗證)

### 2. 建立 Google Sheets

1. 建立新的 Google 試算表
2. 記錄試算表的 ID（網址中的長字串）

### 3. 設定 Google Apps Script

1. 在 Google Sheets 中，點選「擴充功能」→「Apps Script」
2. 刪除預設的 `Code.gs` 檔案
3. 將本專案的所有 `.gs` 檔案複製到專案中：
   - `main.gs` - 主要入口點
   - `config.gs` - 設定管理
   - `dateUtils.gs` - 日期工具
   - `sheetService.gs` - 試算表操作
   - `lineService.gs` - LINE API 通訊
   - `borrowService.gs` - 借用邏輯
   - `queryService.gs` - 查詢功能
4. 儲存專案（Ctrl+S）

### 4. 設定環境變數

在 Apps Script 編輯器中：

1. 點選左側「專案設定」
2. 在「指令碼屬性」區塊點選「新增指令碼屬性」
3. 新增以下屬性：

| 屬性名稱              | 值                        | 說明                           |
| --------------------- | ------------------------- | ------------------------------ |
| `LINE_CHANNEL_TOKEN`  | 你的 Channel Access Token | **必填** - LINE Bot 的存取權杖 |
| `LINE_CHANNEL_SECRET` | 你的 Channel Secret       | 選填 - 用於訊息驗證            |

### 5. 部署 Web 應用程式

1. 在 Apps Script 編輯器中，點選右上角「部署」→「新增部署作業」
2. 選擇類型：「網頁應用程式」
3. 設定：
   - **說明**：LINE Bot Webhook
   - **執行身分**：我
   - **存取權限**：任何人
4. 點選「部署」
5. **複製 Web 應用程式網址**（這就是 Webhook URL）

### 6. 設定 LINE Bot Webhook

1. 回到 [LINE Developers Console](https://developers.line.biz/)
2. 選擇你的 Messaging API Channel
3. 在「Messaging API」分頁中：
   - 將「Webhook URL」設定為剛才複製的網址
   - 啟用「Use webhook」
   - 停用「Auto-reply messages」（避免重複回應）

### 7. 測試設定

1. 用手機 LINE 掃描 Bot 的 QR Code 加為好友
2. 傳送「查指令」測試是否正常運作
3. 如果收到指令說明，表示設定成功！

## 使用方式

### 指令列表

| 指令       | 格式                | 說明                   |
| ---------- | ------------------- | ---------------------- |
| **借器材** | 四行格式（見下方）  | 登記器材借用           |
| **查器材** | `查器材 YYYY.MM.DD` | 查詢特定日期的借用狀況 |
| **查指令** | `查指令`            | 顯示所有可用指令       |

### 借器材格式

```text
借器材
租用器材：相機A, 三腳架, 燈具
租用日期：2025.09.10
歸還日期：2025.09.12
```

**注意事項：**

- 必須完整複製四行（包含「借器材」）
- 器材名稱用逗號分隔
- 日期格式必須是 `YYYY.MM.DD`
- 歸還日期不可早於租用日期

### 查詢範例

```text
查器材 2025.09.11
```

系統會回傳該日期所有被借用的器材和借用者：

```text
**張小明**
相機A
三腳架

**李小華**
燈具
收音設備
```

## 資料結構

系統會在 Google Sheets 中自動建立 `loans` 工作表，包含以下欄位：

| 欄位         | 說明           | 範例                 |
| ------------ | -------------- | -------------------- |
| `ts`         | 建立時間戳記   | 2025-09-03 14:30:00  |
| `userId`     | LINE 使用者 ID | U1234567890abcdef... |
| `username`   | LINE 顯示名稱  | 張小明               |
| `items`      | 租用器材清單   | 相機 A, 三腳架, 燈具 |
| `borrowedAt` | 租用日期       | 2025-09-10           |
| `returnedAt` | 歸還日期       | 2025-09-12           |

## 檔案結構

重構後的專案採用模組化設計，每個檔案負責特定功能：

| 檔案               | 功能說明                | 主要內容                                |
| ------------------ | ----------------------- | --------------------------------------- |
| `main.gs`          | 主要路由與 Webhook 處理 | doGet, doPost, handleEvent\_            |
| `config.gs`        | 設定與常數管理          | 工作表設定、訊息常數、Script Properties |
| `dateUtils.gs`     | 日期處理工具            | 日期解析、格式化、比較函式              |
| `sheetService.gs`  | Google Sheets 操作      | 工作表建立、資料讀寫、標題管理          |
| `lineService.gs`   | LINE API 通訊           | 訊息回覆、歡迎訊息、使用者資訊          |
| `borrowService.gs` | 借用邏輯處理            | 表單解析、借用紀錄建立                  |
| `queryService.gs`  | 查詢功能                | 日期查詢、指令說明                      |

## 自訂設定

### 修改工作表名稱

在 `config.gs` 中：

```javascript
const SHEET_LOANS = "loans"; // 改為你想要的工作表名稱
```

### 修改欄位順序

在 `config.gs` 中：

```javascript
const LOANS_HEADERS = [
  "ts",
  "userId",
  "username",
  "items",
  "borrowedAt",
  "returnedAt",
];
```

### 自訂錯誤訊息

在 `config.gs` 中：

```javascript
const UNKNOWN_CMD_MSG = "目前沒有此指令，請使用「查指令」查看指令範例";
```

## 疑難排解

### 常見問題

**Q: Bot 沒有回應？**

- 檢查 Webhook URL 是否正確設定
- 確認 `LINE_CHANNEL_TOKEN` 是否正確
- 查看 Apps Script 的執行記錄是否有錯誤

**Q: 無法寫入 Google Sheets？**

- 確認 Apps Script 有 Google Sheets 的存取權限
- 檢查工作表名稱是否正確

**Q: 日期格式錯誤？**

- 確保使用 `YYYY.MM.DD` 格式（例如：2025.09.03）
- 注意是英文句點，不是中文句號

### 除錯方式

1. 在 Apps Script 編輯器中查看「執行」記錄
2. 使用 `console.log()` 在程式碼中加入除錯訊息
3. 測試 Web 應用程式網址是否可正常存取（應顯示 "OK"）

## 開發工作流程

### 使用 clasp 進行本地開發

本專案使用 [clasp](https://github.com/google/clasp) 工具來管理 Google Apps Script 專案，讓你可以在本地編輯程式碼並同步到遠端。

#### 安裝 clasp

首先，全局安裝 clasp 工具：

```bash
npm install -g @google/clasp
```

驗證安裝成功：

```bash
clasp --version
```

#### 初始化專案

如果還未設定 clasp，執行以下步驟：

1. **登入 Google 帳號**：

```bash
clasp login
```

這會開啟瀏覽器進行 Google 帳號驗證。

2. **複製遠端專案**（如果是新專案）：

```bash
clasp clone <scriptId>
```

將 `<scriptId>` 替換為你的 Google Apps Script 專案 ID（可在 Apps Script 編輯器的「專案設定」中找到）。

3. **或初始化本地專案**（如果已有本地程式碼）：

確保專案根目錄有 `.clasp.json` 檔案，內容如下：

```json
{
  "scriptId": "你的scriptId",
  "rootDir": "src",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"]
}
```

#### 推送程式碼到 Apps Script

開發完成後，使用以下指令將本地程式碼推送到遠端 Apps Script 專案：

```bash
clasp push
```

**注意**：

- 首次推送時，clasp 會詢問是否覆蓋遠端檔案，選擇「是」
- 推送後，遠端的 Apps Script 編輯器會自動重新整理
- 確保 `.claspignore` 中列出的檔案不會被推送

#### 查看推送狀態

檢查本地和遠端的檔案差異：

```bash
clasp show-file-status
```

#### 拉取遠端程式碼

如果在 Apps Script 編輯器中直接修改了程式碼，可以拉取最新版本：

```bash
clasp pull
```

#### 開啟 Apps Script 編輯器

直接在瀏覽器中開啟遠端編輯器：

```bash
clasp open-script
```

其他相關指令：

- `clasp open-web-app` - 開啟 Web 應用程式
- `clasp open-container` - 開啟容器綁定的檔案

#### 查看執行記錄

查看 Apps Script 的執行日誌（需要設定 Project ID）：

```bash
clasp tail-logs
```

常用選項：

- `--json` - 以 JSON 格式輸出
- `--watch` - 持續監視日誌
- `--simplified` - 簡化輸出格式
- `--open` - 在瀏覽器中開啟日誌頁面
- `--setup` - 設定 Project ID

### .claspignore 設定

專案根目錄的 `.claspignore` 檔案用於排除不需要同步到 Apps Script 的檔案，類似於 `.gitignore`。

**排除的檔案類型**：

- `node_modules/` - npm 依賴套件（Apps Script 不需要）
- `tests/` - 測試檔案（不應部署到生產環境）
- `coverage/` - 測試覆蓋率報告
- `.clasp.json` - clasp 設定檔（本地用）
- `package.json` - npm 設定檔（本地用）
- `.git/` - 版本控制檔案
- `.vscode/` - IDE 設定
- `README.md` - 文件檔案

### 部署工作流程

#### 開發流程

1. **編輯本地程式碼**：

   ```bash
   # 編輯 src/ 目錄下的檔案
   vim src/main.gs
   ```

2. **推送到 Apps Script**：

   ```bash
   clasp push
   ```

3. **在 Apps Script 編輯器中測試**：

   ```bash
   clasp open-script
   ```

4. **查看執行記錄**：

   ```bash
   clasp tail-logs
   ```

#### 部署到生產環境

1. **確認所有程式碼已推送**：

   ```bash
   clasp show-file-status
   ```

2. **在 Apps Script 編輯器中建立新版本**：

   - 開啟 Apps Script 編輯器：`clasp open-script`
   - 點選「部署」→「新增部署作業」
   - 選擇「網頁應用程式」類型
   - 設定執行身分和存取權限
   - 點選「部署」

3. **複製 Webhook URL**：
   - 部署完成後，複製 Web 應用程式網址
   - 在 LINE Developers Console 中更新 Webhook URL

#### 常見工作流程命令

```bash
# 登入
clasp login

# 查看推送狀態
clasp show-file-status

# 推送程式碼
clasp push

# 拉取遠端程式碼
clasp pull

# 開啟編輯器
clasp open-script

# 查看日誌
clasp tail-logs

# 列出所有部署
clasp list-deployments

# 建立新版本
clasp create-version "版本說明"
```

### 疑難排解

**Q: 推送時出現 "Project contents must include a manifest file named appsscript"？**

- 確保 `appsscript.json` 在 `src/` 目錄中
- 檢查 `.clasp.json` 中的 `rootDir` 設定是否正確

**Q: 推送後程式碼沒有更新？**

- 執行 `clasp show-file-status` 檢查是否有未推送的變更
- 確認 `.claspignore` 沒有排除你要推送的檔案
- 嘗試執行 `clasp push --force` 強制推送

**Q: 無法登入 Google 帳號？**

- 清除登入快取：`clasp logout`
- 重新登入：`clasp login`
- 確保使用的是擁有 Apps Script 專案的 Google 帳號

**Q: 如何切換不同的 Google 帳號？**

```bash
clasp logout
clasp login
```

## 授權條款

本專案採用 MIT 授權條款，歡迎自由使用和修改。

## 貢獻

歡迎提交 Issue 和 Pull Request 來改善這個專案！

---

提示：這個系統特別適合攝影工作室、學校社團、或任何需要管理共用器材的團隊使用。
