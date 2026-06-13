// Idempotent dedupe of AI-DERIVED nodes (Phase 0 hygiene).
//
//   Dry-run (default, read-only):
//     DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/dedupe-derived-nodes.ts
//   Apply (writes, in a single transaction):
//     DATABASE_URL=... apps/api/node_modules/.bin/tsx scripts/dedupe-derived-nodes.ts --apply
//   Scope to one user:  --user <user_id>
//
// WHAT IT TOUCHES — *only* AI-synthesis nodes (truth_layer C) produced by Radian
// verbs / waves. Verification runs left duplicate "Boardroom — X" / "What-if — X"
// etc. nodes. We collapse duplicates by (truth_label, source_node_id, normalized_title),
// keep the EARLIEST, re-point edges + quest anchors to the keeper, then delete the rest.
//
// WHAT IT NEVER TOUCHES (hard guards):
//   - captures (Truth Layer A) — user data, immutable by convention. Never read for deletion.
//   - Truth Layer A/B nodes, or "Normalized" knowledge nodes — only the generated set below.
//   - the events table — append-only history is the spine and is never mutated.
//
// source_node_id = meta->>'subject_id' (Boardroom) OR the source of the inbound
// provenance edge (extends/derived_from/...) OR null (e.g. question-keyed What-if,
// which then dedupes on title alone). Re-pointing preserves Atlas badges + provenance.

import { db, query } from "../packages/db/src/index";

// AI-generated synthesis labels only. NOT "Normalized" (capture-backed knowledge),
// NOT Truth Layer A/B. Extend deliberately — every entry here is deletable-when-dupe.
const DERIVED_LABELS = ["Boardroom", "Analysis", "Answer", "Assistance", "Artifact", "Research"];

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const userArg = (() => { const i = args.indexOf("--user"); return i >= 0 ? args[i + 1] : null; })();

function normTitle(t: string): string {
  return (t || "").toLowerCase().replace(/\s+/g, " ").trim();
}

interface NodeRow { id: string; user_id: string; title: string; truth_label: string; truth_layer: string; created_at: string; subject_id: string | null; edge_source: string | null; }

async function main() {
  console.log(`\nDedupe derived nodes — ${APPLY ? "APPLY (will write)" : "DRY-RUN (read-only)"}${userArg ? ` · user=${userArg}` : " · all users"}`);
  console.log(`Derived labels in scope: ${DERIVED_LABELS.join(", ")}\n`);

  // Pull candidate derived nodes + their best source linkage. Layer-A guard in WHERE.
  const { rows } = await query<NodeRow>(
    `SELECT n.id, n.user_id, n.title, n.truth_label, n.truth_layer,
            n.created_at,
            n.meta->>'subject_id' AS subject_id,
            (SELECT e.source_id FROM edges e
               WHERE e.target_id = n.id
                 AND e.relationship IN ('extends','derived_from','assists','produces')
             ORDER BY e.valid_from ASC LIMIT 1) AS edge_source
       FROM nodes n
      WHERE n.truth_label = ANY($1)
        AND n.truth_layer <> 'A'
        ${userArg ? "AND n.user_id = $2" : ""}
      ORDER BY n.created_at ASC`,
    userArg ? [DERIVED_LABELS, userArg] : [DERIVED_LABELS],
  );

  // Group by (user, label, source_node_id, normalized_title). Earliest kept.
  const groups = new Map<string, NodeRow[]>();
  for (const r of rows) {
    const src = r.subject_id || r.edge_source || "∅";
    const key = `${r.user_id}|${r.truth_label}|${src}|${normTitle(r.title)}`;
    (groups.get(key) || groups.set(key, []).get(key)!).push(r);
  }

  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  const keepers: NodeRow[] = [];
  const removable: NodeRow[] = [];
  for (const g of dupGroups) {
    g.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    keepers.push(g[0]);
    removable.push(...g.slice(1));
  }

  console.log(`Candidate derived nodes scanned: ${rows.length}`);
  console.log(`Duplicate groups (>1):           ${dupGroups.length}`);
  console.log(`Nodes that would be removed:     ${removable.length}\n`);

  // Per-label breakdown so the owner can eyeball before applying.
  const byLabel = new Map<string, { groups: number; remove: number }>();
  for (const g of dupGroups) {
    const l = g[0].truth_label;
    const e = byLabel.get(l) || { groups: 0, remove: 0 };
    e.groups++; e.remove += g.length - 1; byLabel.set(l, e);
  }
  if (byLabel.size) {
    console.log("By label:");
    for (const [l, e] of byLabel) console.log(`  ${l.padEnd(12)} ${e.groups} dup-group(s), ${e.remove} removable`);
    console.log("");
  }

  // Sample the largest groups for transparency.
  const sample = [...dupGroups].sort((a, b) => b.length - a.length).slice(0, 8);
  if (sample.length) {
    console.log("Largest duplicate groups:");
    for (const g of sample) {
      console.log(`  ×${g.length}  [${g[0].truth_label}] "${g[0].title.slice(0, 56)}"  keep=${g[0].id} (${g[0].created_at})`);
    }
    console.log("");
  }

  if (removable.length === 0) { console.log("Nothing to dedupe. ✅"); await db().end(); return; }

  const removeIds = removable.map((r) => r.id);
  // Edges + quests that reference a removable node (these get re-pointed, not lost).
  const { rows: edgeCount } = await query<{ c: string }>(
    `SELECT count(*)::text AS c FROM edges WHERE source_id = ANY($1) OR target_id = ANY($1)`, [removeIds]);
  const { rows: questCount } = await query<{ c: string }>(
    `SELECT count(*)::text AS c FROM quests WHERE node_id = ANY($1)`, [removeIds]);
  console.log(`Edges referencing removable nodes (re-pointed to keeper): ${edgeCount[0].c}`);
  console.log(`Quest anchors referencing removable nodes (re-pointed):    ${questCount[0].c}\n`);

  if (!APPLY) {
    console.log("DRY-RUN complete — no changes written. Re-run with --apply to collapse.\n");
    await db().end();
    return;
  }

  // Build remove → keeper map.
  const keeperFor = new Map<string, string>();
  for (const g of dupGroups) for (const dup of g.slice(1)) keeperFor.set(dup.id, g[0].id);

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    for (const [dup, keep] of keeperFor) {
      // Re-point provenance + anchors, then drop the duplicate node.
      await client.query(`UPDATE edges  SET source_id = $2 WHERE source_id = $1`, [dup, keep]);
      await client.query(`UPDATE edges  SET target_id = $2 WHERE target_id = $1`, [dup, keep]);
      await client.query(`UPDATE quests SET node_id   = $2 WHERE node_id   = $1`, [dup, keep]);
    }
    // Clean self-edges + exact-duplicate edges created by re-pointing.
    await client.query(`DELETE FROM edges WHERE source_id = target_id`);
    await client.query(
      `DELETE FROM edges e USING edges k
        WHERE e.ctid > k.ctid
          AND e.source_id = k.source_id AND e.target_id = k.target_id AND e.relationship = k.relationship`);
    // Finally remove the duplicate nodes (only the removable set; keepers untouched).
    const del = await client.query(`DELETE FROM nodes WHERE id = ANY($1)`, [removeIds]);
    await client.query("COMMIT");
    console.log(`APPLIED ✅  deleted ${del.rowCount} duplicate derived node(s); edges + quest anchors re-pointed.\n`);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("ROLLED BACK — no changes written:", (e as Error).message);
    process.exitCode = 1;
  } finally {
    client.release();
    await db().end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
