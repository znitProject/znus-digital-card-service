# ZNUS 디지털 명함 서비스 요구사항

## 1. 목표

모든 직원이 동일한 고정 명함 디자인을 사용하되, 직원별 텍스트 정보와 프로필 이미지, 카드별 배경 미디어만 다르게 적용되는 공개 디지털 명함 서비스를 만든다.

초기 버전은 Google Workspace만으로 운영한다. Cafe24 배포와 사용자 정의 도메인 연결은 이후 단계에서 진행한다.

### 운영 규모와 원칙

- 초기 대상은 약 30명이며, 정보 수정은 드물게 발생한다.
- 명함은 신규 제출 직후 자동으로 공개한다. 운영자의 사전 승인 절차는 없다.
- 공개 URL은 생성 후 고정한다. 정보·미디어를 수정해도 같은 URL에서 최신 명함을 볼 수 있다.
- 현재 활성 데이터와 미디어만 유지한다. 변경 이력과 이전 미디어의 복구 기능은 제공하지 않는다.
- 공개 URL은 접근 제어 수단이 아니다. URL을 전달받은 사람은 로그인 없이 명함을 볼 수 있다.

## 2. 확정 기술 구성

```text
Google Form 제출
        ↓
Google Sheets 응답 데이터
        ↓
Google Apps Script 자동 처리
        ├─ 공개 디지털 명함
        ├─ 운영자 명함 관리 대시보드
        └─ Google Drive 미디어 관리
```

- 서비스 프레임워크: Google Apps Script
- 데이터 저장소: Google Sheets
- 이미지·영상 저장소: Google Drive
- 입력 및 수정 화면: Google Form
- 소스 관리: GitHub `znitProject/znus-digital-card-service`
- Cafe24는 이후 사용자 정의 도메인과 공개 배포가 필요해질 때 연결한다.

## 3. 사용자와 권한

### 공개 명함 방문자

- 로그인 없이 공개 명함 URL을 열 수 있다.
- 명함에 공개하도록 입력한 전화, 이메일, 웹사이트 등만 볼 수 있다.
- 비공개 처리된 URL에 접속하면 명함 정보 대신 “비공개된 명함입니다” 안내 페이지를 본다.
- 완전 삭제된 명함의 기존 URL은 삭제 안내 또는 404 응답을 반환한다.

### 직원

- Google 계정으로 로그인한 뒤 Google Form을 제출한다. 파일 업로드를 위해 로그인은 필수다.
- Google 계정 이메일에는 도메인이나 형식에 대한 별도 제한을 두지 않는다.
- 제출 Google 계정 이메일을 명함의 고유 식별 기준으로 사용한다.
- 같은 이메일로 다시 제출하면 새 명함을 만들지 않고 기존 명함을 갱신한다. 단, 비활성화된 명함은 재제출을 반영하지 않는다.
- 비활성화된 직원도 Google Form 제출은 가능하며 제출 완료 화면을 본다. 서버는 해당 제출로 명함을 수정하거나 신규 생성·재공개하지 않는다.
- 다른 Google 계정 이메일로 제출하면 다른 직원으로 인식해 새 명함을 만든다. 계정 이메일 변경이 필요한 드문 경우에는 운영자가 대시보드에서 기존 명함의 식별 이메일을 직접 수정한다.
- 처리 결과는 이메일로 알리지 않는다. 직원은 공개 URL을 통해 반영된 결과를 확인한다.

### 운영자

- Google Drive와 Google Sheets의 편집 권한으로 운영자를 관리한다. 별도 관리자 로그인 화면은 만들지 않는다.
- 운영자 대시보드는 Google 계정과 Drive·Sheets 편집 권한을 기준으로 접근을 관리한다.
- 대시보드에서는 모든 명함을 조회하고 이름·부서·직함·이메일·처리 상태·공개 상태로 검색·필터링한다.
- 대시보드는 전체·공개·비공개·처리 중·오류 상태의 요약 통계를 표시한다.
- 운영자는 실제 공개 템플릿과 동일한 디자인의 미리보기를 확인하고, 공개 URL 열기·복사와 QR 코드를 확인할 수 있다.
- 운영자는 공개 여부, 텍스트 정보, 활성 배경 미디어를 수정할 수 있다. 저장 시 Form 제출과 같은 데이터 검증 규칙을 적용한다.
- 운영자는 명함을 비공개 처리하거나 비활성화·재활성화하거나 완전 삭제할 수 있다.
- 비공개는 공개 표시만 중단한다. 비활성화는 명함을 비공개로 전환하고 직원의 재제출 반영도 차단한다. 운영자의 직접 수정은 허용한다.
- 재활성화하면 재제출 반영을 다시 허용한다. 공개 여부는 운영자가 별도로 설정하며 자동 재공개하지 않는다.
- 완전 삭제 시 명함 데이터, 카드별 미디어, Form 원본 업로드 파일, 생성된 QR 파일을 모두 삭제한다. 삭제된 공개 URL 토큰은 다시 사용하지 않는다.
- 처리 상태와 오류는 대시보드에만 표시하며, 이메일 알림은 보내지 않는다.

