// MCP connector seam (dormant) — a typed contract for FUTURE external tool servers (e.g. Zapier
// MCP). NO live connection, NO credentials, NO network, NO write actions here. Everything is
// DEFAULT-DENY: every tool is disabled until explicitly enabled; reads need explicit enablement,
// writes need enablement + per-action user confirmation. MCP results are UNTRUSTED external
// content (fence before any synthesis) and every call emits append-only provenance. The only
// adapter implemented is a deterministic, network-free STUB. Pure — no I/O. (MIT-spirit ideas;
// no external code imported.)
import { fenceUntrusted } from "./sanitize";

export type McpToolKind = "read" | "write";

export interface McpToolMeta {
  name: string;
  description: string;
  kind: McpToolKind;                 // read = retrieve only · write = causes external effects
  inputs: Record<string, string>;    // field → type hint (descriptor, not validation)
  outputs: Record<string, string>;
  requiredPermissions: string[];     // e.g. ["mcp:read"] / ["mcp:write"]
  requiresConfirmation: boolean;     // writes are ALWAYS true
  costHint?: string;                 // quota/cost metadata for the governor (future)
  enabled: boolean;                  // DEFAULT FALSE — nothing runs until the owner enables it
}

// Server identity carries only a REFERENCE to where a credential would live (Render env handle),
// never the secret itself. The PWA never sees this.
export interface McpServerIdentity { id: string; name: string; url?: string; authHandleRef?: string }

export interface McpProvenance { connector: string; tool: string; kind: McpToolKind; at: string; confirmed: boolean }

export interface McpCallResult {
  ok: boolean;
  /** ALWAYS true — MCP output is untrusted external content; callers must fence before synthesis. */
  untrusted: true;
  data?: unknown;
  reason?: string;
  provenance: McpProvenance;
}

export interface McpCallContext {
  connectorEnabled: boolean;     // connector-level enable (default false)
  grantedPermissions: string[]; // permissions the owner has granted this connector
  confirmed?: boolean;           // per-action user confirmation (required for writes)
}

export interface McpConnector {
  id: string;
  server: McpServerIdentity;
  status: "disabled" | "enabled";
  listTools(): Promise<McpToolMeta[]>;
  callTool(name: string, args: Record<string, unknown>, ctx: McpCallContext): Promise<McpCallResult>;
}

/** PURE permission decision. Default-deny across the board. */
export function mcpGate(tool: McpToolMeta | undefined, ctx: McpCallContext): { allow: boolean; reason?: string } {
  if (!tool) return { allow: false, reason: "unknown_tool" };
  if (!ctx.connectorEnabled) return { allow: false, reason: "connector_disabled" };
  if (!tool.enabled) return { allow: false, reason: "tool_disabled" };
  const has = (p: string) => ctx.grantedPermissions.includes(p);
  if (!tool.requiredPermissions.every(has)) return { allow: false, reason: "missing_permission" };
  if (tool.kind === "write" || tool.requiresConfirmation) {
    if (!ctx.confirmed) return { allow: false, reason: "confirmation_required" };
  }
  return { allow: true };
}

/** Fence an MCP result's payload as UNTRUSTED before it can reach any model prompt. */
export function fenceMcpResult(connector: string, tool: string, data: unknown): string {
  const text = typeof data === "string" ? data : JSON.stringify(data ?? null);
  return fenceUntrusted(`MCP:${connector}/${tool}`, text);
}

const nowIso = (now?: number) => new Date(now ?? Date.now()).toISOString();

/** Deterministic, network-free STUB connector. Honors the gate, returns canned read data, and
 *  REFUSES writes unless a mock confirmation is present. No credentials, no I/O — for tests +
 *  wiring the seam without ever touching a real server. */
export function stubMcpConnector(opts: {
  id: string;
  server?: Partial<McpServerIdentity>;
  tools?: McpToolMeta[];
  now?: number;
}): McpConnector {
  const id = opts.id;
  const tools: McpToolMeta[] = opts.tools ?? [
    { name: "echo", description: "Return the input (canned read).", kind: "read", inputs: { text: "string" }, outputs: { text: "string" }, requiredPermissions: ["mcp:read"], requiresConfirmation: false, enabled: false },
    { name: "create_thing", description: "Pretend to create something (write).", kind: "write", inputs: { title: "string" }, outputs: { id: "string" }, requiredPermissions: ["mcp:write"], requiresConfirmation: true, enabled: false },
  ];
  return {
    id,
    server: { id, name: opts.server?.name ?? `stub:${id}`, url: opts.server?.url, authHandleRef: opts.server?.authHandleRef },
    status: "disabled",
    async listTools() { return tools; },
    async callTool(name, _args, ctx) {
      const tool = tools.find((t) => t.name === name);
      const kind: McpToolKind = tool?.kind ?? "read";
      const provenance: McpProvenance = { connector: id, tool: name, kind, at: nowIso(opts.now), confirmed: !!ctx.confirmed };
      const gate = mcpGate(tool, ctx);
      if (!gate.allow) return { ok: false, untrusted: true, reason: gate.reason, provenance };
      // Allowed: reads return canned data; writes are still STUBBED (no real effect, no network).
      const data = tool!.kind === "read" ? { stub: true, tool: name, note: "canned read result" } : { stub: true, tool: name, applied: false, note: "write stubbed — no external effect" };
      return { ok: true, untrusted: true, data, provenance };
    },
  };
}
