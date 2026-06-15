# Companion Inversion — from graph-app to AI companion

`Last updated: 2026-06-14 · Commit: radian-home · By: claude (Claude Code)`

> Owner directive: Indigold still behaves like "a graph database with AI attached." Invert it:
> **You → Radian (companion) → conversation memory → Situation Room → Atlas (hidden memory) →
> Storage.** Atlas becomes the engine, not the experience. Tracked as phases A/B/C.

## Phase A — "it feels like a companion" (DONE, this pass)

- **#2 + #6 (core inversion): AI results are conversation, not dots.** Atlas now filters out
  AI-derived nodes (`meta.epistemic_type === "inference"`) and their `derived_from` edges, and
  instead renders them as an **in-node Radian thread** in the node sheet (`RadianThread` in
  `Atlas.tsx`): each Research/Explain/Challenge/Teach/Simulate result is a chat turn (label +
  text, tap to expand), built from the already-fetched nodes/edges (no new backend). The graph
  shows knowledge; the AI history lives inside its source node. CompanionPanel "Open result"
  now focuses the **parent** node (the child is no longer a dot).
- **#4: human-readable queue cards.** `Inbox` cards show the platform ("Instagram", "YouTube",
  …) not raw hosts/ids, a clean preview (never a bare URL), and a companion-voiced status —
  **"Radian analyzing…"** (pulsing) → **"Saved to vault"**.
- **#3 (polish) + #7 (mobile): Situation Room.** The boardroom backend already works
  (`/radian/boardroom` → six advisor lines + synthesis). Fixed the mobile radial so advisor
  labels (Teacher/Strategist) no longer collide with the Convene hub (R 112→128, hub 92→80,
  `nowrap` labels), and reframed the consensus as **"Radian's synthesis · recommended move"**.

**Verified (sandbox):** typecheck:all + pwa build green; matrix 459/459; headless renders of
`/inbox` (clean cards + "Radian analyzing…"), `/situation-room` (labels clear the hub). The
in-node thread + Atlas filtering need **live data with real AI-derived nodes** to fully confirm
— owner verifies on device (share → Ask Radian → result appears in the node's thread, not as a
new Atlas dot).

## Phase B — "Radian is the OS" (IN PROGRESS)

- **#5 + #6 (DONE):** **Companion home** (`/companion`, `Companion.tsx`) is now the **primary
  tab ("Radian")**; it merges "Running now" (active jobs) + "Recent conversations" (terminal AI
  tasks, open-result → the source node's thread, retry on fail) into one place. **Atlas is
  demoted to background** — removed from the tab bar (now Home · Inbox · Radian · Timeline ·
  More), still reachable from Radian's "Memory" button and the More hub. Its task badges roll
  into More.
- **Re-access source (owner ask, DONE):** CaptureDetail "Open original" + Atlas NodeSheet "Open
  source" (from `meta.web.url` / `meta.media.url`).
- **Atlas playful (owner ask, partial):** tactile haptic on star-tap (battery-smart loop
  untouched). Deeper canvas motion = a device-verified follow-up.
- **#1 (DONE): proactive arrival.** The Companion home leads with a **"What I found"** feed —
  recent shares + their enrichment: "Radian is reading this…" while ingesting, then the
  synthesis summary + connection count + "See what I found" → the node thread. Driven by
  recent captures + their derived nodes (no capture-flow changes).
- **Still to do:** richer arrival (suggested questions/actions inline); the dedicated **Media lifecycle indicator**
  (Transcribing → Synthesizing → Done) once the media worker is live (today folded into
  "Radian analyzing…"); optionally retire the standalone `/activity` route now that the
  Companion home covers it.

## Phase C — conversational Radian (DONE: vault chat)

- **Ask Radian anything.** New `POST /radian/chat` retrieves the most relevant **research-safe**
  nodes for the question (`semanticNeighbors` → fallback top-MVS), answers via the governed path
  (budget + provider; secret/internal excluded from context so they never reach the model), and
  returns the **sources** it used. The Companion home has a prominent chat box + this-session
  transcript with tappable source chips → the node. Honest "deterministic" tag when no key.
- One-tap **deepen** (Research / Explain / Convene) on the "What I found" cards fires the verb on
  that node (Task Center → node thread).

## Phase C (orig) — "the boardroom is real"
- Situation Room is already functional; Phase C is richer advisor output + tighter synthesis UI
  if the owner wants more after using it live.

## Stage/Sprint 1 — Radian IS Home (done)

Resolved the Home/Radian tab duplication (external product review): `/` now renders the
Radian Companion; the old dashboard moved to `/home` (in More as "Mission Control").
Primary tabs: **Radian · Inbox · Timeline · Library · More** (Atlas stays background in
More). Added a **deterministic daily orientation** at the top of Radian (greeting + top
lines from `/radian/briefing` — the "Chief of Staff" opener; falls back to the simple
greeting if unavailable). `/companion` still resolves (renders Radian) for old links.

**Next (Sprint 2):** rich arrival cards — "why it matters", explained connections,
2–3 suggested questions, suggested actions, useful/wrong feedback, media lifecycle.
