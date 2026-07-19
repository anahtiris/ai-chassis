import nextConfig from "eslint-config-next";
import storybook from "eslint-plugin-storybook";

// ESLint 9 flat config. eslint-config-next (^16) and eslint-plugin-storybook
// (^10) both ship flat-config-ready exports directly — no @eslint/eslintrc
// FlatCompat shim needed, unlike older Next.js versions' setup docs.
const config = [
  ...nextConfig,
  ...storybook.configs["flat/recommended"],
  {
    // Generated, not hand-maintained — see payload.config.ts and
    // scripts/seed-admin.ts's neighbors in migrations/.
    ignores: ["payload-types.ts", "migrations/**"],
  },
  {
    // .claude/ is Claude Code's own config/scratch directory (worktrees,
    // agent state) — not part of this app's source, regardless of what
    // ends up nested under it.
    ignores: [".claude/**"],
  },
];

export default config;
