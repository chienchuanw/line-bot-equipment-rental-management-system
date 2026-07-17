/**
 * 查詢服務
 * 負責處理器材查詢相關的業務邏輯
 */

/**
 * 查詢指定日期被借走的器材與借用人
 * @param {string} replyToken - LINE 回覆 token
 * @param {string} ymdDot - 日期字串 (YYYY.MM.DD)
 */
function replyBorrowedOnDate_(replyToken, ymdDot) {
  const loans = getLoansSheet_();
  if (!loans) return replyMessage_(replyToken, `找不到工作表：${SHEET_LOANS}`);

  const target = parseDotDate_(ymdDot);
  if (!target) return replyMessage_(replyToken, '日期格式錯誤，請用 YYYY.MM.DD');

  const rows = getLoanRows_(loans);

  // 一次請求只讀一次 users 分頁，不要每列都讀
  const nameMap = getUserDisplayNameMap_();

  // 篩選規則：若「租用日期（borrowedAt）」<= target <=「歸還日期（returnedAt）」即視為該日占用中
  const list = rows.filter(r => {
    const rentStart = toDateOrNull_(r.borrowedAt); // 租用日期（borrowedAt）
    const rentEnd = toDateOrNull_(r.returnedAt); // 歸還日期（returnedAt）
    if (!rentStart || !rentEnd) return false;
    const d = startOfDay_(target);
    return startOfDay_(rentStart) <= d && d <= startOfDay_(rentEnd);
  });

  if (!list.length) {
    return replyMessage_(replyToken, '暫無借用資訊，請確認工作室是否有拍攝。');
  }

  // 格式化回覆訊息：粗體 username，逐項器材換行顯示
  // 查器材是群組共用視圖，故套用 users 對照表讓別人認得出是誰
  const msg = list.map(r => {
    const username = resolveDisplayName_(r.userId, r.username, nameMap);

    // 把 items 用 , 或 ， 分隔後逐行顯示
    const itemsArr = String(r.items || '').split(/[，,]/).map(s => s.trim()).filter(Boolean);
    const itemsBlock = itemsArr.length ? itemsArr.join('\n') : '（無器材資料）';

    // 加入日期範圍顯示
    const rentStart = formatDotDate_(toDateOrNull_(r.borrowedAt));
    const rentEnd = formatDotDate_(toDateOrNull_(r.returnedAt));
    const dateRange = `📅 ${rentStart} ~ ${rentEnd}`;

    return `${dateRange}\n**${username}**\n${itemsBlock}`;
  }).join('\n\n');

  replyMessage_(replyToken, msg);
}

/**
 * 查詢指定月份的器材租借狀況
 * @param {string} replyToken - LINE 回覆 token
 * @param {string} ymDot - 月份字串 (YYYY.MM)
 */
function replyBorrowedOnMonth_(replyToken, ymDot) {
  const loans = getLoansSheet_();
  if (!loans) return replyMessage_(replyToken, `找不到工作表：${SHEET_LOANS}`);

  const monthInfo = parseDotMonth_(ymDot);
  if (!monthInfo) return replyMessage_(replyToken, '月份格式錯誤，請用 YYYY.MM');

  const rows = getLoanRows_(loans);

  // 一次請求只讀一次 users 分頁，不要每列都讀
  const nameMap = getUserDisplayNameMap_();

  // 篩選規則：租借期間與指定月份有重疊的記錄
  const list = rows.filter(r => {
    const rentStart = toDateOrNull_(r.borrowedAt); // 租用日期
    const rentEnd = toDateOrNull_(r.returnedAt);   // 歸還日期
    if (!rentStart || !rentEnd) return false;

    const borrowStart = startOfDay_(rentStart);
    const borrowEnd = startOfDay_(rentEnd);
    const monthStart = startOfDay_(monthInfo.startDate);
    const monthEnd = startOfDay_(monthInfo.endDate);

    // 檢查租借期間是否與指定月份有重疊
    return borrowStart <= monthEnd && borrowEnd >= monthStart;
  });

  if (!list.length) {
    const monthText = `${monthInfo.year} / ${monthInfo.month}`;
    return replyMessage_(replyToken, `${monthText} 暫無器材借用紀錄。`);
  }

  // 按租用日期排序
  list.sort((a, b) => {
    const dateA = toDateOrNull_(a.borrowedAt);
    const dateB = toDateOrNull_(b.borrowedAt);
    return dateA - dateB;
  });

  // 格式化回覆訊息
  const monthText = `${monthInfo.year} / ${monthInfo.month} 器材租借`;
  // 同上：共用視圖套用對照表
  const msg = list.map(r => {
    const username = resolveDisplayName_(r.userId, r.username, nameMap);

    // 把 items 用 , 或 ， 分隔後逐行顯示
    const itemsArr = String(r.items || '').split(/[，,]/).map(s => s.trim()).filter(Boolean);
    const itemsBlock = itemsArr.length ? itemsArr.join('\n') : '（無器材資料）';

    // 加入日期範圍顯示
    const rentStart = formatDotDate_(toDateOrNull_(r.borrowedAt));
    const rentEnd = formatDotDate_(toDateOrNull_(r.returnedAt));
    const dateRange = `📅 ${rentStart} ~ ${rentEnd}`;

    return `${dateRange}\n**${username}**\n${itemsBlock}`;
  }).join('\n\n');

  const fullMessage = `${monthText}\n\n${msg}`;
  replyMessage_(replyToken, fullMessage);
}

