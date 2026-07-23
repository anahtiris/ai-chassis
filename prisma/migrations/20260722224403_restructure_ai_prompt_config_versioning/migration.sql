-- AlterTable
ALTER TABLE "app"."ai_prompt_configs" DROP COLUMN "max_tokens",
DROP COLUMN "model",
DROP COLUMN "prompt_text",
DROP COLUMN "temperature",
DROP COLUMN "version",
ADD COLUMN     "active_version_id" TEXT;

-- CreateTable
CREATE TABLE "app"."ai_prompt_config_versions" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "max_tokens" INTEGER,
    "change_note" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_prompt_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_config_versions_config_id_version_key" ON "app"."ai_prompt_config_versions"("config_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ai_prompt_configs_active_version_id_key" ON "app"."ai_prompt_configs"("active_version_id");

-- AddForeignKey
ALTER TABLE "app"."ai_prompt_configs" ADD CONSTRAINT "ai_prompt_configs_active_version_id_fkey" FOREIGN KEY ("active_version_id") REFERENCES "app"."ai_prompt_config_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ai_prompt_config_versions" ADD CONSTRAINT "ai_prompt_config_versions_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "app"."ai_prompt_configs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

