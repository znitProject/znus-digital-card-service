# 2단계: Form → 명함 자동 생성·수정

`apps-script/admin-bound/FormAutomation.gs`는 운영 Sheet와 Google Form을 ID로 연결하는 독립 Apps Script에 복사해 사용하는 파일입니다.

1. 코드 전체를 Apps Script 프로젝트에 붙여 넣고 저장합니다. 이 단계까지는 Google 권한 승인이 필요 없습니다.
2. 마지막에 `setupFormAutomationAll`을 한 번 실행해, 필요한 Google 권한을 한 번에 승인하고 `Cards`, `CompanySettings`, `DeletedTokens`, 텍스트 Form 항목, 제출 트리거를 구성합니다.
3. Form 화면에서 파일 업로드 질문 5개를 수동으로 추가합니다. 업로드 영역 안내에는 “프로필 사진은 필수입니다. 카드 배경은 바꾸려는 카드에만 파일을 올려 주세요. 업로드한 파일 형식에 따라 이미지 또는 영상 배경으로 자동 적용됩니다. 파일을 올리지 않으면 기존 배경을 유지합니다.”라고 표시합니다. 질문 제목은 `프로필 사진`, `직무 카드 배경 파일`, `연락처 카드 배경 파일`, `회사 카드 배경 파일`, `링크 카드 배경 파일`을 사용합니다. `프로필 사진`은 “명함에 표시할 사진을 1장 업로드하세요. JPG, PNG 또는 WEBP 이미지 파일만 첨부할 수 있습니다.”로 안내하고, 각 카드 배경은 “바꾸려는 [카드명]에 사용할 이미지 또는 MP4 영상 1개를 업로드하세요. 파일을 올리지 않으면 현재 [카드명] 배경을 유지합니다.”로 안내합니다.
4. 공개 웹 앱을 배포한 뒤 `ZNUS_PUBLIC_BASE_URL`을 설정하면 생성 행에 토큰 기반 `publicUrl`이 기록됩니다.

분리 실행이 필요할 때만 `setupFormAutomationWorkspace`, `setupFormAutomationForm`을 각각 실행합니다. 이미 파일 업로드 질문을 만든 Form은 `simplifyFormBackgroundUploads`를 한 번 실행해 배경 선택 질문을 제거하고 파일 업로드 항목을 설문 맨 아래로 이동합니다. 운영 연결 전에는 `setupFormAutomationAll`을 실행하지 마세요.

같은 Google 계정이 이미 활성 카드로 등록되어 있으면 기존 행을 갱신하고 `cardId`, `publicToken`, `publicUrl`, 생성일을 유지합니다. 비활성 카드의 재제출은 `SKIPPED_INACTIVE`로 차단하고 새 업로드 파일은 휴지통으로 보냅니다. 신규 토큰은 Cards와 DeletedTokens를 함께 조회해 재사용하지 않습니다.

Google Forms의 Apps Script 서비스와 Google Forms API는 파일 업로드 질문 생성을 지원하지 않습니다. 파일 질문을 추가한 뒤에는 자동 재구성 함수가 해당 질문을 삭제하지 않도록 실행을 중단합니다. Form의 텍스트·선택 항목을 다시 구성해야 하면 파일 업로드 질문을 먼저 수동으로 삭제한 뒤 `setupFormAutomationForm`을 실행하세요. 자동 구성되는 제목·설명·질문·선택지는 모두 한국어이며, 기존 명함을 다시 제출하면 공개 주소를 유지한 채 내용만 갱신됩니다.
