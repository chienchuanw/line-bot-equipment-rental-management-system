/**
 * 測試與除錯工具
 * 用於手動測試「我的租借」功能
 */

/**
 * 測試函式是否可用
 */
function test0_FunctionAvailability() {
  console.log('=== 測試 0：函式可用性 ===');

  try {
    // 測試各個模組的函式是否可用
    console.log('測試 dateUtils.gs 函式:');
    console.log('- startOfDay_ 存在:', typeof startOfDay_ === 'function');
    console.log('- formatDotDate_ 存在:', typeof formatDotDate_ === 'function');
    console.log('- toDateOrNull_ 存在:', typeof toDateOrNull_ === 'function');
    console.log('- parseDotDate_ 存在:', typeof parseDotDate_ === 'function');

    console.log('測試 sheetService.gs 函式:');
    console.log('- getLoansSheet_ 存在:', typeof getLoansSheet_ === 'function');
    console.log('- getLoanRows_ 存在:', typeof getLoanRows_ === 'function');

    console.log('測試 lineService.gs 函式:');
    console.log('- fetchLineDisplayName_ 存在:', typeof fetchLineDisplayName_ === 'function');
    console.log('- replyMessage_ 存在:', typeof replyMessage_ === 'function');

    console.log('測試 config.gs 常數:');
    console.log('- SHEET_LOANS 存在:', typeof SHEET_LOANS !== 'undefined');
    console.log('- SHEET_LOANS 值:', SHEET_LOANS);

    // 如果 startOfDay_ 可用，測試它
    if (typeof startOfDay_ === 'function') {
      const testDate = new Date();
      const result = startOfDay_(testDate);
      console.log('- startOfDay_ 測試成功:', result);
    }

    console.log('✅ 函式可用性測試完成');
  } catch (error) {
    console.error('❌ 函式可用性測試失敗:', error);
  }
}

/**
 * 測試基本設定是否正確
 */
function test1_BasicSetup() {
  console.log('=== 測試 1：基本設定 ===');

  try {
    console.log('SHEET_LOANS:', SHEET_LOANS);
    console.log('LINE Token 存在:', getProp_('LINE_CHANNEL_TOKEN') !== null);

    const loans = getLoansSheet_();
    console.log('工作表存在:', loans !== null);

    if (loans) {
      const data = loans.getDataRange().getValues();
      console.log('工作表資料行數:', data.length);
      console.log('標題列:', data[0]);
    }

    console.log('✅ 基本設定測試完成');
  } catch (error) {
    console.error('❌ 基本設定測試失敗:', error);
  }
}

/**
 * 測試「我的租借」函式
 */
function test2_MyBorrowFunction() {
  console.log('=== 測試 2：我的租借函式 ===');

  try {
    // 使用假的 replyToken 和 userId 進行測試
    const testReplyToken = 'test-reply-token';
    const testUserId = 'test-user-id';

    console.log('測試參數:');
    console.log('- replyToken:', testReplyToken);
    console.log('- userId:', testUserId);

    // 這會執行函式但不會真的發送 LINE 訊息（因為 token 是假的）
    replyMyBorrowRecords_(testReplyToken, testUserId);

    console.log('✅ 函式執行完成（檢查上方是否有錯誤訊息）');
  } catch (error) {
    console.error('❌ 函式執行失敗:', error);
  }
}

/**
 * 測試工作表資料讀取
 */
function test3_SheetData() {
  console.log('=== 測試 3：工作表資料 ===');

  try {
    const loans = getLoansSheet_();
    if (!loans) {
      console.error('❌ 找不到工作表');
      return;
    }

    const rows = getLoanRows_(loans);
    console.log('📊 總記錄數:', rows.length);

    if (rows.length > 0) {
      console.log('📋 第一筆記錄:');
      const firstRecord = rows[0];
      console.log('- userId:', firstRecord.userId);
      console.log('- username:', firstRecord.username);
      console.log('- items:', firstRecord.items);
      console.log('- borrowedAt:', firstRecord.borrowedAt);
      console.log('- returnedAt:', firstRecord.returnedAt);

      // 測試日期處理
      const today = startOfDay_(new Date());
      const returnDate = toDateOrNull_(firstRecord.returnedAt);
      console.log('📅 今天:', today);
      console.log('📅 歸還日期:', returnDate);
      console.log('📅 是否為未來/進行中:', returnDate && startOfDay_(returnDate) >= today);
    } else {
      console.log('⚠️ 工作表中沒有資料');
    }

    console.log('✅ 工作表資料測試完成');
  } catch (error) {
    console.error('❌ 工作表資料測試失敗:', error);
  }
}

/**
 * 測試 LINE API 連接
 */
function test4_LineAPI() {
  console.log('=== 測試 4：LINE API ===');

  try {
    const token = getProp_('LINE_CHANNEL_TOKEN');
    if (!token) {
      console.error('❌ LINE_CHANNEL_TOKEN 未設定');
      return;
    }

    console.log('✅ LINE Token 已設定');
    console.log('Token 長度:', token.length);
    console.log('Token 開頭:', token.substring(0, 10) + '...');

    // 測試取得使用者名稱（使用假的 userId）
    const testUserId = 'test-user-id';
    const username = fetchLineDisplayName_(testUserId);
    console.log('測試使用者名稱取得:', username);

    console.log('✅ LINE API 測試完成');
  } catch (error) {
    console.error('❌ LINE API 測試失敗:', error);
  }
}

/**
 * 模擬完整的「我的租借」指令處理流程
 */
function test5_FullFlow() {
  console.log('=== 測試 5：完整流程模擬 ===');

  try {
    // 模擬 LINE 事件
    const mockEvent = {
      type: 'message',
      message: {
        type: 'text',
        text: '我的租借'
      },
      replyToken: 'mock-reply-token',
      source: {
        userId: 'mock-user-id'
      }
    };

    const text = String(mockEvent.message.text || '').trim();
    const userId = (mockEvent.source && mockEvent.source.userId) || 'unknown';

    console.log('📨 模擬訊息:', text);
    console.log('👤 模擬使用者 ID:', userId);

    // 測試正則表達式匹配
    const isMatch = /^我的租借$/.test(text);
    console.log('🎯 正則表達式匹配:', isMatch);

    if (isMatch) {
      console.log('✅ 指令匹配成功，開始執行 replyMyBorrowRecords_');
      replyMyBorrowRecords_(mockEvent.replyToken, userId);
    } else {
      console.log('❌ 指令匹配失敗');
    }

    console.log('✅ 完整流程測試完成');
  } catch (error) {
    console.error('❌ 完整流程測試失敗:', error);
  }
}

/**
 * 執行所有測試
 */
function runAllTests() {
  console.log('🚀 開始執行所有測試...\n');

  test1_BasicSetup();
  console.log('\n');

  test2_MyBorrowFunction();
  console.log('\n');

  test3_SheetData();
  console.log('\n');

  test4_LineAPI();
  console.log('\n');

  test5_FullFlow();
  console.log('\n');

  console.log('🏁 所有測試完成！請檢查上方的執行記錄。');
}
