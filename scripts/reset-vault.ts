// DESTRUCTIVE vault reset (Job 2a). Wipes ALL user/test content to a genuinely empty vault
// WITHOUT dropping tables or touching auth/sessions/provider config.
//
//   Dry-run (default, read-only — shows exactly what it WOULD delete):
//     DATABASE_URL=… apps/api/node_modules/.bin/tsx scripts/reset-vault.ts
//   Apply (DESTRUCTIVE):
//     DATABASE_URL=… apps/api/node_modules/.bin/tsx scripts/reset-vault.ts --apply
//   Scope to one user (safer; DELETE … WHERE user_id):
//     DATABASE_URL=… … scripts/reset-vault.ts --user <user_id> --apply
//
// PRESERVED: `users` (auth) + `prompt_overrides` (Meta-Radian/prompt config). Sessions live
// in Redis and provider keys live in Render env — neither is touched here.
// BEFORE YOU --apply: export your vault (`GET /radian/export-bundle`) — a git tag restores
// CODE, not DATA. This wipe is irreversible.

import { db, query } from "../packages/db/src/index";

// Every table holding user/test content. `users`/`prompt_overrides` are intentionally absent.
const WIPE = [
  "events", "jobs", "xp_ledger", "quests", "embeddings", "decisions", "opportunities", "constraints",
  "ai_calls", "api_usage", "audit_logs", "assets", "briefs", "context_packs", "timeline_events",
  "edges", "nodes", "captures", "agents", "projects",
] as const;

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const userArg = (() => { const i = args.indexOf("--user"); return i >= 0 ? args[i + 1] : null; })();

async function counts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of WIPE) {
    const where = userArg ? ` WHERE user_id=$1` : "";
    try {
      const r = await query<{ c: string }>(`SELECT count(*)::text AS c FROM ${t}${where}`, userArg ? [userArg] : []);
      out[t] = Number(r.rows[0]?.c || 0);
    } catch (e) { out[t] = -1; /* table/column missing (e.g. no user_id) */ void e; }
  }
  return out;
}

async function main() {
  console.log(`\nVault reset — ${APPLY ? "APPLY (DESTRUCTIVE)" : "DRY-RUN (read-only)"}${userArg ? ` · user=${userArg}` : " · ALL users"}`);
  console.log(`Preserved: users, prompt_overrides · Sessions(Redis) + provider keys(env) untouched.\n`);

  const before = await counts();
  let total = 0;
  console.log("Rows that will be deleted:");
  for (const t of WIPE) { const n = before[t]; total += n > 0 ? n : 0; console.log(`  ${t.padEnd(16)} ${n < 0 ? "(n/a)" : n}`); }
  console.log(`  ${"TOTAL".padEnd(16)} ${total}\n`);

  if (total === 0) { console.log("Vault already empty. ✅"); await db().end(); return; }

  if (!APPLY) {
    console.log("DRY-RUN — nothing deleted. Re-run with --apply to wipe (export your vault first!).\n");
    await db().end();
    return;
  }

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    if (userArg) {
      // Per-user delete in FK-safe order (children before parents).
      for (const t of WIPE) {
        try { await client.query(`DELETE FROM ${t} WHERE user_id=$1`, [userArg]); }
        catch { /* table without user_id — skip */ }
      }
    } else {
      // Whole-table truncate; list all together + CASCADE so FK order doesn't matter.
      await client.query(`TRUNCATE TABLE ${WIPE.join(", ")} RESTART IDENTITY CASCADE`);
    }
    await client.query("COMMIT");
    const after = await counts();
    const left = Object.values(after).reduce((a, b) => a + (b > 0 ? b : 0), 0);
    console.log(`APPLIED ✅  vault reset. Remaining user-content rows: ${left}.`);
    console.log("Note: budget ledger (ai_calls) reset to $0; the Project Registry re-seeds defaults on next use.\n");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ROLLED BACK — nothing deleted:", (e as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db().end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
