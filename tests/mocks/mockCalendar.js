/**
 * Google Calendar Mock 工具
 *
 * 模擬 CalendarApp，讓我們可以在本地環境測試日曆同步邏輯
 *
 * 注意：整天事件的結束日在 Google 日曆是「排他」的，
 * 租用 9/11 ~ 9/13 建立事件時必須傳 end = 9/14。
 * 這些 mock 只忠實記錄傳進來的值，不做任何排他性的轉換，
 * 排他性的正確與否由 calendarService 的測試負責驗證。
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
    // 找不到日曆時回傳 null，與真實的 CalendarApp 行為一致
    getCalendarById: jest.fn((id) => calendars[id] || null)
  };
}

module.exports = {
  createMockCalendarEvent,
  createMockCalendar,
  createMockCalendarApp
};
