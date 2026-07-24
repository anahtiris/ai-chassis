-- Enrich AiPromptConfig with spec metadata + audit fields, and add the
-- immutable ai_prompt_version_id reference on AiConversation. NOT NULL columns
-- (name/created_by/updated_by) are added nullable, backfilled for existing
-- rows, then constrained — so this applies cleanly to a non-empty table.

-- AiConversation: immutable reference to the version active at record time.
ALTER TABLE "app"."ai_conversations" ADD COLUMN "ai_prompt_version_id" TEXT;

-- AiPromptConfig: add optional/defaulted columns immediately; the required
-- ones nullable for now (backfilled below).
ALTER TABLE "app"."ai_prompt_configs"
  ADD COLUMN "archived_by"  TEXT,
  ADD COLUMN "description"  TEXT,
  ADD COLUMN "prompt_type"  TEXT NOT NULL DEFAULT 'CONCIERGE',
  ADD COLUMN "name"         TEXT,
  ADD COLUMN "created_by"   TEXT,
  ADD COLUMN "updated_by"   TEXT;

-- Backfill: display name from the stable slug.
UPDATE "app"."ai_prompt_configs"
SET "name" = "key"
WHERE "name" IS NULL;

-- Backfill: audit actors from the active version's author, else "system".
UPDATE "app"."ai_prompt_configs" c
SET "created_by" = COALESCE(
  (SELECT v."created_by" FROM "app"."ai_prompt_config_versions" v WHERE v."id" = c."active_version_id"),
  'system'
)
WHERE c."created_by" IS NULL;

UPDATE "app"."ai_prompt_configs" c
SET "updated_by" = COALESCE(
  (SELECT v."created_by" FROM "app"."ai_prompt_config_versions" v WHERE v."id" = c."active_version_id"),
  'system'
)
WHERE c."updated_by" IS NULL;

-- Enforce NOT NULL now that every row is populated.
ALTER TABLE "app"."ai_prompt_configs"
  ALTER COLUMN "name"       SET NOT NULL,
  ALTER COLUMN "created_by" SET NOT NULL,
  ALTER COLUMN "updated_by" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "app"."ai_conversations" ADD CONSTRAINT "ai_conversations_ai_prompt_version_id_fkey" FOREIGN KEY ("ai_prompt_version_id") REFERENCES "app"."ai_prompt_config_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
