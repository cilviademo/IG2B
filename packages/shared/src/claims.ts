// Claims layer (Intelligence review) — the epistemic object above memory nodes and evidence.
// A claim is a STATEMENT with a type, subject, confidence, validity window, owner status, and
// linked evidence (supporting AND refuting). This is what lets Radian represent: multiple
// sources for one claim, counterevidence, beliefs changing over time, stale facts, and the
// exact reason for an answer — and detect CONTRADICTIONS instead of flattening them. Pure, no I/O.

export type ClaimType = "fact" | "forecast" | "opinion" | "definition" | "metric";
export type OwnerStatus = "unreviewed" | "accepted" | "rejected" | "superseded";
export type EvidenceStance = "supports" | "refutes" | "neutral";

export interface ClaimEvidenceLink { evidence_id: string; stance: EvidenceStance; weight: number }

export interface Claim {
  id: string;
  statement: string;
  claim_type: ClaimType;
  subject: string;            // a node/project id or a free-text topic
  subject_kind: "node" | "project" | "topic";
  confidence: number;         // 0..1
  observed_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  owner_status: OwnerStatus;
  evidence: ClaimEvidenceLink[];
}

const CLAIM_TYPES: ClaimType[] = ["fact", "forecast", "opinion", "definition", "metric"];
const OWNER_STATUSES: OwnerStatus[] = ["unreviewed", "accepted", "rejected", "superseded"];
const STANCES: EvidenceStance[] = ["supports", "refutes", "neutral"];
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Deterministic confidence from supporting vs refuting evidence weight, around a prior.
 *  More supporting weight → higher; more refuting → lower; neutral ignored. */
export function aggregateConfidence(links: ClaimEvidenceLink[], base = 0.5): number {
  let s = 0, r = 0;
  for (const l of links) {
    const w = Math.max(0, Number(l.weight) || 0);
    if (l.stance === "supports") s += w;
    else if (l.stance === "refutes") r += w;
  }
  if (s + r === 0) return clamp01(base);
  // Laplace-smoothed support fraction, nudged from the prior.
  const frac = (s + 1) / (s + r + 2);
  return clamp01(0.25 * base + 0.75 * frac);
}

/** A claim is contested when it has BOTH supporting and refuting evidence. */
export function isContested(links: ClaimEvidenceLink[]): boolean {
  return links.some((l) => l.stance === "supports") && links.some((l) => l.stance === "refutes");
}

/** Stale if its validity window has closed (freshness as part of truth). */
export function claimStale(claim: Pick<Claim, "valid_until">, now = Date.now()): boolean {
  return !!claim.valid_until && new Date(claim.valid_until).getTime() <= now;
}

const str = (v: unknown, max = 600) => (v == null ? "" : String(v)).slice(0, max);

export function normalizeClaimEvidence(raw: unknown): ClaimEvidenceLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      evidence_id: str(o.evidence_id, 80),
      stance: STANCES.includes(o.stance as EvidenceStance) ? (o.stance as EvidenceStance) : "neutral",
      weight: Math.max(0, Math.min(1, Number(o.weight) || 0.5)),
    };
  }).filter((l) => l.evidence_id);
}

/** Loosely-typed input → a safe, fully-defaulted Claim (confidence recomputed from evidence). */
export function normalizeClaim(raw: Record<string, unknown>, opts: { id: string }): Claim {
  const evidence = normalizeClaimEvidence(raw.evidence);
  const base = typeof raw.confidence === "number" ? clamp01(raw.confidence) : 0.5;
  return {
    id: opts.id,
    statement: str(raw.statement, 600) || "(empty claim)",
    claim_type: CLAIM_TYPES.includes(raw.claim_type as ClaimType) ? (raw.claim_type as ClaimType) : "fact",
    subject: str(raw.subject, 200),
    subject_kind: (["node", "project", "topic"] as const).includes(raw.subject_kind as "node") ? (raw.subject_kind as Claim["subject_kind"]) : "topic",
    confidence: evidence.length ? aggregateConfidence(evidence, base) : base,
    observed_at: raw.observed_at ? new Date(str(raw.observed_at)).toISOString() : null,
    valid_from: raw.valid_from ? new Date(str(raw.valid_from)).toISOString() : null,
    valid_until: raw.valid_until ? new Date(str(raw.valid_until)).toISOString() : null,
    owner_status: OWNER_STATUSES.includes(raw.owner_status as OwnerStatus) ? (raw.owner_status as OwnerStatus) : "unreviewed",
    evidence,
  };
}

export interface Tension {
  kind: "contested_evidence" | "conflicting_claims" | "stale_accepted";
  subject: string;
  claimIds: string[];
  why: string;
}

/** Surface disagreement rather than flattening it (the "Tensions" view). Detects:
 *  - a single claim with both supporting + refuting evidence (contested),
 *  - two same-subject claims where one is accepted and another refutes/contradicts it,
 *  - an accepted claim that has gone stale. */
export function detectTensions(claims: Claim[], now = Date.now()): Tension[] {
  const out: Tension[] = [];
  for (const c of claims) {
    if (isContested(c.evidence)) out.push({ kind: "contested_evidence", subject: c.subject, claimIds: [c.id], why: `"${c.statement.slice(0, 80)}" has both supporting and refuting evidence` });
    if (c.owner_status === "accepted" && claimStale(c, now)) out.push({ kind: "stale_accepted", subject: c.subject, claimIds: [c.id], why: `Accepted claim "${c.statement.slice(0, 80)}" is past its valid-until` });
  }
  // same-subject claims that disagree (one high-confidence, another low — likely contradictory).
  const bySubject = new Map<string, Claim[]>();
  for (const c of claims) {
    if (!c.subject) continue;
    (bySubject.get(c.subject) ?? bySubject.set(c.subject, []).get(c.subject)!).push(c);
  }
  for (const [subject, group] of bySubject) {
    const strong = group.filter((c) => c.confidence >= 0.66 && c.owner_status !== "rejected" && c.owner_status !== "superseded");
    const weak = group.filter((c) => c.confidence <= 0.34 && c.owner_status !== "rejected" && c.owner_status !== "superseded");
    if (strong.length && weak.length) {
      out.push({ kind: "conflicting_claims", subject, claimIds: [...strong.slice(0, 1), ...weak.slice(0, 1)].map((c) => c.id), why: `Conflicting confidence on "${subject}": "${strong[0].statement.slice(0, 50)}" vs "${weak[0].statement.slice(0, 50)}"` });
    }
  }
  return out;
}
