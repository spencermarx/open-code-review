import { defineConfig } from "vitest/config";

export default defineConfig({
  root: import.meta.dirname,
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
