/**
 * 使用者顯示名稱服務
 *
 * 為什麼需要對照表：
 * LINE 暱稱是使用者隨時可以改的，常是表情符號或綽號，在共用視圖上難以辨識。
 * 且 loans 的 username 欄位是借用當下抓的快照，使用者改暱稱後舊紀錄不會變，
 * 同一個人在日曆上可能出現兩三種名字。
 *
 * 為什麼對照表存在 users 分頁而不是寫死在 config.js：
 * 1. 真實 userId 是個人資料，寫進程式碼等於永久留在 git 歷史
 * 2. 改程式碼要上線需手動建立新部署版本；「新增一個常用使用者」不該付這個成本
 *
 * 為什麼解析發生在顯示層而不是寫入層：
 * userId 一直存在 sheet 裡，所以顯示時解析代表改對照表能讓所有既有紀錄的
 * 顯示一起更新。username 欄位則保留 LINE 暱稱原值——那是借用當下的快照，
 * 是有價值的原始資料，不該被對照表覆寫。
 *
 * 刻意不套用的地方：「我的租借」與借器材的確認回覆。
 * 那兩個是使用者看自己的畫面，用他自己設的暱稱稱呼他反而自然；
 * 對照表的目的是讓「別人」認得出是誰。
 */

/**
 * 解析使用者的顯示名稱
 * 三段 fallback：對照表 → fallbackUsername → userId
 *
 * @param {string} userId - LINE 使用者 ID
 * @param {string} fallbackUsername - 對照表未命中時使用的名稱（通常是紀錄裡的 username）
 * @param {Object<string, string>} nameMap - getUserDisplayNameMap_() 的結果
 * @returns {string} 顯示名稱
 */
function resolveDisplayName_(userId, fallbackUsername, nameMap) {
  const map = nameMap || {};
  const uid = String(userId || '').trim();

  if (uid && map[uid]) return map[uid];
  return fallbackUsername || userId || '';
}
