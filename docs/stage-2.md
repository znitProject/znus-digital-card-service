# 2단계: Form → 명함 자동 생성·수정

`apps-script/admin-bound/FormAutomation.gs`는 운영 Sheet와 Google Form을 ID로 연결하는 독립 Apps Script에 복사해 사용하는 파일입니다.

1. 코드 전체를 Apps Script 프로젝트에 붙여 넣고 저장합니다. 이 단계까지는 Google 권한 승인이 필요 없습니다.
2. 마지막에 `setupFormAutomationAll`을 한 번 실행해, 필요한 Google 권한을 한 번에 승인하고 `Cards`, `CompanySettings`, `DeletedTokens`, 입력 Form, 제출 트리거를 함께 구성합니다.
3. 공개 웹 앱을 배포한 뒤 `ZNUS_PUBLIC_BASE_URL`을 설정하면 생성 행에 토큰 기반 `publicUrl`이 기록됩니다.

분리 실행이 필요할 때만 `setupFormAutomationWorkspace`, `setupFormAutomationForm`을 각각 실행합니다. 운영 연결 전에는 `setupFormAutomationAll`을 실행하지 마세요.

같은 Google 계정이 이미 활성 카드로 등록되어 있으면 기존 행을 갱신하고 `cardId`, `publicToken`, `publicUrl`, 생성일을 유지합니다. 비활성 카드의 재제출은 `SKIPPED_INACTIVE`로 차단하고 새 업로드 파일은 휴지통으로 보냅니다. 신규 토큰은 Cards와 DeletedTokens를 함께 조회해 재사용하지 않습니다.
