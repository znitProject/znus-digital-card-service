function getCompanySettings() {
  const rows = readRecords_(workspace_().getSheetByName('CompanySettings'), 'CompanySettings');
  return rows.length ? rows[0].value : null;
}
function saveCompanySettings(input) {
  const validated = validateCompanySettings_(input);
  return withWorkspaceLock_(function () {
    const sheet = workspace_().getSheetByName('CompanySettings');
    const rows = readRecords_(sheet, 'CompanySettings');
    writeRecord_(sheet, 'CompanySettings', Object.assign({}, rows.length ? rows[0].value : {}, validated), 2);
    return validated;
  });
}
/** getUuid = java.util.UUID.randomUUID, a cryptographically strong v4 UUID.
 * Skip fixed version/variant bytes and use rejection sampling for uniform base36.
 */
function randomToken_() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let attempt = 0; attempt < 100 && token.length < 12; attempt++) {
    const uuid = Utilities.getUuid().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid))
      throw new Error('UUID v4 난수 생성에 실패했습니다.');
    const hex = uuid.replace(/-/g, '');
    for (let i = 0; i < 16 && token.length < 12; i++) {
      if (i === 6 || i === 8) continue;
      const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      if (byte < 252) token += alphabet[byte % 36];
    }
  }
  if (token.length !== 12) throw new Error('공개 토큰 난수 생성에 실패했습니다.');
  return token;
}
function uniqueToken_(cards, deleted) {
  const used = new Set(cards.concat(deleted).map(r => r.value.publicToken));
  for (let i = 0; i < 100; i++) {
    const token = randomToken_();
    if (!used.has(token)) return token;
  }
  throw new Error('고유 공개 토큰 생성에 실패했습니다.');
}
/** Internal foundation only: stage 2 finalizes assets/QR then publishes.
 * Never expose draft creation from the old sidebar or public web app.
 */
function createCardRecord_(input) {
  const data = validateCardInput_(input);
  return withWorkspaceLock_(function () {
    const ss = workspace_(), sheet = ss.getSheetByName('Cards');
    const cards = readRecords_(sheet, 'Cards');
    if (cards.some(r => String(r.value.googleAccountEmail).toLowerCase() === data.googleAccountEmail))
      throw new Error('이미 등록된 Google 계정입니다. 기존 명함 수정 경로를 사용하세요.');
    const deleted = readRecords_(ss.getSheetByName('DeletedTokens'), 'DeletedTokens');
    const token = uniqueToken_(cards, deleted);
    let cardId;
    for (let i = 0; i < 100; i++) {
      cardId = Utilities.getUuid().toLowerCase();
      if (!cards.some(r => r.value.cardId === cardId)) break;
      cardId = null;
    }
    if (!cardId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(cardId))
      throw new Error('고유 cardId 생성에 실패했습니다.');
    const now = new Date().toISOString();
    const record = Object.assign({}, data, {
      cardId: cardId, publicToken: token, publicUrl: publicUrl_(token),
      published: false, isActive: true, qrUrl: '', nfcStatus: '', formResponseId: '',
      processingStatus: 'PROCESSING', errorMessage: '', createdAt: now, updatedAt: now
    });
    writeRecord_(sheet, 'Cards', record);
    return record;
  });
}
/** Stage 5 must call this BEFORE deleting the Cards row. It does not delete files/data. */
function reserveDeletedToken_(token) {
  if (!/^[a-z0-9]{12}$/.test(token)) throw new Error('잘못된 공개 토큰입니다.');
  return withWorkspaceLock_(function () {
    const sheet = workspace_().getSheetByName('DeletedTokens');
    const records = readRecords_(sheet, 'DeletedTokens');
    if (!records.some(r => r.value.publicToken === token))
      writeRecord_(sheet, 'DeletedTokens', { publicToken: token });
    return token;
  });
}
