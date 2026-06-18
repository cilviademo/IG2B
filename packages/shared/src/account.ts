// Account fingerprint (Intelligence/UX) — a short, stable, NON-secret id derived from the session
// token so the owner can SEE which account a surface is on. Two surfaces showing the same
// fingerprint are the same account; different fingerprints = a forked anonymous account (the usual
// cause of "I captured it but the PWA doesn't show it"). Pure + dependency-free; the token never
// leaves the device and the fingerprint is a one-way hash (not reversible to the token).
export function accountFingerprint(token: string | null | undefined): string {
  const t = String(token || "");
  if (!t) return "—";
  // djb2 over the token → base36, padded to 6 chars. Stable across surfaces for the same token.
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(6, "0").slice(-6);
}
