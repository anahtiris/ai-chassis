import type { StorybookConfig } from '@storybook/nextjs-vite';

// Vite-based framework, deliberately not the webpack @storybook/nextjs —
// see docs/decisions.md "UI components & Storybook" for why mixing the two
// (or a webpack framework with a Vite-based addon like addon-vitest) is
// what broke a previous project's setup. Every addon below is Vite-based
// too, so there's exactly one build pipeline in play, not two.
const config: StorybookConfig = {
  "stories": [
    "../stories/**/*.mdx",
    "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp"
  ],
  "framework": "@storybook/nextjs-vite"
};
export default config;
