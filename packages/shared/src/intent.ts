// Owner intents (Intelligence review) — reframe Radian around WHAT THE OWNER WANTS, not internal
// brain modes. Each intent maps to a retrieval mode + a short system guidance clause. Pure so the
// PWA (chips) and the API (system framing) agree. Backward compatible: no intent → existing modes.
// NOTE: the PWA mirrors label/mode/blurb in apps/pwa/src/lib/intent.ts — keep the two in sync.

export type OwnerIntent = "remember" | "explain" | "check" | "research" | "decide";
export type BrainMode = "auto" | "vault" | "general" | "web" | "research";
export const OWNER_INTENTS: OwnerIntent[] = ["remember", "explain", "check", "research", "decide"];

export interface IntentSpec { intent: OwnerIntent; label: string; mode: BrainMode; blurb: string; guidance: string }

const SPEC: Record<OwnerIntent, Omit<IntentSpec, "intent">> = {
  remember: {
    label: "My memory", mode: "vault", blurb: "What you already know",
    guidance: "Intent: RECALL. Answer ONLY from the owner's vault. State what is known; if it isn't there, say so plainly — never invent.",
  },
  explain: {
    label: "Explain", mode: "general", blurb: "Teach me / reason it out",
    guidance: "Intent: EXPLAIN. Teach clearly from general reasoning — concepts, mechanisms, an example. Then connect to the vault only if relevant.",
  },
  check: {
    label: "Check", mode: "web", blurb: "Verify a claim",
    guidance: "Intent: VERIFY. Assess whether the claim holds. Give a verdict + confidence, cite the sources you can see, name what would change the conclusion, and flag any contradictions. Do not assert web facts you can't cite.",
  },
  research: {
    label: "Research", mode: "research", blurb: "Gather the field",
    guidance: "Intent: RESEARCH. Survey the landscape: key findings, who/what, and citations. End with open questions worth turning into claims. Cite only sources you can see.",
  },
  decide: {
    label: "Decide", mode: "general", blurb: "Decision support",
    guidance: "Intent: DECIDE. Lay out the realistic options with their trade-offs, surface the key risks and unknowns, then give a clear recommendation the owner can act on — flag where it depends on their values.",
  },
};

export const isOwnerIntent = (s: string): s is OwnerIntent => (OWNER_INTENTS as string[]).includes(s);
export const intentToMode = (intent: string): BrainMode => (isOwnerIntent(intent) ? SPEC[intent].mode : "auto");
export const intentLabel = (intent: string): string => (isOwnerIntent(intent) ? SPEC[intent].label : intent);
export const intentBlurb = (intent: string): string => (isOwnerIntent(intent) ? SPEC[intent].blurb : "");
export const intentGuidance = (intent: string): string => (isOwnerIntent(intent) ? SPEC[intent].guidance : "");
export const intentSpec = (intent: OwnerIntent): IntentSpec => ({ intent, ...SPEC[intent] });
export const allIntents = (): IntentSpec[] => OWNER_INTENTS.map(intentSpec);
