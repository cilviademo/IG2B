// MIRROR of packages/shared/src/intent.ts — keep in sync (PWA can't import @indigold/shared).
// Owner intents reframe Radian around WHAT the owner wants; each picks a brain mode. The PWA only
// needs label/mode/blurb (the system guidance lives server-side, keyed by the same intent id).
export type OwnerIntent = "remember" | "explain" | "check" | "research" | "decide";
export type BrainMode = "auto" | "vault" | "general" | "web" | "research";

export interface IntentSpec { intent: OwnerIntent; label: string; mode: BrainMode; blurb: string }

const SPEC: Record<OwnerIntent, { label: string; mode: BrainMode; blurb: string }> = {
  remember: { label: "My memory", mode: "vault", blurb: "What you already know" },
  explain: { label: "Explain", mode: "general", blurb: "Teach me / reason it out" },
  check: { label: "Check", mode: "web", blurb: "Verify a claim" },
  research: { label: "Research", mode: "research", blurb: "Gather the field" },
  decide: { label: "Decide", mode: "general", blurb: "Decision support" },
};

export const OWNER_INTENTS: OwnerIntent[] = ["remember", "explain", "check", "research", "decide"];
export const intentToMode = (intent: OwnerIntent): BrainMode => SPEC[intent].mode;
export const allIntents = (): IntentSpec[] => OWNER_INTENTS.map((intent) => ({ intent, ...SPEC[intent] }));
