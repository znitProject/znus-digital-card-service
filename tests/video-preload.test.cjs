const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('card videos preload before the intro finishes and only the active card plays', () => {
  const design = fs.readFileSync(path.resolve(__dirname, '../cardDesign/명함_디자인/index.html'), 'utf8');
  const server = fs.readFileSync(path.resolve(__dirname, '../server/index.cjs'), 'utf8');

  assert.match(design, /video\.preload = "auto"/);
  assert.match(design, /if\(video\.readyState === 0\)\{\s*video\.load\(\);/);
  assert.match(design, /bufferedEnd >= duration - \.25/);
  assert.match(server, /element\.pause\(\);element\.preload='auto';element\.load\(\)/);
});
