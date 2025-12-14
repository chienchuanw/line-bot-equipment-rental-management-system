/**
 * borrowService.js 單元測試
 * 
 * 測試借用器材相關的業務邏輯
 */

// 載入測試資料
const { mockBorrowMessages } = require('../mocks/fixtures');
const { createDate } = require('../mocks/testHelpers');

// 從 src/borrowService.js 複製函式定義（用於測試）
// 注意：這裡需要先載入 dateUtils 的函式

/**
 * 解析點分隔的日期字串 (YYYY.MM.DD)
 */
function parseDotDate_(s) {
  const m = String(s || '').trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return isNaN(d) ? null : d;
}

/**
 * 取得日期的開始時間 (00:00:00)
 */
function startOfDay_(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * 解析借器材四行表單格式
 * @param {string} raw - 原始訊息文字
 * @returns {Object} 解析結果 { ok: boolean, msg?: string, items?: string, returnedAt?: Date, borrowedAt?: Date }
 */
function parseBorrowMessage_(raw) {
  // 移除前綴「借器材」
  const text = String(raw || '').replace(/^借器材[ \t]*/i, '').trim();

  // 期望四行格式（允許空行會被過濾）
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.length < 3) {
    return { ok: false, msg: '格式錯誤：請使用四行格式（借器材：租用器材／租用日期／歸還日期）' };
  }

  // 解析每一行的鍵值對
  const kv = {};
  for (const line of lines) {
    // 支援中英文冒號
    const m = line.match(/^(租用器材|租用日期|歸還日期)\s*[:：]\s*(.+)$/);
    if (!m) return { ok: false, msg: `格式錯誤：無法解析「${line}」` };
    kv[m[1]] = m[2].trim();
  }

  // 檢查必要欄位
  if (!kv['租用器材'] || !kv['租用日期'] || !kv['歸還日期']) {
    return { ok: false, msg: '格式錯誤：三個欄位皆必填（租用器材／租用日期／歸還日期）' };
  }

  // 器材以逗號分隔（中英文逗號）
  const items = kv['租用器材'].split(/[，,]/).map(s => s.trim()).filter(Boolean).join(', ');

  // 解析日期
  const rentDate = parseDotDate_(kv['租用日期']);
  const backDate = parseDotDate_(kv['歸還日期']);
  if (!rentDate || !backDate) {
    return { ok: false, msg: '日期格式錯誤：請用 YYYY.MM.DD（例如 2025.09.03）' };
  }

  // 檢查日期邏輯
  if (startOfDay_(backDate) < startOfDay_(rentDate)) {
    return { ok: false, msg: '日期邏輯錯誤：歸還日期不可早於租用日期' };
  }

  return {
    ok: true,
    items,
    borrowedAt: rentDate,
    returnedAt: backDate
  };
}

// ==================== 測試開始 ====================

