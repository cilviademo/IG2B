# SECURITY_MODEL.md — Indigold v0.1

The prototype's security posture is **isolation by construction**: it cannot leak
real data because it never touches any. This document records the guarantees and
how they are enforced in code.

## Threat model (v0.1 scope)
The prototype is a static, offline client. The relevant risks are not runtime
exploits but **accidental exposure**: real data being committed, a network call
exfiltrating data, or a secret landing in the repo. The model targets those.

## Zones
| Zone | Contents | Rule |
| :-- | :-- | :-- |
| **Workspace** (`Indigold_App/`) | App code, schemas, synthetic fixtures | Read/write allowed |
| **Real vault** (outside, e.g. `OneDrive/Indigold_Vault/`) | Real personal data | **Never** accessed, read, indexed, or committed |
| **Secrets** | tokens, keys, OAuth | Never present in v0.1 |

## Enforced guarantees
1. **No network data calls.** The service worker only ever handles **same-origin**
   GET requests (`url.origin !== self.location.origin` → bypass). `app.js` fetches
   only relative paths. There are no `fetch`/`XHR`/WebSocket calls to any external
   host, no analytics, no telemetry.
2. **No external scripts/CDNs.** All JS/CSS is first-party and same-origin; the
   Liminal Atlas is hand-rolled rather than pulled from a CDN, preserving the
   offline guarantee and removing third-party code execution.
3. **Markdown link hardening.** The renderer rewrites any `http(s):` link target
   to `#`, so rendered fixtures cannot trigger outbound navigation.
4. **Privacy by default.** Every node defaults to `privacy: private`; the schema
   only permits `secure | private | shareable`.
5. **`.gitignore` guardrails.** Real-vault spellings, secret/token/key patterns,
   `.env*`, and local export artifacts are ignored to prevent accidental commits.
6. **Local-only persistence.** Export uses the Blob API to download a file;
   Import uses `<input type=file>` + FileReader. No data leaves the device.

## Local secure zone
`fake_vault/10_PRIVATE_SECURE/` models the encrypted/secure tier. In v0.1 it holds
only a placeholder; no real encryption is implemented because no sensitive data
exists. Real encryption-at-rest is a later-phase concern (see ROADMAP).

## Operational rules
- Repository stays **private**. Public creation is forbidden this phase.
- Coding agents operate only within `Indigold_App/` and must not add network
  calls, cloud sync, secrets, or real data.

## Verification
See the acceptance checklist in `ROADMAP.md` and the repo-level check:
`grep -RInE "https?://|fetch\\(['\"]http|api\\.|onedrive|icloud" app.js service-worker.js`
should return no outbound data calls (only same-origin guards / comments).
