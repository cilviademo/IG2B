// Wave 0 stub test — verifies the RADIAN foundation's PURE logic with no DB and
// no network: budget governor (incl. the $0.01 force-test), cost estimation,
// the provider-agnostic adapter factory, the deterministic adapter, the prompt
// registry + version bump, tool stubs, and the project seed. Run:
//   npx tsx packages/shared/scripts/wave0-verify.ts   (expects ALL PASS)

import {
  loadModelConfig, governorDecision, tierAllowed, preflightBlock, estimateCostCents,
  getModel, deterministicAdapter, anthropicAdapter, toolRegistry,
} from "../src/model";
import { getPrompt, PROMPTS } from "../src/prompts";
import { SEED_PROJECTS } from "../src/registry";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

async function main() {
  // --- config
  const cfg = loadModelConfig({ ANTHROPIC_API_KEY: "", RADIAN_MONTHLY_BUDGET_CENTS: "1500" });
  ok("config loads two tiers", !!cfg.tiers.cheap.model && !!cfg.tiers.strong.model);
  ok("strong tier maxTokens > cheap", cfg.tiers.strong.maxTokens >= cfg.tiers.cheap.maxTokens);

  // --- governor decision (80% degrade / 100% block)
  ok("governor ok at 0%", governorDecision(0, 1500) === "ok");
  ok("governor degrade at 80%", governorDecision(1200, 1500) === "degrade");
  ok("governor block at 100%", governorDecision(1500, 1500) === "block");
  ok("governor block over budget", governorDecision(1600, 1500) === "block");
  ok("degrade permits cheap only", tierAllowed("degrade", "cheap") && !tierAllowed("degrade", "strong"));
  ok("block permits nothing", !tierAllowed("block", "cheap") && !tierAllowed("block", "strong"));

  // --- $0.01 budget force-test: a real (strong-tier) call must be blocked pre-flight
  // (queue, no spend), and a sub-cent budget blocks even a cheap call.
  const strongEst = estimateCostCents(cfg.tiers.strong, { input: 300, output: cfg.tiers.strong.maxTokens });
  ok("$0.01 budget blocks a strong call (preflight)", preflightBlock(0, strongEst, 1) === true, `strongEst=${strongEst.toFixed(3)}c`);
  const cheapEst = estimateCostCents(cfg.tiers.cheap, { input: 300, output: cfg.tiers.cheap.maxTokens });
  ok("sub-cent budget blocks even a cheap call", preflightBlock(0, cheapEst, 0.1) === true, `cheapEst=${cheapEst.toFixed(3)}c`);
  ok("normal budget allows the call", preflightBlock(0, strongEst, 1500) === false);

  // --- cost math is monotonic + nonzero
  const c1 = estimateCostCents(cfg.tiers.cheap, { input: 1000, output: 0 });
  const c2 = estimateCostCents(cfg.tiers.cheap, { input: 1000, output: 1000 });
  ok("output tokens add cost", c2 > c1 && c1 > 0);

  // --- adapter factory: deterministic without key, anthropic with key
  ok("no key -> deterministic adapter", getModel("cheap", cfg).provider === "deterministic");
  ok("key -> anthropic adapter", getModel("cheap", { ...cfg, apiKey: "sk-test" }).provider === "anthropic");

  // --- deterministic adapter works offline (complete + json + embed)
  const det = deterministicAdapter("det");
  const r = await det.complete({ prompt: "RADIAN classifies inputs into types. It matters because it compounds.", system: "be terse" });
  ok("deterministic complete returns text + usage", r.text.length > 0 && r.usage.input > 0);
  const rj = await det.complete({ prompt: "x", json: true });
  ok("deterministic json is valid JSON", (() => { try { JSON.parse(rj.text); return true; } catch { return false; } })());
  const emb = await det.embed("hello world");
  ok("deterministic embed is 16-dim unit-ish vector", emb.vector.length === 16 && Math.abs(Math.hypot(...emb.vector) - 1) < 1e-6);

  // --- anthropic adapter constructed but NOT called (no network in sandbox)
  const an = anthropicAdapter("sk-test", "claude-haiku-4-5-20251001");
  ok("anthropic adapter exposes provider/model", an.provider === "anthropic" && an.model.includes("haiku"));
  let embThrew = false;
  try { await an.embed("x"); } catch { embThrew = true; }
  ok("anthropic embed throws (no native endpoint)", embThrew);

  // --- prompt registry + version bump (Meta-Radian path)
  ok("prompt registry seeded", Object.keys(PROMPTS).length >= 5);
  const p = getPrompt("ingest_classify");
  ok("prompt has a version", p.version === "1.0.0");
  const built = p.build({ title: "Repo", content: "a DSP library" });
  ok("prompt builds system+prompt", built.system.length > 0 && built.prompt.includes("DSP"));
  ok("override bumps version", getPrompt("ingest_classify", { version: "1.1.0" }).version === "1.1.0");

  // --- tool seam stubs (web-search + github implemented in Wave 2)
  const tr = await toolRegistry.github.run({});
  ok("github tool is a not-implemented stub", tr.ok === false && String(tr.error).includes("wave2"));

  // --- project registry seed
  ok("8 seed projects (the owner's domains)", SEED_PROJECTS.length === 8);
  ok("Indigold is in the registry", SEED_PROJECTS.some((s) => s.slug === "indigold"));

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
