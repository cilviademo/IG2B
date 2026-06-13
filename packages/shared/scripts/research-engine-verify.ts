// Living OS (Wave G6) Research Engine stub test — pure logic, no DB/network/model.
//   npx tsx packages/shared/scripts/research-engine-verify.ts
// Run from the repo root.

import { sourcesForDomain, horizonScan, SOURCE_LABEL, RESEARCH_CHAIN } from "../src/research-engine";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const NOW = new Date("2026-06-13T00:00:00Z").getTime();
const dISO = (daysAgo: number) => new Date(NOW - daysAgo * 86400000).toISOString();

// domain → source mapping (honest, keyword-based)
ok("music domain scans repos+papers", sourcesForDomain("BTZ TRACE audio", ["dsp"]).includes("repos") && sourcesForDomain("audio", ["dsp"]).includes("papers"));
ok("business domain scans competitors", sourcesForDomain("Business systems", ["revenue"]).includes("competitors"));
ok("military domain scans guidance", sourcesForDomain("Military leadership", []).includes("guidance"));
ok("ai domain scans papers", sourcesForDomain("AI agent llm", []).includes("papers"));
ok("unknown domain falls back", sourcesForDomain("zzz", []).length > 0);
ok("every source has a label", (Object.keys(SOURCE_LABEL) as (keyof typeof SOURCE_LABEL)[]).every((k) => SOURCE_LABEL[k].length > 0));

// horizon scan over active domains
const projects = [
  { id: "p1", name: "BTZ TRACE", tags: ["dsp", "audio"], status: "active" },
  { id: "p2", name: "Business systems", tags: ["revenue"], status: "active" },
  { id: "p3", name: "Dormant thing", tags: ["x"], status: "dormant" },
];
const nodes = [
  { title: "BTZ analyzer", tags: ["dsp"], mvs: 90, updated_at: dISO(2) },          // fresh, high value
  { title: "Old business note", tags: ["revenue"], mvs: 40, updated_at: dISO(60) }, // stale
];

const dirs = horizonScan({ projects, nodes, now: NOW }, 6);
ok("produces directions", dirs.length > 0);
ok("skips dormant projects", !dirs.some((d) => d.domain === "Dormant thing"));
ok("each direction carries domain+topic+rationale+source+priority", dirs.every((d) => d.domain && d.topic && d.rationale && d.sourceType && d.priority));
ok("stale business domain is high priority", dirs.some((d) => d.domain === "Business systems" && d.priority === "high"));
ok("high-value fresh domain still surfaces", dirs.some((d) => d.domain === "BTZ TRACE"));
ok("ranked high-first", (() => { const r = { high: 0, med: 1, low: 2 } as Record<string, number>; return dirs.every((d, i) => i === 0 || r[dirs[i - 1].priority] <= r[d.priority]); })());
ok("topic references the domain + a source label", dirs.some((d) => d.topic.includes("BTZ TRACE") && /repos|papers|videos|trends/.test(d.topic)));

// no-research domain → baseline rationale + high priority
const fresh = horizonScan({ projects: [{ id: "p9", name: "New Domain", tags: ["new"], status: "active" }], nodes: [], now: NOW });
ok("brand-new domain → 'no external sources' baseline, high priority", fresh.some((d) => /no external sources/i.test(d.rationale) && d.priority === "high"));

// the chain is the canonical Research→…→Quest loop
ok("research chain ends in Quest", RESEARCH_CHAIN[0] === "Research" && RESEARCH_CHAIN[RESEARCH_CHAIN.length - 1] === "Quest");

console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
