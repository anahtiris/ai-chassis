import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@payload-config": path.resolve(__dirname, "./payload.config.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/.claude/**", "**/dist/**"],
  },
});
