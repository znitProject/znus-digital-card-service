const ZNUS_EMPLOYEE_SHEET = '설문지 응답 시트1';
// Form-owned columns stay exactly as Forms creates them. Only these four
// implementation columns are appended and hidden at the right edge.
const ZNUS_EMPLOYEE_SCHEMA = ['publicToken', 'formResponseId', 'processingStatus', 'errorMessage'];
const ZNUS_SCHEMA = {
  // The employee master is the Form response sheet itself. Cards is not part
  // of the workspace schema and is never created by setup.
  [ZNUS_EMPLOYEE_SHEET]: ZNUS_EMPLOYEE_SCHEMA,
  CompanySettings: ['companyName', 'companyWebsite', 'companyPhone', 'companyFax',
    'officeAddress', 'companyLogoFileId', 'sloganLine1', 'sloganLine2', 'sloganLine3'],
  DeletedTokens: ['publicToken']
};
const ZNUS_LEGACY_CARDS_SCHEMA = ZNUS_EMPLOYEE_SCHEMA;
function schema_(name) { return name === 'Cards' ? ZNUS_LEGACY_CARDS_SCHEMA : ZNUS_SCHEMA[name]; }
function employeeSheet_(ss) {
  const sheet = ss.getSheetByName(ZNUS_EMPLOYEE_SHEET);
  if (!sheet) throw new Error(ZNUS_EMPLOYEE_SHEET + ' 탭이 필요합니다. Form 응답 저장 위치를 확인하세요.');
  return sheet;
}
function workspaceSchemaNames_() { return [ZNUS_EMPLOYEE_SHEET, 'CompanySettings', 'DeletedTokens']; }
function sheetHeaders_(sheet) {
  return !sheet || sheet.getLastRow() === 0 ? [] :
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}
function inspectSchema_(sheet, name) {
  const headers = sheetHeaders_(sheet);
  if (!headers.length) return headers;
  if (headers.some(h => !h || h.trim() !== h) || new Set(headers).size !== headers.length)
    throw new Error(name + ': 빈 열 이름 또는 중복 열 이름을 정리하세요. 데이터는 변경하지 않았습니다.');
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
  const missing = schema_(name).filter(h => !headers.includes(h));
  if (missing.length) {
    const count = headers.length + missing.length;
    if (sheet.getMaxColumns() < count) sheet.insertColumnsAfter(sheet.getMaxColumns(), count - sheet.getMaxColumns());
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#17213b').setFontColor('#ffffff');
  if (name === ZNUS_EMPLOYEE_SHEET && typeof sheet.hideColumns === 'function') {
    const currentHeaders = sheetHeaders_(sheet);
    ZNUS_EMPLOYEE_SCHEMA.forEach(function (header) {
      const column = currentHeaders.indexOf(header) + 1;
      if (column) sheet.hideColumns(column);
    });
  }
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
  if (schema_(name).some(h => !headers.includes(h))) throw new Error(name + ': 초기 설정이 필요합니다.');
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
  if (schema_(name).some(h => !headers.includes(h))) throw new Error(name + ': 초기 설정이 필요합니다.');
  const target = row || sheet.getLastRow() + 1;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), target - sheet.getMaxRows());
  const range = sheet.getRange(target, 1, 1, headers.length);
  const previous = target <= sheet.getLastRow() ? range.getValues()[0] : [];
  const systemHeaders = new Set(schema_(name));
  headers.forEach((header, index) => {
    if (systemHeaders.has(header)) sheet.getRange(target, index + 1, 1, 1).setNumberFormat('@');
  });
  range.setValues([headers.map((h, i) => Object.prototype.hasOwnProperty.call(record, h)
    ? sheetValue_(record[h] == null ? '' : record[h]) : (previous[i] == null ? '' : previous[i]))]);
}
/** Write only the four implementation cells; Form-owned cells stay untouched. */
function writeEmployeeSystem_(sheet, row, values) {
  const headers = sheetHeaders_(sheet);
  ZNUS_EMPLOYEE_SCHEMA.forEach(function (header) {
    if (!Object.prototype.hasOwnProperty.call(values, header)) return;
    const column = headers.indexOf(header) + 1;
    if (!column) throw new Error('시스템 열이 없습니다: ' + header);
    sheet.getRange(row, column, 1, 1).setNumberFormat('@').setValues([[sheetValue_(values[header] == null ? '' : values[header])]]);
  });
}
