// Model adapter seam. v0.1 ships a DETERMINISTIC, vendor-free implementation so
// the platform runs end-to-end with no external AI and no API keys. Swap this
// object for a Claude/OpenAI/local adapter later WITHOUT touching job code.
export interface ModelAdapter {
  summarize(text: string): Promise<string>;
  tags(text: string): Promise<string[]>;
}

const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "your", "about", "have", "will"]);

export const deterministicModel: ModelAdapter = {
  async summarize(text: string) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return "";
    const firstSentence = clean.split(/(?<=[.!?])\s/)[0];
    return firstSentence.length > 220 ? firstSentence.slice(0, 217) + "…" : firstSentence;
  },
  async tags(text: string) {
    const counts = new Map<string, number>();
    for (const w of text.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? []) {
      if (STOP.has(w)) continue;
      counts.set(w, (counts.get(w) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w);
  },
};

export const model: ModelAdapter = deterministicModel;