## 4. 명함 생성 및 수정 흐름

```text
직원이 Google Form 제출
        ↓
Apps Script onFormSubmit 트리거 실행
        ↓
제출 Google 계정 이메일로 기존 명함 검색
        ↓
신규 직원: cardId·공개 URL 키·공개 URL·QR 코드 생성 후 즉시 공개
기존 활성 직원: 같은 카드의 데이터와 활성 미디어 갱신(공개 상태 유지)
기존 비활성 직원: 수정·생성·재공개 차단, 제출된 불필요한 원본 파일 정리
        ↓
Google Sheets 및 Google Drive 반영
        ↓
같은 공개 URL에서 최신 명함 표시
```

- 신규 제출 시 내부 카드 ID와 공개 URL 키를 자동 발급한다.
- 기존 직원 수정 시 `cardId`, 공개 URL 키, 공개 URL, QR 코드와 NFC 주소 및 공개 상태를 유지한다.
- 트리거는 계정 이메일로 기존 명함을 찾은 뒤 비활성 여부를 먼저 검사하고, 저장 직전에도 비활성화와 충돌하지 않도록 검사·갱신을 동기화한다.
- 비활성 명함의 제출은 정상적인 반영 차단으로 처리하며 기존 명함 데이터·활성 미디어·처리 상태를 덮어쓰지 않는다. 해당 제출에서 새로 업로드된 불필요한 원본은 삭제한다.
- 텍스트 필드는 최신 제출값으로 갱신한다. 모든 텍스트 필드가 필수이므로 빈 값으로 기존 값을 유지하는 동작은 제공하지 않는다.
- 프로필 카드는 직원이 제출한 프로필 이미지를 항상 사용한다.
- 직무·연락처·회사·링크 카드는 기본 디자인의 배경을 사용한다. 직원이 각 카드를 개별 지정해 이미지 또는 영상으로 교체할 수 있다.
- 배경 교체가 제출된 카드에 대해서만 활성 배경 미디어를 교체한다. 배경을 기본값으로 되돌리는 요청도 처리할 수 있어야 한다.
- 새 활성 미디어로 교체하거나 기본값으로 되돌리면 이전 카드 자산은 보관하지 않고 삭제한다.
- 트리거 처리 실패 시 `processingStatus`와 `errorMessage`를 기록해 대시보드에서 확인할 수 있어야 한다.

## 5. Google Form 입력 항목과 검증

Google Form은 응답 1회 제한을 사용하지 않는다. 직원이 정보를 수정할 때마다 다시 제출해야 하기 때문이다.

### 필수 직원 정보

- Google 계정 이메일 주소 수집
- 이름(국문), 이름(영문)
- 부서
- 직책(국문), 직책(영문)
- 업무 목록 5개(국문), 업무 목록 5개(영문)
- 공개 휴대전화 번호, 공개 이메일 주소
- 프로필 이미지 업로드

업무 목록은 명함의 직무 카드에 순서대로 표시한다. 국문·영문 항목은 각각 5개를 입력받고 언어 전환 시 대응하는 목록을 표시한다.

### 선택 가능한 카드별 배경 변경

프로필 카드는 프로필 이미지를 항상 사용하므로 별도 배경 유형을 고르지 않는다. 나머지 카드는 기본 디자인의 배경을 사용하며, 직원은 다음 항목을 통해 카드별로만 배경을 교체할 수 있다.

- 직무 카드 배경 변경: 기본값, 이미지, 영상
- 연락처 카드 배경 변경: 기본값, 이미지, 영상
- 회사 카드 배경 변경: 기본값, 이미지, 영상
- 링크 카드 배경 변경: 기본값, 이미지, 영상

