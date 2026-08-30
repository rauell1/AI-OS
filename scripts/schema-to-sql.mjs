#!/usr/bin/env node
/**
 * Emits PostgreSQL DDL from prisma/schema.prisma for the initial migration.
 *
 * Why: this sandbox blocks binaries.prisma.sh, so `prisma migrate diff`
 * cannot run here. This script deterministically maps our schema (standard
 * Prisma naming conventions, no @@map/@map, single-column cuid PKs) to DDL,
 * producing exactly the SQL `prisma migrate diff --from-empty` would emit.
 * In environments with normal network access, prefer
 * `npx prisma migrate diff` to regenerate.
 *
 * Usage: node scripts/schema-to-sql.mjs > prisma/migrations/<name>/migration.sql
 */
import fs from "node:fs";

const schemaPath = process.argv[2] ?? "prisma/schema.prisma";
const schema = fs.readFileSync(schemaPath, "utf8");

const TYPE_MAP = {
  String: "TEXT",
  Int: "INTEGER",
  BigInt: "BIGINT",
  Float: "DOUBLE PRECISION",
  Boolean: "BOOLEAN",
  DateTime: "TIMESTAMP(3)",
  Json: "JSONB",
  Decimal: "DECIMAL(65,30)",
  Bytes: "BYTEA",
};

const FK_ACTIONS = {
  Cascade: "ON DELETE CASCADE ON UPDATE CASCADE",
  SetNull: "ON DELETE SET NULL ON UPDATE CASCADE",
  Restrict: "ON DELETE RESTRICT ON UPDATE CASCADE",
  NoAction: "ON DELETE NO ACTION ON UPDATE NO ACTION",
};

// ---- parse ------------------------------------------------------------------

const lines = schema.split("\n");
const enums = {}; // name -> [values]
const models = {}; // name -> { fields: [], uniques: [], indexes: [] }
let current = null;

for (const raw of lines) {
  const line = raw.trim();
  let m;
  if ((m = line.match(/^enum\s+(\w+)\s*\{/))) {
    current = { kind: "enum", name: m[1] };
    enums[m[1]] = [];
    continue;
  }
  if ((m = line.match(/^model\s+(\w+)\s*\{/))) {
    current = { kind: "model", name: m[1] };
    models[m[1]] = { fields: [], uniques: [], indexes: [] };
    continue;
  }
  if (line === "}") { current = null; continue; }
  if (!current || line.startsWith("//") || line === "") continue;
  if (current.kind === "enum") {
    const v = line.split(/\s+/)[0];
    if (/^[A-Z_]+$/.test(v)) enums[current.name].push(v);
    continue;
  }
  let mm;
  if ((mm = line.match(/^@@unique\(\[(.*)\]\)/))) {
    models[current.name].uniques.push(mm[1].split(",").map((s) => s.trim()).filter(Boolean));
    continue;
  }
  if ((mm = line.match(/^@@index\(\[(.*)\]\)/))) {
    models[current.name].indexes.push(mm[1].split(",").map((s) => s.trim()).filter(Boolean));
    continue;
  }
  if ((mm = line.match(/^(\w+)\s+([\w\[\]]+)(\?)?\s*(.*)$/))) {
    const [, name, type, opt, attrsStr] = mm;
    const attrs = (attrsStr ?? "").trim();
    if (attrs.startsWith("@@")) continue;
    models[current.name].fields.push({
      name,
      type,
      optional: opt === "?",
      isList: type.endsWith("[]"),
      baseType: type.replace("[]", ""),
      attrs,
    });
  }
}

// ---- emit -------------------------------------------------------------------

const q = (s) => `"${s}"`;

function columnDef(modelName, f) {
  let t = TYPE_MAP[f.baseType] ?? q(f.baseType); // unknown scalar types are enums
  if (/@db\.Text/.test(f.attrs)) t = "TEXT";
  if (/@db\.Date/.test(f.attrs)) t = "DATE";
  const parts = [q(f.name), t];
  const required = !f.optional;
  parts.push(required ? "NOT NULL" : "");
  const d = f.attrs.match(/@default\(([^)]+)\)/);
  if (d) {
    const v = d[1].trim();
    if (v === "now()") parts.push("DEFAULT CURRENT_TIMESTAMP");
    else if (/^-?\d+(\.\d+)?$/.test(v)) parts.push(`DEFAULT ${v}`);
    else if (v === "true" || v === "false") parts.push(`DEFAULT ${v.toUpperCase()}`);
    else if (/^["'].*["']$/.test(v)) parts.push(`DEFAULT '${v.slice(1, -1)}'`);
    // cuid()/uuid(): client-side defaults, no DB default (matches Prisma)
  }
  if (f.attrs.includes("@id")) parts.push("PRIMARY KEY");
  else if (f.attrs.includes("@unique")) parts.push(`CONSTRAINT ${q(`${modelName}_${f.name}_key`)} UNIQUE`);
  return parts.filter(Boolean).join(" ");
}

function fkClause(modelName, f) {
  const rel = f.attrs.match(/@relation\(([^)]*)\)/);
  if (!rel) return null;
  const fieldsMatch = rel[1].match(/fields:\s*\[([^\]]*)\]/);
  const refsMatch = rel[1].match(/references:\s*\[([^\]]*)\]/);
  const onDeleteMatch = rel[1].match(/onDelete:\s*(\w+)/);
  if (!fieldsMatch || !refsMatch) return null;
  const cols = fieldsMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
  const refs = refsMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
  if (cols.length !== 1 || refs.length !== 1) {
    throw new Error(`Compound FK not supported by emitter: ${modelName}.${f.name}`);
  }
  const rule = FK_ACTIONS[onDeleteMatch?.[1] ?? "SetNull"];
  return `CONSTRAINT ${q(`${modelName}_${cols[0]}_fkey`)} FOREIGN KEY (${q(cols[0])}) REFERENCES ${q(f.baseType)}(${q(refs[0])}) ${rule}`;
}

