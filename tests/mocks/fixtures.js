/**
 * 測試資料 Fixtures
 * 
 * 提供測試用的假資料，包括使用者、租借記錄、日期等
 * 讓測試更容易撰寫和維護
 */

/**
 * 假的使用者資料
 */
const mockUsers = {
  user1: {
    userId: 'U1111111111111111',
    username: '張小明',
    displayName: '張小明'
  },
  user2: {
    userId: 'U2222222222222222',
    username: '李小華',
    displayName: '李小華'
  },
  user3: {
    userId: 'U3333333333333333',
    username: '王大同',
    displayName: '王大同'
  }
};

/**
 * 假的器材清單
 */
const mockEquipment = {
  camera: '相機A',
  tripod: '三腳架',
  light: '燈具',
  microphone: '收音設備',
  lens: '鏡頭組',
  gimbal: '穩定器'
};

/**
 * 建立假的租借記錄
 * @param {Object} options - 選項
 * @returns {Object} 租借記錄
 */
function createMockLoanRecord(options = {}) {
  const {
    userId = mockUsers.user1.userId,
    username = mockUsers.user1.username,
    items = `${mockEquipment.camera}, ${mockEquipment.tripod}`,
    borrowedAt = new Date(2025, 8, 10), // 2025.09.10
    returnedAt = new Date(2025, 8, 12),  // 2025.09.12
    ts = new Date(2025, 8, 3, 14, 30, 0) // 2025.09.03 14:30:00
  } = options;

  return {
    ts,
    userId,
    username,
    items,
    borrowedAt,
    returnedAt
  };
}

/**
 * 假的租借記錄範例（用於測試 Sheet 資料）
 */
const mockLoanRecords = [
  // 記錄 1: 張小明借用相機和三腳架
  createMockLoanRecord({
    userId: mockUsers.user1.userId,
    username: mockUsers.user1.username,
    items: `${mockEquipment.camera}, ${mockEquipment.tripod}`,
    borrowedAt: new Date(2025, 8, 10),
    returnedAt: new Date(2025, 8, 12)
  }),
  
  // 記錄 2: 李小華借用燈具和收音設備
  createMockLoanRecord({
    userId: mockUsers.user2.userId,
    username: mockUsers.user2.username,
    items: `${mockEquipment.light}, ${mockEquipment.microphone}`,
    borrowedAt: new Date(2025, 8, 11),
    returnedAt: new Date(2025, 8, 13)
  }),
  
  // 記錄 3: 王大同借用鏡頭組
  createMockLoanRecord({
    userId: mockUsers.user3.userId,
    username: mockUsers.user3.username,
    items: mockEquipment.lens,
    borrowedAt: new Date(2025, 8, 15),
    returnedAt: new Date(2025, 8, 17)
  })
];

/**
 * 將租借記錄轉換為 Sheet 資料格式（二維陣列）
 * @param {Array<Object>} records - 租借記錄陣列
 * @returns {Array<Array>} Sheet 資料格式
 */
function loanRecordsToSheetData(records) {
  const headers = ['ts', 'userId', 'username', 'items', 'borrowedAt', 'returnedAt'];
  const rows = records.map(record => [
    record.ts,
    record.userId,
    record.username,
    record.items,
    record.borrowedAt,
    record.returnedAt
  ]);
  
  return [headers, ...rows];
}

/**
 * 假的借器材訊息範例
 */
const mockBorrowMessages = {
  // 正確格式
  valid: `借器材
租用器材：相機A, 三腳架, 燈具
租用日期：2025.09.10
歸還日期：2025.09.12`,

  // 只有一項器材
  validSingleItem: `借器材
租用器材：相機A
租用日期：2025.09.10
歸還日期：2025.09.12`,

  // 格式錯誤：缺少欄位
  missingField: `借器材
租用器材：相機A
租用日期：2025.09.10`,

  // 格式錯誤：日期格式錯誤
  invalidDateFormat: `借器材
租用器材：相機A
租用日期：2025-09-10
歸還日期：2025-09-12`,

  // 邏輯錯誤：歸還日期早於租用日期
  invalidDateLogic: `借器材
租用器材：相機A
租用日期：2025.09.12
歸還日期：2025.09.10`
};

module.exports = {
  mockUsers,
  mockEquipment,
  mockLoanRecords,
  createMockLoanRecord,
  loanRecordsToSheetData,
  mockBorrowMessages
};

