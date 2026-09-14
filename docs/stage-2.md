# 2단계: Form 입력

- 직원 정보·필수 프로필·선택 배경 파일을 받습니다.
- 같은 계정의 재제출은 기존 명함을 갱신하고 URL을 유지합니다.
- 제출 트리거가 Sheets·Drive에 반영하고 오류는 대시보드에서 확인합니다.
- 업로드 질문은 Form에서 구성합니다. 기존 파일 질문이 있는 Form을 재생성하지 않습니다.

관련 코드: `apps-script/admin-bound/FormAutomation.gs`, `Validation.gs`.

Form의 이메일 수집은 **확인된 이메일**로 설정합니다. 이 계정 이메일로 직원을 식별하며 공개 이메일과 구분합니다.

기존 Form은 `simplifyFormBackgroundUploads()`를 한 번 실행해 카드별 기본 배경 복원 질문을 추가합니다. 기존 업로드 질문은 보존됩니다.

수정 실패 시 기존 정상 명함을 유지합니다. 신규 실패 건은 대시보드에 오류·누락을 표시하며, 수정 제출이 성공하면 같은 직원 ID와 URL로 제공합니다.

기존 `Cards` 행의 `cardId`가 비어 있는 경우에도 재처리 시 UUID를 자동 보정합니다. 기존 응답을 다시 반영할 때는 관리자 Apps Script에서 `reprocessAllFormResponses()`를 한 번 실행합니다.

확인: 신규 제출 시 명함 생성, 재제출 시 같은 URL에서 변경 내용 표시.
