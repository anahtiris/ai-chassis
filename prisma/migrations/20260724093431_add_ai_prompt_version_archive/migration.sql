-- AlterTable
ALTER TABLE "app"."ai_prompt_config_versions" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "archived_by" TEXT;
