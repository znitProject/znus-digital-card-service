/** These RPCs run only in the Sheet-bound dialog as the signed-in editor. */
function showAdminDashboard() {
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutputFromFile('Dashboard').setWidth(1100).setHeight(760), 'ZNUS 명함 관리');
}
function getAdminDashboard() {
  const cards = readRecords_(workspace_().getSheetByName('Cards'), 'Cards').map(entry => entry.value);
  const yes = value => value === true || String(value).toLowerCase() === 'true';
  return JSON.parse(JSON.stringify({cards: cards, company: getCompanySettings() || {}, stats: {
    total: cards.length, public: cards.filter(card => yes(card.published) && yes(card.isActive)).length,
    private: cards.filter(card => !yes(card.published) || !yes(card.isActive)).length,
    processing: cards.filter(card => card.processingStatus === 'PROCESSING').length,
    error: cards.filter(card => card.processingStatus === 'ERROR').length
  }}));
}
function adminCard_(id, revision) {
  const sheet = workspace_().getSheetByName('Cards');
  const entry = readRecords_(sheet, 'Cards').find(entry => entry.value.cardId === id);
  if (!entry) throw new Error('명함을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
  if (String(entry.value.updatedAt) !== String(revision)) throw new Error('다른 작업에서 명함이 변경되었습니다. 새로고침 후 다시 수정해 주세요.');
  if (entry.value.processingStatus === 'PROCESSING') throw new Error('설문을 처리하고 있습니다. 처리가 끝나면 다시 시도해 주세요.');
  return {sheet: sheet, entry: entry};
}
function setAdminCardState(id, revision, action) {
  return withWorkspaceLock_(function () {
    const found = adminCard_(id, revision), card = found.entry.value;
    if (action === 'disable') { card.isActive = false; card.published = false; }
    else if (action === 'enable') { card.isActive = true; card.published = false; }
    else if (action === 'private') card.published = false;
    else if (action === 'publish') {
      if (!publicTrue_(card.isActive)) throw new Error('먼저 명함을 활성화해 주세요.');
      if (card.processingStatus !== 'COMPLETED') throw new Error('미디어 처리가 완료된 명함만 공개할 수 있습니다.');
      card.published = true;
    } else throw new Error('지원하지 않는 상태 변경입니다.');
    card.updatedAt = new Date().toISOString();
    writeRecord_(found.sheet, 'Cards', card, found.entry.row);
    return {updatedAt: card.updatedAt};
  });
}
function saveAdminCard(id, revision, input) {
  return withWorkspaceLock_(function () {
    const found = adminCard_(id, revision), previous = found.entry.value;
    const data = validateCardInput_(input, previous);
    if (readRecords_(found.sheet, 'Cards').some(entry => entry.value.cardId !== id && String(entry.value.googleAccountEmail).toLowerCase() === data.googleAccountEmail))
      throw new Error('이미 다른 명함에 등록된 Google 계정입니다.');
    const requestedKeys = ['profileImageFileId'].concat(ZNUS_BACKGROUND_KEYS.map(key => key + 'BackgroundFileId'));
    const requestedIds = requestedKeys.map(key => data[key]).filter(Boolean);
    if (new Set(requestedIds).size !== requestedIds.length) throw new Error('각 영역에는 서로 다른 파일을 사용해 주세요.');
    if (readRecords_(found.sheet, 'Cards').some(entry => entry.value.cardId !== id && requestedKeys.some(key => requestedIds.includes(entry.value[key]))))
      throw new Error('다른 명함에서 사용 중인 파일입니다. 파일을 복사한 후 등록해 주세요.');
    // Preflight all requested media before changing any assets or rows.
    if (data.profileImageFileId !== previous.profileImageFileId) inspectCardMedia_(data.profileImageFileId, 'IMAGE', '프로필 이미지');
    ZNUS_BACKGROUND_KEYS.forEach(key => {
      if (data[key + 'BackgroundMode'] !== 'DEFAULT' && (data[key + 'BackgroundFileId'] !== previous[key + 'BackgroundFileId'] || data[key + 'BackgroundMode'] !== previous[key + 'BackgroundMode']))
        inspectCardMedia_(data[key + 'BackgroundFileId'], data[key + 'BackgroundMode'], key);
    });
    // Move new assets first, defer removal of old assets until the row is committed.
    if (data.profileImageFileId !== previous.profileImageFileId) storeCardAsset_(data.profileImageFileId, '', id, 'profile', 'IMAGE');
    ZNUS_BACKGROUND_KEYS.forEach(key => {
      if (data[key + 'BackgroundFileId'] && data[key + 'BackgroundFileId'] !== previous[key + 'BackgroundFileId'])
        storeCardAsset_(data[key + 'BackgroundFileId'], '', id, key + '_background', data[key + 'BackgroundMode']);
    });
    const next = Object.assign({}, previous, data, {updatedAt: new Date().toISOString()});
    writeRecord_(found.sheet, 'Cards', next, found.entry.row);
    const fileKeys = ['profileImageFileId'].concat(ZNUS_BACKGROUND_KEYS.map(key => key + 'BackgroundFileId'));
    fileKeys.forEach(key => { if (previous[key] && previous[key] !== next[key] && !fileKeys.some(other => next[other] === previous[key])) trashCardAsset_(previous[key]); });
    return {updatedAt: next.updatedAt};
  });
}
function openAdminPreview(token) {
  if (!/^[a-z0-9]{12}$/.test(String(token))) throw new Error('명함 주소를 확인하세요.');
  const template = HtmlService.createTemplateFromFile('Preview'); template.slug = token;
  SpreadsheetApp.getUi().showModalDialog(template.evaluate().setWidth(430).setHeight(760), '명함 미리보기 · 비공개 명함도 표시됩니다');
}
function saveAdminPublicBaseUrl(url) { return configurePublicBaseUrl_(url); }
