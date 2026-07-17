/**
 * calendarService 測試
 *
 * 測試 Google 日曆同步的所有功能：
 * 1. getRentalCalendar_ - 取得目標日曆
 * 2. createRentalEvent_ - 建立整天事件
 * 3. deleteRentalEvent_ - 刪除事件
 * 4. updateRentalEventEnd_ - 縮短事件結束日（提前歸還）
 *
 * 最重要的不變量：整天事件的結束日是「排他」的。
 * 租用 9/11 ~ 9/13 必須傳 end = 9/14，少加一天日曆上就會短一天。
 */

const { setupTestEnvironment, createDate, isSameDay } = require('../mocks/testHelpers');

let env;

// ==================== 從 src/dateUtils.js 複製 ====================

/**
 * 取得日期的開始時間 (00:00:00)
 */
function startOfDay_(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * 將日期加上指定天數
 */
function addDays_(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// ==================== 從 src/config.js 複製 ====================

/**
 * 取得 Script Properties 中的設定值
 */
function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// ==================== 從 src/calendarService.js 複製 ====================

/**
 * 取得器材租借用的目標日曆
 */
function getRentalCalendar_() {
  const calendarId = getProp_('CALENDAR_ID');
  if (!calendarId) return null;

  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) {
    console.error('找不到日曆，請確認 CALENDAR_ID 正確且已分享給此帳號', calendarId);
    throw new Error(`找不到日曆：${calendarId}`);
  }
  return calendar;
}

/**
 * 建立器材租借的整天事件
 */
function createRentalEvent_(record) {
  const calendar = getRentalCalendar_();
  if (!calendar) return null;

  const title = `${record.displayName}｜${record.items}`;
  const start = startOfDay_(record.borrowedAt);
  // 整天事件的 end 為排他：租 9/11~9/13 必須傳 9/14，否則日曆上會短一天
  const end = addDays_(startOfDay_(record.returnedAt), 1);

  const event = calendar.createAllDayEvent(title, start, end);
  return event.getId();
}

/**
 * 刪除器材租借的日曆事件
 */
function deleteRentalEvent_(eventId) {
  if (!eventId) return false;

  const calendar = getRentalCalendar_();
  if (!calendar) return false;

  const event = calendar.getEventById(eventId);
  if (!event) return false;

  event.deleteEvent();
  return true;
}

/**
 * 縮短器材租借事件的結束日（提前歸還）
 */
function updateRentalEventEnd_(eventId, newReturnedAt) {
  if (!eventId) return false;

  const calendar = getRentalCalendar_();
  if (!calendar) return false;

  const event = calendar.getEventById(eventId);
  if (!event) return false;

  const start = event.getAllDayStartDate();
  event.setAllDayDates(start, addDays_(startOfDay_(newReturnedAt), 1));
  return true;
}

// ==================== 測試開始 ====================

const CAL_ID = 'foufa@group.calendar.google.com';

/**
 * 建立一個已設定好日曆的測試環境
 */
function setupWithCalendar(calendarEvents = {}) {
  return setupTestEnvironment({
    properties: { LINE_CHANNEL_TOKEN: 'mock-channel-token', CALENDAR_ID: CAL_ID },
    calendarId: CAL_ID,
    calendarEvents
  });
}

describe('calendarService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getRentalCalendar_ - 取得目標日曆', () => {
    test('CALENDAR_ID 未設定時應該回傳 null（功能等同關閉）', () => {
      env = setupTestEnvironment({ properties: {} });

      expect(getRentalCalendar_()).toBeNull();
    });

    test('CALENDAR_ID 為空字串時應該回傳 null', () => {
      env = setupTestEnvironment({ properties: { CALENDAR_ID: '' } });

      expect(getRentalCalendar_()).toBeNull();
    });

    test('CALENDAR_ID 有設定且日曆存在時應該回傳日曆', () => {
      env = setupWithCalendar();

      expect(getRentalCalendar_()).toBe(env.calendar);
    });

    test('CALENDAR_ID 有設定但找不到日曆時應該拋錯（不可偽裝成功能沒開）', () => {
      // 「未設定」與「設定錯誤」必須是兩種行為，
      // 否則 ID 打錯會偽裝成「功能沒開」，永遠沒人發現
      env = setupTestEnvironment({
        properties: { CALENDAR_ID: '打錯的ID' },
        calendarId: CAL_ID
      });
      jest.spyOn(console, 'error').mockImplementation(() => { });

      expect(() => getRentalCalendar_()).toThrow('找不到日曆');
    });
  });

  describe('createRentalEvent_ - 建立整天事件', () => {
    beforeEach(() => {
      env = setupWithCalendar();
    });

    test('結束日應該為排他（租 9/11~9/13 傳 end=9/14）', () => {
      createRentalEvent_({
        displayName: '張小明',
        items: '相機A, 三腳架',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      });

      const [, start, end] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(isSameDay(start, createDate(2025, 9, 11))).toBe(true);
      expect(isSameDay(end, createDate(2025, 9, 14))).toBe(true);
    });

    test('單日租借應該建立一天的整天事件', () => {
      createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 11)
      });

      const [, start, end] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(isSameDay(start, createDate(2025, 9, 11))).toBe(true);
      expect(isSameDay(end, createDate(2025, 9, 12))).toBe(true);
    });

    test('跨月租借的結束日應該正確', () => {
      createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 29),
        returnedAt: createDate(2025, 9, 30)
      });

      const [, , end] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(isSameDay(end, createDate(2025, 10, 1))).toBe(true);
    });

    test('標題應該為「displayName｜items」', () => {
      createRentalEvent_({
        displayName: '張小明',
        items: '相機A, 三腳架',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      });

      const [title] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(title).toBe('張小明｜相機A, 三腳架');
    });

    test('應該回傳新建事件的 eventId', () => {
      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      });

      expect(eventId).toBe('evt-1@google.com');
    });

    test('傳入帶有時間的日期時應該正規化為當日開始', () => {
      createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: new Date(2025, 8, 11, 15, 30, 0),
        returnedAt: new Date(2025, 8, 13, 20, 45, 0)
      });

      const [, start, end] = env.calendar.createAllDayEvent.mock.calls[0];
      expect(start.getHours()).toBe(0);
      expect(end.getHours()).toBe(0);
      expect(isSameDay(end, createDate(2025, 9, 14))).toBe(true);
    });

    test('CALENDAR_ID 未設定時應該回傳 null 且不拋錯', () => {
      env = setupTestEnvironment({ properties: {} });

      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      });

      expect(eventId).toBeNull();
    });
  });

  describe('deleteRentalEvent_ - 刪除事件', () => {
    test('應該刪除指定的事件', () => {
      env = setupWithCalendar();
      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 13)
      });

      const result = deleteRentalEvent_(eventId);

      expect(result).toBe(true);
      expect(env.calendar._getEvents()[eventId]._isDeleted()).toBe(true);
    });

    test('eventId 為空時應該靜默回傳 false（上線前的舊紀錄）', () => {
      env = setupWithCalendar();

      expect(deleteRentalEvent_('')).toBe(false);
      expect(env.calendar.getEventById).not.toHaveBeenCalled();
    });

    test('eventId 為 undefined 時應該靜默回傳 false', () => {
      env = setupWithCalendar();

      expect(deleteRentalEvent_(undefined)).toBe(false);
      expect(env.calendar.getEventById).not.toHaveBeenCalled();
    });

    test('事件已被手動從日曆刪除時應該回傳 false 而非拋錯', () => {
      // 不能因為日曆找不到就讓使用者刪不掉自己的紀錄
      env = setupWithCalendar();

      expect(deleteRentalEvent_('不存在的事件@google.com')).toBe(false);
    });

    test('CALENDAR_ID 未設定時應該回傳 false 且不拋錯', () => {
      env = setupTestEnvironment({ properties: {} });

      expect(deleteRentalEvent_('evt-1@google.com')).toBe(false);
    });
  });

  describe('updateRentalEventEnd_ - 縮短事件結束日', () => {
    test('提前歸還應該把結束日縮短為指定日期的隔天（排他）', () => {
      env = setupWithCalendar();
      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 20)
      });

      const result = updateRentalEventEnd_(eventId, createDate(2025, 9, 13));

      expect(result).toBe(true);
      const event = env.calendar._getEvents()[eventId];
      const [start, end] = event.setAllDayDates.mock.calls[0];
      expect(isSameDay(start, createDate(2025, 9, 11))).toBe(true);
      expect(isSameDay(end, createDate(2025, 9, 14))).toBe(true);
    });

    test('應該保留原本的開始日不變', () => {
      env = setupWithCalendar();
      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 20)
      });

      updateRentalEventEnd_(eventId, createDate(2025, 9, 13));

      const event = env.calendar._getEvents()[eventId];
      const [start] = event.setAllDayDates.mock.calls[0];
      expect(isSameDay(start, createDate(2025, 9, 11))).toBe(true);
    });

    test('提前歸還應該縮短事件而非刪除（器材確實被借出過）', () => {
      env = setupWithCalendar();
      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 20)
      });

      updateRentalEventEnd_(eventId, createDate(2025, 9, 13));

      const event = env.calendar._getEvents()[eventId];
      expect(event.deleteEvent).not.toHaveBeenCalled();
      expect(event._isDeleted()).toBe(false);
    });

    test('當天借當天還時結束日應該為隔天', () => {
      env = setupWithCalendar();
      const eventId = createRentalEvent_({
        displayName: '張小明',
        items: '相機A',
        borrowedAt: createDate(2025, 9, 11),
        returnedAt: createDate(2025, 9, 20)
      });

      updateRentalEventEnd_(eventId, createDate(2025, 9, 11));

      const event = env.calendar._getEvents()[eventId];
      const [, end] = event.setAllDayDates.mock.calls[0];
      expect(isSameDay(end, createDate(2025, 9, 12))).toBe(true);
    });

    test('事件不存在時應該回傳 false 而非拋錯', () => {
      env = setupWithCalendar();

      expect(updateRentalEventEnd_('不存在@google.com', createDate(2025, 9, 13))).toBe(false);
    });

    test('eventId 為空時應該靜默回傳 false', () => {
      env = setupWithCalendar();

      expect(updateRentalEventEnd_('', createDate(2025, 9, 13))).toBe(false);
      expect(env.calendar.getEventById).not.toHaveBeenCalled();
    });

    test('CALENDAR_ID 未設定時應該回傳 false 且不拋錯', () => {
      env = setupTestEnvironment({ properties: {} });

      expect(updateRentalEventEnd_('evt-1@google.com', createDate(2025, 9, 13))).toBe(false);
    });
  });
});
