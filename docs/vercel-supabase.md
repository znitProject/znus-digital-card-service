# Vercel + Supabase 운영 설정

로컬 실행은 기존 `.env`의 PostgreSQL과 `.data` 파일 저장을 그대로 사용합니다. Vercel에서만 아래 Supabase 환경변수를 사용합니다.

## Supabase 준비

1. Supabase에서 PostgreSQL 프로젝트를 생성합니다.
2. SQL Editor 또는 로컬에서 Prisma migration을 실행해 테이블을 만듭니다.
3. Storage에 `znus-media` 버킷을 만들고 Public bucket으로 설정합니다.
4. Vercel Production 환경변수에 다음 값을 추가합니다.

```text
SUPABASE_DATABASE_URL=Supabase의 PostgreSQL 연결 문자열
SUPABASE_URL=https://프로젝트참조.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabase 서버용 service_role 키
SUPABASE_STORAGE_BUCKET=znus-media
```

`SUPABASE_SERVICE_ROLE_KEY`는 브라우저 코드에 넣지 않고 Vercel 환경변수에만 저장해야 합니다.

## Migration 실행

연결 문자열을 로컬 `.env`에 커밋하지 말고, PowerShell에서 한 번만 지정한 뒤 실행합니다.

```powershell
$env:SUPABASE_DATABASE_URL = '여기에 Supabase 연결 문자열'
npm run db:deploy
Remove-Item Env:SUPABASE_DATABASE_URL
```

이후 Vercel을 재배포하면 Vercel은 Supabase PostgreSQL을 사용하고, 로컬 실행은 기존 DB를 계속 사용합니다.

이미지와 MP4는 Vercel의 임시 파일 시스템에 저장하지 않고 Supabase Storage에 업로드되며, 공개 명함에서는 Storage 공개 URL로 전달됩니다.
