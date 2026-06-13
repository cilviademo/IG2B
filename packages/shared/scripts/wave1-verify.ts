// Wave 1 (Stages 1–2) stub test — pure, deterministic, no DB/network.
//   npx tsx packages/shared/scripts/wave1-verify.ts   (expects ALL PASS)

import {
  deterministicIngest, parseIngest, kindToNodeType,
  deterministicContextualize, parseContext, CAPTURE_KINDS,
} from "../src/radian-stages";
import { filterResearchSafe } from "../src/model";
import type { GraphNode } from "../src/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, d = "") => { cond ? (pass++, console.log(`PASS  ${name}`)) : (fail++, console.log(`FAIL  ${name}${d ? " — " + d : ""}`)); };

function node(id: string, title: string, tags: string[]): GraphNode {
  return { id, user_id: "u", type: "resource", title, summary: title, truth_layer: "B", truth_label: "Normalized", mvs: 50, tags } as GraphNode;
}

async function main() {
  // Stage 1 — deterministic ingest
  const repo = deterministicIngest({ title: "Awesome DSP repo", note: "modulation algorithms", url: "https://github.com/x/dsp", source: "ios_share_sheet" });
  ok("github repo -> HIGH actionability", repo.actionability === "HIGH");
  ok("ingest produces a valid kind", (CAPTURE_KINDS as string[]).includes(repo.type));
  ok("ingest extracts entities", repo.entities.length > 0 && repo.entities.includes("dsp"));
  ok("ingest mvs in range", repo.mvs.score >= 0 && repo.mvs.score <= 100);
  const task = deterministicIngest({ title: "TODO: ship the saturation module by Friday", source: "manual" });
  ok("task words -> Task + HIGH", task.type === "Task" && task.actionability === "HIGH");

  // Stage 1 — parser
  ok("parseIngest accepts valid JSON", !!parseIngest('{"type":"Reference","summary":"s","entities":["a"],"mvs":{"score":70,"why":"w"},"actionability":"HIGH"}'));
  ok("parseIngest rejects bad type", parseIngest('{"type":"Nonsense"}') === null);
  ok("parseIngest rejects non-JSON", parseIngest("not json") === null);

  // map kind -> node type
  ok("kindToNodeType maps Person->person", kindToNodeType("Person") === "person");
  ok("kindToNodeType maps Opportunity->project", kindToNodeType("Opportunity") === "project");

  // Stage 2 — deterministic contextualize
  const subject = { id: "n1", tags: ["dsp", "audio", "modulation"], title: "DSP repo", summary: "modulation algorithms for audio" };
  const neighbors = [node("n2", "Audio plugin", ["audio", "plugin"]), node("n3", "Unrelated", ["cooking"])];
  const projects = [
    { id: "p1", name: "BTZ Sonic Alchemy", tags: ["dsp", "audio", "plugin"], objectives: "Ship modulation modules" },
    { id: "p2", name: "Education", tags: ["learning"], objectives: "Study" },
  ];
  const ctx = deterministicContextualize(subject, neighbors, projects);
  ok("contextualize links shared-tag neighbor", ctx.edges.some((e) => e.target_id === "n2" && e.relationship === "similar"));
  ok("contextualize skips unrelated neighbor", !ctx.edges.some((e) => e.target_id === "n3"));
  ok("edge confidence in [0,1]", ctx.edges.every((e) => e.confidence >= 0 && e.confidence <= 1));
  ok("project_relevance favors BTZ Sonic Alchemy", ctx.project_relevance[0]?.registry_id === "p1");
  ok("project_relevance has a why", !!ctx.project_relevance[0]?.why);

  // Stage 2 — parser filters invalid ids
  const parsed = parseContext(
    '{"edges":[{"target_id":"n2","relationship":"extends","confidence":0.8,"why":"x"},{"target_id":"BAD","relationship":"similar","confidence":0.5}],"project_relevance":[{"registry_id":"p1","relevance":0.9,"why":"y"},{"registry_id":"BAD","relevance":1}]}',
    new Set(["n2", "n3"]), new Set(["p1", "p2"]),
  );
  ok("parseContext keeps valid edge only", parsed!.edges.length === 1 && parsed!.edges[0].target_id === "n2");
  ok("parseContext keeps valid relevance only", parsed!.project_relevance.length === 1 && parsed!.project_relevance[0].registry_id === "p1");

  // Wave 1 gate — secret exclusion (research/tool inputs)
  const caps = [{ id: "a", sensitivity: "public" }, { id: "s", sensitivity: "secret" }, { id: "i", sensitivity: "internal" }];
  const safe = filterResearchSafe(caps).map((c) => c.id);
  ok("secret + internal excluded from research inputs", safe.join(",") === "a");

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
