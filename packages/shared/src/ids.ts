import { randomUUID } from "node:crypto";

/** Prefixed, sortable-ish id, e.g. id("node") -> "node_3f2a...". */
export function id(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function token(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}
