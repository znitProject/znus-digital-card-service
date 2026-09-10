# 1단계: 데이터·운영 기반

## 구현 범위

1. Cards 39개 열, CompanySettings 9개 열, DeletedTokens 1개 열을 생성한다.
2. setupWorkspace를 반복해도 기존 행·ID·열 순서를 유지한다. 빈 신규 시트에는 헤더만 만들고 샘플 명함은 넣지 않는다.
3. 레거시 Cards(slug/sectionsJson), 중복·빈 헤더, 데이터가 있으나 필수 열이 누락된 Cards는 모든 시트 변경 전에 중단한다. 별도 이관이 필요하며 자동 삭제나 추정 이관은 하지 않는다.
4. 루트 아래 00_admin, 01_form_uploads, 02_card_assets, 03_generated/qr 폴더를 준비한다. 기존 폴더 ID는 Script Properties에 저장한다. 권한 오류·휴지통 폴더를 새 폴더로 대체하지 않는다.
5. 공통 입력 검증은 Form과 관리자 어댑터에서 재사용한다. 텍스트 필수값, 계정/공개 이메일, 전화, 파일 ID, 카드별 기본값·이미지·영상 규칙을 처리한다.
6. 신규 토큰은 현재 Cards와 DeletedTokens를 함께 검사한다. 신규 레코드 저장까지 ScriptLock으로 묶는다. 삭제 토큰 기록도 같은 잠금을 사용한다.
7. 신규 레코드 생성은 내부 함수 createCardRecord_로 제공한다. 2단계 처리 파이프라인에 연결하기 전에는 PROCESSING/비공개 상태이며 사용자용 신규 생성 버튼을 제공하지 않는다.

## Google 환경 연결

1. 운영용 Google Sheet를 준비하고 확장 프로그램 → Apps Script를 연다.
2. admin-bound의 모든 .gs, Sidebar.html, appsscript.json을 해당 프로젝트에 추가한다. 예전 Code.gs와 Sidebar.html은 교체한다. 같은 이름의 함수가 중복되지 않게 한다.
3. setupWorkspace를 실행하고 필요한 Google 권한을 허용한다.
4. 생성된 시트·폴더와 Script Properties 값을 확인한다. 운영 Sheet는 00_admin으로 정리한다. Form과 Form 업로드 폴더 연결은 2단계에서 진행한다.
5. CompanySettings 두 번째 행에 회사 정보를 입력한다. 코드에서 저장할 때는 saveCompanySettings가 검증을 적용한다. Sheet 직접 편집은 서비스 검증을 우회하므로 운영자만 수행한다.
6. 공개 프로젝트는 별도로 만들고 public-web 파일만 추가한다. 이 프로젝트의 Script Properties에도 ZNUS_SPREADSHEET_ID를 설정한다. 관리자 프로젝트의 속성이 자동 공유되지 않는다.
7. 실제 공개 주소가 정해지면 관리자 프로젝트에서 아래 임시 실행 함수를 만들어 한 번 실행한다. 주소는 예시가 아닌 실제 주소로 바꾼다.

```javascript
function configureServiceUrl() {
  return configurePublicBaseUrl_('https://script.google.com/macros/s/실제배포ID/exec');
}
```

이 주소는 QR/NFC의 기반이므로 운영 중 같은 배포 주소를 유지한다. 레코드가 존재하면 설정 함수를 통한 다른 주소로의 변경을 거부한다. Script Properties 직접 편집으로 이 보호를 우회하지 않는다. 사용자 정의 도메인으로 이전할 때도 기존 주소를 유지할 이전 경로가 필요하다.

## 설정 키

