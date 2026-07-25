import * as migration_20260723_190215_initial_schema from "./20260723_190215_initial_schema";
import * as migration_20260723_232000_rename_concierge_questions_to_suggestions from "./20260723_232000_rename_concierge_questions_to_suggestions";
import * as migration_20260725_000000_add_pages_form from "./20260725_000000_add_pages_form";

export const migrations = [
  {
    up: migration_20260723_190215_initial_schema.up,
    down: migration_20260723_190215_initial_schema.down,
    name: "20260723_190215_initial_schema",
  },
  {
    up: migration_20260723_232000_rename_concierge_questions_to_suggestions.up,
    down: migration_20260723_232000_rename_concierge_questions_to_suggestions.down,
    name: "20260723_232000_rename_concierge_questions_to_suggestions",
  },
  {
    up: migration_20260725_000000_add_pages_form.up,
    down: migration_20260725_000000_add_pages_form.down,
    name: "20260725_000000_add_pages_form",
  },
];
