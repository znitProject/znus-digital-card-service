const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('contact phone type scales from the card rather than the browser viewport', () => {
  const design = fs.readFileSync(path.resolve(__dirname, '../cardDesign/명함_디자인/index.html'), 'utf8');
  assert.match(design, /\.phone-number\s*\{[\s\S]*?font-size:\s*clamp\(52px,\s*26cqw,\s*104px\)/);
  assert.doesNotMatch(design, /font-size:\s*clamp\(92px,\s*64vw/);
});
