# ZNUS 디지털 명함 서비스

Google Workspace 기반 디지털 명함 서비스입니다.
소스 저장소: https://github.com/znitProject/znus-digital-card-service

## 현재 상태: 1단계 운영 기반

- Cards, CompanySettings, DeletedTokens 시트 스키마
- 데이터 삭제 없는 반복 초기 설정, 레거시 형식 감지
- 비공개 Drive 폴더 구조 및 Script Properties 설정 관리
- 직원·회사 입력과 배경 변경, 미디어 메타데이터 공통 검증
- UUID v4 카드 ID 및 12자리 공개 토큰 생성
- 현재 토큰·삭제 토큰 중복 검사, 잠금 적용
- 공개 앱의 새 스키마 조회 및 내부 데이터 제외

Form 제출 자동화, 미디어 처리, 고정 디자인 적용, 전체 대시보드, QR·PNG 생성은 아직 구현하지 않았습니다.
공개 화면은 기존 데모 렌더러에 새 데이터를 연결한 임시 상태입니다.

## 구조

- apps-script/admin-bound: 운영 Google Sheet에 바인드합니다. 공개 웹 앱으로 배포하지 않습니다.
- apps-script/public-web: 별도 읽기 전용 공개 웹 앱 프로젝트입니다.
- cardDesign: 공개 명함 및 간략 명함 디자인 원본
- docs/requirements.md: 서비스 요구사항
- docs/stage-1.md: 1단계 설정·검증·후속 개발 안내
- tests: Google 서비스 대역을 사용하는 Node.js 회귀 테스트

## 검증

Node.js 20 이상에서 추가 패키지 설치 없이 실행합니다.

```sh
npm test
```

실제 Google 계정의 권한·Drive 동작·웹 앱 배포는 로컬 테스트로 검증되지 않습니다.
설정 순서는 [1단계 문서](docs/stage-1.md)를 따릅니다.

## 데이터 보존

초기 설정은 샘플 명함을 생성하거나 기존 시트를 지우지 않습니다.
기존 slug/sectionsJson 형식 또는 데이터가 있는 불완전한 Cards 시트는 오류로 중단합니다.
이는 데이터 이관을 완료했다는 의미가 아닙니다. 원본을 보존하고 별도 이관해야 합니다.
