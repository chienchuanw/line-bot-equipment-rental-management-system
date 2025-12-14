/**
 * Google Apps Script Mock 工具
 * 
 * 模擬 SpreadsheetApp、PropertiesService、UrlFetchApp 等 GAS API
 * 讓我們可以在本地環境測試 GAS 程式碼
 */

/**
 * 建立假的 Sheet 物件
 * @param {string} name - 工作表名稱
 * @param {Array<Array>} initialData - 初始資料（二維陣列）
 * @returns {Object} Mock Sheet 物件
 */
function createMockSheet(name, initialData = []) {
  const data = [...initialData];
  
  return {
    getName: jest.fn(() => name),
    
    getDataRange: jest.fn(() => ({
      getValues: jest.fn(() => data.map(row => [...row]))
    })),
    
    getLastColumn: jest.fn(() => {
      if (data.length === 0) return 0;
      return Math.max(...data.map(row => row.length));
    }),
    
    getLastRow: jest.fn(() => data.length),
    
    getRange: jest.fn((row, col, numRows = 1, numCols = 1) => {
      return {
        getValues: jest.fn(() => {
          const result = [];
          for (let r = row - 1; r < row - 1 + numRows; r++) {
            const rowData = [];
            for (let c = col - 1; c < col - 1 + numCols; c++) {
              rowData.push(data[r] ? data[r][c] : '');
            }
            result.push(rowData);
          }
          return result;
        }),
        
        setValues: jest.fn((values) => {
          for (let r = 0; r < values.length; r++) {
            const rowIndex = row - 1 + r;
            if (!data[rowIndex]) data[rowIndex] = [];
            for (let c = 0; c < values[r].length; c++) {
              data[rowIndex][col - 1 + c] = values[r][c];
            }
          }
        }),
        
        setValue: jest.fn((value) => {
          if (!data[row - 1]) data[row - 1] = [];
          data[row - 1][col - 1] = value;
        })
      };
    }),
    
    appendRow: jest.fn((rowData) => {
      data.push([...rowData]);
    }),
    
    deleteRow: jest.fn((rowIndex) => {
      data.splice(rowIndex - 1, 1);
    }),
    
    clear: jest.fn(() => {
      data.length = 0;
    }),
    
    // 測試用：取得內部資料
    _getData: () => data
  };
}

/**
 * 建立假的 Spreadsheet 物件
 * @param {Object} sheets - 工作表物件集合 { sheetName: mockSheet }
 * @returns {Object} Mock Spreadsheet 物件
 */
function createMockSpreadsheet(sheets = {}) {
  return {
    getSheetByName: jest.fn((name) => sheets[name] || null),
    
    insertSheet: jest.fn((name) => {
      const newSheet = createMockSheet(name, []);
      sheets[name] = newSheet;
      return newSheet;
    }),
    
    getSheets: jest.fn(() => Object.values(sheets))
  };
}

/**
 * 建立 SpreadsheetApp Mock
 * @param {Object} spreadsheet - Mock Spreadsheet 物件
 * @returns {Object} Mock SpreadsheetApp
 */
function createMockSpreadsheetApp(spreadsheet) {
  return {
    getActiveSpreadsheet: jest.fn(() => spreadsheet)
  };
}

/**
 * 建立 PropertiesService Mock
 * @param {Object} properties - 初始屬性物件
 * @returns {Object} Mock PropertiesService
 */
function createMockPropertiesService(properties = {}) {
  const props = { ...properties };
  
  return {
    getScriptProperties: jest.fn(() => ({
      getProperty: jest.fn((key) => props[key] || null),
      setProperty: jest.fn((key, value) => {
        props[key] = value;
      }),
      deleteProperty: jest.fn((key) => {
        delete props[key];
      }),
      getProperties: jest.fn(() => ({ ...props }))
    }))
  };
}

/**
 * 建立 UrlFetchApp Mock
 * @param {Object} mockResponses - 預設的 mock 回應 { url: response }
 * @returns {Object} Mock UrlFetchApp
 */
function createMockUrlFetchApp(mockResponses = {}) {
  return {
    fetch: jest.fn((url, options) => {
      const response = mockResponses[url] || { code: 404, content: '{}' };
      
      return {
        getResponseCode: jest.fn(() => response.code || 200),
        getContentText: jest.fn(() => response.content || '{}')
      };
    })
  };
}

module.exports = {
  createMockSheet,
  createMockSpreadsheet,
  createMockSpreadsheetApp,
  createMockPropertiesService,
  createMockUrlFetchApp
};

