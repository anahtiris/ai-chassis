import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Adds pages_rels/_pages_v_rels — the polymorphic-relationship join table
// Payload's Postgres adapter uses for any relationship field with more than
// one relationTo collection, regardless of nesting depth. lib/payload/
// fields/link.ts's "Internal link" option (relationTo: ["pages", "posts"],
// nested inside Content block's columns) is the first such field on Pages,
// so this table has never existed here before.
//
// Hand-written for the same reason as every other migration in this repo:
// `payload migrate:create` hangs on this project's non-interactive shell
// rather than erroring. Table/column/FK/index shape verified against a
// real payload-poc migration with the identical relationTo pair on its own
// Content block's link field (payload-poc's version also carries a
// categories_id column, from an unrelated field this project doesn't
// have — omitted here). Only the schema is hand-written; Payload's own
// adapter code populates/reads rows in this table at runtime exactly as it
// would for a migrate:create-generated one — nothing here is guessing at
// runtime row semantics, only the CREATE TABLE shape.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "pages_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "pages_id" integer,
    "posts_id" integer
   );

   CREATE TABLE "_pages_v_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "pages_id" integer,
    "posts_id" integer
   );

   ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "pages"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "pages"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "pages_rels" ADD CONSTRAINT "pages_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE no action;

   ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "_pages_v"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "pages"("id") ON DELETE cascade ON UPDATE no action;
   ALTER TABLE "_pages_v_rels" ADD CONSTRAINT "_pages_v_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "posts"("id") ON DELETE cascade ON UPDATE no action;

   CREATE INDEX "pages_rels_order_idx" ON "pages_rels" USING btree ("order");
   CREATE INDEX "pages_rels_parent_idx" ON "pages_rels" USING btree ("parent_id");
   CREATE INDEX "pages_rels_path_idx" ON "pages_rels" USING btree ("path");
   CREATE INDEX "pages_rels_pages_id_idx" ON "pages_rels" USING btree ("pages_id");
   CREATE INDEX "pages_rels_posts_id_idx" ON "pages_rels" USING btree ("posts_id");

   CREATE INDEX "_pages_v_rels_order_idx" ON "_pages_v_rels" USING btree ("order");
   CREATE INDEX "_pages_v_rels_parent_idx" ON "_pages_v_rels" USING btree ("parent_id");
   CREATE INDEX "_pages_v_rels_path_idx" ON "_pages_v_rels" USING btree ("path");
   CREATE INDEX "_pages_v_rels_pages_id_idx" ON "_pages_v_rels" USING btree ("pages_id");
   CREATE INDEX "_pages_v_rels_posts_id_idx" ON "_pages_v_rels" USING btree ("posts_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_rels" CASCADE;
   DROP TABLE "_pages_v_rels" CASCADE;
  `);
}
