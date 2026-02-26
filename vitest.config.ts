import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
  },
});
