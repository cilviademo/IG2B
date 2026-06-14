# Companion Inversion — from graph-app to AI companion

`Last updated: 2026-06-14 · Commit: companion-phase-b · By: claude (Claude Code)`

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
- **Still to do:** **#1** proactive arrival on share ("Marc, I found something…" → summary →
  connections → questions → actions); the dedicated **Media lifecycle indicator**
  (Transcribing → Synthesizing → Done) once the media worker is live (today folded into
  "Radian analyzing…"); optionally retire the standalone `/activity` route now that the
  Companion home covers it.

## Phase C — "the boardroom is real"
- Situation Room is already functional; Phase C is richer advisor output + tighter synthesis UI
  if the owner wants more after using it live.
