# Companion Inversion — from graph-app to AI companion

`Last updated: 2026-06-15 · Commit: sprint-5-narrative-timeline · By: claude (Claude Code)`

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

## Sprint 2 — rich arrival cards (in progress)
The "What I found" cards now answer more of the five questions: **Your note** ("why you saved
it"), the synthesis, **named + openable connections** (real graph neighbours, not a count),
**content-aware suggested prompts** (Key takeaway / Connect to my work / Skeptic's view → open
a grounded conversation), softened AI-status copy ("Quick analysis · deeper reasoning
unavailable"), with precise Research/Explain/Convene as secondary actions.
**Sprint 2b (done — feedback):** arrival cards have **Useful / Not useful / Dismiss**
(`POST /radian/feedback` → `node.meta.feedback` via `nodes.setFeedback`; emits a `feedback`
event). Dismissed findings persist as dismissed (filtered from the feed on reload) — a real
ranking signal, proposal-only (never deletes). **Still to do:** media lifecycle stages once the
media worker is live; use the feedback signal in proactive ranking (Sprint 4 Attention Queue).

## Sprint 3 — durable conversation threads (done: persistence substrate)
New `conversations` + `messages` tables (+ `repo.conversations`/`repo.messages`) and endpoints
(`POST/GET /radian/conversations`, `GET /radian/conversations/:id`, `:id/archive`). `/radian/chat`
takes an optional `conversationId`: it uses the **stored thread** as history and **persists both
turns**, so a conversation survives a browser restart. Anchored threads (node/capture/project)
are deduped (one ongoing thread per anchor). The Companion home now lists **durable
Conversations** (replacing the in-memory list), with **+ New** and tap-to-resume (loads the full
message history back into the chat). `reset-vault` wipes both new tables.
## Sprint 3b — anchored threads + thread search (done)
- **Findings & source-chips → node-anchored threads (not Atlas).** The "What I found" cards
  carry a primary **Discuss** action, and the **source chips** under a Radian reply now open a
  **node-anchored conversation** in place rather than navigating to the Atlas graph. Built on the
  existing anchor substrate (`createConversation(title,"node",nodeId)`; the server dedupes per
  anchor via `findAnchored`), so a node has **one ongoing thread** that resumes its full history.
- **Thread search:** `GET /radian/conversations?q=` matches the title OR any message text
  (`conversations.search`); the Companion "Conversations" list has a live search box.
- **Anchor-aware list + forget:** listing returns each thread's **anchor title** ("on: <node>")
  and an **Archive (forget)** action (soft `status=archived` — never deletes vault data).
- No schema change (the anchor columns shipped in Sprint 3).
**Still to do:** workstream (project/decision) threads — auto-create/resume a thread anchored to
a project or decision and surface it from those surfaces (Mission Control / decisions).

## Sprint 4 — Attention Queue ("what needs you now", done)
- **Pure ranker** `attention-queue.ts` (`buildAttentionQueue`) on the B6 `attentionScore`
  primitive: importance/urgency/recency/signal weighed together so the loudest input never
  auto-wins. **Honours Sprint 2b feedback** (dismissed→dropped, not-useful→×0.6, useful→+12);
  deterministic; bands `now`/`soon`/`later`. No LLM, no mutation.
- **`GET /radian/attention`** gathers inbox backlog → **triage**, blocked quests → **unblock**,
  in-play/snoozed quests → **due**, open opportunities → **review**, resurfaced forgotten gems →
  **revisit** (carries each node's feedback), runs the engine (top 7).
- **Companion home** leads with **"Needs you now"** (above "What I found"): band dot + kind icon +
  reason + one-tap action. **revisit → Discuss** opens that node's anchored thread (Sprint 3b
  tie-in); triage→Inbox; unblock/due/review→Quests. `attention-queue-verify` (13) → matrix 497.
## Sprint 5 — Narrative Timeline (done)
- The Timeline was fully synthetic (static `sample_timeline.json`). Now it tells the **real story**.
- **Pure composer** `narrative.ts` (`narrate`): buckets real moments (captures/ideas/research/
  connections/decisions/completed quests) into newest-first **chapters** (This week / Last week /
  by month), each with a **deterministic summary** (pluralized, Oxford-joined); Time-Machine
  themes + resurfaced annotate only the most-recent chapter. No LLM.
- **`GET /radian/narrative`** assembles real moments (real connections only — `derived_from`
  excluded) + live themes/resurfaced. **Timeline page rewritten**: live chapters + empty state;
  static sample kept only as the offline/not-signed-in demo. `narrative-verify` (13) → matrix 510.
**Next:** Sprint 6 (Atlas evolution) + the Sprint 3b workstream-threads tail.
