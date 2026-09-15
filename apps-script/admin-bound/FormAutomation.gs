// Each account supplies its own connection. Never fall back to another account's IDs.
function formSpreadsheetId_() { return formConnectionId_('ZNUS_SPREADSHEET_ID'); }
function formId_() { return formConnectionId_('ZNUS_FORM_ID'); }
function formConnectionId_(key) {
  const id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(key + ' 연결 설정을 먼저 확인해 주세요.');
  return id;
}
const FORM_BG_KEYS = ['role','contact','company','links'];
const FORM_REQUIRED = ['nameKo','nameEn','department','jobTitleKo','jobTitleEn','roleItem1Ko','roleItem2Ko','roleItem3Ko','roleItem4Ko','roleItem5Ko','roleItem1En','roleItem2En','roleItem3En','roleItem4En','roleItem5En'];
const FORM_UPLOAD_KEYS = ['profileImageFileId'].concat(FORM_BG_KEYS.map(function (key) { return key + 'BackgroundFileId'; }));
const FORM_QUESTION_TITLES = {
  nameKo: '이름 (국문)', nameEn: '이름 (영문)', department: '부서', jobTitleKo: '직책 (국문)', jobTitleEn: '직책 (영문)',
  roleItem1Ko: '주요 업무 1 (국문)', roleItem2Ko: '주요 업무 2 (국문)', roleItem3Ko: '주요 업무 3 (국문)', roleItem4Ko: '주요 업무 4 (국문)', roleItem5Ko: '주요 업무 5 (국문)',
  roleItem1En: '주요 업무 1 (영문)', roleItem2En: '주요 업무 2 (영문)', roleItem3En: '주요 업무 3 (영문)', roleItem4En: '주요 업무 4 (영문)', roleItem5En: '주요 업무 5 (영문)',
  mobilePhone: '공개 휴대전화', publicEmail: '공개 이메일', profileImageFileId: '프로필 사진 또는 영상',
  roleBackgroundMode: '직무 카드 배경', contactBackgroundMode: '연락처 카드 배경', companyBackgroundMode: '회사 카드 배경', linksBackgroundMode: '링크 카드 배경',
  roleBackgroundFileId: '직무 카드 배경 파일', contactBackgroundFileId: '연락처 카드 배경 파일', companyBackgroundFileId: '회사 카드 배경 파일', linksBackgroundFileId: '링크 카드 배경 파일'
};
const FORM_MODE_LABELS = { '현재 배경 유지 / 첨부 파일 적용': 'AUTO', '기본 디자인 사용': 'DEFAULT', '이미지로 변경': 'IMAGE', '영상으로 변경': 'VIDEO' };

// 최초 1회만 실행합니다. 필요한 Google 권한을 한 번에 승인하고,
// 데이터 시트·입력 Form·제출 트리거를 모두 구성합니다.
function setupFormAutomationAll() {
  const spreadsheetUrl = setupFormAutomationWorkspace();
  const form = setupFormAutomationForm();
  return {
    spreadsheetUrl: spreadsheetUrl,
    formEditUrl: form.editUrl,
    formPublishedUrl: form.publishedUrl,
    formItemCount: form.itemCount
  };
}

function setupFormAutomationWorkspace() {
  return withWorkspaceLock_(function () {
    const ss = SpreadsheetApp.openById(formSpreadsheetId_());
    workspaceSchemaNames_().forEach(name => inspectSchema_(ss.getSheetByName(name), name));
    workspaceSchemaNames_().forEach(name => ensureSheet_(ss, name));
    PropertiesService.getScriptProperties().setProperties({ ZNUS_SCHEMA_VERSION: '1' });
    ensureWorkspaceFolders_();
    return ss.getUrl();
  });
}

