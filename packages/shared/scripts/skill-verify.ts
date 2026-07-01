// Skill Registry — pure.  npx tsx packages/shared/scripts/skill-verify.ts
import { verbToSkill, mcpToolToSkill, buildSkillRegistry, findSkill, skillsFor, skillGate, discoverableSkills } from "../src/skill";
import { VERBS } from "../src/living-os";
import type { McpToolMeta } from "../src/mcp";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// 1. Verb → Skill (first-party, governed, enabled).
{
  const research = VERBS.find((v) => v.verb === "research")!;
  const s = verbToSkill(research);
  ok("verb id namespaced", s.id === "verb:research");
  ok("verb is first-party + governed + enabled", s.kind === "verb" && s.governed === true && s.enabled === true);
  ok("job verb → reason access", s.access === "reason" && s.requiredPermissions.length === 0 && s.requiresConfirmation === false);
  ok("verb carries its `on` subjects", Array.isArray(s.on) && s.on.length > 0);
  const task = VERBS.find((v) => v.verb === "create_task")!;
  ok("sync verb (create_task) → write access", verbToSkill(task).access === "write");
}

// 2. MCP tool → Skill (external, default-deny posture carried through).
const readTool: McpToolMeta = { name: "echo", description: "read", kind: "read", inputs: { q: "string" }, outputs: { t: "string" }, requiredPermissions: ["mcp:read"], requiresConfirmation: false, enabled: false };
const writeTool: McpToolMeta = { name: "create", description: "write", kind: "write", inputs: {}, outputs: {}, requiredPermissions: ["mcp:write"], requiresConfirmation: true, enabled: true };
{
  const s = mcpToolToSkill(readTool, "zapier");
  ok("mcp id namespaced by connector", s.id === "mcp:zapier:echo");
  ok("mcp tool disabled-by-default carried", s.kind === "mcp_tool" && s.enabled === false && s.access === "read");
  ok("mcp write carries confirmation + perms", mcpToolToSkill(writeTool, "zapier").requiresConfirmation === true && mcpToolToSkill(writeTool, "zapier").requiredPermissions.includes("mcp:write"));
  ok("every skill is governed", s.governed === true);
}

// 3. Registry build + lookups.
{
  const reg = buildSkillRegistry({ verbs: VERBS, mcpTools: [{ connectorId: "zapier", tool: readTool }, { connectorId: "zapier", tool: writeTool }] });
  ok("registry has all verbs + tools", reg.length === VERBS.length + 2);
  ok("findSkill works", findSkill(reg, "verb:research")?.name === "Research this" && findSkill(reg, "mcp:zapier:echo")?.kind === "mcp_tool");
  ok("skillsFor filters verbs by subject", skillsFor(reg, "capture").every((s) => s.kind !== "verb" || s.on.includes("capture")));
  ok("open-scope mcp skills apply to any subject", skillsFor(reg, "capture").some((s) => s.id === "mcp:zapier:echo"));
  ok("de-dupes by id", buildSkillRegistry({ mcpTools: [{ connectorId: "z", tool: readTool }, { connectorId: "z", tool: readTool }] }).length === 1);
}

// 4. Gate — default-deny for external; verbs always; writes need confirmation.
{
  ok("verb always allowed (governed)", skillGate(verbToSkill(VERBS[0])).allow);
  ok("disabled mcp skill denied", skillGate(mcpToolToSkill(readTool, "z")).reason === "skill_disabled");
  ok("enabled read needs the permission", skillGate(mcpToolToSkill({ ...readTool, enabled: true }, "z"), { grantedPermissions: [] }).reason === "missing_permission");
  ok("enabled read with perm allowed", skillGate(mcpToolToSkill({ ...readTool, enabled: true }, "z"), { grantedPermissions: ["mcp:read"] }).allow);
  ok("write without confirmation denied", skillGate(mcpToolToSkill(writeTool, "z"), { grantedPermissions: ["mcp:write"], confirmed: false }).reason === "confirmation_required");
  ok("write with confirmation + perm allowed", skillGate(mcpToolToSkill(writeTool, "z"), { grantedPermissions: ["mcp:write"], confirmed: true }).allow);
  ok("unknown skill denied", skillGate(undefined).reason === "unknown_skill");
}

// 5. Discoverability — verbs surface; disabled external skills don't.
{
  const reg = buildSkillRegistry({ verbs: VERBS, mcpTools: [{ connectorId: "z", tool: readTool }] });
  const disc = discoverableSkills(reg);
  ok("all verbs discoverable", VERBS.every((v) => disc.some((s) => s.id === `verb:${v.verb}`)));
  ok("disabled mcp skill NOT discoverable", !disc.some((s) => s.id === "mcp:z:echo"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
