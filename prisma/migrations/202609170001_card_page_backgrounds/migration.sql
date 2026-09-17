-- Keep the selected background for each employee and each visible card page.
CREATE TYPE "CardPage" AS ENUM ('profile', 'role', 'contact', 'company', 'links');

CREATE TABLE "card_page_backgrounds" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "page" "CardPage" NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_page_backgrounds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "card_page_backgrounds_media_asset_id_key"
    ON "card_page_backgrounds"("media_asset_id");
CREATE UNIQUE INDEX "card_page_backgrounds_employee_id_page_key"
    ON "card_page_backgrounds"("employee_id", "page");
CREATE INDEX "card_page_backgrounds_employee_id_page_idx"
    ON "card_page_backgrounds"("employee_id", "page");

ALTER TABLE "card_page_backgrounds"
    ADD CONSTRAINT "card_page_backgrounds_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_page_backgrounds"
    ADD CONSTRAINT "card_page_backgrounds_media_asset_id_fkey"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the latest existing media for each page so current cards keep working.
INSERT INTO "card_page_backgrounds" ("id", "employee_id", "page", "media_asset_id", "created_at")
SELECT gen_random_uuid(), latest."employee_id", latest."slot"::text::"CardPage", latest."id", latest."created_at"
FROM (
    SELECT DISTINCT ON ("employee_id", "slot")
      "id", "employee_id", "slot", "created_at"
    FROM "media_assets"
    WHERE "employee_id" IS NOT NULL
      AND "slot" IN ('profile', 'role', 'contact', 'company', 'links')
    ORDER BY "employee_id", "slot", "created_at" DESC
) AS latest;
