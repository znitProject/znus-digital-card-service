const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('Form response sheet has exactly four system columns', () => {
  const source = read('apps-script/admin-bound/Schema.gs');
  assert.match(source, /ZNUS_EMPLOYEE_SCHEMA = \['publicToken', 'formResponseId', 'processingStatus', 'errorMessage'\]/);
  for (const legacy of ['cardId', 'published', 'isActive', 'publicUrl', 'qrUrl', 'nfcStatus', 'createdAt', 'updatedAt']) {
    assert.doesNotMatch(source, new RegExp("'" + legacy + "'"));
  }
});

test('submit handler preserves Form cells and only writes the hidden system cells', () => {
  const source = read('apps-script/admin-bound/FormAutomation.gs');
  const handler = source.slice(source.indexOf('function onFormSubmitCard(e)'), source.indexOf('function formCard_(row)'));
  assert.match(handler, /writeEmployeeSystem_\(sheet, targetRow/);
  assert.doesNotMatch(handler, /formWrite_\(/);
  assert.match(handler, /existing && existing\.row !== targetRow.*sheet\.deleteRow/s);
  assert.match(handler, /old\.publicToken/);
});

test('Form response settings use one account response with response editing', () => {
  const source = read('apps-script/admin-bound/FormAutomation.gs');
  const setup = source.slice(source.indexOf('function setupFormAutomationForm()'), source.indexOf('function legacySetupFormAutomationForm_'));
  assert.match(setup, /setLimitOneResponsePerUser\(true\)/);
  assert.match(setup, /setAllowResponseEdits\(true\)/);
  assert.match(setup, /setShowLinkToRespondAgain\(false\)/);
  assert.doesNotMatch(setup, /deleteItem/);
});

test('public card and media read live Form rows and reject deleted rows', () => {
  const source = read('apps-script/public-web/Code.gs');
  const getter = source.slice(source.indexOf('function getPublicCard(token)'), source.indexOf('function legacyGetPublicCard_'));
  assert.match(getter, /publicRows_\(ss\.getSheetByName\('설문지 응답 시트1'\)\)/);
  assert.match(getter, /map\(publicEmployeeCard_\)\.find/);
  assert.match(getter, /card\.processingStatus !== 'COMPLETED'/);
  assert.doesNotMatch(getter, /published|isActive|cardId/);
});

test('the card QR is generated from the resolved public URL', () => {
  const source = read('apps-script/public-web/Card.html');
  const qr = source.slice(source.indexOf('function createQRCode()'), source.indexOf('/* =========================================================\n   MAP MODAL', source.indexOf('function createQRCode()')));
  assert.match(qr, /text:\s*ZNUS\.url\(\)/);
  assert.match(source, /url: \(\) => card\?\.publicUrl \|\| ''/);
});
