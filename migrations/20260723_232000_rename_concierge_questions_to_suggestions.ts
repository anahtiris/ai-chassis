import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Renames the AI Concierge `questions` arrays (global + pages/posts + their
// version tables) to `suggestions`, and replaces the single `question` column
// with `label` + `sample_message` — matching generative-ui-kit's `Suggestion`
// shape (see lib/payload/concierge/global.ts). Hand-written rather than
// generated: `payload migrate:create` drops into an interactive create-vs-
// rename prompt that can't be answered on a non-TTY server (same reason
// pushDevSchema is disabled — see docs/decisions.md "Known issues"). The
// tables only ever held disposable default rows, so this drops + recreates
// rather than trying to remap columns. NOTE: the initial migration's `.json`
// schema snapshot was not updated, so a future `migrate:create` will re-diff
// against the old shape — regenerate the snapshot in a real terminal if you
// resume using the generator.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_ai_concierge_questions" CASCADE;
   DROP TABLE "_pages_v_version_ai_concierge_questions" CASCADE;
   DROP TABLE "posts_ai_concierge_questions" CASCADE;
   DROP TABLE "_posts_v_version_ai_concierge_questions" CASCADE;
   DROP TABLE "ai_concierge_questions" CASCADE;

   CREATE TABLE "pages_ai_concierge_suggestions" (
   	"_order" integer NOT NULL,
   	"_parent_id" integer NOT NULL,
   	"id" varchar PRIMARY KEY NOT NULL,
   	"label" varchar,
   	"sample_message" varchar,
   	"enabled" boolean DEFAULT true
   );

   CREATE TABLE "_pages_v_version_ai_concierge_suggestions" (
   	"_order" integer NOT NULL,
   	"_parent_id" integer NOT NULL,
   	"id" serial PRIMARY KEY NOT NULL,
   	"label" varchar,
   	"sample_message" varchar,
   	"enabled" boolean DEFAULT true,
   	"_uuid" varchar
   );

   CREATE TABLE "posts_ai_concierge_suggestions" (
   	"_order" integer NOT NULL,
   	"_parent_id" integer NOT NULL,
   	"id" varchar PRIMARY KEY NOT NULL,
   	"label" varchar,
   	"sample_message" varchar,
   	"enabled" boolean DEFAULT true
   );

   CREATE TABLE "_posts_v_version_ai_concierge_suggestions" (
   	"_order" integer NOT NULL,
   	"_parent_id" integer NOT NULL,
   	"id" serial PRIMARY KEY NOT NULL,
   	"label" varchar,
   	"sample_message" varchar,
   	"enabled" boolean DEFAULT true,
   	"_uuid" varchar
   );

   CREATE TABLE "ai_concierge_suggestions" (
   	"_order" integer NOT NULL,
   	"_parent_id" integer NOT NULL,
   	"id" varchar PRIMARY KEY NOT NULL,
   	"label" varchar NOT NULL,
   	"sample_message" varchar
   );

   ALTER TABLE "pages_ai_concierge_suggestions" ADD CONSTRAINT "pages_ai_concierge_suggestions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "_pages_v_version_ai_concierge_suggestions" ADD CONSTRAINT "_pages_v_version_ai_concierge_suggestions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "posts_ai_concierge_suggestions" ADD CONSTRAINT "posts_ai_concierge_suggestions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "_posts_v_version_ai_concierge_suggestions" ADD CONSTRAINT "_posts_v_version_ai_concierge_suggestions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "ai_concierge_suggestions" ADD CONSTRAINT "ai_concierge_suggestions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_concierge"("id") ON DELETE cascade ON UPDATE no action;

   CREATE INDEX "pages_ai_concierge_suggestions_order_idx" ON "pages_ai_concierge_suggestions" USING btree ("_order");
   CREATE INDEX "pages_ai_concierge_suggestions_parent_id_idx" ON "pages_ai_concierge_suggestions" USING btree ("_parent_id");
   CREATE INDEX "_pages_v_version_ai_concierge_suggestions_order_idx" ON "_pages_v_version_ai_concierge_suggestions" USING btree ("_order");
   CREATE INDEX "_pages_v_version_ai_concierge_suggestions_parent_id_idx" ON "_pages_v_version_ai_concierge_suggestions" USING btree ("_parent_id");
   CREATE INDEX "posts_ai_concierge_suggestions_order_idx" ON "posts_ai_concierge_suggestions" USING btree ("_order");
   CREATE INDEX "posts_ai_concierge_suggestions_parent_id_idx" ON "posts_ai_concierge_suggestions" USING btree ("_parent_id");
   CREATE INDEX "_posts_v_version_ai_concierge_suggestions_order_idx" ON "_posts_v_version_ai_concierge_suggestions" USING btree ("_order");
   CREATE INDEX "_posts_v_version_ai_concierge_suggestions_parent_id_idx" ON "_posts_v_version_ai_concierge_suggestions" USING btree ("_parent_id");
   CREATE INDEX "ai_concierge_suggestions_order_idx" ON "ai_concierge_suggestions" USING btree ("_order");
   CREATE INDEX "ai_concierge_suggestions_parent_id_idx" ON "ai_concierge_suggestions" USING btree ("_parent_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_ai_concierge_suggestions" CASCADE;
   DROP TABLE "_pages_v_version_ai_concierge_suggestions" CASCADE;
   DROP TABLE "posts_ai_concierge_suggestions" CASCADE;
   DROP TABLE "_posts_v_version_ai_concierge_suggestions" CASCADE;
   DROP TABLE "ai_concierge_suggestions" CASCADE;

   CREATE TABLE "pages_ai_concierge_questions" (
   	"_order" integer NOT NULL,
   	"_parent_id" integer NOT NULL,
   	"id" varchar PRIMARY KEY NOT NULL,
   	"question" varchar,
   	"enabled" boolean DEFAULT true
   );

   CREATE TABLE "_pages_v_version_ai_concierge_questions" (
   	"_order" integer NOT NULL,
   	"_parent_id" integer NOT NULL,
   	"id" serial PRIMARY KEY NOT NULL,
   	"question" varchar,
   	"enabled" boolean DEFAULT true,
   	"_uuid" varchar
   );

   CREATE TABLE "posts_ai_concierge_questions" (
   	"_order" integer NOT NULL,
   	"_parent_id" integer NOT NULL,
   	"id" varchar PRIMARY KEY NOT NULL,
   	"question" varchar,
   	"enabled" boolean DEFAULT true
   );

   CREATE TABLE "_posts_v_version_ai_concierge_questions" (
   	"_order" integer NOT NULL,
   	"_parent_id" integer NOT NULL,
   	"id" serial PRIMARY KEY NOT NULL,
   	"question" varchar,
   	"enabled" boolean DEFAULT true,
   	"_uuid" varchar
   );

   CREATE TABLE "ai_concierge_questions" (
   	"_order" integer NOT NULL,
   	"_parent_id" integer NOT NULL,
   	"id" varchar PRIMARY KEY NOT NULL,
   	"question" varchar NOT NULL
   );

   ALTER TABLE "pages_ai_concierge_questions" ADD CONSTRAINT "pages_ai_concierge_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "_pages_v_version_ai_concierge_questions" ADD CONSTRAINT "_pages_v_version_ai_concierge_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "posts_ai_concierge_questions" ADD CONSTRAINT "posts_ai_concierge_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "_posts_v_version_ai_concierge_questions" ADD CONSTRAINT "_posts_v_version_ai_concierge_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "ai_concierge_questions" ADD CONSTRAINT "ai_concierge_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."ai_concierge"("id") ON DELETE cascade ON UPDATE no action;

   CREATE INDEX "pages_ai_concierge_questions_order_idx" ON "pages_ai_concierge_questions" USING btree ("_order");
   CREATE INDEX "pages_ai_concierge_questions_parent_id_idx" ON "pages_ai_concierge_questions" USING btree ("_parent_id");
   CREATE INDEX "_pages_v_version_ai_concierge_questions_order_idx" ON "_pages_v_version_ai_concierge_questions" USING btree ("_order");
   CREATE INDEX "_pages_v_version_ai_concierge_questions_parent_id_idx" ON "_pages_v_version_ai_concierge_questions" USING btree ("_parent_id");
   CREATE INDEX "posts_ai_concierge_questions_order_idx" ON "posts_ai_concierge_questions" USING btree ("_order");
   CREATE INDEX "posts_ai_concierge_questions_parent_id_idx" ON "posts_ai_concierge_questions" USING btree ("_parent_id");
   CREATE INDEX "_posts_v_version_ai_concierge_questions_order_idx" ON "_posts_v_version_ai_concierge_questions" USING btree ("_order");
   CREATE INDEX "_posts_v_version_ai_concierge_questions_parent_id_idx" ON "_posts_v_version_ai_concierge_questions" USING btree ("_parent_id");
   CREATE INDEX "ai_concierge_questions_order_idx" ON "ai_concierge_questions" USING btree ("_order");
   CREATE INDEX "ai_concierge_questions_parent_id_idx" ON "ai_concierge_questions" USING btree ("_parent_id");
  `);
}
