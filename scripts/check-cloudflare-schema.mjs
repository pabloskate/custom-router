#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const WRANGLER_CONFIG = process.env.WRANGLER_CONFIG || "apps/web/wrangler.toml";

const REQUIRED_TABLES = {
  users: [
    "id",
    "name",
    "email",
    "password_hash",
    "preferred_models",
    "default_model",
    "classifier_model",
    "routing_instructions",
    "blocklist",
    "custom_catalog",
    "profiles",
    "route_trigger_keywords",
    "routing_frequency",
    "smart_pin_turns",
    "config_agent_enabled",
    "config_agent_orchestrator_model",
    "config_agent_search_model",
    "created_at",
    "updated_at",
  ],
  user_upstream_credentials: [
    "user_id",
    "upstream_base_url",
    "upstream_api_key_enc",
    "classifier_base_url",
    "classifier_api_key_enc",
    "updated_at",
  ],
  user_gateways: [
    "id",
    "user_id",
    "name",
    "base_url",
    "api_key_enc",
    "models_json",
    "created_at",
    "updated_at",
  ],
  user_sessions: [
    "id",
    "user_id",
    "expires_at",
    "created_at",
  ],
};

function parseDatabaseName(tomlPath) {
  const raw = readFileSync(tomlPath, "utf8");
  const match = raw.match(/database_name\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`Could not find database_name in ${tomlPath}`);
  }
  return match[1];
}

function runWranglerSql(databaseName, sql) {
  const output = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      databaseName,
      "--remote",
      "--command",
      sql,
      "--config",
      WRANGLER_CONFIG,
    ],
    { encoding: "utf8" }
  );

  const jsonStart = output.indexOf("[");
  if (jsonStart === -1) {
    throw new Error(`Unexpected Wrangler output:\n${output}`);
  }

  return JSON.parse(output.slice(jsonStart));
}

function getColumns(databaseName, tableName) {
  const result = runWranglerSql(databaseName, `PRAGMA table_info(${tableName});`);
  return new Set((result?.[0]?.results ?? []).map((row) => row.name));
}

function ensureTablesExist(databaseName) {
  const result = runWranglerSql(
    databaseName,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${Object.keys(REQUIRED_TABLES).map((t) => `'${t}'`).join(", ")});`
  );
  return new Set((result?.[0]?.results ?? []).map((row) => row.name));
}

function main() {
  const databaseName = parseDatabaseName(WRANGLER_CONFIG);
  console.log(`Checking remote D1 schema for ${databaseName} using ${WRANGLER_CONFIG}...`);

  const presentTables = ensureTablesExist(databaseName);
  const failures = [];

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_TABLES)) {
    if (!presentTables.has(tableName)) {
      failures.push(`Missing table: ${tableName}`);
      continue;
    }

    const presentColumns = getColumns(databaseName, tableName);
    for (const column of requiredColumns) {
      if (!presentColumns.has(column)) {
        failures.push(`Missing column: ${tableName}.${column}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("Remote schema drift detected:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("✓ Remote D1 schema matches the auth/admin requirements.");
}

main();
