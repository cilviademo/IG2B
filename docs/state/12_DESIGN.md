# Design + Delight pass (Phase 4)

`Last updated: 2026-06-14 · Commit: design-polish · By: claude (Claude Code)`

> **Branch: `claude/design-polish` (NOT merged).** Per the directive this stays off `main`
> and off the hardening branch for the owner's eyeball first. Logic is frozen — every change
> here is visual/additive. The Vault design system was already disciplined (one gold accent,
> mono-for-data, radius 0/6/10, reduced-motion guards, AI-ism ban honored), so this is
> **refinement, not a teardown.**

## What shipped this pass

1. **Design-system tokens** (`index.css`, additive): a 4px **spacing scale** (`--s-1..7`),
   a **type scale** (`--t-1..5`), and a single **elevation** token (`--elev-card`, a barely-
   perceptible lift — no heavy shadows, per the ban list). Gives screens a shared rhythm to
   migrate to without rewriting existing layouts.
2. **Real empty states** (`EmptyState` primitive): a soft gold ring + icon, display-face
   headline, one inviting sentence, optional primary action. Replaces "gray text that reads
   as broken." Applied to the **Quests** board (empty + API-off). Before/after attached.
3. **Tasteful celebration** (`.celebrate`): a single warm gold ring that expands+fades once
   on **quest completion** (QuestCard) — no confetti, no sound (sound kept out of scope but
   the hook is a clean place to add it later). Fully suppressed under `prefers-reduced-motion`.
4. **Accessibility — status not by colour alone:** `Dot` gained a `shape` prop
   (dot/square/triangle). Home **Detections → squares**, **Risks → triangles**, so
   colour-blind users get a second channel. Icon-only controls get a `.tap-target` (44px)
   utility; `Button`/`Row` already met the 44px floor; focus ring already present.

## Accessibility audit (state + gaps)

| Area | State | Notes |
|---|---|---|
| Reduced motion | ✅ | Global guard freezes drift/pulse/celebrate; Atlas respects it. |
| Large text | ✅ | Global `zoom: 1.08` + 15px body; type scale added. Re-confirm sheets under zoom on device. |
| Colour-blind status | ✅ (started) | Shape now pairs with colour on Home Detections/Risks + `Dot`. **Gap:** roll `shape=` through Atlas legend + quest state chips. |
| Tap targets ≥44px | ✅ | Button/Row/`.tap-target`. **Gap:** audit the 8-up TabBar on the narrowest device (~48px/tab at 390w — borderline). |
| Focus-visible | ✅ | 2px gold outline globally. |
| Contrast | 🟡 | Cream `#eae6da` on `#0c0d11` passes; **verify `--text-dim` (#8e929c) on bg for small text** — borderline AA, consider nudging dim ~+6% lightness. |
| VoiceOver labels | 🟡 | Decorative `Dot`s now `aria-hidden`. **Gap:** add `aria-label`s to icon-only buttons (Suggest, sheet X, tab items). |
| One-handed reach | ✅ | Primary actions + tab bar are bottom-anchored. |

## Recommendations for the deeper review (not done — your call)

- **Home as a briefing room:** reorder/label into Situation · Opportunities · Risks · Today's
  Quests · Momentum · Boardroom · Companion · Time Machine (data sources already exist; this
  is layout + headers, still logic-frozen).
- **Atlas beautification polish** beyond G8 (depth/parallax on the nebulae) — keep 60fps + the
  reduced-motion guard; verify on device.
- **Migrate ad-hoc margins → the spacing scale** screen by screen for density consistency.
- **Sound readiness:** the `.celebrate`/level-up hook is the natural insertion point; keep it
  opt-in and off by default.
- **TabBar at 8 items** is dense on small phones — consider a "More" overflow or grouping.

## Verify

pwa typecheck + build green. Headless before/after captured for **Quests** (empty state) and
**Home** (shape-distinct status). Screenshot script: `apps/pwa/scripts/screenshot.mjs`.
