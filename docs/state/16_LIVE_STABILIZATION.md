# Live-AI stabilization (post-AURORA)

`Last updated: 2026-06-14 · Commit: aurora-ia · By: claude (Claude Code)`

> Branch `claude/aurora-ia` (NOT merged). No new feature waves — stabilizing the live AI
> task flow, result routing, Atlas navigation, and item management. Behaviour-preserving.

| # | Issue | Status |
|---|---|---|
| 1 | **Global task notifications** | ✅ `toastTask` no longer excludes the active tab — a completing job toasts on **any** route (provider is shell-level; tab badges + bell update globally; history persists in localStorage across route changes + reload). |
| 2 | **"View" routes correctly** | ✅ `accept()` now routes to the **child node** (`/atlas?focus`), else the **source node**, else the **AI Activity detail** (`/activity?task=…`) — **never generic Home**. |
| 3 | **AI Activity / Runs screen** | ✅ New **`/activity`** — the engine room for every run (Running · Completed · Archived), each with feature · source · status · progress · timestamp · error + **View result · Open source · Retry · Archive · Delete**. Reached from the **bell** ("Open AI Activity") and **More**. Sourced from the persistent Task Center (survives reload + Companion-panel close). |
| 4 | **Atlas back/navigation** | ✅ A **"Back to full Atlas"** pill appears whenever a node is focused/selected (incl. a `?focus` result/what-if cluster) → resets + clears selection. Zoom/center controls relabeled. **Partial:** a full named view-state taxonomy (Main/Focused/Result/Simulation/Research/Filtered breadcrumb) is recommended-next. |
| 5 | **Atlas mobile scaling** | ✅ Container reserves safe-area **top + bottom**; controls bumped to **44px** and lifted clear of the tab bar + home indicator. **Partial:** force-layout vertical centering for small node counts + label-collision avoidance for generated clusters is canvas work, recommended-next (kept out to protect pointer math + 60fps). |
| 6 | **App-wide item management** | ✅ Reusable **`ItemActions`** menu shipped + wired: **AI results** (view/open-source/retry/archive/delete), **nodes** (create quest, copy), **captures** (create quest, copy, **Archive** [soft, reversible], **Delete permanently** [confirm]). Backend: `POST /captures/:id/archive` + `DELETE /captures/:id` + node-delete now emit `archived`/`deleted` events (provenance). Soft-delete-first; destructive actions confirm. **Recommended-next:** extend the same `ItemActions` to quests/briefs/timeline/context/projects + Move-to-project/Link/Mark-secret/Duplicate + an undo toast.
| 7 | **First-class result persistence** | ✅ **Verified, no new table needed.** Every run persists across three layers: `jobs` (one row per run — status/result/error/updated_at), `ai_calls` (provider/model/tokens/cost/latency/status), and **child nodes** (the output, edged to the source, with provenance). The client **Task Center** mirrors run state durably (localStorage) so Activity survives reload + panel close. |
| 8 | **Mobile UI fit** | ✅ Addressed via AURORA (16px base, overflow guards, responsive headings, per-route scroll, 5-tab bar) + this pass (44px Atlas controls, safe-area). Sheets already cap at 90vh + scroll. |
| 9 | **Verification** | pwa/api/worker typecheck + builds green; verify matrix **409/409**; Atlas iPhone screenshot; reduced-motion intact; capture/upload/iOS-Shortcut untouched. |

## Phone acceptance (owner runs)
1. Long-press an Atlas node → **Explain / Next steps**. 2. Immediately go to **Home**. 3. The
toast appears **on Home** when the job completes. 4. Tap **View** → opens the exact result
(child node on Atlas, or the AI Activity detail). 5. The run is also in **AI Activity** (and
the **bell**). 6. Back on Atlas, a focused/result cluster shows **"Back to full Atlas."**
7. Zoom/center controls are comfortably tappable (44px). 8. AI results have Retry/Archive/Delete.

## Recommended-next (explicitly deferred, honest)
- A dedicated **`ItemActions`** rollout across all entity types (Issue 6 breadth) with soft-delete + undo.
- **Atlas canvas pass** (Issue 5 depth): force-layout centering + label collision for generated
  clusters, and the full view-state breadcrumb (Issue 4) — on its own branch with fps + pointer regression gates.
- Optional server read-model `GET /radian/runs` (jobs ⨝ ai_calls) to make AI Activity cross-device (today it's client-durable, which meets the acceptance criteria).
