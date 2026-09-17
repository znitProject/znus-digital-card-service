-- Store one shared fallback background per visible card page.
CREATE TABLE "card_page_default_backgrounds" (
    "id" UUID NOT NULL,
    "page" "CardPage" NOT NULL,
    "media_asset_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_page_default_backgrounds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "card_page_default_backgrounds_page_key"
    ON "card_page_default_backgrounds"("page");
CREATE UNIQUE INDEX "card_page_default_backgrounds_media_asset_id_key"
    ON "card_page_default_backgrounds"("media_asset_id");

ALTER TABLE "card_page_default_backgrounds"
    ADD CONSTRAINT "card_page_default_backgrounds_media_asset_id_fkey"
    FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