| 키 | 저장 위치·용도 |
| --- | --- |
| ZNUS_SPREADSHEET_ID | 관리자·공개 프로젝트 각각의 Script Properties |
| ZNUS_SCHEMA_VERSION | 관리자, 현재 1 |
| ZNUS_PUBLIC_BASE_URL | 관리자, 공개 URL 생성 기준 |
| ZNUS_FOLDER_ROOT | 관리자, ZNUS Digital Card |
| ZNUS_FOLDER_ADMIN | 관리자, 00_admin |
| ZNUS_FOLDER_UPLOADS | 관리자, 01_form_uploads |
| ZNUS_FOLDER_ASSETS | 관리자, 02_card_assets |
| ZNUS_FOLDER_GENERATED | 관리자, 03_generated |
| ZNUS_FOLDER_QR | 관리자, 03_generated/qr |

.env.example은 설정 항목 설명용이다. Apps Script는 로컬 .env를 자동으로 읽지 않는다.
기존 명함·회사 데이터를 Git에 넣지 않는다. Google 계정 인증 파일과 로컬 clasp 설정도 제외한다.

## ID와 토큰

cardId는 Utilities.getUuid()의 UUID v4다. publicToken은 별도 UUID 난수 바이트에서 버전·variant 고정 바이트를 제외하고, rejection sampling으로 소문자+숫자 36자에 균등 매핑한다. Math.random, 직원 정보, 순번은 사용하지 않는다.

근거:
- [Apps Script Utilities.getUuid](https://developers.google.com/apps-script/reference/utilities/utilities#getUuid())
- [Java UUID.randomUUID](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/UUID.html#randomUUID())

DeletedTokens는 publicToken만 저장한다. reserveDeletedToken_은 토큰을 중복 없이 등록하는 내부 기반 함수다. 실제 파일·개인정보 완전 삭제는 5단계이며, 반드시 이 함수가 성공한 뒤 Cards 행을 제거해야 한다. 함수 자체는 삭제 작업을 수행하지 않는다.

## 비활성화와 검증 경계

- published와 isActive를 별도로 저장한다. 공개 조회는 두 값 모두 true일 때만 데이터를 반환한다.
- 신규 생성 함수는 같은 계정의 중복 카드 생성을 거부한다. 기존 카드 갱신/비활성 재제출 차단은 2단계 트리거에서 연결한다.
- 배경 입력이 모두 비어 있으면 신규는 DEFAULT, 수정은 현재 설정을 유지한다. DEFAULT는 파일을 비운다. IMAGE/VIDEO는 파일 ID가 필수다.
- 허용 이미지는 JPEG/PNG/WEBP다. 영상 메타데이터 검증은 MP4, 18MiB(18×1024×1024 bytes), 3초, 가로 2560·세로 1440 이하를 적용한다.
- 파일 ID 형식 검증은 파일의 실재·소유권·실제 형식 검증을 대신하지 않는다. 실제 파일 검사, 영상 메타데이터 추출 및 원본/이전 자산 삭제는 3단계다.
- 직원 텍스트 길이는 이름·부서·직책 100자, 업무 항목 200자로 구현했다. Form에서도 같은 제한을 적용한다.
- 검증 함수는 입력의 공개 여부·cardId·토큰 등을 복사하지 않는다. 서버가 시스템 필드를 지정한다.

## 검증과 남은 실행

npm test는 서비스 대역을 이용하여 반복 초기화, 레거시 보존, 폴더 복구/권한 오류, 열 순서 독립성, 토큰 충돌·삭제 목록, 데이터 검증, 공개 데이터 제외를 확인한다.

실제 Google 환경에서는 다음을 확인해야 한다.
- 초기 설정 두 번 실행 시 시트·폴더 중복 및 기존 데이터 변경이 없는지
- Sheet 편집자만 운영 도구에 접근하는지
- 공개 웹 앱의 새 스키마 조회, 익명 접근 및 이미지 권한
- 데이터가 있는 레거시 시트를 실제로 사용하는 경우 별도 이관

현재 개발 세션에서는 Google 리소스를 생성하거나 웹 앱을 배포하지 않는다. 실제 Google Sheet/Apps Script 연결 정보가 제공되면 위 실행을 이어갈 수 있다.
