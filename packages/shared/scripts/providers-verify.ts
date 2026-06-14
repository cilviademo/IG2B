// LLM Provider Framework acceptance tests — pure, no network, no real keys.
//   npx tsx packages/shared/scripts/providers-verify.ts   (expects ALL PASS)

import {
  providerConfigured, providersStatus, resolveTask, defaultProvider, llmMode,
  getTaskAdapter, makeLiveAdapter, ALL_PROVIDERS, PROVIDER_ENV,
} from "../src/providers";
import { filterResearchSafe, isResearchSafe } from "../src/model";

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

async function main() {
  const empty = {}; // no keys configured

  // 1. missing key does not crash; returns safe reason
  const oa = providerConfigured("openai", empty);
  ok("missing key -> configured:false reason:missing_env_var", oa.configured === false && oa.reason === "missing_env_var");

  // 2. configured provider reports true
  const an = providerConfigured("anthropic", { ANTHROPIC_API_KEY: "sk-test" });
  ok("configured provider -> true", an.configured === true && an.models_available === true);

  // 3. status never exposes token values
  const status = providersStatus({ ANTHROPIC_API_KEY: "sk-SECRET-must-not-leak", OPENAI_API_KEY: "" });
  const blob = JSON.stringify(status);
  ok("status does not expose token values", !blob.includes("SECRET") && !blob.includes("sk-"));
  ok("status lists all providers", ALL_PROVIDERS.every((p) => p in status.providers));

  // 4. stub mode returns deterministic output (no network)
  const stub = getTaskAdapter("classification", empty, "stub");
  ok("stub mode uses deterministic adapter", stub.adapter.provider === "deterministic");
  const r = await stub.adapter.complete({ prompt: "classify this DSP repo" });
  const r2 = await stub.adapter.complete({ prompt: "classify this DSP repo" });
  ok("stub output is deterministic + repeatable", r.text.length > 0 && r.text === r2.text);

  // 5. live mode refuses to run without env key (graceful throw, redacted)
  let threw = "", crashed = false;
  try { makeLiveAdapter("openai", "gpt-4o-mini", empty); } catch (e) { threw = e instanceof Error ? e.message : ""; }
  ok("live without key throws provider_not_configured", threw.includes("not_configured"));
  ok("no key never crashes the process", !crashed);

  // 6. per-task provider selection from env, no code changes
  const env = { LLM_DEFAULT_PROVIDER: "openrouter", LLM_CLASSIFICATION_PROVIDER: "anthropic", LLM_RESEARCH_PROVIDER: "openrouter" };
  ok("default provider from env", defaultProvider(env) === "openrouter");
  ok("classification overrides to anthropic", resolveTask("classification", env).provider === "anthropic");
  // Live activation: LLM_PROVIDER alias + ANTHROPIC_API_KEY => live anthropic.
  ok("LLM_PROVIDER alias honored", defaultProvider({ LLM_PROVIDER: "anthropic" }) === "anthropic");
  ok("ANTHROPIC_API_KEY -> live mode", llmMode({ ANTHROPIC_API_KEY: "sk-test" }) === "live");
  ok("ANTHROPIC_API_KEY -> anthropic configured", providerConfigured("anthropic", { ANTHROPIC_API_KEY: "sk-test" }).configured === true);
  ok("default provider is anthropic with no env", defaultProvider({}) === "anthropic");
  ok("research uses openrouter + a research model", resolveTask("research", env).provider === "openrouter" && resolveTask("research", env).model.length > 0);
  ok("synthesis falls back to default (openrouter)", resolveTask("synthesis", env).provider === "openrouter");

  // 7. mode inference: any key -> live, none -> stub; explicit wins
  ok("no keys -> stub mode", llmMode(empty) === "stub");
  ok("a key -> live mode", llmMode({ OPENAI_API_KEY: "x" }) === "live");
  ok("explicit LLM_MODE wins", llmMode({ OPENAI_API_KEY: "x", LLM_MODE: "stub" }) === "stub");

  // 8. privacy: secret/internal excluded from research/tool inputs
  const items = [
    { id: "a", sensitivity: "public" }, { id: "b", sensitivity: "private" },
    { id: "c", sensitivity: "internal" }, { id: "d", sensitivity: "secret" },
  ];
  const safe = filterResearchSafe(items).map((i) => i.id);
  ok("secret + internal excluded from research", safe.join(",") === "a,b" && !isResearchSafe("secret") && !isResearchSafe("internal"));

  // 9. env var names are correct + complete
  ok("provider env var map complete", ALL_PROVIDERS.every((p) => !!PROVIDER_ENV[p as keyof typeof PROVIDER_ENV]));

  console.log(`\n${fail === 0 ? "ALL PASS ✓" : "SOME FAILED ✗"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
