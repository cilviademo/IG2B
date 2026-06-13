// Living OS (Wave G6) — Research Engine. The ever-evolving knowledge loop:
//   Research → Capture → Classify → Graph → Context Pack → Brief → Quest.
// This module is the DETERMINISTIC planner: from your active domains + graph gaps it
// proposes WHAT to research next (honest "directions", never fabricated findings). The
// actual fetching (JUCE releases, papers, repos, competitors…) upgrades in when the tool
// adapters + a provider are connected — the directions/pipeline stay the same.

export type ResearchSourceType = "papers" | "repos" | "competitors" | "guidance" | "trends" | "tools" | "videos";

export const SOURCE_LABEL: Record<ResearchSourceType, string> = {
  papers: "recent papers / preprints",
  repos: "active GitHub repos",
  competitors: "competing products",
  guidance: "updated guidance / regulations",
  trends: "community trends",
  tools: "new tools",
  videos: "tutorials / talks",
};

// Which sources to scan for a domain — keyword-mapped, honest. (No network here.)
export function sourcesForDomain(name: string, tags: string[] = []): ResearchSourceType[] {
  const t = `${name} ${tags.join(" ")}`.toLowerCase();
  if (/music|audio|dsp|plugin|synth|juce|sonic|spectral/.test(t)) return ["repos", "papers", "videos", "trends"];
  if (/\bai\b|llm|model|agent|ml|neural|prompt/.test(t)) return ["papers", "repos", "tools"];
  if (/business|revenue|market|client|sales|pricing|ops/.test(t)) return ["competitors", "tools", "trends"];
  if (/military|leadership|command|tactical|regulation|guidance|btz/.test(t)) return ["guidance", "trends"];
  if (/learn|research|study|course|paper|knowledge|education/.test(t)) return ["papers", "videos"];
  if (/health|fitness|sleep|diet|wellness/.test(t)) return ["trends", "papers"];
  if (/create|design|art|content|video|brand|creative/.test(t)) return ["trends", "videos"];
  if (/build|code|infra|engineer|technical|software|architecture/.test(t)) return ["repos", "tools"];
  return ["trends", "tools"];
}

export interface HorizonDirection {
  domain: string;
  topic: string;        // a concrete scan query
  rationale: string;    // WHY now (computed from the graph)
  sourceType: ResearchSourceType;
  priority: "high" | "med" | "low";
  project_id?: string;
}

export interface HorizonProject { id: string; name: string; tags?: string[]; status?: string }
export interface HorizonNode { title: string; tags?: string[]; mvs: number; updated_at?: string; source?: string }

const DAY = 86400000;

/** Plan the next research directions across the owner's active domains. Deterministic;
 *  ranked by staleness + value. Returns up to `limit` directions (default 6). */
export function horizonScan(
  input: { projects: HorizonProject[]; nodes: HorizonNode[]; now?: number },
  limit = 6,
): HorizonDirection[] {
  const now = input.now ?? Date.now();
  const active = input.projects.filter((p) => (p.status ?? "active") === "active");
  const out: HorizonDirection[] = [];

  for (const p of active) {
    const ptags = new Set((p.tags || []).map((t) => t.toLowerCase()));
    const token = (p.name.toLowerCase().split(/\s+/)[0] || p.name.toLowerCase());
    const related = input.nodes.filter((n) => (n.tags || []).some((t) => ptags.has((t || "").toLowerCase())) || n.title.toLowerCase().includes(token));
    const lastTouch = Math.max(0, ...related.map((n) => new Date(n.updated_at || 0).getTime()));
    const inactivityDays = lastTouch ? Math.round((now - lastTouch) / DAY) : 999;
    const hasResearch = related.some((n) => n.source === "radian_research" || (n.tags || []).some((t) => /research/i.test(t)));
    const topValue = Math.max(0, ...related.map((n) => n.mvs || 0));

    const sources = sourcesForDomain(p.name, p.tags || []);
    // primary direction (top source for the domain).
    const primary = sources[0];
    const rationale = !hasResearch
      ? "no external sources captured here yet — establish a baseline"
      : inactivityDays >= 21
        ? `no activity in ${inactivityDays === 999 ? "a while" : inactivityDays + "d"} — scan for fresh inputs`
        : topValue >= 75
          ? "high-value work here — broaden the source base"
          : "keep the domain current";
    const priority: HorizonDirection["priority"] = !hasResearch || inactivityDays >= 30 ? "high" : inactivityDays >= 14 || topValue >= 75 ? "med" : "low";
    out.push({ domain: p.name, topic: `${p.name}: ${SOURCE_LABEL[primary]}`, rationale, sourceType: primary, priority, project_id: p.id });
    // a secondary angle when the domain warrants attention.
    if ((priority === "high" || priority === "med") && sources[1]) {
      out.push({ domain: p.name, topic: `${p.name}: ${SOURCE_LABEL[sources[1]]}`, rationale: "second angle for breadth", sourceType: sources[1], priority: "low", project_id: p.id });
    }
  }

  const rank = { high: 0, med: 1, low: 2 } as const;
  out.sort((a, b) => rank[a.priority] - rank[b.priority]);
  return out.slice(0, limit);
}

// The deterministic chain a research direction travels (for UI/explainability).
export const RESEARCH_CHAIN = ["Research", "Capture", "Classify", "Graph", "Context Pack", "Brief", "Quest"] as const;
