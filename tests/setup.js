/**
 * Jest 測試環境設定檔
 * 
 * 此檔案會在所有測試執行前載入，用於：
 * 1. 設定全域變數
 * 2. 載入 mock 工具
 * 3. 設定測試環境
 */

// 設定測試超時時間
jest.setTimeout(10000);

// 全域 mock：Google Apps Script 的全域物件
global.SpreadsheetApp = undefined;
global.PropertiesService = undefined;
global.UrlFetchApp = undefined;
global.ContentService = undefined;
global.CalendarApp = undefined;
global.Logger = {
  log: jest.fn()
};

// 全域測試輔助函式
global.testHelpers = {
  // 建立假的日期物件
  createDate: (year, month, day) => {
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  },
  
  // 建立假的 LINE 事件
  createLineEvent: (text, userId = 'test-user-id') => {
    return {
      type: 'message',
      message: {
        type: 'text',
        text: text
      },
      replyToken: 'test-reply-token',
      source: {
        userId: userId
      }
    };
  }
};

// 在測試開始前顯示訊息
console.log('🧪 Jest 測試環境已初始化');

