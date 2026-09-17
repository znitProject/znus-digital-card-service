-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaSlot" AS ENUM ('profile', 'role', 'contact', 'company', 'links', 'logo');

-- CreateTable
CREATE TABLE "company_settings" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "company_name" TEXT NOT NULL DEFAULT '',
    "company_website" TEXT NOT NULL DEFAULT '',
    "company_phone" TEXT NOT NULL DEFAULT '',
    "company_fax" TEXT NOT NULL DEFAULT '',
    "office_address" TEXT NOT NULL DEFAULT '',
    "company_logo_asset_id" UUID,
    "slogan_line_1" TEXT NOT NULL DEFAULT '',
    "slogan_line_2" TEXT NOT NULL DEFAULT '',
    "slogan_line_3" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "employee_number" TEXT,
    "company_email" TEXT NOT NULL,
    "public_email" TEXT NOT NULL DEFAULT '',
    "name_ko" TEXT NOT NULL DEFAULT '',
    "name_en" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "job_title_ko" TEXT NOT NULL DEFAULT '',
    "job_title_en" TEXT NOT NULL DEFAULT '',
    "mobile_phone" TEXT NOT NULL DEFAULT '',
    "role_items" JSONB NOT NULL DEFAULT '{}',
    "public_token" TEXT NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL,
    "employee_id" UUID,
    "slot" "MediaSlot" NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employee_id" UUID,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "input_sessions" (
    "id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "input_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" UUID,
    "action" TEXT NOT NULL,
    "ip_address" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deleted_tokens" (
    "public_token" TEXT NOT NULL,
    "deleted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deleted_tokens_pkey" PRIMARY KEY ("public_token")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_number_key" ON "employees"("employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_email_key" ON "employees"("company_email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_public_token_key" ON "employees"("public_token");

-- CreateIndex
CREATE UNIQUE INDEX "media_assets_storage_key_key" ON "media_assets"("storage_key");

-- CreateIndex
CREATE INDEX "media_assets_employee_id_slot_created_at_idx" ON "media_assets"("employee_id", "slot", "created_at");

-- CreateIndex
CREATE INDEX "otp_challenges_email_created_at_idx" ON "otp_challenges"("email", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "input_sessions_token_hash_key" ON "input_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "input_sessions_expires_at_idx" ON "input_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_sessions" ADD CONSTRAINT "input_sessions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the singleton company settings row used by the public card and admin settings API.
INSERT INTO "company_settings" ("id") VALUES (true) ON CONFLICT ("id") DO NOTHING;
