# Indigold — v0.1 Mobile-First PWA Prototype

A private, **local-first** Progressive Web App that serves as the capture, review,
and mission-control surface for the Indigold architecture.

> **This prototype runs exclusively on synthetic JSON/Markdown fixtures.**
> It is intentionally disconnected from any real personal vault. No backend, no
> bundler, no cloud, **zero network data calls**. It works fully offline after
> first load.

## What it proves

- The architecture's **schemas** (nodes, edges, Memory Value Score, context packs).
- A **mobile-first**, iPhone-installable PWA shell with safe-area support.
- The structural **separation of concerns** (Identity / Knowledge / Context /
  Boardroom / Radian surfaces) against fake data — before any real data exists.

## Run it locally

No build step. Serve the folder over `http://` (a service worker requires a
secure context — `localhost` counts) and open it:

```sh
cd Indigold_App
python3 -m http.server 8080
# then visit http://localhost:8080/  (open from a phone on the same network to test install)
```

Opening `index.html` via `file://` will load the UI but **service-worker
offline caching is disabled** under `file://`; use the local server above to
exercise offline mode.

### Install to iPhone Home Screen

Safari → **Share** → **Add to Home Screen**. Launch from the icon to run
full-screen (standalone), notch/home-indicator aware.

### Verify offline

After first load over `localhost`, enable Airplane Mode (or stop the server)
and relaunch — all seven views still render from cache.

## The seven views (bottom tab bar)

| Tab | View | Source |
| :-- | :-- | :-- |
| Inbox | Triage feed of captured items | `sample_nodes.json` |
| Mission | Mission-control dashboard + synthetic Identity card | `sample_dashboard.md`, identity profile |
| Timeline | Multi-track temporal layer | `sample_timeline.json` |
| Atlas | Liminal Atlas force-graph (tap a node) | `sample_nodes.json` + `sample_edges.json` |
| Context | Token-budgeted Context Pack (Encompass) | `sample_context_pack.md` |
| Radian | Weekly Brief / directional intelligence | `sample_weekly_brief.md` |
| Data | Import / Export round-trip (File + Blob API) | in-memory state |

## Layout

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the file/folder map,
[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md) for the guardrails,
[`docs/SYSTEM_RULES.md`](docs/SYSTEM_RULES.md) for the non-negotiable rules, and
[`docs/ROADMAP.md`](docs/ROADMAP.md) for what is deliberately deferred.

## Guardrails (non-negotiable)

- Fake data only. No real names, dates, files, or histories.
- No network/API/telemetry/cloud calls. No secrets in the repo.
- The real vault never lives inside `Indigold_App/` and is never committed.
- Repository stays private during this phase.
