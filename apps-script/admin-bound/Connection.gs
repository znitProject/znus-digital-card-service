/** Connect an existing Form without rebuilding questions or installing a second trigger. */
function connectExistingForm(formId) {
  const id = fileId_(formId, '입력 설문 ID');
  return withWorkspaceLock_(function () {
    const ss = SpreadsheetApp.getActive();
    if (!ss) throw new Error('운영 시트에 바인드된 Apps Script에서 실행해 주세요.');
    const props = PropertiesService.getScriptProperties();
    const previousSheet = props.getProperty('ZNUS_SPREADSHEET_ID');
    const previousForm = props.getProperty('ZNUS_FORM_ID');
    if (previousSheet && previousSheet !== ss.getId()) throw new Error('이미 다른 시트에 연결되어 있습니다. 기존 연결을 이전하는 절차가 필요합니다.');
    if (previousForm && previousForm !== id) throw new Error('이미 다른 설문에 연결되어 있습니다. 기존 연결을 이전하는 절차가 필요합니다.');
    const form = FormApp.openById(id);
    if (form.getDestinationId() !== ss.getId()) throw new Error('이 설문의 응답 저장 위치가 현재 시트와 다릅니다. 설문의 응답 연결을 확인해 주세요.');
    if (!form.collectsEmail()) throw new Error('설문에서 Google 계정 이메일 수집을 먼저 켜 주세요.');
    Object.keys(ZNUS_SCHEMA).forEach(name => inspectSchema_(ss.getSheetByName(name), name));
    props.setProperties({ZNUS_SPREADSHEET_ID: ss.getId(), ZNUS_FORM_ID: id});
    return {spreadsheetUrl: ss.getUrl(), formEditUrl: form.getEditUrl(),
      message: '연결을 저장했습니다. 기존 프로젝트의 제출 트리거를 확인한 후 이 프로젝트로 이전해 주세요. 질문과 트리거는 변경하지 않았습니다.'};
  });
}

/** Read-only audit: project triggers are visible only for the current user/project. */
// Run once with the Drive folder containing the four original default MP4s.
// These are shared design assets, separate from employee Form uploads.
function connectDefaultBackgroundFolder(folderId) {
  const folder = DriveApp.getFolderById(fileId_(folderId, '기본 영상 폴더'));
  const files = {role:'role.mp4', contact:'contact.mp4', company:'web.mp4', links:'links.mp4'};
  const configured = {};
  Object.keys(files).forEach(function (key) {
    const matches = folder.getFilesByName(files[key]);
    if (!matches.hasNext()) throw new Error(files[key] + ': 기본 영상이 없습니다.');
    const file = matches.next();
    if (matches.hasNext()) throw new Error(files[key] + ': 같은 이름의 파일이 여러 개입니다.');
    if (file.isTrashed() || file.getMimeType() !== 'video/mp4' || file.getSize() <= 0 || file.getSize() > 18 * 1024 * 1024)
      throw new Error(files[key] + ': MP4 파일과 크기를 확인하세요.');
    configured[key + 'DefaultVideoFileId'] = file.getId();
  });
  return withWorkspaceLock_(function () {
    const sheet = workspace_().getSheetByName('CompanySettings');
    const rows = readRecords_(sheet, 'CompanySettings');
    const headers = sheetHeaders_(sheet);
    const missing = Object.keys(configured).filter(key => !headers.includes(key));
    if (missing.length) {
      const count = headers.length + missing.length;
      if (sheet.getMaxColumns() < count) sheet.insertColumnsAfter(sheet.getMaxColumns(), count - sheet.getMaxColumns());
      sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    }
    writeRecord_(sheet, 'CompanySettings', Object.assign({}, rows.length ? rows[0].value : {}, configured), 2);
    return configured;
  });
}

function inspectFormConnection() {
  const sheetId = formSpreadsheetId_(), id = formId_();
  const form = FormApp.openById(id);
  if (form.getDestinationId() !== sheetId) throw new Error('설문의 응답 저장 위치가 설정한 시트와 다릅니다.');
  return {
    spreadsheetId: sheetId, formId: id, collectsEmail: form.collectsEmail(),
    triggers: ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'onFormSubmitCard')
      .map(trigger => ({sourceId: trigger.getTriggerSourceId(), eventType: String(trigger.getEventType())})),
    message: '현재 계정과 프로젝트에서 보이는 트리거만 표시됩니다. 이전 프로젝트에 남은 트리거도 확인해야 합니다.'
  };
}
