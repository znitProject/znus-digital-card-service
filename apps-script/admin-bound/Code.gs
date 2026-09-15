/** Sheet-bound administration only. Never deploy as a public web app. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ZNUS 명함 서비스')
    .addItem('명함 관리', 'showAdminDashboard')
    .addItem('운영 기반 확인', 'showAdminSidebar')
    .addItem('초기 설정 / 점검', 'setupWorkspace').addToUi();
}
function showAdminSidebar() {
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('ZNUS 운영 기반'));
}
/** Repeatable; preflight ALL schemas before mutating anything. */
function setupWorkspace() {
  return withWorkspaceLock_(function () {
    const ss = SpreadsheetApp.getActive();
    if (!ss) throw new Error('운영 Google Sheet에 바인드된 스크립트에서 실행하세요.');
    workspaceSchemaNames_().forEach(name => inspectSchema_(ss.getSheetByName(name), name));
    workspaceSchemaNames_().forEach(name => ensureSheet_(ss, name));
    const folders = ensureWorkspaceFolders_();
    PropertiesService.getScriptProperties().setProperties({
      ZNUS_SPREADSHEET_ID: ss.getId(), ZNUS_SCHEMA_VERSION: '1'
    });
    return workspaceInfo_(ss, folders);
  });
}
function getWorkspaceInfo() { return workspaceInfo_(workspace_(), readFolderConfig_()); }
function workspaceInfo_(ss, folders) {
  return {
    spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl(), folders: folders,
    schemaVersion: PropertiesService.getScriptProperties().getProperty('ZNUS_SCHEMA_VERSION'),
    cardCount: readRecords_(employeeSheet_(ss), ZNUS_EMPLOYEE_SHEET).length,
    deletedTokenCount: readRecords_(ss.getSheetByName('DeletedTokens'), 'DeletedTokens').length,
    publicBaseUrl: PropertiesService.getScriptProperties().getProperty('ZNUS_PUBLIC_BASE_URL') || '',
    message: '직원 수정은 Google Form, 조회는 설문지 응답 시트1의 직원 행으로 처리합니다. 직원 행 삭제 전 publicToken을 DeletedTokens에 보존하세요.'
  };
}