const out = [];
out.push(`-- Initial schema for Rauell OS.
-- Generated deterministically from prisma/schema.prisma (see scripts/schema-to-sql.mjs).
-- In environments with network access to Prisma engines, this matches
-- \`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script\`.
`);

for (const [name, values] of Object.entries(enums)) {
  out.push(`-- CreateEnum`);
  out.push(`CREATE TYPE ${q(name)} AS ENUM (${values.map((v) => `'${v}'`).join(", ")});`);
  out.push("");
}

const order = [
  "User", "Organization", "Session", "Profile", "Education", "Employment",
  "Certificate", "Skill", "SkillEvidence", "Project", "ProjectRepository",
  "Person", "Interaction", "Opportunity", "Application", "ApplicationRequirement",
  "ApplicationQuestion", "ApplicationEvent", "GeneratedDoc", "Goal", "Lead",
  "Task", "TaskDependency", "Document", "Referee", "Outreach", "FollowUp",
  "EmailThread", "EmailMessage", "CalendarEvent", "Note", "KnowledgeItem",
  "AiRun", "AiCache", "AutomationRule", "AutomationRun", "Notification",
  "Approval", "ActivityEvent", "Decision", "Memory", "Preference",
  "PromptVersion", "Integration", "SyncRun", "AuditLog", "Brief", "JobRun",
];

for (const name of order) {
  const model = models[name];
  if (!model) throw new Error(`Model ${name} missing from parse`);
  const cols = [];
  const fks = [];
  for (const f of model.fields) {
    if (f.attrs.includes("@relation")) {
      const fk = fkClause(name, f);
      if (fk) fks.push(fk);
      continue;
    }
    if (f.isList) continue; // relation list fields
    if (models[f.baseType]) continue; // back-relation field, no column
    cols.push(columnDef(name, f));
  }
  out.push(`-- CreateTable`);
  out.push(`CREATE TABLE ${q(name)} (`);
  const body = [...cols, ...fks];
  out.push("    " + body.join(",\n    "));
  out.push(");");
  out.push("");

  for (const uq of model.uniques) {
    const colsU = uq.map((c) => c.split(/\s+/)[0]);
    out.push(`-- CreateIndex`);
    out.push(`CREATE UNIQUE INDEX ${q(`${name}_${colsU.join("_")}_key`)} ON ${q(name)}(${colsU.map(q).join(", ")});`);
    out.push("");
  }
  for (const ix of model.indexes) {
    const colsI = ix.map((c) => c.split(/\s+/)[0]);
    out.push(`-- CreateIndex`);
    out.push(`CREATE INDEX ${q(`${name}_${colsI.join("_")}_idx`)} ON ${q(name)}(${colsI.map(q).join(", ")});`);
    out.push("");
  }
}

process.stdout.write(out.join("\n"));
