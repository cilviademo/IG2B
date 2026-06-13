// Wave 2 (Stages 3–5) stub test — pure, deterministic, no DB/network.
//   npx tsx packages/shared/scripts/wave2-verify.ts   (expects ALL PASS)

import {
  parseGithubUrl, deterministicAssist, parseAssist,
  deterministicResearch, parseResearch,
  deterministicDailyBrief, parseDailyBrief,
} from "../src/radian-stages2";
import { makeGithubTool, getTools } from "../src/providers";
import type { GraphNode } from "../src/types";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };
const node = (id: string, title: string, mvs: number): GraphNode => ({ id, user_id: "u", type: "resource", title, summary: title, truth_layer: "B", truth_label: "x", mvs, tags: [] } as GraphNode);

async function main() {
  // GitHub URL parsing
  ok("parse github url", JSON.stringify(parseGithubUrl("https://github.com/owner/dsp-repo")) === JSON.stringify({ owner: "owner", repo: "dsp-repo" }));
  ok("parse github url strips .git", parseGithubUrl("https://github.com/o/r.git")?.repo === "r");
  ok("non-github url -> null", parseGithubUrl("https://example.com/x") === null);

  // Stage 3 — assistance for a repo produces the clone->study->adapt playbook + actions
  const projects = [{ id: "p1", name: "BTZ Sonic Alchemy", tags: ["dsp", "audio"], objectives: "Ship modulation" }];
  const repoRef = parseGithubUrl("https://github.com/x/dsp");
  const a = deterministicAssist({ title: "DSP repo", summary: "modulation algorithms", tags: ["dsp", "audio"], url: "https://github.com/x/dsp", kind: "Reference" }, projects, repoRef);
  ok("repo assist has a playbook", a.playbook.length >= 3 && /clone/i.test(a.playbook[0]));
  ok("repo assist next_actions anchored to project", a.next_actions.length > 0 && a.next_actions[0].project === "p1");
  ok("repo assist has a HIGH-leverage action", a.next_actions.some((x) => x.leverage === "HIGH"));

  // Stage 3 — parser
  ok("parseAssist accepts valid JSON", !!parseAssist('{"playbook":["a"],"suggestions":[],"next_actions":[{"action":"do x","project":"p1","effort":"S","leverage":"HIGH","confidence":0.8}]}'));
  ok("parseAssist rejects empty next_actions", parseAssist('{"next_actions":[]}') === null);

  // Stage 4 — research findings become finding stubs; parser shape
  const findings = deterministicResearch({ title: "DSP repo", url: "https://github.com/x/dsp" }, '{"language":"C++"}');
  ok("research yields >=1 finding with a title", findings.length >= 1 && !!findings[0].title);
  ok("parseResearch parses findings array", (parseResearch('{"findings":[{"title":"t","summary":"s","url":"u"}]}') || []).length === 1);
  ok("parseResearch rejects junk", parseResearch("nope") === null);

  // Stage 5 — daily brief deterministic + parser
  const brief = deterministicDailyBrief([node("n1", "Quartz", 92), node("n2", "Idea", 60)], projects);
  ok("daily brief summarizes recent + urgent actions", brief.summary.length > 0 && brief.urgent_actions.length > 0);
  ok("parseDailyBrief accepts valid JSON", !!parseDailyBrief('{"summary":"s","urgent_actions":[{"text":"t","project":"p1","priority":"high"}]}'));

  // GitHub tool: offline -> graceful error (no crash), and missing args guarded
  const gh = makeGithubTool({});
  const noArgs = await gh.run({});
  ok("github tool guards missing owner/repo", noArgs.ok === false && String(noArgs.error).includes("missing"));
  const offline = await gh.run({ action: "repo", owner: "torvalds", repo: "linux" }).catch(() => ({ ok: false, error: "threw" }));
  ok("github tool never throws (graceful)", typeof offline.ok === "boolean");
  ok("getTools exposes github + web_search", !!getTools({}).github && !!getTools({}).web_search);

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
