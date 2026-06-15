# 20 — MCP Connector Seam (DORMANT design)

`Last updated: 2026-06-15 · Commit: mcp-seam · By: claude (Claude Code)`

A typed, **dormant** seam for FUTURE Model Context Protocol tool servers (e.g. **Zapier MCP**).
**Today there is NO live connection, NO credentials, NO network, NO write actions.** Only a pure
contract + a deterministic, network-free **stub** ship now (`packages/shared/src/mcp.ts`,
`mcp-verify` 19). Live activation requires explicit owner approval and a separate PR.

## Why a seam (not a feature) now
So the architecture is ready — and *provably safe by default* — before any external tool is wired.
Nothing here can act; it can only describe and refuse.

## Contract (`packages/shared/src/mcp.ts`)
- `McpToolMeta` — `name · description · kind(read|write) · inputs · outputs · requiredPermissions ·
  requiresConfirmation · costHint · enabled`. (This is also the **skill descriptor** from `21_SKILL_SCHEMA_EVAL.md` — one schema, at the boundary that needs it.)
- `McpServerIdentity` — `id · name · url? · authHandleRef?`. **`authHandleRef` is a reference only**
  (which Render env handle holds the secret) — never the secret, never seen by the PWA.
- `McpConnector` — `listTools()` + `callTool(name, args, ctx)`.
- `McpCallResult` — `{ ok, untrusted: true, data?, reason?, provenance }`. **`untrusted` is always true.**
- `McpProvenance` — `connector · tool · kind · at · confirmed` (append-only event shape).
- `mcpGate(tool, ctx)` — the **pure** permission decision. `fenceMcpResult(...)` — wraps output as untrusted.
- `stubMcpConnector(...)` — deterministic adapter: canned reads, **refuses writes** without confirmation, no I/O.

## Safety model (default-deny, end to end)
1. **Connector disabled** by default → nothing runs.
2. **Every tool `enabled: false`** by default. Reads require explicit enablement + `mcp:read`.
3. **Writes** require enablement + `mcp:write` **+ per-action user confirmation** (`ctx.confirmed`).
   There is **no blanket "AI can act across apps."**
4. **MCP results are untrusted external content** → `fenceMcpResult` (reuses `fenceUntrusted`) before
   any model synthesis; the `UNTRUSTED_GUARD` system clause applies (prompt-injection defense, Finding B).
5. **Secret/internal vault content** is never sent to an MCP tool without explicit per-action approval.
6. **No MCP call bypasses the governed system** — any future synthesis of MCP output still goes
   through `governedComplete` (budget, ledger, timeout, deterministic floor).
7. **No secrets to the PWA or logs.** Credentials live only in Render env, referenced by handle.
8. Every call (allowed or refused) emits an **append-only provenance event**.

## Future Zapier activation path (owner-approved, separate PR)
1. Owner approves; a `mcp_connectors` table (or config) records connector id + `authHandleRef` +
   per-tool `enabled` + granted permissions. **Default-deny persists.**
2. A live adapter implements `McpConnector` against the Zapier MCP endpoint (server-side worker
   only), reusing the SSRF-safe fetch + the timeout guard.
3. Owner enables **specific read tools**; the Companion shows them as discoverable skills.
4. Writes stay off until the owner enables the tool **and** confirms each action in the UI.
5. Synthesis of any MCP result is fenced + governed.

## Env secrets eventually needed (NOT now)
`MCP_<CONNECTOR>_URL` (server endpoint) and `MCP_<CONNECTOR>_TOKEN` (auth) on the **worker/API**
env only — referenced by `authHandleRef`, never exposed to the PWA. None exist today.

## Suggested first safe read-only tools (when activated)
Calendar "list upcoming events", email "search (read)", task "list" — all **read**, all
disabled-by-default, each surfaced as evidence (untrusted) into the Research Inbox, never auto-acted.

> **Explicit:** a live connection requires the owner's approval. This document + the stub are the
> entire footprint today; they change no runtime behavior.
