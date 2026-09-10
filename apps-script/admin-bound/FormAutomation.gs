const FORM_AUTOMATION_SHEET_ID = '1FlJ8xn523nMo07iVwm-5TaWCfCHt4Q8_KqdZhyjrO_Y';
const FORM_AUTOMATION_FORM_ID = '1xnDZARmNjZtz8OwLCkVv8Tw14JC-M_VS2pjdA7fdCqA';
const FORM_CARD_HEADERS = ['cardId','googleAccountEmail','publicToken','published','isActive','nameKo','nameEn','department','jobTitleKo','jobTitleEn','roleItem1Ko','roleItem2Ko','roleItem3Ko','roleItem4Ko','roleItem5Ko','roleItem1En','roleItem2En','roleItem3En','roleItem4En','roleItem5En','mobilePhone','publicEmail','profileImageFileId','roleBackgroundMode','roleBackgroundFileId','contactBackgroundMode','contactBackgroundFileId','companyBackgroundMode','companyBackgroundFileId','linksBackgroundMode','linksBackgroundFileId','publicUrl','qrUrl','nfcStatus','formResponseId','createdAt','updatedAt','processingStatus','errorMessage'];
const FORM_BG_KEYS = ['role','contact','company','links'];
const FORM_REQUIRED = ['nameKo','nameEn','department','jobTitleKo','jobTitleEn','roleItem1Ko','roleItem2Ko','roleItem3Ko','roleItem4Ko','roleItem5Ko','roleItem1En','roleItem2En','roleItem3En','roleItem4En','roleItem5En'];
const FORM_UPLOAD_KEYS = ['profileImageFileId'].concat(FORM_BG_KEYS.map(function (key) { return key + 'BackgroundFileId'; }));
const FORM_QUESTION_TITLES = {
  nameKo: '이름 (국문)', nameEn: '이름 (영문)', department: '부서', jobTitleKo: '직책 (국문)', jobTitleEn: '직책 (영문)',
  roleItem1Ko: '주요 업무 1 (국문)', roleItem2Ko: '주요 업무 2 (국문)', roleItem3Ko: '주요 업무 3 (국문)', roleItem4Ko: '주요 업무 4 (국문)', roleItem5Ko: '주요 업무 5 (국문)',
  roleItem1En: '주요 업무 1 (영문)', roleItem2En: '주요 업무 2 (영문)', roleItem3En: '주요 업무 3 (영문)', roleItem4En: '주요 업무 4 (영문)', roleItem5En: '주요 업무 5 (영문)',
  mobilePhone: '공개 휴대전화', publicEmail: '공개 이메일', profileImageFileId: '프로필 사진',
  roleBackgroundMode: '직무 카드 배경', contactBackgroundMode: '연락처 카드 배경', companyBackgroundMode: '회사 카드 배경', linksBackgroundMode: '링크 카드 배경',
  roleBackgroundFileId: '직무 카드 배경 파일', contactBackgroundFileId: '연락처 카드 배경 파일', companyBackgroundFileId: '회사 카드 배경 파일', linksBackgroundFileId: '링크 카드 배경 파일'
};
const FORM_MODE_LABELS = { '기본 디자인 사용': 'DEFAULT', '이미지로 변경': 'IMAGE', '영상으로 변경': 'VIDEO' };

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
    const ss = SpreadsheetApp.openById(FORM_AUTOMATION_SHEET_ID);
    ensureFormSheet_(ss, 'Cards', FORM_CARD_HEADERS);
    ensureFormSheet_(ss, 'CompanySettings', ['companyName','companyWebsite','companyPhone','companyFax','officeAddress','companyLogoFileId','sloganLine1','sloganLine2','sloganLine3']);
    ensureFormSheet_(ss, 'DeletedTokens', ['publicToken']);
    PropertiesService.getScriptProperties().setProperty('ZNUS_SPREADSHEET_ID', FORM_AUTOMATION_SHEET_ID);
    return ss.getUrl();
  });
}