배경 변경 항목은 선택 입력이다. 이미지 또는 영상을 선택한 경우에만 해당 파일 업로드가 필수다. `기본값`을 선택하면 기존 개인 배경을 삭제하고 `cardDesign/명함_디자인/`의 기본 배경으로 되돌린다. 신규 명함에서 배경 변경 항목을 선택하지 않으면 기본값을 사용한다. 기존 명함에서 배경 변경 항목과 파일을 모두 비워 제출하면 현재 설정을 유지한다.

직원은 공개 URL이나 URL 키를 직접 입력하거나 변경할 수 없다. 회사명·대표 전화·팩스·회사 주소·회사 웹사이트·로고·슬로건은 전 직원 공통 설정이므로 직원 Form에서 입력받지 않는다.
## 6. 공통 디자인과 미디어

### 디자인

- 모든 명함은 하나의 HTML/CSS/JavaScript 디자인 템플릿을 사용한다.
- 카드 디자인과 카드 섹션 구성은 추후 제공되는 고정 디자인을 그대로 적용한다.
- 프로필 카드는 직원의 프로필 이미지를 배경으로 사용한다.
- 직무·연락처·회사·링크 카드는 기본적으로 `cardDesign/명함_디자인/`의 배경을 사용한다.
- 직원은 위 네 카드의 배경만 이미지 또는 영상으로 개별 교체할 수 있다. 카드마다 기본값으로 되돌릴 수 있다.

### 이미지

- 업로드 가능한 이미지 형식은 JPG/JPEG, PNG, WEBP이다.
- 프로필 이미지와 선택한 이미지 배경은 필수다.

### 영상

- 업로드 가능한 영상 형식은 MP4만 허용한다.
- 권장 코덱은 H.264이며, 음성은 사용하지 않는다.
- 최대 길이는 3초, 최대 해상도는 QHD(2560×1440), 최대 파일 크기는 18MB다.
- 영상은 음소거, 반복 재생, 인라인 재생으로 처리한다.
- 별도 포스터 이미지 업로드는 받지 않는다. 영상이 로드되면 첫 프레임을 정지 상태로 먼저 표시한 뒤 재생한다.
- 영상 로드 또는 자동재생이 실패하거나 절전·데이터 절약 모드인 경우 기본 색상 또는 그라데이션을 표시한다.
- 자연스러운 반복을 위해 영상 제작 시 첫 프레임과 마지막 프레임을 같은 이미지·장면으로 구성하는 것을 권장한다.
### 간략 명함 이미지 다운로드

- 공개 명함에는 `간략 명함 이미지 다운로드` 버튼을 제공한다.
- 버튼을 누르면 현재 공개 중인 직원 데이터를 `cardDesign/간략명함_디자인/`의 고정 레이아웃에 적용한 정적 PNG 이미지로 생성해 다운로드한다.
- 다운로드 이미지는 원본 디자인 크기인 626×1110px을 유지한다.
- 이미지에는 간략 명함 디자인과 직원 정보만 포함하며, 다운로드 버튼·브라우저 UI·공개 명함의 영상 배경은 포함하지 않는다.
- 이미지는 요청 시 생성하며, 별도의 다운로드 이미지 파일이나 생성 이력을 Google Drive에 저장하지 않는다.

## 7. 고정 공개 URL과 QR 코드

각 명함은 내부 식별자와 외부 공개 URL 키를 별도로 가진다.

| 항목 | 용도 | 규칙 |
| --- | --- | --- |
| `cardId` | 시스템 내부 식별자 | UUID v4로 생성하며 외부에 노출하지 않는다. 변경하지 않는다. |
| `publicToken` | 공개 URL 키 | 영문 소문자와 숫자로 이루어진 12자리 암호학적 난수다. 직원 정보·순번·부서 등 유추 가능한 값은 사용하지 않는다. |

예시:

```text
Apps Script 초기 URL: https://script.google.com/macros/s/.../exec?card=m4x7k9q2v8rc
향후 사용자 정의 도메인: https://card.example.com/m4x7k9q2v8rc
```

`publicToken` 규칙:

- 신규 명함 생성 시 시스템이 자동 발급한다.
- 12자리 영문 소문자와 숫자만 사용한다.
- 서비스 전체에서 중복될 수 없으며, 생성 시 현재 명함과 삭제된 토큰 목록 모두에 대해 중복 검증한다.
- 생성 후 변경하거나 재사용하지 않는다.
- 명함 데이터 수정, 비공개 처리·재공개 후에도 같은 공개 URL을 유지한다.
- QR 코드와 향후 NFC 태그는 이 고정 공개 URL을 사용한다.

공개 URL 키는 다른 사람의 URL을 순번이나 이름으로 유추하기 어렵게 하는 목적이다. URL 자체는 공개 링크이며 권한 검증 기능은 제공하지 않는다.

## 8. Google Drive 폴더 구조와 삭제 정책

```text
ZNUS Digital Card/
├─ 00_admin/
│  ├─ ZNUS 명함 입력 폼
│  └─ ZNUS 명함 데이터베이스 (Google Sheets)
├─ 01_form_uploads/
│  └─ Google Form 원본 업로드 파일
├─ 02_card_assets/
│  ├─ <cardId>/
│  │  ├─ profile_current.<image-ext>
│  │  ├─ role_background_current.<ext>
│  │  ├─ contact_background_current.<ext>
│  │  ├─ company_background_current.<ext>
│  │  └─ links_background_current.<ext>
│  └─ ...
└─ 03_generated/
   └─ qr/
```

- `01_form_uploads`에는 처리 중인 Google Form 원본 업로드 파일을 둔다.
- Apps Script는 활성 파일을 `02_card_assets/<cardId>/`로 정리한다.
- 처리 완료 후 더 이상 필요하지 않은 Form 원본과 교체된 이전 카드 자산은 삭제한다.
- Google Sheets에는 현재 사용 중인 파일 ID와 URL만 저장한다.
- 카드마다 별도 HTML 파일을 만들지 않는다. 하나의 공개 명함 템플릿이 `cardId`별 데이터를 동적으로 표시한다.
- 카드 자산 폴더는 비공개로 유지하고, 공개 명함에 필요한 개별 미디어 파일에만 링크 보유자 보기 권한을 적용한다.
- 완전 삭제 요청 시 해당 카드의 자산 폴더와 관련 Form 원본, QR 파일, 명함에 연결된 Form 응답 및 Sheets 데이터를 모두 영구 삭제한다. 단순 보관함 이동으로 끝내지 않는다.
- 예외적으로 공개 토큰 값만 DeletedTokens 시트에 남겨 재사용을 막는다. 이름·계정 이메일·cardId·미디어 정보 등 삭제된 명함과 연결되는 다른 값은 보관하지 않는다.
- 카드 데이터를 삭제하기 전에 토큰을 DeletedTokens에 기록한다. 삭제 도중 실패하더라도 토큰은 재발급하지 않는다.

## 9. Google Sheets 주요 데이터

명함 디자인의 표시 구조에 맞춰 명함별 데이터와 전 직원 공통 회사 설정을 분리한다. 회사 정보는 명함마다 중복 저장하지 않는다.

### 9.1 `Cards` 시트: 명함별 데이터

```text
cardId
googleAccountEmail
publicToken
published
isActive
nameKo
nameEn
department
jobTitleKo
jobTitleEn
roleItem1Ko
roleItem2Ko
roleItem3Ko
roleItem4Ko
roleItem5Ko
roleItem1En
roleItem2En
roleItem3En
roleItem4En
roleItem5En
mobilePhone
publicEmail
profileImageFileId
roleBackgroundMode
roleBackgroundFileId
contactBackgroundMode
contactBackgroundFileId
companyBackgroundMode
companyBackgroundFileId
linksBackgroundMode
linksBackgroundFileId
publicUrl
qrUrl
nfcStatus
formResponseId
createdAt
updatedAt
processingStatus
errorMessage
```

| 디자인 영역 | 사용하는 명함별 데이터 |
| --- | --- |
| 프로필 카드 | `nameKo`, `nameEn`, `profileImageFileId` |
| 직무 카드 | `department`, `jobTitleKo`, `jobTitleEn`, `roleItem1~5Ko`, `roleItem1~5En`, `roleBackgroundMode`, `roleBackgroundFileId` |
| 연락처 카드 | `mobilePhone`, `publicEmail`, `contactBackgroundMode`, `contactBackgroundFileId` |
| 회사 카드 | `companyBackgroundMode`, `companyBackgroundFileId`와 공통 회사 설정 |
| 링크 카드 | `publicUrl`, `qrUrl`, `linksBackgroundMode`, `linksBackgroundFileId`와 공통 회사 설정 |
| 간략 명함 PNG | `nameKo`, `nameEn`, `jobTitleKo`, `mobilePhone`, `publicEmail`와 공통 회사 설정 |