/** Keep the already approved Form questions; configure only response behavior. */
function setupFormAutomationForm() {
  const form = FormApp.openById(formId_());
  if (form.getDestinationId() !== formSpreadsheetId_()) throw new Error('설문의 응답 저장 위치가 정본 Sheet와 다릅니다.');
  form.setCollectEmail(true).setLimitOneResponsePerUser(true).setAllowResponseEdits(true).setShowLinkToRespondAgain(false);
  if (!ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === 'onFormSubmitCard'; }))
    ScriptApp.newTrigger('onFormSubmitCard').forForm(form).onFormSubmit().create();
  return {editUrl: form.getEditUrl(), publishedUrl: form.getPublishedUrl(), itemCount: form.getItems().length};
}

/**
 * One-time, explicit migration for workbooks that still have the old Cards
 * tab. The old tab is never used as a live source after this succeeds and is
 * intentionally left untouched so the operator can archive it safely.
 */
function migrateCardsToFormResponseSheet() {
  return withWorkspaceLock_(function () {
    const ss = workspace_(), source = ss.getSheetByName('Cards'), target = employeeSheet_(ss);
    if (!source) return {status: 'NOT_NEEDED', migrated: 0};
    const sourceRows = readRecords_(source, 'Cards');
    const targetRows = formRecords_(target);
    const accounts = new Set(targetRows.map(entry => String(entry.value.googleAccountEmail || '').trim().toLowerCase()).filter(Boolean));
    const tokens = new Set(targetRows.map(entry => String(entry.value.publicToken || '').trim()).filter(Boolean));
    const deletedTokens = new Set(readRecords_(ss.getSheetByName('DeletedTokens'), 'DeletedTokens').map(entry => String(entry.value.publicToken || '').trim()));
    let migrated = 0;
    sourceRows.forEach(function (entry) {
      const account = String(entry.value.googleAccountEmail || '').trim().toLowerCase();
      const token = String(entry.value.publicToken || '').trim();
      if (account && accounts.has(account)) throw new Error('직원 계정이 응답 시트에 이미 있습니다: ' + account);
      if (token && tokens.has(token)) throw new Error('공개 토큰이 응답 시트에 이미 있습니다: ' + token);
      if (token && deletedTokens.has(token)) throw new Error('삭제 토큰은 재사용할 수 없습니다: ' + token);
      formWrite_(target, entry.value);
      if (account) accounts.add(account);
      if (token) tokens.add(token);
      migrated++;
    });
    return {status: 'MIGRATED', migrated: migrated, source: 'Cards', target: ZNUS_EMPLOYEE_SHEET};
  });
}

function legacySetupFormAutomationForm_() {
  const form = FormApp.openById(formId_());
  const existingTitles = form.getItems().map(function (item) { return item.getTitle(); });
  const existingUploadTitles = existingTitles.filter(function (title) { return FORM_UPLOAD_KEYS.indexOf(formQuestionKey_(title)) >= 0 || title === '프로필 카드 배경 파일'; });
  if (existingUploadTitles.length) {
    throw new Error('파일 업로드 질문은 Google Forms 화면에서 수동으로 관리합니다. 기존 파일 질문을 보존하기 위해 자동 재구성을 중단했습니다: ' + existingUploadTitles.join(', '));
  }
  form.setTitle('ZNUS 디지털 명함 입력').setDescription('신규 명함 생성과 기존 명함 수정을 위한 입력 양식입니다. 수정 시 기존 공개 토큰과 주소는 유지됩니다.').setCollectEmail(true).setLimitOneResponsePerUser(false).setShowLinkToRespondAgain(true);
  form.getItems().forEach(function (item) { form.deleteItem(item); });
  FORM_REQUIRED.forEach(function (key) { form.addTextItem().setTitle(formQuestionTitle_(key)).setHelpText(formQuestionHelp_(key)).setRequired(true); });
  form.addTextItem().setTitle(formQuestionTitle_('mobilePhone')).setHelpText('명함에 공개할 번호를 입력하세요. 예: 010-1234-5678').setRequired(true);
  form.addTextItem().setTitle(formQuestionTitle_('publicEmail')).setHelpText('명함에 공개할 이메일 주소를 입력하세요.').setRequired(true);
  configureFormBackgroundQuestions_(form);
  form.addSectionHeaderItem().setTitle('사진과 배경 파일 업로드').setHelpText('프로필 사진 또는 영상은 한 개만 받습니다. JPG, PNG, WEBP 이미지 또는 MP4 영상(최대 5초·2560×1440·30MB)을 첨부하세요. 신규 프로필은 필수이며 재제출 시 미첨부하면 기존 파일을 유지합니다. 다른 카드 배경은 미첨부 시 신규는 기본 영상, 재제출은 기존 배경을 사용합니다. 필요한 질문: ' + FORM_UPLOAD_KEYS.map(formQuestionTitle_).join(', '));
  form.setDestination(FormApp.DestinationType.SPREADSHEET, formSpreadsheetId_());
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onFormSubmitCard'; })) ScriptApp.newTrigger('onFormSubmitCard').forForm(form).onFormSubmit().create();
  return { editUrl: form.getEditUrl(), publishedUrl: form.getPublishedUrl(), itemCount: form.getItems().length, manualUploadQuestionTitles: FORM_UPLOAD_KEYS.map(formQuestionTitle_) };
}

