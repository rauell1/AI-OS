import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma client over the node-postgres driver adapter.
 *
 * The queryCompiler + driverAdapters preview means the client runs the pure
 * JS/WASM query engine (bundled with @prisma/client) instead of the native
 * Rust engine: no postinstall binary downloads are required, which keeps
 * installs hermetic and CI friendly. Works unchanged against Neon.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL ?? "";
  const adapter = new PrismaPg({ connectionString, max: 10 });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
