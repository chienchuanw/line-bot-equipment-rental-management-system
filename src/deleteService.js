/**
 * 刪除服務
 * 負責處理租借記錄的刪除邏輯，確保安全性
 * 
 * 安全性原則：
 * 1. 只能刪除未來的租借記錄（borrowedAt > 今天）
 * 2. 只能刪除自己的記錄（userId 比對）
 * 3. 提供完整的錯誤處理與使用者回饋
 */

/**
 * 處理刪除器材記錄請求
 * @param {Object} event - LINE 事件物件
 * @param {string} recordIndex - 記錄編號（從1開始）
 * @param {string} userId - 使用者 ID
 */
function handleDeleteRecord_(event, recordIndex, userId) {
  const loans = getLoansSheet_();
  if (!loans) return replyMessage_(event.replyToken, `找不到工作表：${SHEET_LOANS}`);

  const index = parseInt(recordIndex, 10);
  if (isNaN(index) || index < 1) {
    return replyMessage_(event.replyToken, '記錄編號格式錯誤，請輸入正確的數字。');
  }

  const rows = getLoanRows_(loans);
  const today = startOfDay_(new Date());

  // 取得使用者的可操作記錄（進行中和未來的記錄）
  const myActiveRecords = rows
    .map((record, rowIndex) => ({ ...record, sheetRowIndex: rowIndex + 2 })) // +2 因為有標題行
    .filter(r => {
      const isMyRecord = r.userId === userId;
      const returnDate = toDateOrNull_(r.returnedAt);
      const isActiveOrFuture = returnDate && startOfDay_(returnDate) >= today;
      return isMyRecord && isActiveOrFuture;
    });

  // 檢查記錄是否存在
  if (index > myActiveRecords.length) {
    return replyMessage_(event.replyToken, `記錄編號 ${index} 不存在，請先使用「我的租借」查看可操作的記錄。`);
  }

  const recordToProcess = myActiveRecords[index - 1];

  // 判斷記錄類型：未來記錄 vs 進行中記錄
  const borrowDate = toDateOrNull_(recordToProcess.borrowedAt);
  const returnDate = toDateOrNull_(recordToProcess.returnedAt);
  const isFutureRecord = borrowDate && startOfDay_(borrowDate) > today;

  try {
    // 格式化記錄資訊（用於回覆訊息）
    const itemsArr = String(recordToProcess.items || '').split(/[，,]/).map(s => s.trim()).filter(Boolean);
    const itemsBlock = itemsArr.length ? itemsArr.join(', ') : '（無器材資料）';
    const rentStart = formatDotDate_(borrowDate);
    const rentEnd = formatDotDate_(returnDate);

    if (isFutureRecord) {
      // 情況A：未來記錄 - 直接刪除整筆記錄
      loans.deleteRow(recordToProcess.sheetRowIndex);

      const successMessage = [
        '✅ 已取消未來租借記錄',
        '',
        `📅 ${rentStart} ~ ${rentEnd}`,
        itemsBlock,
        '',
        '記錄已從系統中移除。'
      ].join('\n');

      replyMessage_(event.replyToken, successMessage);

    } else {
      // 情況B：進行中記錄 - 修改 returnedAt 為今天（提前歸還）
      const success = updateRecordReturnDate_(loans, recordToProcess.sheetRowIndex, today);

      if (success) {
        const todayStr = formatDotDate_(today);
        const successMessage = [
          '✅ 已提前歸還器材',
          '',
          `📅 ${rentStart} ~ ${todayStr}`,
          itemsBlock,
          '',
          '租借期間已調整為提前歸還。'
        ].join('\n');

        replyMessage_(event.replyToken, successMessage);
      } else {
        replyMessage_(event.replyToken, '更新租借記錄時發生錯誤，請稍後再試。');
      }
    }

  } catch (error) {
    // 記錄錯誤並回覆使用者
    console.error('處理記錄時發生錯誤:', error);
    replyMessage_(event.replyToken, '處理記錄時發生錯誤，請稍後再試。');
  }
}

/**
 * 驗證記錄是否可以被操作（刪除或修改）
 * @param {Object} record - 租借記錄物件
 * @param {string} userId - 使用者 ID
 * @returns {Object} 驗證結果 { canProcess: boolean, reason?: string }
 */
function validateRecordOperation_(record, userId) {
  // 檢查是否為本人記錄
  if (record.userId !== userId) {
    return { canProcess: false, reason: '只能操作自己的租借記錄' };
  }

  // 檢查日期格式
  const returnDate = toDateOrNull_(record.returnedAt);
  if (!returnDate) {
    return { canProcess: false, reason: '記錄日期格式錯誤' };
  }

  // 檢查是否為已過期記錄（歸還日期已過）
  const today = startOfDay_(new Date());
  if (startOfDay_(returnDate) < today) {
    return { canProcess: false, reason: '無法操作已過期的租借記錄' };
  }

  return { canProcess: true };
}
