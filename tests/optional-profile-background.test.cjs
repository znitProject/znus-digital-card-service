const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('profile background is optional in both the save flow and form labels', () => {
  const server = fs.readFileSync(path.resolve(__dirname, '../server/index.cjs'), 'utf8');
  const input = fs.readFileSync(path.resolve(__dirname, '../server/views/input.html'), 'utf8');
  assert.doesNotMatch(server, /프로필 페이지의 배경 이미지 또는 MP4 영상을 먼저 업로드/);
  assert.match(input, /addRequirementBadge\(item\.querySelector\('\.background-item__title'\),false\)/);
  assert.match(input, /배경 이미지 또는 영상은 모두 선택 입력/);
});
