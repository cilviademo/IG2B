// Narrative Timeline (Sprint 5) — pure chapter composer.  npx tsx packages/shared/scripts/narrative-verify.ts
import { narrate, type Moment } from "../src/narrative";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15
const ago = (days: number) => new Date(NOW - days * 86400000).toISOString();
const m = (id: string, days: number, kind: Moment["kind"], title = id): Moment => ({ id, date: ago(days), kind, title });

// 1. Bucketing into This week / Last week / month chapters.
{
  const { chapters } = narrate([
    m("a", 1, "capture"), m("b", 3, "idea"),
    m("c", 9, "decision"), // last week
    m("d", 70, "capture"), // ~April
  ], { now: NOW });
  ok("three chapters formed", chapters.length === 3);
  ok("newest chapter is This week", chapters[0].label === "This week");
  ok("second chapter is Last week", chapters[1].label === "Last week");
  ok("oldest is a month label", /\d{4}$/.test(chapters[2].label) && chapters[2].key === "2026-04");
}

// 2. Summary reflects real counts (deterministic phrasing + pluralization).
{
  const { chapters } = narrate([m("a", 0, "capture"), m("b", 1, "capture"), m("c", 2, "idea"), m("d", 3, "decision")], { now: NOW });
  const s = chapters[0].summary;
  ok("counts pluralize", s.includes("captured 2 items") && s.includes("formed 1 idea") && s.includes("made 1 decision"), s);
  ok("clauses joined with Oxford and", s.includes(", and "), s);
}

// 3. Themes + resurfaced only annotate the most-recent chapter.
{
  const { chapters } = narrate([m("a", 1, "idea"), m("z", 40, "idea")], { now: NOW, themes: ["sonic", "trace"], resurfaced: ["genesis"] });
  ok("recent chapter gets Focus + Resurfaced", chapters[0].summary.includes("Focus: sonic, trace") && chapters[0].summary.includes("Resurfaced: genesis"));
  ok("older chapter has no Focus annotation", !chapters[1].summary.includes("Focus:"));
}

// 4. Notable moments capped + significance assigned; quiet chapter handled.
{
  const many = Array.from({ length: 12 }, (_, i) => m(`n${i}`, i % 6, "capture"));
  const { chapters } = narrate(many, { now: NOW, momentsPerChapter: 5 });
  ok("moments per chapter capped", chapters[0].moments.length <= 5);
  ok("decision significance is critical", narrate([m("d", 0, "decision")], { now: NOW }).chapters[0].moments[0].significance === "critical");
  ok("empty input → no chapters", narrate([], { now: NOW }).chapters.length === 0);
}

// 5. Bad/undated moments are skipped (never throw).
{
  const { chapters } = narrate([{ id: "x", date: "not-a-date", kind: "idea", title: "x" }, m("ok", 1, "idea")], { now: NOW });
  ok("invalid date skipped, valid kept", chapters.length === 1 && chapters[0].moments.length === 1);
}

// 6. Deterministic across runs.
{
  const input = [m("a", 1, "capture"), m("b", 9, "idea"), m("c", 40, "decision")];
  ok("deterministic", JSON.stringify(narrate(input, { now: NOW })) === JSON.stringify(narrate(input, { now: NOW })));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
