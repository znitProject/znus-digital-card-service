# 요구사항

## 현재 범위

Google Form·Sheets·Drive·Apps Script로 구현·검증합니다. Cafe24 배포는 이후 진행합니다.

## 웹 페이지: 2종류

**대시보드**
- 직원 목록·검색과 입력 정보 확인.
- 실제 명함 디자인 미리보기.
- 명함 URL·QR 확인, 입력 누락·처리 오류 확인.
- 운영자용 조회 화면. 정보·배경 수정, 공개·비공개, 비활성화·재활성화, 완전 삭제 기능은 제외.

**직원 명함**
- 공통 디자인에 직원 정보·프로필·배경을 연결.
- 로그인 없는 직원별 고정 URL.
- 한영 전환, 연락처·회사 링크, QR·공유.
- 간략 명함 PNG 다운로드(626×1110px). 별도 서비스 페이지는 추가하지 않음.

## 입력과 저장

- 신규 입력과 수정은 직원 모두 같은 Google Form 링크 하나를 사용합니다.
- Form은 로그인 계정별 응답을 1개만 허용하고 응답 수정을 켭니다. 같은 계정이 다시 열면 기존 응답을 수정하며 기존 값이 표시됩니다.
- 직원은 Google 계정 이메일로 식별하며, 공개 연락용 이메일과 별도로 관리합니다.
- 직원 정보는 Sheets, 이미지·영상은 Drive에 저장합니다.
- 이름·직책은 국문/영문, 업무 목록은 각 언어 5개이며 부서·공개 전화·공개 이메일·프로필 사진 또는 영상을 받습니다.
- 회사명·대표 연락처·주소·웹사이트·로고·슬로건은 공통 설정입니다.
- 신규 명함은 정상 처리 후 자동 제공하며 수정해도 URL과 QR은 유지합니다.
- 수정 처리에 실패하면 기존 정상 명함을 유지하고 대시보드에 오류를 표시합니다.
- 이메일 알림은 보내지 않습니다.

- 직원 정본은 Form이 연결된 `설문지 응답 시트1` 하나이며, 별도 `Cards` 탭은 만들지 않습니다. 수정 제출은 같은 Form 응답 행을 갱신하므로 중복 직원 행을 만들지 않습니다.
- Form 원본 열 옆에는 숨김 시스템 열 `publicToken`, `formResponseId`, `processingStatus`, `errorMessage`만 둡니다. 직원 정보를 시스템 열에 다시 복제하지 않습니다.
- `publicToken`은 최초 정상 제출 때 무작위로 한 번 만들고 수정해도 유지합니다. 공개 URL과 QR은 이 토큰으로 계산하며 별도 열에 저장하지 않습니다.
- 삭제된 직원의 공개 토큰은 `DeletedTokens`에 남겨 재사용하지 않습니다.
- 기존 `Cards` 탭이 남아 있는 경우에는 `migrateCardsToFormResponseSheet()`를 1회 실행해 응답 시트로 옮긴 뒤 검증합니다. 자동으로 기존 탭을 삭제하지 않으며, 이관 후 운영 코드는 `Cards`를 읽지 않습니다.

## 정본 Google 파일

- 운영 계정: `znitdesign@gmail.com`
- 정본 Sheet: `ZNUS 명함 데이터베이스` (`11FMCexeeRz5mLHylUuTTKzyO4uFNQkM-5UAPn9mdTww`)
- 정본 Form: `ZNUS 디지털 명함 입력` (`1HVOoOaRB2VDo25jgPRVepvDtjTbGxgtZ_3kK1_Tfh1g`)
- 공용 Form 링크: `https://docs.google.com/forms/d/e/1FAIpQLScQR08lvthv2JDIDH1FpN1lc7-xQ5QBddpAwzXMAKSk-AohnA/viewform`
- 기본 영상 폴더: `명함카드 디폴트 영상` (`1lHBYgIvtu8tSQqf2jb6qTBRgzNqZhQYr`)
- 기본 영상: `role.mp4` (`12j1PGCRYFy59hoqDQQ8nk7zVodmUtfe4`), `contact.mp4` (`1R0DD8v-h-zkqgYJYml6D81gfGXN_OLww`), `web.mp4` (`1gGZ67mzv02_-aRp0zEFd5rifc5aLRUhk`), `links.mp4` (`1A5KkazKDi8HVuXmR9z7CKPG9UkYDXZKM`)
- 공통 로고: `logo_w_2.svg` (`1rhos83xvErRoFwtqDXXHVsnce46WBqf-`)

## 운영 기준

- 운영에는 정본 Google Form 1개·정본 Sheet 1개·정본 공개 배포 1개만 사용합니다.
- Form 항목·Apps Script 처리·명함 표시를 변경할 때는 세 곳을 함께 수정하고 실제 연결 상태를 확인합니다.
- 코드 저장만으로 완료하지 않으며, 공개 배포를 갱신한 뒤 기존 직원 URL에서 실제 표시를 확인합니다.
- 데이터·Form·Drive 구조에 영향을 주는 변경은 대상과 영향 범위를 먼저 확인한 뒤 진행합니다.

## 디자인과 미디어

- [기존 디자인 코드](stage-4.md)를 사용합니다.
- 명함 콘텐츠는 `cardDesign/명함_디자인/index.html`에 정의된 항목만 허용하며, 변경 시 디자인 HTML·Form·Apps Script를 함께 수정·검증합니다.
- 프로필은 기본값 없이 사진 또는 영상 한 개를 신규 제출 때 반드시 받으며, 별도 프로필 배경은 없습니다. 재제출에서 프로필을 비우면 기존 파일을 유지합니다. 직무·연락처·회사·링크 카드는 기본 영상 또는 직원별 이미지·영상입니다. 기본 영상은 각각 `role.mp4`, `contact.mp4`, `web.mp4`, `links.mp4`입니다.
- 신규 배경 미첨부는 기본값, 재제출 시 미첨부는 기존 배경 유지입니다. 기본 배경 복원은 입력 흐름에서 처리합니다.
- 직원 이미지: JPG/JPEG·PNG·WEBP. 공통 로고: JPG/JPEG·PNG·WEBP·SVG. 영상: MP4, 최대 5초·2560×1440·30MB.
- 영상은 음소거·반복·인라인 재생하며 실패하면 기본 배경을 표시합니다.
- PNG에는 명함 디자인과 직원 정보만 포함하며 Drive에 별도 저장하지 않습니다.

## 삭제

Sheets에서 직원 행을 삭제하면 기존 URL의 명함 조회를 차단하고 ‘이용할 수 없는 명함입니다’ 안내를 표시합니다.

Drive 폴더나 사진 삭제는 직원 전체 삭제로 간주하지 않습니다.
