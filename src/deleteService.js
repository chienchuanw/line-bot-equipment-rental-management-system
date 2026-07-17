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
 *
 * 日曆同步刻意放在 try/catch 之外，且在回覆使用者之後：
 * 若放進 try/catch，日曆的例外會被接住並回覆「處理記錄時發生錯誤」，
 * 但其實紀錄已經刪成功了——使用者會重試，造成更多混亂。
 *
 * 放在 try/catch 之外代表日曆失敗時例外會往上拋，Apps Script 會寄失敗
 * 通知信給 script owner，使用者則已收到正確的成功訊息。
 *
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

  // eventId 必須在 deleteRow 之前讀出來，列一旦刪掉就取不到了
  const eventId = recordToProcess.eventId;

  // 判斷記錄類型：未來記錄 vs 進行中記錄
  const borrowDate = toDateOrNull_(recordToProcess.borrowedAt);
  const returnDate = toDateOrNull_(recordToProcess.returnedAt);
  const isFutureRecord = borrowDate && startOfDay_(borrowDate) > today;

  // 記錄實際發生了什麼，供 try/catch 之外的日曆同步使用
  let calendarAction = null;

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
      calendarAction = 'delete';

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
        calendarAction = 'shorten';
      } else {
        replyMessage_(event.replyToken, '更新租借記錄時發生錯誤，請稍後再試。');
      }
    }

  } catch (error) {
    // 記錄錯誤並回覆使用者
    console.error('處理記錄時發生錯誤:', error);
    // return 而非往下走：sheet 操作失敗時不該再嘗試同步日曆
    return replyMessage_(event.replyToken, '處理記錄時發生錯誤，請稍後再試。');
  }

  // 日曆同步：刻意放在 try/catch 之外且在回覆之後
  // 提前歸還是縮短事件而非刪除，因為器材確實被借出過，那段歷史該留在日曆上
  if (calendarAction === 'delete') {
    deleteRentalEvent_(eventId);
  } else if (calendarAction === 'shorten') {
    updateRentalEventEnd_(eventId, today);
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
