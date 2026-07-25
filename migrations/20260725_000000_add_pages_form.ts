import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// Adds the `pages.form` relationship field (see lib/payload/collections/pages.ts)
// as a `form_id` FK column on `pages` and `version_form_id` on the `_pages_v`
// version table, both referencing `forms(id)`. Mirrors the exact column / FK /
// index shape Payload generates for a top-level hasOne relationship (identical
// to `posts.hero_image` in the initial migration). Hand-written for the same
// reason as the concierge-rename migration: `payload migrate:create` drops into
// an interactive create-vs-rename prompt on a non-TTY server, and it currently
// re-diffs against the initial migration's stale `.json` snapshot (never
// regenerated), so it also proposes spurious concierge DDL. Regenerate the
// snapshot in a real terminal if you resume using the generator.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "form_id" integer;
   ALTER TABLE "_pages_v" ADD COLUMN "version_form_id" integer;

   ALTER TABLE "pages" ADD CONSTRAINT "pages_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;
   ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_form_id_forms_id_fk" FOREIGN KEY ("version_form_id") REFERENCES "public"."forms"("id") ON DELETE set null ON UPDATE no action;

   CREATE INDEX "pages_form_idx" ON "pages" USING btree ("form_id");
   CREATE INDEX "_pages_v_version_version_form_idx" ON "_pages_v" USING btree ("version_form_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "pages_form_idx";
   DROP INDEX "_pages_v_version_version_form_idx";

   ALTER TABLE "pages" DROP CONSTRAINT "pages_form_id_forms_id_fk";
   ALTER TABLE "_pages_v" DROP CONSTRAINT "_pages_v_version_form_id_forms_id_fk";

   ALTER TABLE "pages" DROP COLUMN "form_id";
   ALTER TABLE "_pages_v" DROP COLUMN "version_form_id";
  `);
}
