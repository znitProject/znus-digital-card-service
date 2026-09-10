const ZNUS_FOLDERS = [
  ['root', 'ZNUS Digital Card', null], ['admin', '00_admin', 'root'],
  ['uploads', '01_form_uploads', 'root'], ['assets', '02_card_assets', 'root'],
  ['generated', '03_generated', 'root'], ['qr', 'qr', 'generated']
];
function readFolderConfig_() {
  const props = PropertiesService.getScriptProperties();
  return Object.fromEntries(ZNUS_FOLDERS.map(([key]) => [key, props.getProperty('ZNUS_FOLDER_' + key.toUpperCase()) || '']));
}
function ensureWorkspaceFolders_() {
  const props = PropertiesService.getScriptProperties();
  const result = {};
  ZNUS_FOLDERS.forEach(([key, name, parent]) => {
    const property = 'ZNUS_FOLDER_' + key.toUpperCase();
    const id = props.getProperty(property);
    let folder;
    if (id) {
      // Never silently replace inaccessible folders and lose references.
      folder = DriveApp.getFolderById(id);
      if (folder.isTrashed()) throw new Error(name + ' 폴더가 휴지통에 있습니다. 복원 후 다시 실행하세요.');
    } else {
      const container = parent ? DriveApp.getFolderById(result[parent]) : DriveApp.getRootFolder();
      const matches = container.getFoldersByName(name);
      if (matches.hasNext()) {
        folder = matches.next();
        if (matches.hasNext()) throw new Error(name + ' 폴더가 여러 개입니다. ' + property + '에 사용할 ID를 지정하세요.');
      } else { folder = container.createFolder(name); }
      props.setProperty(property, folder.getId());
    }
    if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE)
      throw new Error(name + ': 폴더의 일반 액세스를 제한됨으로 설정하세요.');
    if (parent) {
      const parents = folder.getParents();
      let belongs = false;
      while (parents.hasNext()) if (parents.next().getId() === result[parent]) belongs = true;
      if (!belongs) throw new Error(name + ' 폴더의 상위 폴더가 설정과 다릅니다.');
    }
    result[key] = folder.getId();
  });
  return result;
}
/** Called from an editor-only wrapper, not from the public app. */
function configurePublicBaseUrl_(url) {
  const clean = validateHttpsUrl_(url, '공개 기본 URL').replace(/\/+$/, '');
  if (/[?#]/.test(clean)) throw new Error('공개 기본 URL에는 쿼리나 해시를 넣지 마세요.');
  return withWorkspaceLock_(function () {
    const props = PropertiesService.getScriptProperties();
    const sheet = workspace_().getSheetByName('Cards');
    const cards = readRecords_(sheet, 'Cards');
    if (props.getProperty('ZNUS_PUBLIC_BASE_URL') !== clean &&
        cards.some(entry => entry.value.publicUrl))
      throw new Error('명함 생성 이후 주소 변경은 별도 이전 절차가 필요합니다. 기존 URL을 유지하세요.');
    props.setProperty('ZNUS_PUBLIC_BASE_URL', clean);
    cards.filter(entry => !entry.value.publicUrl).forEach(entry => {
      entry.value.publicUrl = publicUrl_(entry.value.publicToken);
      writeRecord_(sheet, 'Cards', entry.value, entry.row);
    });
    return clean;
  });
}
function publicUrl_(token) {
  const base = PropertiesService.getScriptProperties().getProperty('ZNUS_PUBLIC_BASE_URL');
  if (!base) throw new Error('ZNUS_PUBLIC_BASE_URL을 먼저 설정하세요.');
  const clean = validateHttpsUrl_(base, '공개 기본 URL').replace(/\/+$/, '');
  if (/[?#]/.test(clean)) throw new Error('공개 기본 URL에 쿼리나 해시를 사용할 수 없습니다.');
  return clean + (/^https:\/\/script\.google\.com\//.test(clean) ? '?card=' : '/') + token;
}
