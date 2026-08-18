-- Collapse duplicate sessions before the unique constraint is added.
-- Keeps the most recently created row per session_id and drops the rest.
-- The id tiebreak matters: created_at has millisecond precision, so two rows
-- written in the same millisecond would otherwise both survive and fail the
-- constraint below.
DELETE FROM "app"."ai_conversations" a
USING "app"."ai_conversations" b
WHERE a."session_id" = b."session_id"
  AND (a."created_at" < b."created_at"
       OR (a."created_at" = b."created_at" AND a."id" < b."id"));

-- AlterTable
ALTER TABLE "app"."ai_conversations" ADD COLUMN     "agent_key" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summary_turns" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversations_session_id_key" ON "app"."ai_conversations"("session_id");
