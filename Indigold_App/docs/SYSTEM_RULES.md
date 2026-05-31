# SYSTEM_RULES.md — Indigold v0.1

These rules are **structural and non-negotiable** for the prototype phase.
They mirror the Founding Commitments of the Indigold architecture.

## Cardinal rule
**Use fake sample data only.** Never request, read, reference, embed, index, or
summarize any real personal file. The real memory vault does not exist for the
prototype's purposes.

## Data & memory integrity
1. Raw sources are immutable (Truth Layer A). Derived artifacts carry provenance.
2. Every node is classified into exactly one **primary** Truth Layer (A–F).
3. Information must earn the right to stay Active via the **Memory Value Score**
   (Promote → Active → Review → Archive → Expire).

## Locality & independence
4. The authoritative copy is plain text / Markdown / JSON on local disk.
5. No vendor API shape leaks into app logic. Model access (future) goes through a
   thin adapter — not present in v0.1.
6. No bundler, no backend, no cloud dependency is required to run.

## Privacy & security
7. Privacy by default — every item is `private` unless explicitly downgraded.
8. Zero network data calls, zero telemetry, zero secrets in the repository.
9. The repository remains **private** during this phase. Public creation is
   forbidden.

## Separation of concerns
10. Identity, Knowledge, Skills, Boardroom (Agents), and Execution are distinct.
    The prototype surfaces them but never merges their data.

## Coding-agent boundary
11. Agents may read/write **only** inside `Indigold_App/`.
12. Agents must never touch any path outside this workspace, add network calls,
    onboard a real user, or change repository visibility.