// 파일 업로드 질문을 이미 추가한 Form을 새 입력 방식으로 바꿀 때 한 번 실행합니다.
// 기본 배경 복원 질문을 추가하고, 기존 업로드 질문을 보존합니다.
function simplifyFormBackgroundUploads() {
  const form = FormApp.openById(formId_());
  configureFormBackgroundQuestions_(form);
  const header = form.getItems().find(function (item) { return item.getTitle() === '사진과 배경 파일 업로드'; });
  if (header) form.moveItem(header, form.getItems().length - 1);
  FORM_UPLOAD_KEYS.forEach(function (key) {
    const item = form.getItems().find(function (candidate) { return candidate.getTitle() === formQuestionTitle_(key); });
    if (item) form.moveItem(item, form.getItems().length - 1);
  });
  return { editUrl: form.getEditUrl(), itemCount: form.getItems().length };
}

// Existing upload questions and responses are preserved when adding reset controls.
function configureFormBackgroundQuestions_(form) {
  FORM_BG_KEYS.forEach(function (key) {
    const title = formQuestionTitle_(key + 'BackgroundMode');
    const existing = form.getItems().find(function (item) { return item.getTitle() === title; });
    const item = existing ? existing.asMultipleChoiceItem() : form.addMultipleChoiceItem().setTitle(title);
    item.setChoiceValues(['현재 배경 유지 / 첨부 파일 적용', '기본 디자인 사용'])
      .setHelpText('미첨부 시 기존 배경 유지, 신규 명함은 기본 배경입니다. 기본 디자인 사용을 선택하면 배경을 복원합니다. 이때 파일은 첨부하지 마세요.')
      .setRequired(false);
  });
}