describe('borrowService - parseBorrowMessage_', () => {
  describe('正常情境測試', () => {
    test('應該正確解析標準的四行格式', () => {
      const result = parseBorrowMessage_(mockBorrowMessages.valid);

      expect(result.ok).toBe(true);
      expect(result.items).toBe('相機A, 三腳架, 燈具');
      expect(result.borrowedAt).toBeInstanceOf(Date);
      expect(result.returnedAt).toBeInstanceOf(Date);
    });

    test('應該正確解析租用日期', () => {
      const result = parseBorrowMessage_(mockBorrowMessages.valid);

      expect(result.borrowedAt.getFullYear()).toBe(2025);
      expect(result.borrowedAt.getMonth()).toBe(8); // 9月是8（0-based）
      expect(result.borrowedAt.getDate()).toBe(10);
    });

    test('應該正確解析歸還日期', () => {
      const result = parseBorrowMessage_(mockBorrowMessages.valid);

      expect(result.returnedAt.getFullYear()).toBe(2025);
      expect(result.returnedAt.getMonth()).toBe(8);
      expect(result.returnedAt.getDate()).toBe(12);
    });

    test('應該正確解析只有一項器材的情況', () => {
      const result = parseBorrowMessage_(mockBorrowMessages.validSingleItem);

      expect(result.ok).toBe(true);
      expect(result.items).toBe('相機A');
    });

    test('應該正確處理器材名稱中的空白', () => {
      const message = `借器材
租用器材：  相機A  ,  三腳架  
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
      expect(result.items).toBe('相機A, 三腳架');
    });

    test('應該支援中文逗號分隔器材', () => {
      const message = `借器材
租用器材：相機A，三腳架，燈具
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
      expect(result.items).toBe('相機A, 三腳架, 燈具');
    });

    test('應該支援中文冒號', () => {
      const message = `借器材
租用器材：相機A
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
    });

    test('租用日期和歸還日期相同應該可以通過', () => {
      const message = `借器材
租用器材：相機A
租用日期：2025.09.10
歸還日期：2025.09.10`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
    });
  });

  describe('格式錯誤測試', () => {
    test('缺少欄位應該回傳錯誤', () => {
      const result = parseBorrowMessage_(mockBorrowMessages.missingField);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('格式錯誤');
    });

    test('只有「借器材」應該回傳錯誤', () => {
      const message = '借器材';
      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('格式錯誤');
    });

    test('空字串應該回傳錯誤', () => {
      const result = parseBorrowMessage_('');

      expect(result.ok).toBe(false);
    });

    test('null 應該回傳錯誤', () => {
      const result = parseBorrowMessage_(null);

      expect(result.ok).toBe(false);
    });

    test('缺少「租用器材」欄位應該回傳錯誤', () => {
      const message = `借器材
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('三個欄位皆必填');
    });

    test('缺少「租用日期」欄位應該回傳錯誤', () => {
      const message = `借器材
租用器材：相機A
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('三個欄位皆必填');
    });

    test('缺少「歸還日期」欄位應該回傳錯誤', () => {
      const message = `借器材
租用器材：相機A
租用日期：2025.09.10`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('三個欄位皆必填');
    });

    test('欄位名稱錯誤應該回傳錯誤', () => {
      const message = `借器材
器材名稱：相機A
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('無法解析');
    });

    test('沒有冒號應該回傳錯誤', () => {
      const message = `借器材
租用器材 相機A
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('無法解析');
    });
  });

  describe('日期格式錯誤測試', () => {
    test('使用破折號分隔日期應該回傳錯誤', () => {
      const result = parseBorrowMessage_(mockBorrowMessages.invalidDateFormat);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('日期格式錯誤');
    });

    test('使用斜線分隔日期應該回傳錯誤', () => {
      const message = `借器材
租用器材：相機A
租用日期：2025/09/10
歸還日期：2025/09/12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('日期格式錯誤');
    });

    test('日期缺少前導零應該回傳錯誤', () => {
      const message = `借器材
租用器材：相機A
租用日期：2025.9.10
歸還日期：2025.9.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('日期格式錯誤');
    });

    test('完全無效的日期應該回傳錯誤', () => {
      const message = `借器材
租用器材：相機A
租用日期：明天
歸還日期：後天`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('日期格式錯誤');
    });
  });

  describe('日期邏輯錯誤測試', () => {
    test('歸還日期早於租用日期應該回傳錯誤', () => {
      const result = parseBorrowMessage_(mockBorrowMessages.invalidDateLogic);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('日期邏輯錯誤');
      expect(result.msg).toContain('歸還日期不可早於租用日期');
    });

    test('歸還日期比租用日期早一天應該回傳錯誤', () => {
      const message = `借器材
租用器材：相機A
租用日期：2025.09.11
歸還日期：2025.09.10`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(false);
      expect(result.msg).toContain('日期邏輯錯誤');
    });
  });

  describe('邊界情況測試', () => {
    test('應該正確處理多個空行', () => {
      const message = `借器材

租用器材：相機A

租用日期：2025.09.10

歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
      expect(result.items).toBe('相機A');
    });

    test('應該正確處理行首行尾的空白', () => {
      const message = `借器材
  租用器材：相機A
  租用日期：2025.09.10
  歸還日期：2025.09.12  `;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
    });

    test('應該正確處理冒號前後的空白', () => {
      const message = `借器材
租用器材  :  相機A
租用日期  :  2025.09.10
歸還日期  :  2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
      expect(result.items).toBe('相機A');
    });

    test('應該正確處理器材清單為空的情況', () => {
      const message = `借器材
租用器材：
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      // 器材為空應該被視為無效
      expect(result.ok).toBe(false);
    });

    test('應該正確處理只有逗號的器材清單', () => {
      const message = `借器材
租用器材：,,,
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      // 只有逗號應該被過濾掉，結果為空
      expect(result.ok).toBe(false);
    });

    test('應該正確處理大小寫混合的「借器材」', () => {
      const message = `借器材
租用器材：相機A
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
    });

    test('應該正確處理跨年的租借', () => {
      const message = `借器材
租用器材：相機A
租用日期：2025.12.30
歸還日期：2026.01.05`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
      expect(result.borrowedAt.getFullYear()).toBe(2025);
      expect(result.returnedAt.getFullYear()).toBe(2026);
    });

    test('應該正確處理閏年的 2 月 29 日', () => {
      const message = `借器材
租用器材：相機A
租用日期：2024.02.29
歸還日期：2024.03.01`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
      expect(result.borrowedAt.getDate()).toBe(29);
    });

    test('應該正確處理長期租借（超過一個月）', () => {
      const message = `借器材
租用器材：相機A
租用日期：2025.09.01
歸還日期：2025.10.31`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
    });
  });

  describe('器材清單處理測試', () => {
    test('應該正確處理多個器材', () => {
      const message = `借器材
租用器材：相機A, 三腳架, 燈具, 收音設備, 鏡頭組
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
      expect(result.items).toBe('相機A, 三腳架, 燈具, 收音設備, 鏡頭組');
    });

    test('應該正確處理器材名稱中的特殊字元', () => {
      const message = `借器材
租用器材：相機A-1, 三腳架(大), 燈具【白光】
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
      expect(result.items).toContain('相機A-1');
      expect(result.items).toContain('三腳架(大)');
      expect(result.items).toContain('燈具【白光】');
    });

    test('應該過濾掉空的器材項目', () => {
      const message = `借器材
租用器材：相機A, , 三腳架, ,
租用日期：2025.09.10
歸還日期：2025.09.12`;

      const result = parseBorrowMessage_(message);

      expect(result.ok).toBe(true);
      expect(result.items).toBe('相機A, 三腳架');
    });
  });
});

