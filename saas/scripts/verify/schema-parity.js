#!/usr/bin/env node
/*
 * KEYONE — Prisma dual-schema parity check (PostgreSQL readiness, Agent 4).
 *
 * The project keeps two Prisma schemas in lock-step:
 *   - prisma/schema.prisma          (SQLite — production source of truth)
 *   - prisma/schema.postgres.prisma (PostgreSQL — dormant cutover target)
 *
 * A PostgreSQL cutover applies the .postgres schema. If it has drifted from
 * the SQLite schema, the cutover silently drops models/fields/indexes (e.g. an
 * absent TeamMember model would break team-member auth). This read-only check
 * compares the structural SHAPE of both schemas and exits non-zero on drift so
 * the lock-step rule is enforceable in CI / pre-cutover gates.
 *
 * Shape compared per model: field names + types + optionality, @@index,
 * @@unique, @unique. Pure parsing — no DB connection, no env needed, no
 * mutations. Datasource/generator blocks are intentionally ignored (they
 * legitimately differ: provider sqlite vs postgresql).
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SQLITE = path.join(ROOT, "prisma/schema.prisma");
const POSTGRES = path.join(ROOT, "prisma/schema.postgres.prisma");

function read(file) {
  if (!fs.existsSync(file)) {
    console.error(`✗ schema not found: ${file}`);
    process.exit(2);
  }
  return fs.readFileSync(file, "utf8");
}

// Strip line/block comments and `//`-trailing comments so cosmetic comment
// drift (which is harmless) never trips the check.
function stripComments(line) {
  // Drop `//` trailing comment but keep string defaults intact enough for shape
  const idx = line.indexOf("//");
  return (idx >= 0 ? line.slice(0, idx) : line).trimEnd();
}

/**
 * Parse a schema into { modelName -> { fields: Map<name, typeSig>, attrs: Set } }.
 * `attrs` holds normalized @@index / @@unique lines. Field typeSig captures the
 * type + optionality + relation/default markers that matter for portability.
 */
function parseModels(src) {
  const models = {};
  const lines = src.split(/\r?\n/);
  let current = null;
  for (let raw of lines) {
    const line = stripComments(raw).trim();
    if (!line) continue;
    const modelMatch = line.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      current = modelMatch[1];
      models[current] = { fields: new Map(), attrs: new Set() };
      continue;
    }
    if (current && line === "}") {
      current = null;
      continue;
    }
    if (!current) continue; // skip datasource/generator/enum/etc.

    if (line.startsWith("@@")) {
      // Normalize whitespace inside @@index([...]) / @@unique([...])
      models[current].attrs.add(line.replace(/\s+/g, ""));
      continue;
    }

    // Field line: `name  Type  @attrs...`
    const fm = line.match(/^(\w+)\s+([\w\[\]?]+)(.*)$/);
    if (fm) {
      const fname = fm[1];
      const ftype = fm[2];
      const rest = fm[3] || "";
      // Capture portability-relevant markers only (unique/id/default presence).
      const markers = [];
      if (/@id\b/.test(rest)) markers.push("@id");
      if (/@unique\b/.test(rest)) markers.push("@unique");
      if (/@default\(/.test(rest)) markers.push("@default");
      if (/@relation\(/.test(rest)) markers.push("@relation");
      models[current].fields.set(fname, `${ftype}${markers.length ? " " + markers.sort().join(" ") : ""}`);
    }
  }
  return models;
}

const sqlite = parseModels(read(SQLITE));
const postgres = parseModels(read(POSTGRES));

const drift = [];

const sqliteModels = Object.keys(sqlite);
const pgModels = Object.keys(postgres);

for (const m of sqliteModels) {
  if (!postgres[m]) {
    drift.push({ model: m, kind: "missing_model_in_postgres", detail: `model ${m} exists in SQLite but not PostgreSQL` });
    continue;
  }
  // Fields present in SQLite but missing / differing in PG
  for (const [fname, sig] of sqlite[m].fields) {
    const pgSig = postgres[m].fields.get(fname);
    if (pgSig === undefined) {
      drift.push({ model: m, kind: "missing_field_in_postgres", detail: `${m}.${fname} (${sig})` });
    } else if (pgSig !== sig) {
      drift.push({ model: m, kind: "field_shape_diff", detail: `${m}.${fname}: sqlite='${sig}' pg='${pgSig}'` });
    }
  }
  // Attrs (index/unique) present in SQLite but missing in PG
  for (const a of sqlite[m].attrs) {
    if (!postgres[m].attrs.has(a)) {
      drift.push({ model: m, kind: "missing_constraint_in_postgres", detail: `${m}: ${a}` });
    }
  }
}

// Reverse direction: anything in PG that SQLite lacks (additive drift the other way)
for (const m of pgModels) {
  if (!sqlite[m]) {
    drift.push({ model: m, kind: "extra_model_in_postgres", detail: `model ${m} exists in PostgreSQL but not SQLite` });
    continue;
  }
  for (const [fname, sig] of postgres[m].fields) {
    if (!sqlite[m].fields.has(fname)) {
      drift.push({ model: m, kind: "extra_field_in_postgres", detail: `${m}.${fname} (${sig})` });
    }
  }
  for (const a of postgres[m].attrs) {
    if (!sqlite[m].attrs.has(a)) {
      drift.push({ model: m, kind: "extra_constraint_in_postgres", detail: `${m}: ${a}` });
    }
  }
}

const summary = {
  sqliteModels: sqliteModels.length,
  postgresModels: pgModels.length,
  driftCount: drift.length,
};

if (drift.length === 0) {
  console.log(`✓ schema parity OK — ${summary.sqliteModels} models in lock-step (SQLite ↔ PostgreSQL)`);
  process.exit(0);
}

console.log(`✗ schema parity DRIFT — ${drift.length} difference(s) between SQLite and PostgreSQL schemas`);
for (const d of drift) {
  console.log(`  [${d.kind}] ${d.detail}`);
}
console.log(JSON.stringify(summary));
process.exit(1);