function legacyOnFormSubmitCard_(e) {
  return withWorkspaceLock_(function () {
    const response = e && e.response;
    if (!response) throw new Error('Form 제출 이벤트가 필요합니다.');
    const account = email_(String(response.getRespondentEmail() || ''), 'Google 계정 이메일').toLowerCase();
    const ss = workspace_(), sheet = employeeSheet_(ss);
    const rows = formRecords_(sheet);
    const matches = rows.filter(r => String(r.value.googleAccountEmail).trim().toLowerCase() === account);
    if (matches.length > 1) throw new Error('같은 Google 계정의 직원 행이 여러 개입니다. Sheets를 확인하세요.');
    const existing = matches[0], old = existing ? existing.value : null;
    const responseId = String(response.getId() || '');
    if (!responseId) throw new Error('Form 응답 ID가 없습니다.');
    if (old && old.formResponseId === responseId && old.processingStatus === 'COMPLETED')
      return {status: 'UNCHANGED', cardId: old.cardId, publicToken: old.publicToken};
    const responseRow = findFormResponseRow_(sheet, response, account, rows);
    const answers = formAnswers_(response);
    answers.googleAccountEmail = account;
    const now = new Date().toISOString();
    const token = old ? old.publicToken : formUniqueToken_(ss);
    const base = ensureCardIdentity_(old || {cardId: Utilities.getUuid().toLowerCase(), googleAccountEmail: account,
      publicToken: token, publicUrl: formPublicUrl_(token), published: false, isActive: true,
      createdAt: now, qrUrl: '', nfcStatus: ''}, ss);
    const target = existing ? existing.row : (responseRow || sheet.getLastRow() + 1);
    if (existing && responseRow && responseRow !== existing.row)
      mergeFormResponseRow_(sheet, responseRow, existing.row);
    // Retain the last good payload until every new asset has been prepared.
    const processing = Object.assign({}, base, {processingStatus: 'PROCESSING', errorMessage: ''});
    formWrite_(sheet, processing, target);
    try {
      const data = formValidate_(answers, old);
      const ids = FORM_UPLOAD_KEYS.map(key => data[key]).filter(Boolean);
      if (new Set(ids).size !== ids.length) throw new Error('각 영역에 서로 다른 파일을 첨부하세요.');
      if (rows.some(r => (!existing || r.row !== existing.row) && FORM_UPLOAD_KEYS.some(key => ids.includes(r.value[key]))))
        throw new Error('다른 직원 명함에서 사용 중인 파일입니다.');
      const next = Object.assign({}, base, data, {googleAccountEmail: account, formResponseId: responseId,
        published: true, isActive: true, processingStatus: 'COMPLETED', errorMessage: '', updatedAt: now});
      next.profileImageFileId = formStoreAsset_(data.profileImageFileId, '', base.cardId, 'profile', data.profileBackgroundMode);
      next.profileBackgroundFileId = ''; // Legacy column; there is no second profile media slot.
      FORM_BG_KEYS.forEach(function (key) {
        next[key + 'BackgroundFileId'] = formApplyBackground_(data, base, key, base.cardId);
        if (data[key + 'BackgroundMode'] === 'KEEP_CURRENT') next[key + 'BackgroundMode'] = base[key + 'BackgroundMode'] || 'DEFAULT';
      });
      // Resolve by ID again: a manual Sheets row deletion must never overwrite another employee.
      const current = formRecords_(sheet).find(r => r.value.cardId === base.cardId);
      if (!current) throw new Error('처리 중 직원 행이 삭제되었습니다. 다시 제출해 주세요.');
      formWrite_(sheet, next, current.row);
      removeDuplicateFormRows_(sheet, account, current.row);
      SpreadsheetApp.flush();
      // Keep replaced uploads in Drive. A failed save must never destroy the last good media.
      return {status: old ? 'UPDATED' : 'CREATED', cardId: next.cardId, publicToken: token, publicUrl: next.publicUrl};
    } catch (error) {
      const current = formRecords_(sheet).find(r => r.value.cardId === base.cardId);
      if (current) {
        const failed = Object.assign({}, base, {processingStatus: 'ERROR', errorMessage: formErrorMessage_(error)});
        if (!old) FORM_REQUIRED.concat(['mobilePhone', 'publicEmail']).forEach(key => { failed[key] = String(answers[key] || '').slice(0, 254); });
        formWrite_(sheet, failed, current.row);
      }
      if (existing) removeDuplicateFormRows_(sheet, account, existing.row);
      throw error;
    }
  });
}

/**
 * The submitted Form row is the only employee record. We write only the
 * hidden system cells, leaving every Form-owned value and header untouched.
 */
