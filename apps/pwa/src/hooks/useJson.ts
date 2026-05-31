import { useEffect, useState } from "react";

interface JsonState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads a same-origin JSON fixture from /public. v0.1 fetches only relative,
 * local paths — there are no external/API calls.
 */
export function useJson<T>(path: string): JsonState<T> {
  const [state, setState] = useState<JsonState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });
    fetch(path)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json();
      })
      .then((data: T) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({ data: null, loading: false, error: e instanceof Error ? e.message : "load failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return state;
}
