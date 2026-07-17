/**
 * userService 測試
 *
 * 測試顯示名稱解析：
 * LINE 暱稱是使用者隨時可改的，且 username 欄位是借用當下的快照。
 * 對照表讓共用視圖（日曆、查器材）顯示認得出來的名字。
 *
 * 三段 fallback：對照表 → fallbackUsername → userId
 */

// ==================== 從 src/userService.js 複製 ====================

/**
 * 解析使用者的顯示名稱
 */
function resolveDisplayName_(userId, fallbackUsername, nameMap) {
  const map = nameMap || {};
  const uid = String(userId || '').trim();

  if (uid && map[uid]) return map[uid];
  return fallbackUsername || userId || '';
}

// ==================== 測試開始 ====================

describe('userService - resolveDisplayName_', () => {
  const nameMap = {
    U1111111111111111: '張小明',
    U2222222222222222: '李小華'
  };

  describe('對照表命中', () => {
    test('命中對照表時應該回傳指定名稱', () => {
      expect(resolveDisplayName_('U1111111111111111', '阿明🌀', nameMap)).toBe('張小明');
    });

    test('對照表應該優先於 username', () => {
      expect(resolveDisplayName_('U2222222222222222', '華仔', nameMap)).toBe('李小華');
    });

    test('userId 前後有空白時仍應該命中對照表', () => {
      expect(resolveDisplayName_('  U1111111111111111  ', '阿明🌀', nameMap)).toBe('張小明');
    });
  });

  describe('三段 fallback', () => {
    test('未命中對照表時應該退回 username', () => {
      expect(resolveDisplayName_('U9999999999999999', '路人甲', nameMap)).toBe('路人甲');
    });

    test('未命中且 username 為空時應該退回 userId', () => {
      expect(resolveDisplayName_('U9999999999999999', '', nameMap)).toBe('U9999999999999999');
    });

    test('未命中且 username 為 null 時應該退回 userId', () => {
      expect(resolveDisplayName_('U9999999999999999', null, nameMap)).toBe('U9999999999999999');
    });

    test('全部都空時應該回傳空字串而非 undefined', () => {
      expect(resolveDisplayName_('', '', {})).toBe('');
    });
  });

  describe('對照表異常時的容錯', () => {
    test('對照表為 null 時應該退回 username 而非拋錯', () => {
      expect(resolveDisplayName_('U1111111111111111', '阿明🌀', null)).toBe('阿明🌀');
    });

    test('對照表為 undefined 時應該退回 username 而非拋錯', () => {
      expect(resolveDisplayName_('U1111111111111111', '阿明🌀', undefined)).toBe('阿明🌀');
    });

    test('對照表為空物件時應該退回 username', () => {
      // users 分頁不存在時 getUserDisplayNameMap_ 會回傳 {}
      expect(resolveDisplayName_('U1111111111111111', '阿明🌀', {})).toBe('阿明🌀');
    });
  });

  describe('實際使用情境', () => {
    test('使用者改了 LINE 暱稱後，對照表仍應該顯示一致的名字', () => {
      // username 是借用當下的快照，同一個人在不同紀錄可能有不同暱稱
      const oldRecord = resolveDisplayName_('U1111111111111111', '阿明', nameMap);
      const newRecord = resolveDisplayName_('U1111111111111111', '明哥🔥', nameMap);

      expect(oldRecord).toBe('張小明');
      expect(newRecord).toBe('張小明');
    });

    test('未登錄在對照表的臨時使用者應該顯示其 LINE 暱稱', () => {
      expect(resolveDisplayName_('U8888888888888888', '臨時工讀生', nameMap)).toBe('臨時工讀生');
    });
  });
});