function onFormSubmitCard(e) {
  return withWorkspaceLock_(function () {
    const response = e && e.response;
    if (!response) throw new Error('Form 제출 이벤트가 필요합니다.');
    const account = email_(String(response.getRespondentEmail() || ''), 'Google 계정 이메일').toLowerCase();
    const ss = workspace_(), sheet = employeeSheet_(ss), rows = formRecords_(sheet);
    const responseId = String(response.getId() || '');
    if (!responseId) throw new Error('Form 응답 ID가 없습니다.');
    const rowFromEvent = findFormResponseRow_(sheet, response, account, rows);
    const matches = rows.filter(function (entry) { return formAccount_(entry.value) === account; });
    if (matches.length > 1) throw new Error('같은 Google 계정의 직원 행이 여러 개입니다. Sheets를 확인하세요.');
    const existing = matches[0] || null;
    const targetRow = rowFromEvent || (existing && existing.row);
    if (!targetRow) throw new Error('제출된 Form 응답 행을 찾지 못했습니다. 응답 저장 위치를 확인하세요.');
    if (existing && existing.row === targetRow && String(existing.value.formResponseId || '') === responseId &&
        String(existing.value.processingStatus || '') === 'COMPLETED') return {status: 'UNCHANGED', publicToken: existing.value.publicToken, publicUrl: publicUrl_(existing.value.publicToken)};

    const old = existing ? formCard_(existing.value) : null;
    const token = old && /^[a-z0-9]{12}$/.test(String(old.publicToken || '')) ? old.publicToken : formUniqueToken_(ss);
    writeEmployeeSystem_(sheet, targetRow, {publicToken: token, formResponseId: responseId, processingStatus: 'PROCESSING', errorMessage: ''});
    try {
      const data = formValidate_(formAnswers_(response), old);
      const ids = FORM_UPLOAD_KEYS.map(function (key) { return data[key]; }).filter(Boolean);
      if (new Set(ids).size !== ids.length) throw new Error('각 영역에 서로 다른 파일을 첨부하세요.');
      // New uploads are validated and moved, but their IDs remain in the
      // original Form cells. The public reader extracts them from those cells.
      if (data.profileImageFileId && (!old || data.profileImageFileId !== old.profileImageFileId))
        formStoreAsset_(data.profileImageFileId, '', token, 'profile', data.profileBackgroundMode);
      FORM_BG_KEYS.forEach(function (key) {
        const fileKey = key + 'BackgroundFileId';
        if (data[key + 'BackgroundMode'] !== 'DEFAULT' && data[fileKey] && (!old || data[fileKey] !== old[fileKey]))
          formStoreAsset_(data[fileKey], '', token, key + '_background', data[key + 'BackgroundMode']);
      });
      writeEmployeeSystem_(sheet, targetRow, {publicToken: token, formResponseId: responseId, processingStatus: 'COMPLETED', errorMessage: ''});
      if (existing && existing.row !== targetRow && typeof sheet.deleteRow === 'function') sheet.deleteRow(existing.row);
      return {status: existing ? 'UPDATED' : 'CREATED', publicToken: token, publicUrl: publicUrl_(token)};
    } catch (error) {
      writeEmployeeSystem_(sheet, targetRow, {publicToken: token, formResponseId: responseId, processingStatus: 'ERROR', errorMessage: formErrorMessage_(error)});
      throw error;
    }
  });
}