function setupFormAutomationForm() {
  const form = FormApp.openById(FORM_AUTOMATION_FORM_ID);
  const existingTitles = form.getItems().map(function (item) { return item.getTitle(); });
  const existingUploadTitles = FORM_UPLOAD_KEYS.map(formQuestionTitle_).filter(function (title) { return existingTitles.indexOf(title) >= 0; });
  if (existingUploadTitles.length) {
    throw new Error('파일 업로드 질문은 Google Forms 화면에서 수동으로 관리합니다. 기존 파일 질문을 보존하기 위해 자동 재구성을 중단했습니다: ' + existingUploadTitles.join(', '));
  }
  form.setTitle('ZNUS 디지털 명함 입력').setDescription('신규 명함 생성과 기존 명함 수정을 위한 입력 양식입니다. 수정 시 기존 공개 토큰과 주소는 유지됩니다.').setCollectEmail(true).setLimitOneResponsePerUser(false).setShowLinkToRespondAgain(true);
  form.getItems().forEach(function (item) { form.deleteItem(item); });
  FORM_REQUIRED.forEach(function (key) { form.addTextItem().setTitle(formQuestionTitle_(key)).setHelpText(formQuestionHelp_(key)).setRequired(true); });
  form.addTextItem().setTitle(formQuestionTitle_('mobilePhone')).setHelpText('명함에 공개할 번호를 입력하세요. 예: 010-1234-5678').setRequired(true);
  form.addTextItem().setTitle(formQuestionTitle_('publicEmail')).setHelpText('명함에 공개할 이메일 주소를 입력하세요.').setRequired(true);
  form.addSectionHeaderItem().setTitle('사진과 배경 파일 업로드').setHelpText('프로필 사진은 필수입니다. 카드 배경은 바꾸려는 카드에만 파일을 올려 주세요. 업로드한 파일 형식에 따라 이미지 또는 영상 배경으로 자동 적용됩니다. 파일을 올리지 않으면 기존 배경을 유지합니다. 필요한 질문: ' + FORM_UPLOAD_KEYS.map(formQuestionTitle_).join(', '));
  form.setDestination(FormApp.DestinationType.SPREADSHEET, FORM_AUTOMATION_SHEET_ID);
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onFormSubmitCard'; })) ScriptApp.newTrigger('onFormSubmitCard').forForm(form).onFormSubmit().create();
  return { editUrl: form.getEditUrl(), publishedUrl: form.getPublishedUrl(), itemCount: form.getItems().length, manualUploadQuestionTitles: FORM_UPLOAD_KEYS.map(formQuestionTitle_) };
}

// 파일 업로드 질문을 이미 추가한 Form을 새 입력 방식으로 바꿀 때 한 번 실행합니다.
// 배경 선택 질문을 제거하고, 업로드 질문을 Form 맨 아래로 이동합니다.
function simplifyFormBackgroundUploads() {
  const form = FormApp.openById(FORM_AUTOMATION_FORM_ID);
  const modeTitles = FORM_BG_KEYS.map(function (key) { return formQuestionTitle_(key + 'BackgroundMode'); });
  form.getItems().filter(function (item) { return modeTitles.indexOf(item.getTitle()) >= 0; }).forEach(function (item) { form.deleteItem(item); });
  const header = form.getItems().find(function (item) { return item.getTitle() === '사진과 배경 파일 업로드'; });
  if (header) form.moveItem(header, form.getItems().length - 1);
  FORM_UPLOAD_KEYS.forEach(function (key) {
    const item = form.getItems().find(function (candidate) { return candidate.getTitle() === formQuestionTitle_(key); });
    if (item) form.moveItem(item, form.getItems().length - 1);
  });
  return { editUrl: form.getEditUrl(), itemCount: form.getItems().length };
}

