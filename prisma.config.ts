import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma CLI configuration (Prisma 7+).
 * The datasource URL lives here instead of schema.prisma; env is loaded
 * explicitly via dotenv so CLI commands and seeds work the same locally
 * and in production (Neon).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