/** Map native Form titles (and historical title variants) to card fields. */
function formCard_(row) {
  const card = {publicToken: String(row.publicToken || '').trim(), formResponseId: String(row.formResponseId || '').trim(),
    processingStatus: String(row.processingStatus || '').trim(), errorMessage: String(row.errorMessage || '').trim()};
  Object.keys(row).forEach(function (header) {
    const key = formQuestionKey_(header);
    if (FORM_REQUIRED.concat(['mobilePhone', 'publicEmail']).indexOf(key) >= 0) card[key] = String(row[header] || '').trim();
    if (FORM_UPLOAD_KEYS.indexOf(key) >= 0) card[key] = formFileIdOrEmpty_(row[header]);
    if (FORM_BG_KEYS.some(function (background) { return key === background + 'BackgroundMode'; })) card[key] = FORM_MODE_LABELS[String(row[header] || '').trim()] || String(row[header] || '').trim();
  });
  card.googleAccountEmail = formAccount_(row);
  FORM_BG_KEYS.forEach(function (key) {
    const fileKey = key + 'BackgroundFileId', modeKey = key + 'BackgroundMode';
    if (card[fileKey] && !card[modeKey]) card[modeKey] = formStoredMediaKind_(card[fileKey]);
    if (!card[modeKey]) card[modeKey] = 'DEFAULT';
  });
  return card;
}
function formAccount_(row) {
  const key = Object.keys(row).find(function (header) { return /^(email address|이메일 주소|이메일)$/i.test(String(header).trim()); });
  return key ? String(row[key] || '').trim().toLowerCase() : String(row.googleAccountEmail || '').trim().toLowerCase();
}
function formFileIdOrEmpty_(value) {
  const text = String(value == null ? '' : value).trim();
  return text ? formFile_(text, '업로드 파일') : '';
}
function formStoredMediaKind_(fileId) {
  try { return DriveApp.getFileById(fileId).getMimeType() === 'video/mp4' ? 'VIDEO' : 'IMAGE'; }
  catch (error) { return 'DEFAULT'; }
}

const CARD_ID_PATTERN_ = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function ensureCardIdentity_(record, ss) {
  const next = Object.assign({}, record);
  if (!CARD_ID_PATTERN_.test(String(next.cardId || ''))) next.cardId = Utilities.getUuid().toLowerCase();
  if (!/^[a-z0-9]{12}$/.test(String(next.publicToken || ''))) {
    next.publicToken = formUniqueToken_(ss);
    next.publicUrl = formPublicUrl_(next.publicToken);
  }
  return next;
}

// Run once after fixing a failed Form response. It reuses the original response IDs,
// so existing cards keep their public token and URL.
function reprocessAllFormResponses() {
  const form = FormApp.openById(formId_());
  return form.getResponses().map(function (response) {
    try { return onFormSubmitCard({response: response}); }
    catch (error) { return {status: 'ERROR', responseId: response.getId(), error: formErrorMessage_(error)}; }
  });
}

function formErrorMessage_(error) {
  const message = String(error && error.message || error || '알 수 없는 오류').trim();
  return message.slice(0, 1000);
}

