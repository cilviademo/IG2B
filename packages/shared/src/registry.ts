// Project Registry — the owner's active domains. RADIAN interprets EVERY capture
// relative to this registry (Stage 2), so captures/actions/opportunities/sims all
// reference registry ids. Config-driven + editable at runtime (DB table + admin
// endpoint) without redeploy; seeded from these defaults on first use.

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: "active" | "dormant";
  tags: string[];
  objectives: string; // short free text the owner updates
  created_at?: string;
  updated_at?: string;
}

export interface ProjectSeed {
  slug: string; // stable key used to derive a deterministic id per user
  name: string;
  description: string;
  status: "active" | "dormant";
  tags: string[];
  objectives: string;
}

export const SEED_PROJECTS: ProjectSeed[] = [
  { slug: "btz-sonic-alchemy", name: "BTZ Sonic Alchemy", description: "DSP / audio plugin development.", status: "active", tags: ["dsp", "audio", "plugin", "c++", "juce"], objectives: "Ship production-grade modulation + saturation modules." },
  { slug: "btz-trace", name: "BTZ TRACE", description: "BTZ TRACE initiative.", status: "active", tags: ["btz", "audio"], objectives: "Define scope and first deliverable." },
  { slug: "genesis", name: "Genesis", description: "Genesis project.", status: "active", tags: ["genesis"], objectives: "Clarify objectives." },
  { slug: "indigold", name: "Indigold", description: "This personal intelligence operating system.", status: "active", tags: ["indigold", "radian", "ai", "systems"], objectives: "Build RADIAN intelligence layer; compound the vault." },
  { slug: "military-force-support", name: "Military / Force Support career", description: "Force Support career track.", status: "active", tags: ["career", "military", "force-support"], objectives: "Advance role; capture decisions + outcomes." },
  { slug: "music-mza-inceptive", name: "Music production (MZA/Inceptive)", description: "Music production under MZA / Inceptive.", status: "active", tags: ["music", "production", "sampling", "sound-design"], objectives: "Release output; refine sound-design pipeline." },
  { slug: "business-multibanded", name: "Business systems (Multibanded)", description: "Business systems under Multibanded.", status: "active", tags: ["business", "systems", "ops"], objectives: "Systematize operations." },
  { slug: "education-learning", name: "Education / learning", description: "Ongoing learning across domains.", status: "active", tags: ["learning", "education", "study"], objectives: "Compound skills relevant to active projects." },
];
