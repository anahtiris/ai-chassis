-- AlterTable
ALTER TABLE "app"."users" ADD COLUMN     "is_owner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_hash" TEXT;