function formQuestionTitle_(key) { return FORM_QUESTION_TITLES[key] || key; }
function formQuestionKey_(title) { if (title === '프로필 사진') return 'profileImageFileId'; return Object.keys(FORM_QUESTION_TITLES).find(function (key) { return FORM_QUESTION_TITLES[key] === title; }) || title; }
function formQuestionHelp_(key) { if (key.indexOf('roleItem') === 0) return '명함의 업무 목록에 순서대로 표시됩니다. 최대 200자까지 입력할 수 있습니다.'; if (key === 'nameKo') return '명함에 표시할 한글 이름을 입력하세요. 예: 홍길동'; if (key === 'nameEn') return '명함에 표시할 영문 이름을 입력하세요. 예: Gildong Hong'; if (key === 'department') return '소속 부서를 입력하세요. 예: 브랜드전략팀'; return '명함에 표시할 내용을 입력하세요. 최대 100자까지 입력할 수 있습니다.'; }
function formAnswers_(response) { const out = {}; if (!response) return out; response.getItemResponses().forEach(function (ir) { const key = formQuestionKey_(ir.getItem().getTitle()); let v = ir.getResponse(); if (Array.isArray(v)) v = v[0] || ''; v = String(v == null ? '' : v).trim(); out[key] = key.endsWith('BackgroundMode') ? (FORM_MODE_LABELS[v] || v) : v; }); return out; }
function formValidate_(input, existing) {
  const normalized = Object.assign({}, input);
  if (String(input.profileImageFileId || '').trim())
    normalized.profileImageFileId = formFile_(input.profileImageFileId, '프로필 사진 또는 영상');
  FORM_BG_KEYS.forEach(function (key) {
    const modeKey = key + 'BackgroundMode', fileKey = key + 'BackgroundFileId';
    const mode = String(input[modeKey] || '').trim(), id = String(input[fileKey] || '').trim();
    if (!['', 'AUTO', 'DEFAULT', 'IMAGE', 'VIDEO'].includes(mode)) throw new Error(key + ': 배경 선택을 확인하세요.');
    if (mode === 'DEFAULT') {
      if (id) throw new Error(key + ': 기본 디자인 복원 시 파일을 첨부하지 마세요.');
      normalized[modeKey] = 'DEFAULT'; normalized[fileKey] = '';
    } else if (id) {
      normalized[fileKey] = formFile_(id, fileKey);
      normalized[modeKey] = formBackgroundModeForFile_(normalized[fileKey], fileKey);
      if (['IMAGE', 'VIDEO'].includes(mode) && mode !== normalized[modeKey]) throw new Error(key + ': 파일 유형과 선택이 다릅니다.');
    } else {
      if (['IMAGE', 'VIDEO'].includes(mode)) throw new Error(key + ': 배경 파일이 필요합니다.');
      normalized[modeKey] = ''; normalized[fileKey] = '';
    }
  });
  const out = validateCardInput_(normalized, existing);
  out.profileBackgroundMode = formBackgroundModeForFile_(out.profileImageFileId, '프로필 사진 또는 영상');
  FORM_BG_KEYS.forEach(function (key) {
    if (!normalized[key + 'BackgroundMode'] && existing) {
      out[key + 'BackgroundMode'] = 'KEEP_CURRENT'; out[key + 'BackgroundFileId'] = '';
    }
  });
  return out;
}
function formBackgroundModeForFile_(id, label) { const mime = String(DriveApp.getFileById(id).getMimeType() || '').toLowerCase(); const mode = ['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) >= 0 ? 'IMAGE' : mime === 'video/mp4' ? 'VIDEO' : ''; if (!mode) throw new Error(label + ': JPG, PNG, WEBP 이미지 또는 MP4 영상만 허용합니다.'); formInspectAsset_(id, mode, label); return mode; }
function formInspectAsset_(id, mode, label) { return inspectCardMedia_(id, mode, label); }
function formApplyBackground_(data, old, key, cardId) { const modeKey = key + 'BackgroundMode', fileKey = key + 'BackgroundFileId'; if (data[modeKey] === 'DEFAULT') return ''; if (data[modeKey] === 'KEEP_CURRENT') return old[fileKey] || ''; return formStoreAsset_(data[fileKey], '', cardId || old.cardId, key + '_background', data[modeKey]); }
function formStoreAsset_(id, oldId, cardId, label, mode) { if (!id) return ''; return storeCardAsset_(id, oldId, cardId, label, mode); }
function formTrashFiles_(a) { [a.profileImageFileId].concat(FORM_BG_KEYS.map(function (k) { return a[k + 'BackgroundFileId']; })).filter(Boolean).forEach(formTrashById_); }
function formTrashById_(id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (err) {} }
function formUniqueToken_(ss) { return uniqueToken_(formRecords_(employeeSheet_(ss)), readRecords_(ss.getSheetByName('DeletedTokens'), 'DeletedTokens')); }
function formPublicUrl_(token) { return publicUrl_(token); }
function formRequired_(v, key, max) { const s = String(v == null ? '' : v).trim(); if (!s) throw new Error(key + ': 필수 입력입니다.'); if (s.length > max) throw new Error(key + ': 최대 ' + max + '자입니다.'); return s; }
function formEmail_(v, key) { const s = formRequired_(v, key, 254); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error(key + ': 이메일 형식을 확인하세요.'); return s.toLowerCase(); }
function formFile_(v, key) {
  const s = formRequired_(v, key, 500);
  const match = s.match(/(?:[?&]id=|\/d\/)([A-Za-z0-9_-]+)/);
  const id = match ? match[1] : s;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(key + ': Drive 파일 ID 형식을 확인하세요.');
  return id;
}
function ensureFormSheet_(ss, name, headers) { let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name); if (!sh.getLastRow()) sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); sh.getRange(1,1,1,headers.length).setFontWeight('bold'); return sh; }
function formRecords_(sheet) { return readRecords_(sheet, ZNUS_EMPLOYEE_SHEET); }
function formWrite_(sheet, record, row) { return writeRecord_(sheet, ZNUS_EMPLOYEE_SHEET, record, row); }

