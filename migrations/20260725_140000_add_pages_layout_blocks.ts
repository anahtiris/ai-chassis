import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Replaces pages.content (jsonb) + pages.form_id (relationship) with a
// `layout` blocks field (content/mediaBlock/formBlock) — see
// lib/payload/collections/pages.ts and docs/decisions.md "Collections:
// generic infrastructure only, no page-builder blocks" follow-up.
//
// Hand-written for the same reason as the concierge-rename and
// add_pages_form migrations: `payload migrate:create` drops into an
// interactive create-vs-rename prompt on a non-TTY server that this
// environment can't drive (it spins rather than erroring). Table/column/
// index/FK shapes below mirror exactly what Payload's Postgres adapter
// generates for a `blocks` field — verified against this project's own
// already-applied `pages_ai_concierge_suggestions` array-field tables
// (same _order/_parent_id/id-varchar-live/id-serial-version/_uuid-on-
// version shape) and cross-checked against a real payload-poc migration
// that has the identical Content/MediaBlock/Form blocks. The Content
// block's `link` field here is URL-only (no "internal reference" variant —
// that needs a polymorphic `pages_rels` join table this codebase doesn't
// have yet; see lib/payload/fields/link.ts's comment), so there's no
// `link_type` column/enum unlike payload-poc's version of this block.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "enum_pages_blocks_content_columns_size" AS ENUM('oneThird', 'half', 'twoThirds', 'full');
   CREATE TYPE "enum_pages_blocks_content_columns_link_appearance" AS ENUM('default', 'outline');
   CREATE TYPE "enum__pages_v_blocks_content_columns_size" AS ENUM('oneThird', 'half', 'twoThirds', 'full');
   CREATE TYPE "enum__pages_v_blocks_content_columns_link_appearance" AS ENUM('default', 'outline');

   CREATE TABLE "pages_blocks_content_columns" (
    "_order" integer NOT NULL,
    "_parent_id" varchar NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "size" "enum_pages_blocks_content_columns_size" DEFAULT 'oneThird',
    "rich_text" jsonb,
    "enable_link" boolean,
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum_pages_blocks_content_columns_link_appearance" DEFAULT 'default'
   );

   CREATE TABLE "pages_blocks_content" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "block_name" varchar
   );

   CREATE TABLE "pages_blocks_media_block" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "media_id" integer,
    "block_name" varchar
   );

   CREATE TABLE "pages_blocks_form_block" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "form_id" integer,
    "enable_intro" boolean,
    "intro_content" jsonb,
    "block_name" varchar
   );

   CREATE TABLE "_pages_v_blocks_content_columns" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "size" "enum__pages_v_blocks_content_columns_size" DEFAULT 'oneThird',
    "rich_text" jsonb,
    "enable_link" boolean,
    "link_new_tab" boolean,
    "link_url" varchar,
    "link_label" varchar,
    "link_appearance" "enum__pages_v_blocks_content_columns_link_appearance" DEFAULT 'default',
    "_uuid" varchar
   );

   CREATE TABLE "_pages_v_blocks_content" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "_uuid" varchar,
    "block_name" varchar
   );

   CREATE TABLE "_pages_v_blocks_media_block" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "media_id" integer,
    "_uuid" varchar,
    "block_name" varchar
   );

   CREATE TABLE "_pages_v_blocks_form_block" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "_path" text NOT NULL,
    "id" serial PRIMARY KEY NOT NULL,
    "form_id" integer,
    "enable_intro" boolean,
    "intro_content" jsonb,
    "_uuid" varchar,
    "block_name" varchar
   );

   ALTER TABLE "pages_blocks_content_columns" ADD CONSTRAINT "pages_blocks_content_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "pages_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "pages_blocks_content" ADD CONSTRAINT "pages_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "pages"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "pages_blocks_media_block" ADD CONSTRAINT "pages_blocks_media_block_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "pages_blocks_media_block" ADD CONSTRAINT "pages_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "pages"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "pages_blocks_form_block" ADD CONSTRAINT "pages_blocks_form_block_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "pages_blocks_form_block" ADD CONSTRAINT "pages_blocks_form_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "pages"("id") ON DELETE cascade ON UPDATE no action;

   ALTER TABLE "_pages_v_blocks_content_columns" ADD CONSTRAINT "_pages_v_blocks_content_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "_pages_v_blocks_content"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "_pages_v_blocks_content" ADD CONSTRAINT "_pages_v_blocks_content_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "_pages_v"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "_pages_v_blocks_media_block" ADD CONSTRAINT "_pages_v_blocks_media_block_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_pages_v_blocks_media_block" ADD CONSTRAINT "_pages_v_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "_pages_v"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "_pages_v_blocks_form_block" ADD CONSTRAINT "_pages_v_blocks_form_block_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_pages_v_blocks_form_block" ADD CONSTRAINT "_pages_v_blocks_form_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "_pages_v"("id") ON DELETE cascade ON UPDATE no action;

   CREATE INDEX "pages_blocks_content_columns_order_idx" ON "pages_blocks_content_columns" USING btree ("_order");
   CREATE INDEX "pages_blocks_content_columns_parent_id_idx" ON "pages_blocks_content_columns" USING btree ("_parent_id");
   CREATE INDEX "pages_blocks_content_order_idx" ON "pages_blocks_content" USING btree ("_order");
   CREATE INDEX "pages_blocks_content_parent_id_idx" ON "pages_blocks_content" USING btree ("_parent_id");
   CREATE INDEX "pages_blocks_content_path_idx" ON "pages_blocks_content" USING btree ("_path");
   CREATE INDEX "pages_blocks_media_block_order_idx" ON "pages_blocks_media_block" USING btree ("_order");
   CREATE INDEX "pages_blocks_media_block_parent_id_idx" ON "pages_blocks_media_block" USING btree ("_parent_id");
   CREATE INDEX "pages_blocks_media_block_path_idx" ON "pages_blocks_media_block" USING btree ("_path");
   CREATE INDEX "pages_blocks_media_block_media_idx" ON "pages_blocks_media_block" USING btree ("media_id");
   CREATE INDEX "pages_blocks_form_block_order_idx" ON "pages_blocks_form_block" USING btree ("_order");
   CREATE INDEX "pages_blocks_form_block_parent_id_idx" ON "pages_blocks_form_block" USING btree ("_parent_id");
   CREATE INDEX "pages_blocks_form_block_path_idx" ON "pages_blocks_form_block" USING btree ("_path");
   CREATE INDEX "pages_blocks_form_block_form_idx" ON "pages_blocks_form_block" USING btree ("form_id");

   CREATE INDEX "_pages_v_blocks_content_columns_order_idx" ON "_pages_v_blocks_content_columns" USING btree ("_order");
   CREATE INDEX "_pages_v_blocks_content_columns_parent_id_idx" ON "_pages_v_blocks_content_columns" USING btree ("_parent_id");
   CREATE INDEX "_pages_v_blocks_content_order_idx" ON "_pages_v_blocks_content" USING btree ("_order");
   CREATE INDEX "_pages_v_blocks_content_parent_id_idx" ON "_pages_v_blocks_content" USING btree ("_parent_id");
   CREATE INDEX "_pages_v_blocks_content_path_idx" ON "_pages_v_blocks_content" USING btree ("_path");
   CREATE INDEX "_pages_v_blocks_media_block_order_idx" ON "_pages_v_blocks_media_block" USING btree ("_order");
   CREATE INDEX "_pages_v_blocks_media_block_parent_id_idx" ON "_pages_v_blocks_media_block" USING btree ("_parent_id");
   CREATE INDEX "_pages_v_blocks_media_block_path_idx" ON "_pages_v_blocks_media_block" USING btree ("_path");
   CREATE INDEX "_pages_v_blocks_media_block_media_idx" ON "_pages_v_blocks_media_block" USING btree ("media_id");
   CREATE INDEX "_pages_v_blocks_form_block_order_idx" ON "_pages_v_blocks_form_block" USING btree ("_order");
   CREATE INDEX "_pages_v_blocks_form_block_parent_id_idx" ON "_pages_v_blocks_form_block" USING btree ("_parent_id");
   CREATE INDEX "_pages_v_blocks_form_block_path_idx" ON "_pages_v_blocks_form_block" USING btree ("_path");
   CREATE INDEX "_pages_v_blocks_form_block_form_idx" ON "_pages_v_blocks_form_block" USING btree ("form_id");

   DROP INDEX "pages_form_idx";
   ALTER TABLE "pages" DROP CONSTRAINT "pages_form_id_forms_id_fk";
   ALTER TABLE "pages" DROP COLUMN "form_id";
   ALTER TABLE "pages" DROP COLUMN "content";

   DROP INDEX "_pages_v_version_version_form_idx";
   ALTER TABLE "_pages_v" DROP CONSTRAINT "_pages_v_version_form_id_forms_id_fk";
   ALTER TABLE "_pages_v" DROP COLUMN "version_form_id";
   ALTER TABLE "_pages_v" DROP COLUMN "version_content";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "content" jsonb;
   ALTER TABLE "pages" ADD COLUMN "form_id" integer;
   ALTER TABLE "pages" ADD CONSTRAINT "pages_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "forms"("id") ON DELETE set null ON UPDATE no action;
   CREATE INDEX "pages_form_idx" ON "pages" USING btree ("form_id");

   ALTER TABLE "_pages_v" ADD COLUMN "version_content" jsonb;
   ALTER TABLE "_pages_v" ADD COLUMN "version_form_id" integer;
   ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_form_id_forms_id_fk" FOREIGN KEY ("version_form_id") REFERENCES "forms"("id") ON DELETE set null ON UPDATE no action;
   CREATE INDEX "_pages_v_version_version_form_idx" ON "_pages_v" USING btree ("version_form_id");

   DROP TABLE "pages_blocks_content_columns" CASCADE;
   DROP TABLE "pages_blocks_content" CASCADE;
   DROP TABLE "pages_blocks_media_block" CASCADE;
   DROP TABLE "pages_blocks_form_block" CASCADE;
   DROP TABLE "_pages_v_blocks_content_columns" CASCADE;
   DROP TABLE "_pages_v_blocks_content" CASCADE;
   DROP TABLE "_pages_v_blocks_media_block" CASCADE;
   DROP TABLE "_pages_v_blocks_form_block" CASCADE;

   DROP TYPE "enum_pages_blocks_content_columns_size";
   DROP TYPE "enum_pages_blocks_content_columns_link_appearance";
   DROP TYPE "enum__pages_v_blocks_content_columns_size";
   DROP TYPE "enum__pages_v_blocks_content_columns_link_appearance";
  `);
}
