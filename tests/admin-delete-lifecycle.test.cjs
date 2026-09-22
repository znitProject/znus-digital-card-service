const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin separates private cards from irreversible hard deletion', () => {
  const server = fs.readFileSync(path.resolve(__dirname, '../server/index.cjs'), 'utf8');
  const admin = fs.readFileSync(path.resolve(__dirname, '../server/views/admin.html'), 'utf8');

  assert.match(server, /private: \{status: 'ACTIVE', published: false\}/);
  assert.match(server, /DELETE FROM employees WHERE id=\$1/);
  assert.match(server, /SELECT storage_key FROM media_assets WHERE employee_id=\$1/);
  assert.match(server, /deleteEmployeeMedia\(asset\.storage_key\)/);
  assert.match(admin, /비공개로 전환/);
  assert.match(admin, /명함과 업로드한 미디어를 영구 삭제/);
  assert.doesNotMatch(admin, /삭제 후에는 복구 메뉴에서만 되돌릴 수 있습니다/);
});
