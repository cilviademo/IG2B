// Negative knowledge (Intelligence review) — remember ABSENCE: things searched-but-not-found,
// retracted, or deliberately excluded. Most systems forget what they didn't find; recording it
// lets Radian say "you looked for X on date Y and found nothing" and avoid re-litigating dead ends.
// Pure normalization here; storage/surfacing live in the api/worker + World Lens.

export type NegativeKind = "not_found" | "retracted" | "excluded";
export const NEGATIVE_KINDS: NegativeKind[] = ["not_found", "retracted", "excluded"];

const LABEL: Record<NegativeKind, string> = {
  not_found: "Searched, nothing found",
  retracted: "Retracted / corrected away",
  excluded: "Deliberately excluded",
};

export const isNegativeKind = (s: string): s is NegativeKind => (NEGATIVE_KINDS as string[]).includes(s);
export const negativeKindLabel = (kind: string): string => (isNegativeKind(kind) ? LABEL[kind] : kind);
export const normalizeNegativeKind = (s?: unknown): NegativeKind => {
  const v = String(s ?? "excluded");
  return isNegativeKind(v) ? v : "excluded";
};

export interface NegativeKnowledge { id: string; subject: string; kind: NegativeKind; note: string }

/** Loosely-typed input → a safe, fully-defaulted NegativeKnowledge record. */
export function normalizeNegative(raw: Record<string, unknown>, opts: { id: string }): NegativeKnowledge {
  return {
    id: opts.id,
    subject: String(raw.subject ?? "").slice(0, 200),
    kind: normalizeNegativeKind(raw.kind),
    note: String(raw.note ?? "").slice(0, 600),
  };
}
