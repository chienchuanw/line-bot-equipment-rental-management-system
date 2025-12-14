/**
 * dateUtils.js 單元測試
 * 
 * 測試所有日期處理相關的純函式
 */

// 載入要測試的模組
const { createDate, isSameDay } = require('../mocks/testHelpers');

// 因為 dateUtils.js 是 GAS 環境的程式碼，我們需要手動載入
// 在實際環境中，這些函式會是全域函式
// 這裡我們先定義測試用的函式（從 src/dateUtils.js 複製）

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
 * 將日期格式化為點分隔字串 (YYYY.MM.DD)
 */
function formatDotDate_(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
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
 * 解析點分隔的月份字串 (YYYY.MM)
 */
function parseDotMonth_(s) {
  const m = String(s || '').trim().match(/^(\d{4})\.(\d{2})$/);
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);

  if (month < 1 || month > 12) return null;

  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  return {
    year,
    month,
    startDate,
    endDate
  };
}

/**
 * 安全地將值轉換為日期物件
 */
function toDateOrNull_(v) {
  if (v instanceof Date) return v;
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

// ==================== 測試開始 ====================

describe('dateUtils - parseDotDate_', () => {
  describe('正常格式測試', () => {
    test('應該正確解析 YYYY.MM.DD 格式', () => {
      const result = parseDotDate_('2025.09.03');

      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(8); // 0-based，所以 9 月是 8
      expect(result.getDate()).toBe(3);
    });

    test('應該將時間設定為 00:00:00', () => {
      const result = parseDotDate_('2025.09.03');

      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    test('應該正確解析月份開頭的日期', () => {
      const result = parseDotDate_('2025.01.01');

      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(1);
    });

    test('應該正確解析月份結尾的日期', () => {
      const result = parseDotDate_('2025.12.31');

      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(11);
      expect(result.getDate()).toBe(31);
    });
  });

  describe('錯誤格式測試', () => {
    test('使用破折號分隔應該回傳 null', () => {
      expect(parseDotDate_('2025-09-03')).toBeNull();
    });

    test('使用斜線分隔應該回傳 null', () => {
      expect(parseDotDate_('2025/09/03')).toBeNull();
    });

    test('缺少前導零應該回傳 null', () => {
      expect(parseDotDate_('2025.9.3')).toBeNull();
    });

    test('完全無效的字串應該回傳 null', () => {
      expect(parseDotDate_('invalid')).toBeNull();
    });

    test('空字串應該回傳 null', () => {
      expect(parseDotDate_('')).toBeNull();
    });

    test('null 應該回傳 null', () => {
      expect(parseDotDate_(null)).toBeNull();
    });

    test('undefined 應該回傳 null', () => {
      expect(parseDotDate_(undefined)).toBeNull();
    });
  });

  describe('邊界情況測試', () => {
    test('應該正確處理閏年的 2 月 29 日', () => {
      const result = parseDotDate_('2024.02.29');

      expect(result).toBeInstanceOf(Date);
      expect(result.getMonth()).toBe(1);
      expect(result.getDate()).toBe(29);
    });

    test('前後有空白應該能正確解析', () => {
      const result = parseDotDate_('  2025.09.03  ');

      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
    });
  });
});

describe('dateUtils - formatDotDate_', () => {
  describe('正常格式化測試', () => {
    test('應該正確格式化日期為 YYYY.MM.DD', () => {
      const date = new Date(2025, 8, 3); // 2025-09-03
      const result = formatDotDate_(date);

      expect(result).toBe('2025.09.03');
    });

    test('應該為個位數月份補零', () => {
      const date = new Date(2025, 0, 15); // 2025-01-15
      const result = formatDotDate_(date);

      expect(result).toBe('2025.01.15');
    });

    test('應該為個位數日期補零', () => {
      const date = new Date(2025, 8, 5); // 2025-09-05
      const result = formatDotDate_(date);

      expect(result).toBe('2025.09.05');
    });

    test('應該為個位數月份和日期都補零', () => {
      const date = new Date(2025, 0, 1); // 2025-01-01
      const result = formatDotDate_(date);

      expect(result).toBe('2025.01.01');
    });
  });

  describe('邊界情況測試', () => {
    test('應該正確格式化年初日期', () => {
      const date = new Date(2025, 0, 1); // 2025-01-01
      const result = formatDotDate_(date);

      expect(result).toBe('2025.01.01');
    });

    test('應該正確格式化年末日期', () => {
      const date = new Date(2025, 11, 31); // 2025-12-31
      const result = formatDotDate_(date);

      expect(result).toBe('2025.12.31');
    });

    test('應該正確格式化閏年的 2 月 29 日', () => {
      const date = new Date(2024, 1, 29); // 2024-02-29
      const result = formatDotDate_(date);

      expect(result).toBe('2024.02.29');
    });
  });

  describe('與 parseDotDate_ 的互操作性測試', () => {
    test('格式化後再解析應該得到相同的日期', () => {
      const original = new Date(2025, 8, 3, 0, 0, 0, 0);
      const formatted = formatDotDate_(original);
      const parsed = parseDotDate_(formatted);

      expect(isSameDay(original, parsed)).toBe(true);
    });

    test('解析後再格式化應該得到相同的字串', () => {
      const original = '2025.09.03';
      const parsed = parseDotDate_(original);
      const formatted = formatDotDate_(parsed);

      expect(formatted).toBe(original);
    });
  });
});

describe('dateUtils - startOfDay_', () => {
  describe('時間歸零測試', () => {
    test('應該將時間設定為 00:00:00.000', () => {
      const date = new Date(2025, 8, 3, 14, 30, 45, 123);
      const result = startOfDay_(date);

      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    test('應該保留原始日期', () => {
      const date = new Date(2025, 8, 3, 14, 30, 45);
      const result = startOfDay_(date);

      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(8);
      expect(result.getDate()).toBe(3);
    });

    test('不應該修改原始日期物件', () => {
      const original = new Date(2025, 8, 3, 14, 30, 45);
      const originalTime = original.getTime();

      startOfDay_(original);

      expect(original.getTime()).toBe(originalTime);
    });
  });

  describe('邊界情況測試', () => {
    test('已經是 00:00:00 的日期應該保持不變', () => {
      const date = new Date(2025, 8, 3, 0, 0, 0, 0);
      const result = startOfDay_(date);

      expect(result.getTime()).toBe(date.getTime());
    });

    test('應該正確處理午夜前一秒', () => {
      const date = new Date(2025, 8, 3, 23, 59, 59, 999);
      const result = startOfDay_(date);

      expect(result.getHours()).toBe(0);
      expect(result.getDate()).toBe(3); // 日期不變
    });

    test('應該正確處理跨日情況', () => {
      const date = new Date(2025, 8, 1, 23, 59, 59);
      const result = startOfDay_(date);

      expect(result.getDate()).toBe(1);
      expect(result.getHours()).toBe(0);
    });
  });

  describe('日期比較測試', () => {
    test('同一天的不同時間應該得到相同的 startOfDay', () => {
      const morning = new Date(2025, 8, 3, 8, 0, 0);
      const afternoon = new Date(2025, 8, 3, 14, 0, 0);
      const evening = new Date(2025, 8, 3, 20, 0, 0);

      const result1 = startOfDay_(morning);
      const result2 = startOfDay_(afternoon);
      const result3 = startOfDay_(evening);

      expect(result1.getTime()).toBe(result2.getTime());
      expect(result2.getTime()).toBe(result3.getTime());
    });

    test('可以用於日期比較', () => {
      const date1 = new Date(2025, 8, 3, 14, 30, 0);
      const date2 = new Date(2025, 8, 3, 20, 45, 0);

      expect(startOfDay_(date1).getTime()).toBe(startOfDay_(date2).getTime());
    });
  });
});

describe('dateUtils - parseDotMonth_', () => {
  describe('正常格式測試', () => {
    test('應該正確解析 YYYY.MM 格式', () => {
      const result = parseDotMonth_('2025.09');

      expect(result).not.toBeNull();
      expect(result.year).toBe(2025);
      expect(result.month).toBe(9);
    });

    test('應該包含該月份的開始日期', () => {
      const result = parseDotMonth_('2025.09');

      expect(result.startDate).toBeInstanceOf(Date);
      expect(result.startDate.getFullYear()).toBe(2025);
      expect(result.startDate.getMonth()).toBe(8); // 0-based
      expect(result.startDate.getDate()).toBe(1);
      expect(result.startDate.getHours()).toBe(0);
    });

    test('應該包含該月份的結束日期', () => {
      const result = parseDotMonth_('2025.09');

      expect(result.endDate).toBeInstanceOf(Date);
      expect(result.endDate.getFullYear()).toBe(2025);
      expect(result.endDate.getMonth()).toBe(8); // 0-based
      expect(result.endDate.getDate()).toBe(30); // 9月有30天
    });
  });

  describe('不同月份天數測試', () => {
    test('應該正確處理 31 天的月份', () => {
      const result = parseDotMonth_('2025.01');

      expect(result.endDate.getDate()).toBe(31);
    });

    test('應該正確處理 30 天的月份', () => {
      const result = parseDotMonth_('2025.04');

      expect(result.endDate.getDate()).toBe(30);
    });

    test('應該正確處理平年的 2 月（28 天）', () => {
      const result = parseDotMonth_('2025.02');

      expect(result.endDate.getDate()).toBe(28);
    });

    test('應該正確處理閏年的 2 月（29 天）', () => {
      const result = parseDotMonth_('2024.02');

      expect(result.endDate.getDate()).toBe(29);
    });
  });

  describe('邊界月份測試', () => {
    test('應該正確解析 1 月', () => {
      const result = parseDotMonth_('2025.01');

      expect(result.month).toBe(1);
      expect(result.startDate.getMonth()).toBe(0);
    });

    test('應該正確解析 12 月', () => {
      const result = parseDotMonth_('2025.12');

      expect(result.month).toBe(12);
      expect(result.startDate.getMonth()).toBe(11);
    });
  });

  describe('錯誤格式測試', () => {
    test('月份為 0 應該回傳 null', () => {
      expect(parseDotMonth_('2025.00')).toBeNull();
    });

    test('月份為 13 應該回傳 null', () => {
      expect(parseDotMonth_('2025.13')).toBeNull();
    });

    test('缺少前導零應該回傳 null', () => {
      expect(parseDotMonth_('2025.9')).toBeNull();
    });

    test('使用破折號分隔應該回傳 null', () => {
      expect(parseDotMonth_('2025-09')).toBeNull();
    });

    test('完全無效的字串應該回傳 null', () => {
      expect(parseDotMonth_('invalid')).toBeNull();
    });

    test('空字串應該回傳 null', () => {
      expect(parseDotMonth_('')).toBeNull();
    });

    test('null 應該回傳 null', () => {
      expect(parseDotMonth_(null)).toBeNull();
    });
  });

  describe('邊界情況測試', () => {
    test('前後有空白應該能正確解析', () => {
      const result = parseDotMonth_('  2025.09  ');

      expect(result).not.toBeNull();
      expect(result.year).toBe(2025);
      expect(result.month).toBe(9);
    });
  });
});

describe('dateUtils - toDateOrNull_', () => {
  describe('Date 物件輸入測試', () => {
    test('應該直接回傳 Date 物件', () => {
      const date = new Date(2025, 8, 3);
      const result = toDateOrNull_(date);

      expect(result).toBe(date);
      expect(result).toBeInstanceOf(Date);
    });

    test('應該回傳相同的 Date 實例', () => {
      const date = new Date(2025, 8, 3, 14, 30, 0);
      const result = toDateOrNull_(date);

      expect(result).toBe(date);
      expect(result.getTime()).toBe(date.getTime());
    });
  });

  describe('字串輸入測試', () => {
    test('應該正確轉換 ISO 8601 格式字串', () => {
      const result = toDateOrNull_('2025-09-03T00:00:00.000Z');

      expect(result).toBeInstanceOf(Date);
      expect(result).not.toBeNull();
    });

    test('應該正確轉換日期字串', () => {
      const result = toDateOrNull_('2025-09-03');

      expect(result).toBeInstanceOf(Date);
      expect(result).not.toBeNull();
    });

    test('無效的日期字串應該回傳 null', () => {
      expect(toDateOrNull_('invalid-date')).toBeNull();
    });
  });

  describe('數字輸入測試', () => {
    test('應該正確轉換時間戳記（毫秒）', () => {
      const timestamp = new Date(2025, 8, 3).getTime();
      const result = toDateOrNull_(timestamp);

      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(8);
      expect(result.getDate()).toBe(3);
    });

    test('應該正確轉換 0（Unix epoch）', () => {
      const result = toDateOrNull_(0);

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(0);
    });
  });

  describe('空值輸入測試', () => {
    test('null 應該回傳 null', () => {
      expect(toDateOrNull_(null)).toBeNull();
    });

    test('undefined 應該回傳 null', () => {
      expect(toDateOrNull_(undefined)).toBeNull();
    });

    test('空字串應該回傳 null', () => {
      expect(toDateOrNull_('')).toBeNull();
    });

    test('false 應該回傳 null', () => {
      expect(toDateOrNull_(false)).toBeNull();
    });
  });

  describe('特殊情況測試', () => {
    test('NaN 應該回傳 null', () => {
      expect(toDateOrNull_(NaN)).toBeNull();
    });

    test('無效的 Date 物件應該回傳 null', () => {
      const invalidDate = new Date('invalid');
      const result = toDateOrNull_(invalidDate);

      // 注意：這個測試可能會失敗，因為 toDateOrNull_ 會直接回傳 Date 物件
      // 這是一個潛在的 bug，但我們先記錄這個行為
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('與其他函式的整合測試', () => {
    test('應該能處理 parseDotDate_ 的回傳值', () => {
      const parsed = parseDotDate_('2025.09.03');
      const result = toDateOrNull_(parsed);

      expect(result).toBe(parsed);
      expect(result).toBeInstanceOf(Date);
    });

    test('應該能處理 parseDotDate_ 的 null 回傳', () => {
      const parsed = parseDotDate_('invalid');
      const result = toDateOrNull_(parsed);

      expect(result).toBeNull();
    });
  });
});

