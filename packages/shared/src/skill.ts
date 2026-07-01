// Skill Registry (Wave 8 — "OS for capabilities"). ONE descriptor for every capability Radian can
// use — internal verbs, MCP tools, and future owner-generated skills — so Radian routes by
// DISCOVERING skills instead of a hardcoded switch. agentskills-compatible in spirit. PURE +
// deterministic: adapters + registry + a default-deny gate. Every skill still runs ONLY through the
// governed layer (governedComplete / the job pipeline) — the registry describes, it never executes.
import type { VerbSpec } from "./living-os";
import type { McpToolMeta } from "./mcp";

export type SkillKind = "verb" | "mcp_tool" | "generated" | "connector";
// reason = pure model reasoning, no external effect · read = retrieves · write = external effect.
export type SkillAccess = "reason" | "read" | "write";

export interface Skill {
  id: string;                          // stable, namespaced (verb:… / mcp:<conn>:<tool> / gen:…)
  name: string;
  description: string;
  kind: SkillKind;
  access: SkillAccess;
  inputs: Record<string, string>;      // field → type hint (descriptor, not validation)
  outputs: Record<string, string>;
  on: string[];                        // subject types it applies to (node/project/brief/capture); [] = any
  requiredPermissions: string[];
  requiresConfirmation: boolean;       // writes are ALWAYS true
  enabled: boolean;                    // first-party verbs true; external skills DEFAULT FALSE
  source: string;                      // "living-os" | "mcp:<connector>" | "generated"
  governed: true;                      // invariant: every skill runs through the governed chokepoint
}

/** Internal verb → Skill. First-party + governed; enabled by default. */
export function verbToSkill(v: VerbSpec): Skill {
  const f = v.fulfilment;
  const isSync = f.kind === "sync";
  const engine = f.kind === "sync" ? f.action : f.job;
  return {
    id: `verb:${v.verb}`,
    name: v.label,
    description: `${v.label} — routes to the ${engine} engine through the governed layer.`,
    kind: "verb",
    access: isSync ? "write" : "reason",
    inputs: { subject: "node|project|brief|capture", question: "string?" },
    outputs: { result: "node|job" },
    on: [...v.on],
    requiredPermissions: [],
    requiresConfirmation: false,
    enabled: true,
    source: "living-os",
    governed: true,
  };
}

/** MCP tool → Skill. External + untrusted; carries the tool's own default-deny posture. */
export function mcpToolToSkill(tool: McpToolMeta, connectorId: string): Skill {
  return {
    id: `mcp:${connectorId}:${tool.name}`,
    name: tool.name,
    description: tool.description,
    kind: "mcp_tool",
    access: tool.kind, // read | write
    inputs: { ...tool.inputs },
    outputs: { ...tool.outputs },
    on: [],
    requiredPermissions: [...tool.requiredPermissions],
    requiresConfirmation: tool.requiresConfirmation,
    enabled: tool.enabled,
    source: `mcp:${connectorId}`,
    governed: true,
  };
}

/** Build the unified registry from the current verbs (+ any MCP tools, when a connector is live). */
export function buildSkillRegistry(opts: { verbs?: VerbSpec[]; mcpTools?: { connectorId: string; tool: McpToolMeta }[] } = {}): Skill[] {
  const skills: Skill[] = [];
  for (const v of opts.verbs || []) skills.push(verbToSkill(v));
  for (const m of opts.mcpTools || []) skills.push(mcpToolToSkill(m.tool, m.connectorId));
  // Stable de-dupe by id (first wins).
  const seen = new Set<string>();
  return skills.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

export const findSkill = (registry: Skill[], id: string): Skill | undefined => registry.find((s) => s.id === id);

/** Skills applicable to a subject type (verbs filter by `on`; open-scope skills always apply). */
export const skillsFor = (registry: Skill[], subjectType: string): Skill[] =>
  registry.filter((s) => s.on.length === 0 || s.on.includes(subjectType));

/** Default-deny gate. First-party verbs are always allowed (governed). External skills need
 *  enablement + permissions, and writes need per-action confirmation — mirrors the MCP gate. */
export function skillGate(skill: Skill | undefined, ctx: { grantedPermissions?: string[]; confirmed?: boolean } = {}): { allow: boolean; reason?: string } {
  if (!skill) return { allow: false, reason: "unknown_skill" };
  if (skill.kind === "verb") return { allow: true }; // first-party, governed
  if (!skill.enabled) return { allow: false, reason: "skill_disabled" };
  const granted = ctx.grantedPermissions || [];
  if (!skill.requiredPermissions.every((p) => granted.includes(p))) return { allow: false, reason: "missing_permission" };
  if ((skill.access === "write" || skill.requiresConfirmation) && !ctx.confirmed) return { allow: false, reason: "confirmation_required" };
  return { allow: true };
}

/** What's usable right now (for discovery UIs) — verbs always; external skills only when gated open. */
export const discoverableSkills = (registry: Skill[], ctx: { grantedPermissions?: string[] } = {}): Skill[] =>
  registry.filter((s) => skillGate(s, { ...ctx, confirmed: true }).allow);
