# ZNUS 디지털 명함

Google Form·Sheets·Drive·Apps Script 대신 자체 Node.js 서비스와 PostgreSQL로 운영하는 디지털 명함 서비스입니다.

## 현재 구현된 범위

- 공용 직원 입력 페이지: `/input`
- 회사 이메일 OTP 인증
- 신규 직원 자동 생성 및 기존 직원 수정
- PostgreSQL 영속 저장
- 공개 명함 API: `/api/cards/{publicToken}`
- 공개 명함 페이지: `/{publicToken}` (기존 `/c/{publicToken}` 링크도 자동 연결)
- 기존 카드 디자인 기반 공개 페이지와 미디어 슬롯 연결
- 관리자 대시보드: 검색·필터·미리보기·상태 변경
- 회사 설정 및 감사 로그 API
- 원격 PostgreSQL 전용 Docker Compose 구성

기존 카드 디자인과 대시보드 디자인은 유지하고, Google 연동 호출부를 자체 PostgreSQL API로 교체했습니다.

## 로컬 실행

Node.js 20 이상과 PostgreSQL이 필요합니다.

루트 `.env`의 `DB_PASSWORD`, `SMTP_USER`, `SMTP_PASSWORD`에 각각 원격 PostgreSQL 비밀번호, 다음 회사 이메일 전체 주소, 다음에서 발급한 앱 비밀번호를 입력한 뒤 다음을 실행합니다. `SMTP_FROM`은 `SMTP_USER`를 자동으로 사용합니다.

```powershell
npm install
npm run db:deploy
npm run db:generate
npm start
```

브라우저에서 `http://127.0.0.1:4173/input`을 엽니다. 다음 SMTP는 `smtp.daum.net:465` SSL 설정을 사용합니다.

## 원격 PostgreSQL 실행

원격 PostgreSQL 접속 정보는 프로젝트 루트 `.env`에 설정되어 있습니다. 원격 PC에서 PostgreSQL Docker를 실행할 때는 `deploy/postgres/docker-compose.yml`과 `deploy/postgres/.env`를 같은 폴더에 복사한 뒤 `.env`의 `POSTGRES_PASSWORD`를 입력하세요. 자세한 내용은 [db-only-deployment.md](docs/db-only-deployment.md)를 참고하세요.
