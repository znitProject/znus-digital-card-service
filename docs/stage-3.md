# 3단계: 업로드 미디어 처리

3단계에서는 Form 응답에 들어온 파일을 실제 Drive 파일로 확인하고, 공개 명함에서 사용할 현재 자산으로 정리합니다. 파일 ID나 Form 응답 문자열만 믿지 않으므로 잘못된 형식의 파일은 명함 데이터에 반영하지 않습니다.

## 구현 범위

1. `MediaProcessing.gs`가 Drive 파일의 휴지통 여부, MIME 형식, 실제 크기를 확인합니다.
2. 이미지는 JPG/JPEG, PNG, WEBP만 허용합니다. 프로필 이미지는 항상 이미지여야 합니다.
3. 영상은 MP4만 허용하고, MP4 컨테이너에서 재생 시간과 첫 번째 영상 트랙의 해상도를 읽습니다. 최대 크기 18MiB, 길이 5초, 해상도 2560×1440 제한을 함께 적용합니다.
4. 유효한 파일은 `02_card_assets/<cardId>/`로 이동하고 `profile_current.jpg`, `role_background_current.mp4`처럼 현재 자산 이름으로 정리합니다. 공개 명함이 읽을 수 있도록 해당 파일에만 링크 보기 권한을 적용합니다.
5. 새 파일을 안전하게 확인한 뒤 교체된 이전 자산을 휴지통으로 보냅니다. 배경을 비워 제출한 수정은 현재 자산을 유지하고, 기본값으로 되돌린 요청은 기존 배경 파일을 삭제합니다.
6. 처리 중 오류가 발생하면 해당 Cards 행의 `processingStatus`를 `ERROR`로 저장하고 `errorMessage`에 원인을 기록합니다. 신규 명함은 처리가 끝날 때까지 비공개 상태를 유지합니다.

## Apps Script 반영 순서

1. 관리자 바인드 Apps Script 프로젝트에 `apps-script/admin-bound`의 `.gs` 파일을 모두 반영합니다. 이번 단계에서 추가되는 파일은 `MediaProcessing.gs`입니다.
2. `setupFormAutomationWorkspace`를 다시 한 번 실행해 `ZNUS Digital Card` 아래의 `01_form_uploads`, `02_card_assets` 등 폴더 ID를 Script Properties에 저장합니다. 단일 `Code.gs`로 운영 중인 개인 테스트 프로젝트는 대신 `setupStage3MediaFolders`를 실행합니다. 기존 폴더가 휴지통에 있거나 같은 이름의 폴더가 여러 개면 자동으로 바꾸지 않고 중단합니다.
3. 이미 파일 업로드 질문을 만든 Form에서는 `setupFormAutomationForm`을 다시 실행하지 않습니다. 기존 파일 질문을 보존하도록 중단되며, Form 제출 트리거는 그대로 유지됩니다.
4. 첫 파일 처리 시 Google Drive 권한을 승인합니다. 승인 후에는 동일한 설치형 Form 제출 트리거가 자동으로 미디어 검증·이동·교체 삭제를 수행합니다.

## 상태 확인

- 성공한 신규 제출: `PROCESSING` → 자산 정리 → `COMPLETED`, `published=true`
- 성공한 기존 제출: 기존 `cardId`, `publicToken`, `publicUrl` 유지 후 `COMPLETED`
- 잘못된 파일 또는 Drive 오류: `ERROR`, `errorMessage` 기록
- 비활성 명함 제출: `SKIPPED_INACTIVE`, 새로 업로드된 Form 원본은 휴지통 처리

영상의 자동재생·포스터·다운로드 이미지와 운영자 대시보드 연결은 다음 단계에서 공개 템플릿과 함께 마무리합니다.
