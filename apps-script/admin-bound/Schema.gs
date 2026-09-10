const ZNUS_SCHEMA = {
  Cards: [
    'cardId', 'googleAccountEmail', 'publicToken', 'published', 'isActive',
    'nameKo', 'nameEn', 'department', 'jobTitleKo', 'jobTitleEn',
    'roleItem1Ko', 'roleItem2Ko', 'roleItem3Ko', 'roleItem4Ko', 'roleItem5Ko',
    'roleItem1En', 'roleItem2En', 'roleItem3En', 'roleItem4En', 'roleItem5En',
    'mobilePhone', 'publicEmail', 'profileImageFileId',
    'roleBackgroundMode', 'roleBackgroundFileId', 'contactBackgroundMode', 'contactBackgroundFileId',
    'companyBackgroundMode', 'companyBackgroundFileId', 'linksBackgroundMode', 'linksBackgroundFileId',
    'publicUrl', 'qrUrl', 'nfcStatus', 'formResponseId',
    'createdAt', 'updatedAt', 'processingStatus', 'errorMessage'
  ],
  CompanySettings: ['companyName', 'companyWebsite', 'companyPhone', 'companyFax',
    'officeAddress', 'companyLogoFileId', 'sloganLine1', 'sloganLine2', 'sloganLine3'],
  DeletedTokens: ['publicToken']
};
function sheetHeaders_(sheet) {
  return !sheet || sheet.getLastRow() === 0 ? [] :
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}
function inspectSchema_(sheet, name) {
  const headers = sheetHeaders_(sheet);
  if (!headers.length) return headers;
  if (headers.some(h => !h || h.trim() !== h) || new Set(headers).size !== headers.length)
    throw new Error(name + ': 빈 열 이름 또는 중복 열 이름을 정리하세요. 데이터는 변경하지 않았습니다.');
  if (name === 'Cards' && (headers.includes('slug') || headers.includes('sectionsJson')))
    throw new Error('기존 Cards 형식입니다. 원본을 보존한 뒤 별도 이관이 필요합니다. 초기 설정은 데이터를 삭제하지 않습니다.');
  if (name === 'Cards' && sheet.getLastRow() > 1 && ZNUS_SCHEMA.Cards.some(h => !headers.includes(h)))
    throw new Error('Cards 데이터에 필수 열이 누락되었습니다. 식별자나 상태를 추정하지 않습니다. 이관이 필요합니다.');
  if (name === 'DeletedTokens' && (headers.length !== 1 || headers[0] !== 'publicToken'))
    throw new Error('DeletedTokens에는 publicToken 한 열만 허용합니다.');
  if (name === 'CompanySettings' && sheet.getLastRow() > 2)
    throw new Error('CompanySettings는 설정 한 행만 사용합니다.');
  return headers;
}
function ensureSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const headers = inspectSchema_(sheet, name);
  const missing = ZNUS_SCHEMA[name].filter(h => !headers.includes(h));
  if (missing.length) {
    const count = headers.length + missing.length;
    if (sheet.getMaxColumns() < count) sheet.insertColumnsAfter(sheet.getMaxColumns(), count - sheet.getMaxColumns());
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#17213b').setFontColor('#ffffff');
  return sheet;
}
function workspace_() {
  const id = PropertiesService.getScriptProperties().getProperty('ZNUS_SPREADSHEET_ID');
  if (!id) throw new Error('setupWorkspace를 먼저 실행하세요.');
  return SpreadsheetApp.openById(id);
}
function withWorkspaceLock_(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return action(); }
  finally { try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); } }
}
function readRecords_(sheet, name) {
  if (!sheet) throw new Error(name + ' 시트가 없습니다.');
  const headers = inspectSchema_(sheet, name);
  if (ZNUS_SCHEMA[name].some(h => !headers.includes(h))) throw new Error(name + ': 초기 설정이 필요합니다.');
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    .map((values, i) => ({ row: i + 2, value: Object.fromEntries(headers.map((h, j) => [h, values[j]])) }))
    .filter(record => Object.values(record.value).some(v => v !== ''));
}
/** Text format preserves leading zeroes; escaping prevents Sheets formulas. */
function sheetValue_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}
function writeRecord_(sheet, name, record, row) {
  const headers = inspectSchema_(sheet, name);
  if (ZNUS_SCHEMA[name].some(h => !headers.includes(h))) throw new Error(name + ': 초기 설정이 필요합니다.');
  const target = row || sheet.getLastRow() + 1;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), target - sheet.getMaxRows());
  const range = sheet.getRange(target, 1, 1, headers.length);
  range.setNumberFormat('@');
  range.setValues([headers.map(h => sheetValue_(record[h] == null ? '' : record[h]))]);
}
