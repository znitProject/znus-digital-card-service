# 1단계: 데이터 연결

- 개인 Google 계정으로 테스트합니다.
- Sheets의 `Cards`에 직원 정보, `CompanySettings`에 회사 공통정보를 저장합니다.
- Drive에 프로필·배경 파일을 저장합니다.
- Apps Script의 `ZNUS_SPREADSHEET_ID`, `ZNUS_FORM_ID`와 폴더 설정을 연결합니다.
- 기존 데이터가 있는 환경의 초기 설정을 무작정 다시 실행하지 않습니다.
- 관리자 웹앱은 접근 권한을 운영자 본인으로 제한합니다. 로그인 없이 제공하는 직원 명함은 별도 `public-web` 프로젝트로 배포합니다.

관련 코드: `apps-script/admin-bound/`의 `Config.gs`, `Schema.gs`, `Repository.gs`, `Connection.gs`.