/**
 * 查詢使用者自己的未來租借記錄（可刪除的記錄）
 * @param {string} replyToken - LINE 回覆 token
 * @param {string} userId - 使用者 ID
 */
function replyMyBorrowRecords_(replyToken, userId) {
  const loans = getLoansSheet_();
  if (!loans) return replyMessage_(replyToken, `找不到工作表：${SHEET_LOANS}`);

  // 取得使用者的 LINE 顯示名稱
  const username = fetchLineDisplayName_(userId) || '您';

  const rows = getLoanRows_(loans);
  const today = startOfDay_(new Date());

  // 篩選條件：
  // 1. 是該使用者的記錄
  // 2. 歸還日期在今天或之後（進行中和未來的記錄）
  const myActiveRecords = rows
    .map((record, index) => ({ ...record, rowIndex: index + 2 })) // +2 因為有標題行
    .filter(r => {
      const isMyRecord = r.userId === userId;
      const returnDate = toDateOrNull_(r.returnedAt);
      const isActiveOrFuture = returnDate && startOfDay_(returnDate) >= today;
      return isMyRecord && isActiveOrFuture;
    });

  if (!myActiveRecords.length) {
    return replyMessage_(replyToken, '您目前沒有可操作的租借記錄。');
  }

  // 格式化回覆訊息
  const recordList = myActiveRecords.map((r, index) => {
    const itemsArr = String(r.items || '').split(/[，,]/).map(s => s.trim()).filter(Boolean);
    const itemsBlock = itemsArr.length ? itemsArr.join(', ') : '（無器材資料）';

    const rentStart = formatDotDate_(toDateOrNull_(r.borrowedAt));
    const rentEnd = formatDotDate_(toDateOrNull_(r.returnedAt));

    return `[${index + 1}] ${rentStart} ~ ${rentEnd}\n${itemsBlock}`;
  }).join('\n\n');

  const helpText = '\n\n輸入「刪除 <編號>」即可刪除\n例如：刪除 1';
  const fullMessage = `📋 ${username}的租借記錄\n\n${recordList}${helpText}`;

  replyMessage_(replyToken, fullMessage);
}

/**
 * 產生指令說明文字
 * @returns {string} 指令說明內容
 */
function helpText_() {
  return [
    '可用指令與範例：',
    '',
    '1) 借器材（請複製下方四行格式，包含「借器材」）',
    '借器材',
    '租用器材：器材一, 器材二, 器材三',
    '租用日期：2025.09.10',
    '歸還日期：2025.09.12',
    '',
    '2) 查器材 <YYYY.MM.DD> 或 <YYYY.MM>',
    '範例：查器材 2025.09.11（查特定日期）',
    '範例：查器材 2025.09（查整個月份）',
    '',
    '3) 我的租借',
    '查看您的未來租借記錄，並進行刪除',
    '',
    '4) 查指令',
    '顯示所有指令與使用範例'
  ].join('\n');
}