function onFormSubmitCard(e) {
  return withWorkspaceLock_(function () {
    const ss = SpreadsheetApp.openById(FORM_AUTOMATION_SHEET_ID), sheet = ss.getSheetByName('Cards');
    const answers = formAnswers_(e && e.response), account = String((e && e.response && e.response.getRespondentEmail()) || '').trim().toLowerCase();
    if (!account) throw new Error('응답자 Google 계정을 확인할 수 없습니다. Form의 이메일 수집을 켜세요.');
    answers.googleAccountEmail = account;
    const rows = formRecords_(sheet), existing = rows.find(function (r) { return String(r.value.googleAccountEmail).toLowerCase() === account; });
    if (existing && String(existing.value.isActive).toLowerCase() !== 'true') { formTrashFiles_(answers); return { status: 'SKIPPED_INACTIVE', row: existing.row }; }
    const data = formValidate_(answers, existing && existing.value), now = new Date().toISOString(), responseId = e && e.response ? e.response.getId() : '';
    if (existing) {
      const next = Object.assign({}, existing.value, data, { googleAccountEmail: account, formResponseId: responseId, updatedAt: now, processingStatus: 'COMPLETED', errorMessage: '' });
      next.profileImageFileId = formStoreAsset_(data.profileImageFileId, existing.value.profileImageFileId, existing.value.cardId, 'profile');
      FORM_BG_KEYS.forEach(function (key) { next[key + 'BackgroundFileId'] = formApplyBackground_(data, existing.value, key); });
      formWrite_(sheet, next, existing.row); return { status: 'UPDATED', cardId: existing.value.cardId, publicToken: existing.value.publicToken };
    }
    const token = formUniqueToken_(ss), cardId = Utilities.getUuid().toLowerCase(), record = Object.assign({}, data, { cardId: cardId, googleAccountEmail: account, publicToken: token, published: true, isActive: true, publicUrl: formPublicUrl_(token), qrUrl: '', nfcStatus: '', formResponseId: responseId, createdAt: now, updatedAt: now, processingStatus: 'COMPLETED', errorMessage: '' });
    record.profileImageFileId = formStoreAsset_(data.profileImageFileId, '', cardId, 'profile'); FORM_BG_KEYS.forEach(function (key) { record[key + 'BackgroundFileId'] = formApplyBackground_(data, {}, key, cardId); }); formWrite_(sheet, record); return { status: 'CREATED', cardId: cardId, publicToken: token, publicUrl: record.publicUrl };
  });
}

