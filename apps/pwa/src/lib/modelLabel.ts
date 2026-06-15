// Friendly model/provider labels for the UI. The owner should see at a glance WHO answered —
// a live model (e.g. Claude) or the deterministic fallback (no LLM key / secret content / budget).
export function providerLabel(p?: string): string {
  switch (p) {
    case "anthropic": return "Claude";
    case "openai": return "GPT";
    case "gemini": return "Gemini";
    case "openrouter": return "OpenRouter";
    case "ollama": return "Ollama";
    case "deterministic":
    case undefined:
    case "": return "Deterministic";
    default: return p;
  }
}

/** Is this a real (non-deterministic) model? */
export const isLiveProvider = (p?: string): boolean => !!p && p !== "deterministic";
