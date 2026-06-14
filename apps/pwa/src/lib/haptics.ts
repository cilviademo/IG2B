// AURORA A11 — subtle haptics where the platform allows. Gated behind reduced-motion so
// users who opt out of motion also opt out of vibration. No-op when unsupported.
export function haptic(ms = 8): void {
  try {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(ms);
  } catch { /* unsupported */ }
}
