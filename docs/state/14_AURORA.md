# PROJECT AURORA — UX / IA / Visual reconfiguration

`Last updated: 2026-06-14 · Commit: aurora-ia · By: claude (Claude Code)`

> Branch `claude/aurora-ia` (NOT merged). Behaviour-preserving: no engine, endpoint, or job
> changed — capabilities re-presented, not rebuilt. Three laws: attention is sacred · engines
> disappear, verbs remain · Atlas is the emotional center.

## Phase status

| Phase | What | Status |
|---|---|---|
| **A1** | Home → 4 sections; Progression/Simulate/Research/Detections/Metrics → `/insights`; tab bar 8→5 + `/more`; I/O→Settings (raw under Advanced) | ✅ |
| **A2** | Conversational Home (time greeting + paragraph + Brief Me), offline-safe, same deterministic data | ✅ |
| **A3** | Quests → Today · Later · Archive (state machine unchanged; empty groups hide; inviting empty board) | ✅ |
| **A4** | Ask RADIAN → one natural-language input routed to the verb router; Advanced reveals explicit verbs | ✅ |
| **A5** | Boardroom → dedicated **Situation Room** (`/situation-room`): radial of 6 advisors, Convene, deliberation, Resolved, Make-it-a-quest | ✅ |
| **A6** | Time Machine → one panel at a time (Replay / Lessons / Resurfaced / Past Self) via segmented control + swipe | ✅ |
| **A7** | Weekly Brief → editorial (masthead rule, big headline, large lede, more air) | ✅ |
| **A8** | Atlas evolution | **Deferred (intentional)** — Atlas already implements the cosmos (G8: nebulae, constellations, glow, legendary, 60fps). Heavy changes risk the canvas pointer math (a hard constraint) + 60fps, so this needs a *dedicated* Atlas branch, not a broad sweep. No regressions introduced. |
| **A9** | Scroll restoration — per-route `scrollTop` remembered + restored (fixes shared-scroll bug) | ✅ |
| **A10** | Loading skeletons (shimmer) replace bare "Loading…"; always resolve to real success/failure | ✅ |
| **A11** | Motion + haptics: `.page-enter` transitions, gated haptics on tab taps; subtle-sound left as readiness only | ✅ |
| **A12** | Empty states with intent (Quests board, Active Quest, honest sparse copy everywhere) | ✅ |
| **A13** | Premium feel — spacing tokens, more whitespace/line-height/type scale, fewer borders | ✅ (applied across Home/Insights/More/Brief/Quests/Situation Room) |
| **A14** | Performance — Home cold-load **4 → 1** request (panels relocated; was 2 after Phase-3 lazy, now 1); lazy routes; worker-Redis guard confirmed intact | ✅ |
| **A15** | Provider posture — UI honestly reflects deterministic-vs-live (fallback status labels, "answered from your vault", `key_detected`); no provider wiring this pass | ✅ |

## Accessibility (cross-cutting)
- Status not by colour alone — `Dot` shapes (triangle = risk, square = info) on Home + Insights.
- `.tap-target` (44px) for icon-only controls; tab targets ≥56×44; bell/refresh have aria-labels.
- `prefers-reduced-motion` strips `.page-enter`, `.skeleton`, celebrate/pop and haptics.
- Responsive heading clamps; 16px base; `overflow-x` guards (no horizontal smush).

## Information architecture (new)
- **Tabs:** Home · Inbox · Atlas · Timeline · More.
- **More hub:** Quests · Insights · Context · Brief · Time Machine · Settings · Diagnostics.
- **New routes:** `/more`, `/insights`, `/situation-room`, `/settings` (alias of `/io`).
- **Removed dead code:** `BoardroomView.tsx` (superseded by the Situation Room).

## Guardrails honoured
Capture-instant / AI-async untouched · SW not modified (no cache bump needed) · `/capture?raw=`
contract untouched · no secrets in PWA/logs · **no CSS zoom on `/atlas`** (global zoom removed
entirely) · deterministic-first + honest sparse copy · mirrors (`lib/*`) intact · engines frozen.
Verify matrix **409/409**; pwa/api/worker typecheck + builds green throughout.

## Recommended next (owner's call)
A dedicated **Atlas branch** for A8 (depth/parallax/fog-of-war/breathing) with fps + pointer
regression gates, kept separate so the signature experience gets the care it needs.
