// Advanced memory scoring — pure.  npx tsx packages/shared/scripts/memory-score-verify.ts
import { memoryScore, topMemoryFactor } from "../src/memory-score";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// 1. Bounds + defaults.
{
  const s = memoryScore({});
  ok("empty → mid-ish, bounded 0..100", s.score >= 0 && s.score <= 100);
  ok("components all 0..1", Object.values(s.components).every((v) => v >= 0 && v <= 1));
  ok("weights sum to 1", Math.abs(Object.values(s.weights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  ok("all-zero factors → low", memoryScore({ importance: 0, recencyDays: 999, reuseCount: 0, confidence: 0, connectionDensity: 0, citationFrequency: 0, novelty: 0 }).score < 15);
  ok("all-max factors → high", memoryScore({ importance: 100, recencyDays: 0, reuseCount: 40, confidence: 1, connectionDensity: 20, citationFrequency: 20, novelty: 1 }).score > 85);
}

// 2. Monotonic in each factor (more reuse/citation/degree → higher; older → lower).
const base = { importance: 50, recencyDays: 30, reuseCount: 2, confidence: 0.5, connectionDensity: 2, citationFrequency: 1, novelty: 0.5 };
ok("more reuse → higher", memoryScore({ ...base, reuseCount: 15 }).score > memoryScore(base).score);
ok("more citations → higher", memoryScore({ ...base, citationFrequency: 12 }).score > memoryScore(base).score);
ok("more connections → higher", memoryScore({ ...base, connectionDensity: 12 }).score > memoryScore(base).score);
ok("higher importance → higher", memoryScore({ ...base, importance: 95 }).score > memoryScore(base).score);
ok("older → lower (recency)", memoryScore({ ...base, recencyDays: 150 }).score < memoryScore({ ...base, recencyDays: 1 }).score);
ok("higher confidence → higher", memoryScore({ ...base, confidence: 0.95 }).score > memoryScore({ ...base, confidence: 0.1 }).score);

// 3. Determinism + saturation + robustness.
ok("deterministic", memoryScore(base).score === memoryScore(base).score);
ok("reuse saturates (huge count not unbounded)", memoryScore({ ...base, reuseCount: 1000 }).components.reuse <= 1);
ok("garbage/NaN factors tolerated", Number.isFinite(memoryScore({ importance: NaN as unknown as number, reuseCount: -5 }).score));
ok("recency fresh=1, 180d≈0", Math.abs(memoryScore({ recencyDays: 0 }).components.recency - 1) < 1e-9 && memoryScore({ recencyDays: 180 }).components.recency <= 0.01);

// 4. topMemoryFactor names the biggest weighted lever.
{
  const s = memoryScore({ importance: 100, recencyDays: 200, reuseCount: 0, confidence: 0, connectionDensity: 0, citationFrequency: 0, novelty: 0 });
  ok("top factor is importance when it dominates", topMemoryFactor(s).factor === "importance");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
