// Minimal, dependency-free env loader with typed accessors + fail-fast checks.

export function str(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

export function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${key} must be a number`);
  return n;
}

export function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

export const isProd = process.env.NODE_ENV === "production";

// Optional accessor that returns undefined instead of throwing.
export function opt(key: string): string | undefined {
  const v = process.env[key];
  return v === "" ? undefined : v;
}
