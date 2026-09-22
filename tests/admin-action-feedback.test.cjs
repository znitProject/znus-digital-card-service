const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin state actions show progress, confirmation, and completion feedback', () => {
  const admin = fs.readFileSync(path.resolve(__dirname, '../server/views/admin.html'), 'utf8');

  assert.match(admin, /id="activityButton"/);
  assert.match(admin, /비공개 처리 중\.\.\./);
  assert.match(admin, /비활성화 중\.\.\./);
  assert.match(admin, /영구 삭제 중\.\.\./);
  assert.match(admin, /showActionNotice\('명함과 업로드한 미디어를 영구 삭제했습니다\.'/);
  assert.match(admin, /공개 명함과 입력 접근이 중지됩니다/);
});
