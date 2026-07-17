/**
 * Google 日曆同步服務
 *
 * 本檔案獨佔所有 CalendarApp 的呼叫，其他檔案不得直接使用 CalendarApp
 * （沿用 sheetService 獨佔 SpreadsheetApp、lineService 獨佔 UrlFetchApp 的分層慣例）
 *
 * 必要的 Script Properties：
 * - CALENDAR_ID (選填) - 目標日曆 ID。未設定即代表關閉日曆同步功能
 *
 * 前置設定：
 * GAS 永遠以部署者的身分執行（appsscript.json 的 executeAs: USER_DEPLOYING），
 * 無法以另一個 Google 帳號的身分建立事件。因此目標日曆必須分享給執行本專案的
 * 帳號，權限為「變更活動」。事件的建立者會顯示為該帳號。
 *
 * 注意：加入 CalendarApp 會引入新的 OAuth scope。web app 是綁著既有授權部署的，
 * scope 一變必須在編輯器重新授權並建立新的部署版本，否則 doPost 會整個失敗。
 */

/**
 * 取得器材租借用的目標日曆
 *
 * 「未設定」與「失敗」是兩件事：
 * - CALENDAR_ID 未設定 → 回傳 null，代表刻意關閉功能，呼叫端靜默跳過
 * - CALENDAR_ID 有設定但找不到日曆 → 拋錯
 *
 * 若兩者都回傳 null，「ID 打錯」就會偽裝成「功能沒開」，
 * 日曆一片空白也永遠沒人發現。
 *
 * @returns {GoogleAppsScript.Calendar.Calendar|null} 日曆物件，未設定時回傳 null
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
 * @param {Object} record - { displayName, items, borrowedAt, returnedAt }
 *                          displayName 為已解析好的顯示名稱（由呼叫端負責解析，
 *                          本服務不需要知道 users 對照表的存在）
 * @returns {string|null} 事件 ID；日曆未設定時回傳 null
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
 *
 * 以下情況一律靜默跳過並回傳 false：
 * - eventId 為空（上線前的舊紀錄、或建立時同步失敗過的紀錄）
 * - 事件已被人手動從日曆刪除
 *
 * 不能因為日曆找不到就讓使用者刪不掉自己的紀錄。
 *
 * @param {string} eventId - 事件 ID
 * @returns {boolean} 是否實際刪除了事件
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
 *
 * 提前歸還是縮短事件而非刪除，因為器材確實被借出過，
 * 那段歷史該留在日曆上。
 *
 * 容錯行為與 deleteRentalEvent_ 相同。
 *
 * @param {string} eventId - 事件 ID
 * @param {Date} newReturnedAt - 新的歸還日期
 * @returns {boolean} 是否實際更新了事件
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
