# ZNUS 디지털 명함

개인 Google 계정으로 임시 연동 테스트합니다. 기능 구현·검증 후 회사 계정 전환과 Cafe24 배포를 진행합니다.

- **대시보드:** 직원 정보와 명함 디자인을 확인하는 조회 화면.
- **직원 명함:** 고정 URL로 열람하고 QR·공유·간략 명함 PNG 다운로드 제공.
- Google 원본 직원 정보를 삭제하면 명함 제공 중단. 대시보드 편집·상태 변경·삭제 기능은 제외.

## 문서

- [요구사항](docs/requirements.md)
- [데이터 연결](docs/stage-1.md)
- [Form 입력](docs/stage-2.md)
- [미디어 처리](docs/stage-3.md)
- [대시보드·명함·간략 명함 디자인 코드](docs/stage-4.md)

## 로컬 실행

Node.js 20 이상에서 실행합니다.

```sh
npm ci
npm run build
npm test
npm run demo
```

데모: http://127.0.0.1:4173 — 실제 Google 연동 검증과 별개입니다.
