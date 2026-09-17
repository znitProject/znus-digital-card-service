# 원격 PostgreSQL Docker 배포

개발 PC에서 Prisma migration을 실행하고, PostgreSQL만 `100.102.230.73` PC의 Docker에서 운영하는 구성입니다. 원격 PC에는 Git 저장소 전체가 필요하지 않습니다.

## 1. 원격 PC에 복사할 파일

저장소의 다음 세 파일만 원격 PC의 같은 폴더에 복사합니다.

- `deploy/postgres/docker-compose.yml`
- `deploy/postgres/.env`
- `deploy/postgres/start.ps1` (선택: 시작 자동화)
- `deploy/postgres/diagnose.ps1` (선택: 데이터 삭제 없는 진단)

```powershell
New-Item -ItemType Directory -Force C:\znus-postgres | Out-Null
Set-Location C:\znus-postgres
# 위 파일들을 이 폴더에 복사
notepad .env
```

`.env`의 `POSTGRES_PASSWORD`에 사용할 비밀번호를 입력합니다. `DB_BIND_ADDRESS`, `POSTGRES_DB`, `POSTGRES_USER`는 이미 설정되어 있습니다.

## 2. PostgreSQL 컨테이너 시작

원격 PC에서 Docker Desktop을 실행한 뒤:

```powershell
docker compose up -d db
docker compose ps
docker compose logs db
```

또는 복사한 `deploy/postgres` 폴더에서 제공된 `start.ps1`을 실행할 수 있습니다. `.env`의 비밀번호를 입력한 뒤 실행합니다.

```powershell
Set-Location C:\znus-postgres
.\start.ps1
```

개발 PC에서 `28P01 password authentication failed`가 나오면 원격 PC에서 다음을 실행해 컨테이너·계정·포트·비밀번호 인증이 일치하는지 확인합니다. 비밀번호나 데이터는 출력하지 않습니다.

```powershell
.\diagnose.ps1
```

정상 확인:

```powershell
docker compose exec db pg_isready -U znus_admin -d znus_cards
```

`accepting connections`이 나오면 DB가 준비된 것입니다.

## 3. Windows 방화벽

Docker 포트는 `100.102.230.73`에만 바인딩되지만, Windows 방화벽에서도 Tailscale 대역만 허용합니다.

```powershell
New-NetFirewallRule -DisplayName "ZNUS PostgreSQL Tailscale" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5432 -RemoteAddress 100.64.0.0/10
```

공유기 포트포워딩은 만들지 않습니다. PostgreSQL을 인터넷에 직접 공개하지 않습니다.

## 4. 개발 PC에서 접속

개발 PC 프로젝트 루트 `.env`에는 원격 PostgreSQL 접속 정보가 이미 설정되어 있습니다. `DB_PASSWORD`에 원격 PostgreSQL 비밀번호를 입력하세요. Prisma 명령은 이 값을 이용해 연결 문자열을 자동으로 구성하므로 비밀번호를 다른 곳에 복사할 필요가 없습니다.

개발 PC에 PostgreSQL 클라이언트가 있다면 다음으로 연결을 확인합니다.

```powershell
npm run db:deploy
npm run db:generate
```

## 5. Prisma로 스키마 적용

Prisma schema와 migration 파일은 개발 PC 저장소에서 관리합니다.

```powershell
npm run db:deploy
npm run db:generate
npm run db:studio
```

새 migration을 개발 중 생성할 때는 다음처럼 사용합니다.

```powershell
npx prisma migrate dev --name 변경내용
```

DB 컨테이너는 데이터를 보관하는 역할만 하고, 테이블 생성과 변경의 정본은 Prisma schema와 migration으로 관리합니다.

### 인증 오류가 날 때

`password authentication failed`가 나오면 기존 PostgreSQL 데이터 볼륨이 다른 사용자·비밀번호로 이미 초기화된 경우가 많습니다. `POSTGRES_USER`와 `POSTGRES_PASSWORD`를 바꿔도 기존 볼륨의 계정 비밀번호는 자동으로 바뀌지 않습니다. 먼저 기존 비밀번호로 접속하거나, 데이터가 정말 비어 있는지 확인하고 백업한 뒤에만 볼륨 초기화를 검토합니다. 운영 데이터가 있는 상태에서 `docker compose down -v`는 실행하지 않습니다.

## 6. 확인과 백업

```powershell
docker compose exec db psql -U znus_admin -d znus_cards -c "\dt"
New-Item -ItemType Directory -Force C:\znus-backups | Out-Null
docker compose exec -T db pg_dump -U znus_admin -d znus_cards -Fc > C:\znus-backups\znus_cards_$(Get-Date -Format yyyyMMdd_HHmm).dump
```

운영 중에는 `docker compose down -v`를 실행하지 않습니다. PostgreSQL 데이터 볼륨이 삭제될 수 있습니다.
