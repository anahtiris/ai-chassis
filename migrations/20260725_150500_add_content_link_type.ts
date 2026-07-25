import { MigrateUpArgs, MigrateDownArgs, sql } from "@payloadcms/db-postgres";

// lib/payload/fields/link.ts's "type" radio (reference/custom) needs a
// link_type column on pages_blocks_content_columns (and its version-table
// twin) — missed when 20260725_140000_add_pages_layout_blocks.ts was
// written, since the link field was URL-only at that point (the "Internal
// link" variant, and its "type" selector, were added afterward — see
// 20260725_150000_add_pages_rels.ts). Same hand-written-migration reasoning
// as every other one in this repo.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "enum_pages_blocks_content_columns_link_type" AS ENUM('reference', 'custom');
   CREATE TYPE "enum__pages_v_blocks_content_columns_link_type" AS ENUM('reference', 'custom');

   ALTER TABLE "pages_blocks_content_columns" ADD COLUMN "link_type" "enum_pages_blocks_content_columns_link_type" DEFAULT 'reference';
   ALTER TABLE "_pages_v_blocks_content_columns" ADD COLUMN "link_type" "enum__pages_v_blocks_content_columns_link_type" DEFAULT 'reference';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_content_columns" DROP COLUMN "link_type";
   ALTER TABLE "_pages_v_blocks_content_columns" DROP COLUMN "link_type";

   DROP TYPE "enum_pages_blocks_content_columns_link_type";
   DROP TYPE "enum__pages_v_blocks_content_columns_link_type";
  `);
}
