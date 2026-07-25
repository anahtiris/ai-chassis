-- AlterTable
ALTER TABLE "app"."ai_prompt_config_versions" ADD COLUMN     "allow_fallback" BOOLEAN NOT NULL DEFAULT false;
