/** These RPCs run only in the Sheet-bound dialog as the signed-in editor. */
/** Web entry point for the administrator dashboard during the Drive integration test. */
function doGet() {
  return adminGalleryOutput_()
    .setTitle('ZNUS 직원 명함 갤러리')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function showAdminDashboard() {
  connectAdminWorkspace();
  SpreadsheetApp.getUi().showModalDialog(
    adminGalleryOutput_().setWidth(1440).setHeight(900),
    'ZNUS 직원 명함 갤러리'
  );
}
function adminGalleryOutput_() {
  const html = HtmlService.createHtmlOutputFromFile('AdminGallery').getContent();
  const qr = HtmlService.createHtmlOutputFromFile('QrLibrary').getContent();
  return HtmlService.createHtmlOutput(html.replace('<script>', () => qr + '<script>'));
}
function safeAdminJson_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/'/g, '\\u0027')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
/** Connect an existing database without creating folders or changing Form triggers. */
function connectAdminWorkspace() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('명함 데이터베이스 Google Sheet에 연결된 프로젝트에서 실행하세요.');
  const props = PropertiesService.getScriptProperties();
  const configured = props.getProperty('ZNUS_SPREADSHEET_ID');
  if (configured && configured !== ss.getId()) throw new Error('현재 시트와 설정된 데이터베이스가 다릅니다. 연결 설정을 확인하세요.');
  workspaceSchemaNames_().forEach(name => readRecords_(ss.getSheetByName(name), name));
  props.setProperty('ZNUS_SPREADSHEET_ID', ss.getId());
  return {spreadsheetId: ss.getId()};
}
function getAdminDashboard() {
  const cards = getEmployees();
  return {cards: cards, company: getCompanySettings() || {}, stats: {
    total: cards.length, public: cards.filter(function (card) { return card.status === '생성완료'; }).length,
    private: cards.filter(function (card) { return card.status !== '생성완료'; }).length,
    processing: cards.filter(function (card) { return card.status === '입력완료'; }).length,
    error: cards.filter(function (card) { return card.status === '검토필요'; }).length
  }};
}
/** Adapter for the existing Admin.html gallery design. The source of truth is the Form response sheet. */
function getEmployees() {
  const company = getCompanySettings() || {};
  const text = function (value) { return String(value == null ? '' : value).trim(); };
  const records = formRecords_(employeeSheet_(workspace_()));
  return records.map(function (entry) {
    const card = formCard_(entry.value);
    const complete = card.processingStatus === 'COMPLETED' && /^[a-z0-9]{12}$/.test(card.publicToken);
    const status = card.processingStatus === 'ERROR' ? '검토필요' : complete ? '생성완료' : '입력완료';
    return {
      employeeId: card.publicToken || ('row-' + entry.row), name: text(card.nameKo), nameEn: text(card.nameEn),
      department: text(card.department), position: text(card.jobTitleKo), positionEn: text(card.jobTitleEn),
      accountEmail: text(card.googleAccountEmail),
      roles: [1,2,3,4,5].map(function (i) { return {ko: text(card['roleItem' + i + 'Ko']), en: text(card['roleItem' + i + 'En'])}; }),
      backgrounds: ['profile', 'role', 'contact', 'company', 'links'].map(function (key) {
        const media = publicCardMedia_(card, key); return {type: key, mode: media.kind};
      }),
      errorMessage: text(card.errorMessage),
      missingFields: ZNUS_REQUIRED_TEXT.concat(['mobilePhone', 'publicEmail', 'profileImageFileId']).filter(function (key) { return !text(card[key]); }),
      profileImage: imageUrl_(text(card.profileImageFileId)), phone: text(card.mobilePhone), email: text(card.publicEmail),
      companyPhone: text(company.companyPhone), companyAddress: text(company.officeAddress),
      mobileUrl: complete ? publicUrl_(card.publicToken) : '', status: status,
      updatedAt: text(entry.value.Timestamp || entry.value['타임스탬프'] || '')
    };
  });
}
function legacyGetEmployees_() {
  const cards = readRecords_(employeeSheet_(workspace_()), ZNUS_EMPLOYEE_SHEET).map(entry => entry.value);
  const company = getCompanySettings() || {};
  const text = value => String(value == null ? '' : value).trim();
  const status = value => {
    const state = text(value).toUpperCase();
    if (state === 'COMPLETED') return '생성완료';
    if (state === 'ERROR') return '검토필요';
    return '입력완료';
  };
  return cards.map(card => ({
    employeeId: text(card.cardId),
    name: text(card.nameKo),
    nameEn: text(card.nameEn),
    department: text(card.department),
    position: text(card.jobTitleKo),
    positionEn: text(card.jobTitleEn),
    accountEmail: text(card.googleAccountEmail),
    roles: [1, 2, 3, 4, 5].map(i => ({ko: text(card['roleItem' + i + 'Ko']), en: text(card['roleItem' + i + 'En'])})),
    backgrounds: ['profile', 'role', 'contact', 'company', 'links'].map(key => ({type: key, mode: publicCardMedia_(card, key).kind})),
    errorMessage: text(card.errorMessage),
    missingFields: ZNUS_REQUIRED_TEXT.concat(['mobilePhone', 'publicEmail', 'profileImageFileId']).filter(key => !text(card[key])),
    profileImage: imageUrl_(text(card.profileImageFileId)),
    phone: text(card.mobilePhone),
    email: text(card.publicEmail),
    companyPhone: text(company.companyPhone),
    companyAddress: text(company.officeAddress),
    mobileUrl: safeUrl_(card.publicUrl),
    status: status(card.processingStatus),
    updatedAt: text(card.updatedAt)
  }));
}
function adminCard_(id, revision) {
  const sheet = employeeSheet_(workspace_());
  const entry = readRecords_(sheet, ZNUS_EMPLOYEE_SHEET).find(entry => entry.value.cardId === id);
  if (!entry) throw new Error('명함을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
  if (String(entry.value.updatedAt) !== String(revision)) throw new Error('다른 작업에서 명함이 변경되었습니다. 새로고침 후 다시 수정해 주세요.');
  if (entry.value.processingStatus === 'PROCESSING') throw new Error('설문을 처리하고 있습니다. 처리가 끝나면 다시 시도해 주세요.');
  return {sheet: sheet, entry: entry};
}
function setAdminCardState(id, revision, action) {
  throw new Error('대시보드는 조회 전용입니다. 직원 삭제는 Sheets에서 처리하세요.');
}
function saveAdminCard(id, revision, input) {
  throw new Error('대시보드는 조회 전용입니다. 정보 수정은 Google Form에서 제출하세요.');
}
function openAdminPreview(token) {
  if (!/^[a-z0-9]{12}$/.test(String(token))) throw new Error('명함 주소를 확인하세요.');
  const template = HtmlService.createTemplateFromFile('Preview'); template.slug = token;
  SpreadsheetApp.getUi().showModalDialog(template.evaluate().setWidth(430).setHeight(760), '명함 미리보기 · 비공개 명함도 표시됩니다');
}
function saveAdminPublicBaseUrl(url) { return configurePublicBaseUrl_(url); }