### 9.2 `CompanySettings` 시트: 공통 회사 설정

```text
companyName
companyWebsite
companyPhone
companyFax
officeAddress
companyLogoFileId
sloganLine1
sloganLine2
sloganLine3
```

- 이 시트에는 전 직원에게 동일하게 표시되는 회사 카드, 연락처 카드의 대표 전화·팩스, 간략 명함의 주소 정보, 지도 검색 주소, 회사 웹사이트·로고·슬로건을 관리한다.
- 초기에는 한 행만 사용한다. 향후 여러 법인 또는 브랜드를 지원할 때만 `companyId`를 `Cards` 시트에 추가한다.

### 9.3 `DeletedTokens` 시트: 삭제된 공개 토큰

- publicToken 한 열만 사용하며 완전 삭제한 명함의 토큰을 영구 보관한다.
- 신규 토큰 발급 시 Cards와 DeletedTokens 모두 검사하며, 동시 생성·삭제에도 중복 또는 재사용이 발생하지 않도록 처리한다.
- 삭제된 직원의 개인정보나 명함 복구용 데이터는 저장하지 않는다.

### 9.4 데이터 규칙

- `cardId`: UUID v4. 내부 식별자로만 사용한다.
- `googleAccountEmail`: 같은 명함을 갱신할지 판단하는 고유 키다.
- `publicToken`: 12자리 무작위 공개 URL 키다. 변경·재사용하지 않는다.
- `published`: isActive가 true이고 published도 true일 때만 공개 명함을 표시한다. 그 외에는 비공개 안내 페이지를 표시한다.
- `isActive`: 신규 명함은 true다. false이면 직원의 재제출 반영을 차단하고 published도 false로 설정한다. 운영자만 재활성화할 수 있다. 단순 비공개와 구분한다.
- `profileImageFileId`: 프로필 카드의 필수 배경 이미지다.
- `*BackgroundMode`: `DEFAULT`, `IMAGE`, `VIDEO` 중 하나다. `DEFAULT`이면 해당 화면은 기존 `cardDesign/명함_디자인/`의 기본 배경을 사용한다.
- `*BackgroundFileId`: `IMAGE` 또는 `VIDEO`일 때만 현재 활성 파일 ID를 저장한다. 변경되거나 `DEFAULT`로 전환되면 이전 파일은 삭제한다.
- `roleItem1~5Ko`, `roleItem1~5En`: 직원별 업무 목록이며, 두 언어의 동일 순번 항목이 서로 대응한다.
- `processingStatus`: 최소 `PROCESSING`, `COMPLETED`, `ERROR` 상태를 사용한다.
- `errorMessage`: 오류 상태일 때 원인을 저장하며 대시보드에서 확인한다.
## 10. 현재 개발 범위

- GitHub 기반 소스 관리
- Google Form 설계: 직원별 한글·영문 업무 목록과 카드별 선택 배경 검증
- Google Sheets 데이터 구조
- Google Drive 미디어 정리 및 교체 파일 삭제
- Form 제출 트리거 자동화
- 신규 명함 생성, 즉시 공개, 기존 명함 수정
- 기존 `cardDesign/명함_디자인/` 기반의 공개 명함 UI 적용`r`n- 기존 `cardDesign/간략명함_디자인/` 기반의 간략 명함 PNG 다운로드
- 운영자 명함 관리 대시보드: 전체 목록, 검색·필터, 상태 통계, 명함 미리보기, 공개·비공개·비활성화·재활성화·완전 삭제, 공개 URL·QR 관리
- 프로필 이미지와 직무·연락처·회사·링크 카드별 이미지·MP4 배경
- 추측하기 어려운 고정 공개 URL 키 생성 및 중복 검증
- QR 코드용 고정 URL
- 대시보드 기반 처리 상태와 오류 확인

## 11. 이후 단계

- Cafe24 배포
- 사용자 정의 도메인 연결
- 별도 관리자 화면 및 권한 관리
- NFC 태그 기록 자동화
- 대용량 영상용 CDN 및 영상 변환 처리
- 자동 영상 썸네일·마지막 프레임 추출 기능
