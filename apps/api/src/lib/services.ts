// Radian + Encompass access. EMBEDDED mode (low-cost single service): if the
// service URL env is unset, call the shared intelligence core in-process.
// SCALED mode: if RADIAN_URL / ENCOMPASS_URL are set, call them over HTTP.
import { forecast as forecastLocal, assemble as assembleLocal } from "@indigold/shared/intelligence";
import type { GraphNode, GraphEdge } from "@indigold/shared/types";

const withScheme = (u: string) => (/^https?:\/\//.test(u) ? u : `http://${u}`);
const RADIAN_URL = process.env.RADIAN_URL ? withScheme(process.env.RADIAN_URL) : "";
const ENCOMPASS_URL = process.env.ENCOMPASS_URL ? withScheme(process.env.ENCOMPASS_URL) : "";

async function post<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal": process.env.INTERNAL_TOKEN || "" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${base}${path} -> ${res.status}`);
  return (await res.json()) as T;
}

type ForecastBody = { nodes: GraphNode[]; edges: GraphEdge[]; horizon?: string };
type AssembleBody = { purpose?: string; tokenBudget?: number; nodes: GraphNode[]; edges: GraphEdge[] };
type Pack = ReturnType<typeof assembleLocal>;

export const radian = {
  async forecast(body: ForecastBody): Promise<{ payload: Record<string, unknown> }> {
    if (RADIAN_URL) return post(RADIAN_URL, "/forecast", body);
    return { payload: forecastLocal(body.nodes, body.edges, body.horizon) as unknown as Record<string, unknown> };
  },
};

export const encompass = {
  async assemble(body: AssembleBody): Promise<Pack> {
    if (ENCOMPASS_URL) return post(ENCOMPASS_URL, "/assemble", body);
    return assembleLocal(body);
  },
};

export const mode = {
  radian: RADIAN_URL ? "http" : "embedded",
  encompass: ENCOMPASS_URL ? "http" : "embedded",
};
