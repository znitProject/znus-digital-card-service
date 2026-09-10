# ZNUS 디지털 명함 서비스

Google Workspace 기반 디지털 명함 서비스입니다.
소스 저장소: https://github.com/znitProject/znus-digital-card-service

## 현재 상태: 4단계 로컬 구현, 운영 연결 전

- Cards, CompanySettings, DeletedTokens 시트 스키마
- 데이터 삭제 없는 반복 초기 설정, 레거시 형식 감지
- 비공개 Drive 폴더 구조 및 Script Properties 설정 관리
- 직원·회사 입력과 배경 변경, 미디어 메타데이터 공통 검증
- UUID v4 카드 ID 및 12자리 공개 토큰 생성
- 현재 토큰·삭제 토큰 중복 검사, 잠금 적용
- 공개 앱의 새 스키마 조회 및 내부 데이터 제외
- Google Form 제출에 따른 명함 생성·수정과 비활성 제출 차단
- Drive 파일의 실제 형식·크기·MP4 길이·해상도 검증
- 카드별 현재 자산 폴더 이동, 링크 보기 권한, 이전 자산 교체 삭제
- 오류 상태(`PROCESSING`, `COMPLETED`, `ERROR`) 기록

원본 공개 디자인에 데이터 연결, QR·626×1110 PNG 생성, 관리자 검색·정보 수정·상태 관리·미리보기를 구현했습니다.
Google 운영 프로젝트 반영과 기본 영상 호스팅, 완전 삭제 기능은 남아 있습니다. [4단계 문서](docs/stage-4.md)에 구현·검증 범위와 운영 연결 순서를 정리했습니다.

## 구조

전체 후속 작업은 [검증·회사 계정 전환·Cafe24 배포 체크리스트](docs/release-roadmap.md)를 기준으로 진행합니다.

- apps-script/admin-bound: 운영 Google Sheet에 바인드합니다. 공개 웹 앱으로 배포하지 않습니다.
- apps-script/public-web: 별도 읽기 전용 공개 웹 앱 프로젝트입니다.
- cardDesign: 공개 명함 및 간략 명함 디자인 원본
- docs/requirements.md: 서비스 요구사항
- docs/stage-1.md: 1단계 설정·검증·후속 개발 안내
- docs/stage-2.md: 2단계 Form 연결·자동화 안내
- docs/stage-3.md: 3단계 Drive 미디어 처리 안내
- docs/stage-4.md: 4단계 공개 화면·관리자 화면과 운영 반영 상태
- tests: Google 서비스 대역을 사용하는 Node.js 회귀 테스트

## 검증

Node.js 20 이상에서 실행합니다. QR 라이브러리는 빌드할 때 HTML 안에 포함합니다.

```sh
npm ci
npm run build
npm test
npm run demo
```

실제 Google 계정의 권한·Drive 동작·웹 앱 배포는 로컬 테스트로 검증되지 않습니다.
설정 순서는 [1단계 문서](docs/stage-1.md)를 따릅니다.

## 데이터 보존

초기 설정은 샘플 명함을 생성하거나 기존 시트를 지우지 않습니다.
기존 slug/sectionsJson 형식 또는 데이터가 있는 불완전한 Cards 시트는 오류로 중단합니다.
이는 데이터 이관을 완료했다는 의미가 아닙니다. 원본을 보존하고 별도 이관해야 합니다.