function formQuestionTitle_(key) { return FORM_QUESTION_TITLES[key] || key; }
function formQuestionKey_(title) { return Object.keys(FORM_QUESTION_TITLES).find(function (key) { return FORM_QUESTION_TITLES[key] === title; }) || title; }
function formQuestionHelp_(key) { if (key.indexOf('roleItem') === 0) return '명함의 업무 목록에 순서대로 표시됩니다. 최대 200자까지 입력할 수 있습니다.'; if (key === 'nameKo') return '명함에 표시할 한글 이름을 입력하세요. 예: 홍길동'; if (key === 'nameEn') return '명함에 표시할 영문 이름을 입력하세요. 예: Gildong Hong'; if (key === 'department') return '소속 부서를 입력하세요. 예: 브랜드전략팀'; return '명함에 표시할 내용을 입력하세요. 최대 100자까지 입력할 수 있습니다.'; }
function formAnswers_(response) { const out = {}; if (!response) return out; response.getItemResponses().forEach(function (ir) { const key = formQuestionKey_(ir.getItem().getTitle()); let v = ir.getResponse(); if (Array.isArray(v)) v = v[0] || ''; v = String(v == null ? '' : v).trim(); out[key] = key.endsWith('BackgroundMode') ? (FORM_MODE_LABELS[v] || v) : v; }); return out; }
function formValidate_(input, existing) { const out = {}; FORM_REQUIRED.forEach(function (key) { out[key] = formRequired_(input[key], key, key.indexOf('roleItem') === 0 ? 200 : 100); }); out.mobilePhone = formRequired_(input.mobilePhone, 'mobilePhone', 40); if (!/^\+?[0-9 ()-]+$/.test(out.mobilePhone) || out.mobilePhone.replace(/\D/g, '').length < 7) throw new Error('mobilePhone 형식이 올바르지 않습니다.'); out.publicEmail = formEmail_(input.publicEmail, 'publicEmail'); out.profileImageFileId = formFile_(input.profileImageFileId, 'profileImageFileId'); formInspectAsset_(out.profileImageFileId, 'IMAGE', 'profileImageFileId'); FORM_BG_KEYS.forEach(function (key) { const modeKey = key + 'BackgroundMode', fileKey = key + 'BackgroundFileId', id = String(input[fileKey] || '').trim(); if (!id) { out[modeKey] = existing ? 'KEEP_CURRENT' : 'DEFAULT'; out[fileKey] = ''; return; } out[fileKey] = formFile_(id, fileKey); out[modeKey] = formBackgroundModeForFile_(out[fileKey], fileKey); }); return out; }
function formBackgroundModeForFile_(id, label) { const mime = String(DriveApp.getFileById(id).getMimeType() || '').toLowerCase(); const mode = ['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) >= 0 ? 'IMAGE' : mime === 'video/mp4' ? 'VIDEO' : ''; if (!mode) throw new Error(label + ': JPG, PNG, WEBP 이미지 또는 MP4 영상만 허용합니다.'); formInspectAsset_(id, mode, label); return mode; }
function formInspectAsset_(id, mode, label) { const file = DriveApp.getFileById(id), mime = String(file.getMimeType() || '').toLowerCase(), size = Number(file.getSize() || 0); if (mode === 'IMAGE' && ['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) < 0) throw new Error(label + ': JPG, PNG, WEBP 이미지만 허용합니다.'); if (mode === 'VIDEO' && mime !== 'video/mp4') throw new Error(label + ': MP4 영상만 허용합니다.'); if (mode === 'VIDEO' && size > 18 * 1024 * 1024) throw new Error(label + ': 영상은 18MiB 이하여야 합니다.'); if (size <= 0) throw new Error(label + ': 빈 파일은 사용할 수 없습니다.'); return { id: id, mimeType: mime, sizeBytes: size }; }
function formApplyBackground_(data, old, key, cardId) { const modeKey = key + 'BackgroundMode', fileKey = key + 'BackgroundFileId'; if (data[modeKey] === 'DEFAULT') { if (old[fileKey]) formTrashById_(old[fileKey]); return ''; } if (data[modeKey] === 'KEEP_CURRENT') return old[fileKey] || ''; return formStoreAsset_(data[fileKey], old[fileKey] || '', cardId || old.cardId, key + '_background'); }
function formStoreAsset_(id, oldId, cardId, label) { if (!id) return ''; if (oldId && oldId !== id) formTrashById_(oldId); const file = DriveApp.getFileById(id); file.setName(label + '_' + file.getName()); file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); return file.getId(); }
function formTrashFiles_(a) { [a.profileImageFileId].concat(FORM_BG_KEYS.map(function (k) { return a[k + 'BackgroundFileId']; })).filter(Boolean).forEach(formTrashById_); }
function formTrashById_(id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (err) {} }
function formUniqueToken_(ss) { const used = new Set(formRecords_(ss.getSheetByName('Cards')).map(function (r) { return r.value.publicToken; })), d = ss.getSheetByName('DeletedTokens'); if (d.getLastRow() > 1) d.getRange(2,1,d.getLastRow()-1,1).getValues().forEach(function (r) { used.add(String(r[0])); }); for (let i = 0; i < 100; i++) { const t = Utilities.getUuid().replace(/-/g, '').slice(0, 12).toLowerCase(); if (!used.has(t)) return t; } throw new Error('고유 publicToken 생성에 실패했습니다.'); }
function formPublicUrl_(token) { const b = PropertiesService.getScriptProperties().getProperty('ZNUS_PUBLIC_BASE_URL'); return b ? b.replace(/\/+$/, '') + (b.indexOf('script.google.com') >= 0 ? '?card=' : '/') + token : ''; }
function formRequired_(v, key, max) { const s = String(v == null ? '' : v).trim(); if (!s) throw new Error(key + ': 필수 입력입니다.'); if (s.length > max) throw new Error(key + ': 최대 ' + max + '자입니다.'); return s; }
function formEmail_(v, key) { const s = formRequired_(v, key, 254); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error(key + ': 이메일 형식을 확인하세요.'); return s.toLowerCase(); }
function formFile_(v, key) { const s = formRequired_(v, key, 200); if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error(key + ': Drive 파일 ID 형식을 확인하세요.'); return s; }
function ensureFormSheet_(ss, name, headers) { let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name); if (!sh.getLastRow()) sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); sh.getRange(1,1,1,headers.length).setFontWeight('bold'); return sh; }
function formRecords_(sheet) { if (!sheet || sheet.getLastRow() < 2) return []; const h = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String); return sheet.getRange(2,1,sheet.getLastRow()-1,h.length).getValues().map(function (v,i) { return { row:i+2, value:Object.fromEntries(h.map(function (k,j) { return [k,v[j]]; })) }; }).filter(function (r) { return Object.values(r.value).some(function (v) { return v !== ''; }); }); }
function formWrite_(sheet, record, row) { const h = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String), target = row || sheet.getLastRow() + 1; sheet.getRange(target,1,1,h.length).setNumberFormat('@').setValues([h.map(function (k) { return record[k] == null ? '' : record[k]; })]); }
