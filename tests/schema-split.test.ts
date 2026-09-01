import { describe, expect, it } from "vitest";
import { SCHEMA_SQL } from "../src/lib/schema";
import { RLS_SQL } from "../src/lib/rls";

/**
 * The bootstrap splits this SQL on ";" and executes each piece. A semicolon
 * inside a `--` comment would cut a statement in half and hand Postgres the
 * remaining prose, which is a syntax error at start-up: the whole application
 * failing to boot over a comma splice. That happened once; these guard it.
 */
function split(sql: string): string[] {
  return sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("schema statement splitting", () => {
  it("survives a semicolon inside a comment", () => {
    const sql = `
      -- Only failures are recorded; a success clears the history.
      CREATE TABLE IF NOT EXISTS a (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS b (id TEXT PRIMARY KEY);
    `;
    const parts = split(sql);
    expect(parts).toHaveLength(2);
    for (const p of parts) expect(p).toMatch(/^CREATE TABLE/);
  });

  it("leaves no statement that is not real DDL", () => {
    for (const sql of [SCHEMA_SQL, RLS_SQL]) {
      for (const statement of split(sql)) {
        expect(
          /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|GRANT|REVOKE|COMMENT|SET|DO)\b/i.test(statement),
          `not a statement: ${statement.slice(0, 80)}`
        ).toBe(true);
      }
    }
  });
});
