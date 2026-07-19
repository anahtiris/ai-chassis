-- AlterTable
ALTER TABLE "app"."ai_prompt_configs" ADD COLUMN     "max_tokens" INTEGER,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "temperature" DOUBLE PRECISION;
