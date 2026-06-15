import { useEffect, useState } from "react";
import { Link } from "wouter";
import { RefreshCw, AlertTriangle, X } from "lucide-react";
import { isVaultStale, needsLogin, onVaultSynced } from "@/lib/sync";

// Two thin, honest banners that sit directly under the TopBar:
//  • Update — a newer build/service-worker is ready; offer a clean reload so the
//    installed PWA never silently runs stale code.
//  • Stale — the API is configured but the last sync failed (or never ran), so the
//    view may be stale. We never show stale data silently; we point at Force Sync.
export default function AppBanners() {
  const [updateReady, setUpdateReady] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [stale, setStale] = useState(isVaultStale());
  const [loginNeeded, setLoginNeeded] = useState(needsLogin());

  useEffect(() => {
    const onUpdate = () => setUpdateReady(true);
    const recompute = () => { setStale(isVaultStale()); setLoginNeeded(needsLogin()); };
    window.addEventListener("indigold:sw-update", onUpdate);
    // Recompute on every sync attempt (success clears stale/login; failure sets them).
    const off = onVaultSynced(recompute);
    document.addEventListener("visibilitychange", recompute);
    return () => {
      window.removeEventListener("indigold:sw-update", onUpdate);
      document.removeEventListener("visibilitychange", recompute);
      off();
    };
  }, []);

  const showUpdate = updateReady && !updateDismissed;
  if (!showUpdate && !stale && !loginNeeded) return null;

  return (
    <div className="sticky z-30" style={{ top: "calc(48px + env(safe-area-inset-top))" }}>
      {loginNeeded && (
        <Link href="/io" className="flex items-center gap-2 px-3 py-2 tap-row" style={{ background: "color-mix(in srgb, var(--gold) 16%, var(--bg))", borderBottom: "1px solid var(--gold-line)" }}>
          <RefreshCw size={14} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />
          <span className="flex-1 min-w-0" style={{ fontSize: 13, color: "var(--text)" }}>Session expired — tap to log back in.</span>
        </Link>
      )}
      {showUpdate && (
        <div className="flex items-center gap-2 px-3 py-2" style={{ background: "color-mix(in srgb, var(--gold) 16%, var(--bg))", borderBottom: "1px solid var(--gold-line)" }}>
          <RefreshCw size={14} strokeWidth={1.5} style={{ color: "var(--gold)", flexShrink: 0 }} />
          <span className="flex-1 min-w-0" style={{ fontSize: 13, color: "var(--text)" }}>New version available.</span>
          <button onClick={() => window.location.reload()} className="press px-3 py-1 text-xs font-semibold shrink-0" style={{ borderRadius: 8, border: "1px solid var(--gold-line)", color: "var(--gold)" }}>
            Reload
          </button>
          <button onClick={() => setUpdateDismissed(true)} aria-label="Dismiss" className="press shrink-0" style={{ color: "var(--text-dim)" }}>
            <X size={15} strokeWidth={1.5} />
          </button>
        </div>
      )}
      {stale && !loginNeeded && (
        <Link href="/io" className="flex items-center gap-2 px-3 py-2 tap-row" style={{ background: "color-mix(in srgb, var(--risk) 12%, var(--bg))", borderBottom: "1px solid var(--line)" }}>
          <AlertTriangle size={14} strokeWidth={1.5} style={{ color: "var(--risk)", flexShrink: 0 }} />
          <span className="flex-1 min-w-0" style={{ fontSize: 13, color: "var(--text)" }}>Vault may be stale — tap to Force Sync.</span>
        </Link>
      )}
    </div>
  );
}
