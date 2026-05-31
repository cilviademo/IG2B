// Clients for the private services (Radian + Encompass). Same-region HTTP on
// Render. The blueprint injects host:port (no scheme) — add http:// if missing.
const withScheme = (u: string) => (/^https?:\/\//.test(u) ? u : `http://${u}`);
const RADIAN_URL = withScheme(process.env.RADIAN_URL || "localhost:7101");
const ENCOMPASS_URL = withScheme(process.env.ENCOMPASS_URL || "localhost:7102");

async function post<T>(base: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-internal": process.env.INTERNAL_TOKEN || "" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${base}${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export const radian = {
  forecast: (body: unknown) => post<{ payload: Record<string, unknown> }>(RADIAN_URL, "/forecast", body),
};
export const encompass = {
  assemble: (body: unknown) =>
    post<{
      title: string;
      purpose: string;
      token_budget: { total: number; used: number };
      source_nodes: string[];
      sections: { heading: string; content: string; truth_layer: string; provenance: string }[];
    }>(ENCOMPASS_URL, "/assemble", body),
};