/**
 * Form triggers expose FormResponse but not the destination row. Match the
 * row written by Forms using its timestamp and collected account email. The
 * response sheet can contain the system columns after the native Form columns.
 */
function findFormResponseRow_(sheet, response, account, rows) {
  const headers = sheetHeaders_(sheet);
  const timestampIndex = headers.findIndex(h => /^(timestamp|타임스탬프)$/i.test(String(h).trim()));
  const emailIndex = headers.findIndex(h => /^(email address|이메일 주소|이메일)$/i.test(String(h).trim()));
  const formTimestamp = response && typeof response.getTimestamp === 'function' ? response.getTimestamp() : null;
  const expectedTime = formTimestamp instanceof Date ? formTimestamp.getTime() : NaN;
  if (timestampIndex >= 0 || emailIndex >= 0) {
    const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      const row = i + 2, value = values[i];
      const rowEmail = emailIndex >= 0 ? String(value[emailIndex] || '').trim().toLowerCase() : account;
      if (rowEmail !== account) continue;
      const rowTime = timestampIndex >= 0 && value[timestampIndex] instanceof Date ? value[timestampIndex].getTime() : NaN;
      if (Number.isFinite(expectedTime) && Number.isFinite(rowTime) && expectedTime !== rowTime) continue;
      const canonical = rows.find(entry => entry.row === row);
      if (!canonical || !canonical.value.formResponseId) return row;
    }
  }
  // Test doubles and manually imported responses may not have native Form
  // columns. Only reuse a blank system row; never overwrite a live employee.
  for (let i = sheet.getLastRow(); i >= 2; i--) {
    const row = rows.find(entry => entry.row === i);
    if (!row || !row.value.formResponseId) return i;
  }
  return null;
}

function mergeFormResponseRow_(sheet, sourceRow, targetRow) {
  const headers = sheetHeaders_(sheet);
  const source = sheet.getRange(sourceRow, 1, 1, headers.length).getValues()[0];
  const target = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
  const system = new Set(ZNUS_EMPLOYEE_SCHEMA);
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([headers.map((header, i) => system.has(header) ? target[i] : source[i])]);
}

/** Remove old/native duplicate rows after their values have been folded into the master row. */
function removeDuplicateFormRows_(sheet, account, canonicalRow) {
  if (typeof sheet.deleteRow !== 'function') return;
  const headers = sheetHeaders_(sheet);
  const emailIndex = headers.findIndex(h => /^(email address|이메일 주소|이메일)$/i.test(String(h).trim()));
  const accountIndex = headers.indexOf('googleAccountEmail');
  const responseIndex = headers.indexOf('formResponseId');
  if (emailIndex < 0 || accountIndex < 0 || responseIndex < 0) return;
  for (let row = sheet.getLastRow(); row >= 2; row--) {
    if (row === canonicalRow) continue;
    const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    const nativeEmail = String(values[emailIndex] || '').trim().toLowerCase();
    if (nativeEmail === account && !String(values[accountIndex] || '').trim() && !String(values[responseIndex] || '').trim()) {
      sheet.deleteRow(row);
      if (row < canonicalRow) canonicalRow--;
    }
  }
}
