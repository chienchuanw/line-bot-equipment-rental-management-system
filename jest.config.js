/**
 * Jest 測試框架配置
 * 
 * 此配置檔案定義了測試環境、覆蓋率報告、測試檔案匹配規則等設定
 */

module.exports = {
  // 測試環境：使用 Node.js 環境
  testEnvironment: 'node',

  // 測試檔案匹配規則
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],

  // 覆蓋率收集的檔案範圍
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/testDebug.js',  // 排除舊的測試檔案
    '!src/**/*.test.js',
    '!src/**/*.spec.js'
  ],

  // 覆蓋率報告格式
  coverageReporters: [
    'text',           // 終端機輸出
    'text-summary',   // 簡要摘要
    'html',           // HTML 報告（可在瀏覽器查看）
    'lcov'            // 用於 CI/CD 整合
  ],

  // 覆蓋率輸出目錄
  coverageDirectory: 'coverage',

  // 覆蓋率門檻設定（初期設定較低，逐步提高）
  coverageThreshold: {
    global: {
      branches: 60,      // 分支覆蓋率
      functions: 60,     // 函式覆蓋率
      lines: 60,         // 行覆蓋率
      statements: 60     // 語句覆蓋率
    }
  },

  // 測試執行前的設定檔案
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // 模組路徑別名（方便 import）
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },

  // 忽略的目錄
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/.git/'
  ],

  // 詳細輸出
  verbose: true,

  // 清除 mock 狀態
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,

  // 測試超時時間（毫秒）
  testTimeout: 10000,

  // 錯誤訊息最大輸出行數
  maxWorkers: '50%'
};

