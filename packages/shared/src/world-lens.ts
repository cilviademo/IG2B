// World Lens (Intelligence review): for a memory / project / topic — "what has changed OUTSIDE
// your vault?" Composes the owner's claims + external evidence + tensions on a subject into
// readable sections (new evidence · counterevidence · what you believe · corrections/retractions ·
// tensions · worth-asking). PURE + deterministic; relevance is lexical (no model, no I/O).
import type { Claim, Tension } from "./claims";
import type { ExternalEvidence } from "./evidence";
import { claimStale, isContested } from "./claims";
import { isStale } from "./evidence";

export interface WorldLensEvidence { id: string; title: string; url: string; source: string; kind: string; observed_at: string | null; retrieved_at: string; stale: boolean; status: string }
export interface WorldLensClaim { id: string; statement: string; confidence: number; owner_status: string; contested: boolean; stale: boolean }
export interface WorldLensSection { key: string; label: string; evidence?: WorldLensEvidence[]; claims?: WorldLensClaim[]; notes?: string[] }
export interface WorldLens { subject: string; subjectTitle: string; sections: WorldLensSection[]; counts: { evidence: number; claims: number; tensions: number } }


const tokenize = (s: string): string[] =>
  (s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);

/** Lexical relevance: does the text share enough meaningful terms with the subject? */
export function lexicalRelevant(text: string, subjectTerms: Set<string>): boolean {
  if (subjectTerms.size === 0) return false;
  const t = tokenize(text);
  let hits = 0;
  for (const w of t) if (subjectTerms.has(w)) { if (++hits >= 2) return true; }
  return false;
}

function evToLens(e: ExternalEvidence, now: number): WorldLensEvidence {
  return { id: e.id, title: e.title, url: e.canonical_url, source: e.source_name, kind: e.source_kind, observed_at: e.observed_at, retrieved_at: e.retrieved_at, stale: isStale(e, now), status: e.status };
}

export interface WorldLensInput {
  subject: string;
  subjectTitle: string;
  subjectTerms?: string[];        // extra terms (e.g. node tags); title is always included
  claims: Claim[];                // claims already scoped to this subject
  evidence: ExternalEvidence[];   // candidate evidence (will be relevance-filtered)
  tensions: Tension[];
  now?: number;
}

/** Compose the World Lens for a subject. Deterministic; sections omit when empty. */
export function worldLens(input: WorldLensInput): WorldLens {
  const now = input.now ?? Date.now();
  const terms = new Set<string>([...tokenize(input.subjectTitle), ...(input.subjectTerms || []).flatMap(tokenize)]);
  const relevant = input.evidence.filter((e) => lexicalRelevant(`${e.title} ${e.summary}`, terms));

  const isCounter = (e: ExternalEvidence) => e.status === "contradictory";
  const isCorrection = (e: ExternalEvidence) => e.status === "corrected";
  const newEv = relevant.filter((e) => e.status === "new" || e.status === "relevant" || e.status === "accepted").map((e) => evToLens(e, now));
  const counter = relevant.filter(isCounter).map((e) => evToLens(e, now));
  const corrections = relevant.filter(isCorrection).map((e) => evToLens(e, now));

  const claims: WorldLensClaim[] = input.claims.map((c) => ({ id: c.id, statement: c.statement, confidence: c.confidence, owner_status: c.owner_status, contested: isContested(c.evidence), stale: claimStale(c, now) }));
  const supersededOrStale = claims.filter((c) => c.owner_status === "superseded" || c.stale);

  // "Worth asking": claim-candidates from relevant evidence not already stated in a claim.
  const claimText = new Set(claims.map((c) => c.statement.toLowerCase().slice(0, 80)));
  const questions = [...new Set(relevant.flatMap((e) => e.claim_candidates))]
    .filter((q) => q && !claimText.has(q.toLowerCase().slice(0, 80))).slice(0, 6);

  const sections: WorldLensSection[] = [];
  if (newEv.length) sections.push({ key: "new", label: "New evidence", evidence: newEv.slice(0, 10) });
  if (counter.length) sections.push({ key: "counter", label: "Counterevidence", evidence: counter.slice(0, 10) });
  if (claims.length) sections.push({ key: "claims", label: "What you believe", claims });
  if (corrections.length || supersededOrStale.length) sections.push({ key: "corrections", label: "Corrections & retractions", evidence: corrections.slice(0, 6), claims: supersededOrStale });
  if (input.tensions.length) sections.push({ key: "tensions", label: "Tensions", notes: input.tensions.map((t) => t.why) });
  if (questions.length) sections.push({ key: "questions", label: "Worth turning into claims", notes: questions });

  return { subject: input.subject, subjectTitle: input.subjectTitle, sections, counts: { evidence: relevant.length, claims: claims.length, tensions: input.tensions.length } };
}
