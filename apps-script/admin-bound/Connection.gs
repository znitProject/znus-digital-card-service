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
