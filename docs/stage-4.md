# 4단계: 디자인 코드

서비스 페이지는 대시보드와 직원 명함 두 종류입니다. 간략 명함은 PNG 다운로드용 디자인입니다.

| 디자인 | 기준 코드 | 역할 |
| --- | --- | --- |
| 대시보드 | [AdminGallery.html](../apps-script/admin-bound/AdminGallery.html) | 직원 목록·검색·정보 확인·명함 미리보기 |
| 직원 명함 | [index.html](../cardDesign/명함_디자인/index.html) | 프로필·직무·연락처·회사·링크 카드와 화면 전환 |
| 간략 명함 | [card.html](../cardDesign/간략명함_디자인/card.html) | 626×1110px 정적 명함 레이아웃 |

## 대시보드

`AdminGallery.html`에 스타일과 화면 동작이 있습니다. `Dashboard.gs`의 `getEmployees()`로 데이터를 읽고 직원의 공개 URL을 iframe으로 미리 봅니다. 대시보드는 처음 열 때와 이후 10초마다 Sheets를 다시 읽어 변경된 직원 수·상태·미리보기를 반영합니다.

현재 웹앱과 Sheet 메뉴는 이 화면을 엽니다. `Dashboard.html`은 이전 관리 화면이며 현재 디자인 기준이 아닙니다.

## 직원 명함

`index.html`에 주요 CSS·HTML·JavaScript가 포함되어 있습니다. `font.css`는 글꼴, `assets/`는 로고·기본 배경입니다. 별도 `style.css`·`app.js`는 현재 빌드에서 직접 읽지 않습니다.

콘텐츠 항목은 이 HTML을 기준으로 Form·Apps Script와 함께 맞춥니다. 프로필 사진·영상은 같은 미디어 영역 한 개입니다.

`web/card-service.js`가 직원 데이터·미디어·QR·다운로드를 연결합니다. 수정 후 `npm run build`를 실행합니다. `scripts/build-web.cjs`가 아래 파일을 생성하므로 생성물을 직접 수정하지 않습니다.

- `apps-script/public-web/Card.html`: 공개 명함.
- `apps-script/admin-bound/Preview.html`, `PreviewData.gs`: 관리자 미리보기용 생성물.
- `apps-script/admin-bound/QrLibrary.html`: 대시보드 QR 라이브러리. 관리자 프로젝트에 함께 반영합니다.

## 간략 명함

`card.html`은 디자인 원본이며 `font.css`·`images/`를 사용합니다. `sample.html`·`sample2.html`은 별도 샘플이고 현재 빌드 입력이 아닙니다.

실제 PNG는 `web/card-service.js`의 `download()`가 Canvas로 그립니다. 원본 HTML을 자동 캡처하지 않으므로 디자인 변경 시 PNG 그리기도 함께 맞춥니다.

## 확인

개인 Google 환경에서 직원 정보·미리보기, 배경·한영 전환, QR·PNG를 확인합니다. 이 문서는 코드 안내이며 실제 검증 완료 기록은 아닙니다.

공개 명함은 요청마다 Cards 시트의 직원 행을 확인하며 직원 데이터 캐시를 사용하지 않습니다. 행을 삭제한 뒤 기존 URL로 다시 접속하면 이용 불가 안내가 표시됩니다. 이미 열어 둔 화면이나 내려받은 PNG는 회수하지 않습니다.
