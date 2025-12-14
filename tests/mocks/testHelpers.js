/**
 * 測試輔助工具
 * 
 * 提供常用的測試輔助函式，簡化測試撰寫
 */

const {
  createMockSheet,
  createMockSpreadsheet,
  createMockSpreadsheetApp,
  createMockPropertiesService,
  createMockUrlFetchApp
} = require('./mockSheets');

const {
  createMockLineMessageEvent,
  createMockLineProfileResponse,
  createMockLineReplyResponse
} = require('./mockLineAPI');

const { loanRecordsToSheetData } = require('./fixtures');

/**
 * 設定完整的 Google Apps Script 測試環境
 * @param {Object} options - 選項
 * @returns {Object} Mock 物件集合
 */
function setupGASEnvironment(options = {}) {
  const {
    sheetData = [],
    properties = {},
    urlResponses = {}
  } = options;

  // 建立 Mock Sheet
  const loansSheet = createMockSheet('loans', sheetData);
  const spreadsheet = createMockSpreadsheet({ loans: loansSheet });
  const SpreadsheetApp = createMockSpreadsheetApp(spreadsheet);
  
  // 建立 Mock PropertiesService
  const PropertiesService = createMockPropertiesService(properties);
  
  // 建立 Mock UrlFetchApp
  const UrlFetchApp = createMockUrlFetchApp(urlResponses);

  // 設定為全域變數（模擬 GAS 環境）
  global.SpreadsheetApp = SpreadsheetApp;
  global.PropertiesService = PropertiesService;
  global.UrlFetchApp = UrlFetchApp;

  return {
    SpreadsheetApp,
    PropertiesService,
    UrlFetchApp,
    loansSheet,
    spreadsheet
  };
}

/**
 * 清除 Google Apps Script 測試環境
 */
function cleanupGASEnvironment() {
  global.SpreadsheetApp = undefined;
  global.PropertiesService = undefined;
  global.UrlFetchApp = undefined;
}

/**
 * 設定 LINE API 測試環境
 * @param {Object} options - 選項
 * @returns {Object} Mock 物件集合
 */
function setupLineAPIEnvironment(options = {}) {
  const {
    channelToken = 'mock-channel-token',
    userProfiles = {}
  } = options;

  // 建立 URL 回應映射
  const urlResponses = {};
  
  // 設定 Profile API 回應
  Object.entries(userProfiles).forEach(([userId, displayName]) => {
    const url = `https://api.line.me/v2/bot/profile/${userId}`;
    urlResponses[url] = createMockLineProfileResponse(userId, displayName);
  });
  
  // 設定 Reply API 回應
  urlResponses['https://api.line.me/v2/bot/message/reply'] = createMockLineReplyResponse();

  return {
    channelToken,
    urlResponses
  };
}

/**
 * 建立測試用的完整環境（GAS + LINE）
 * @param {Object} options - 選項
 * @returns {Object} Mock 物件集合
 */
function setupTestEnvironment(options = {}) {
  const {
    loanRecords = [],
    properties = {
      LINE_CHANNEL_TOKEN: 'mock-channel-token'
    },
    userProfiles = {}
  } = options;

  // 轉換租借記錄為 Sheet 資料格式
  const sheetData = loanRecordsToSheetData(loanRecords);
  
  // 設定 LINE API 環境
  const lineEnv = setupLineAPIEnvironment({ userProfiles });
  
  // 設定 GAS 環境
  const gasEnv = setupGASEnvironment({
    sheetData,
    properties,
    urlResponses: lineEnv.urlResponses
  });

  return {
    ...gasEnv,
    ...lineEnv
  };
}

/**
 * 比較兩個日期是否為同一天
 * @param {Date} date1 - 日期 1
 * @param {Date} date2 - 日期 2
 * @returns {boolean} 是否為同一天
 */
function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * 建立指定日期的 Date 物件（時間為 00:00:00）
 * @param {number} year - 年
 * @param {number} month - 月（1-12）
 * @param {number} day - 日
 * @returns {Date} 日期物件
 */
function createDate(year, month, day) {
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

module.exports = {
  setupGASEnvironment,
  cleanupGASEnvironment,
  setupLineAPIEnvironment,
  setupTestEnvironment,
  isSameDay,
  createDate
};

