import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { projectRoot } from "./sites-env.mjs";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--dry-run")) {
  throw new Error("Supported option: --dry-run (build and validate without publishing).");
}
const id = process.env.DUKATRACK_D1_ID;
if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    || id === "00000000-0000-4000-8000-000000000000") {
  throw new Error("Set DUKATRACK_D1_ID to your real Cloudflare D1 database UUID. See CLOUDFLARE.md.");
}
const wrangler = path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js");
function run(script, commandArgs) {
  const result = spawnSync(process.execPath, [script, ...commandArgs], {
    cwd: projectRoot, env: process.env, stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Build first: a failed build must never change the remote database.
run(path.join(projectRoot, "scripts/run-framework.mjs"), ["build"]);
const builtConfig = path.join(projectRoot, "dist/server/wrangler.json");
if (args.includes("--dry-run")) {
  run(wrangler, ["deploy", "--config", builtConfig, "--dry-run"]);
} else {
  const runtime = path.join(projectRoot, ".sites-runtime");
  mkdirSync(runtime, { recursive: true });
  const migrationConfig = path.join(runtime, "cloudflare-d1.json");
  writeFileSync(migrationConfig, JSON.stringify({
    name: "dukatrack",
    compatibility_date: "2026-05-15",
    d1_databases: [{
      binding: "DB",
      database_name: process.env.DUKATRACK_D1_NAME || "site-creator-d1",
      database_id: id,
      migrations_dir: path.join(projectRoot, "drizzle"),
    }],
  }, null, 2));
  run(wrangler, ["d1", "migrations", "apply", "DB", "--remote", "--config", migrationConfig]);
  run(wrangler, ["deploy", "--config", builtConfig]);
}
