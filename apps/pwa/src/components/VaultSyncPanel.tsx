import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Link2, Copy, ClipboardPaste, Smartphone, Globe, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button, SectionRule, Dot } from "@/components/primitives";
import {
  snapshot, forceSync, pairingCode, applyPairingCode, isVaultStale,
  type VaultSnapshot,
} from "@/lib/sync";
import { apiEnabled } from "@/lib/api";

// "One vault reality" panel. Surfaces the exact environment of THIS surface so the
// Safari-vs-installed-PWA divergence is diagnosable at a glance (the device account
// email is the tell — different emails = different vaults), and offers the fix:
//   • Force Sync — pull the authoritative server vault now.
//   • Link a device — copy this surface's pairing code, or paste another's so both
//     surfaces share ONE account → one vault.
function relTime(iso: string | null): string {
  if (!iso) return "never";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "var(--good)" : tone === "bad" ? "var(--risk)" : tone === "warn" ? "var(--gold)" : "var(--text-dim)";
  return (
    <div className="flex items-start justify-between gap-3 py-1" style={{ fontSize: 12 }}>
      <span className="font-mono shrink-0" style={{ color: "var(--text-dim)" }}>{label}</span>
      <span className="font-mono text-right break-all" style={{ color }}>{value}</span>
    </div>
  );
}

export default function VaultSyncPanel() {
  const [snap, setSnap] = useState<VaultSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteVal, setPasteVal] = useState("");
  const [pairBusy, setPairBusy] = useState(false);

  const refresh = useCallback(async () => {
    setSnap(await snapshot());
  }, []);

  // On open: pull live server counts (forceSync) then snapshot the environment.
  useEffect(() => {
    (async () => {
      if (apiEnabled()) await forceSync();
      await refresh();
    })();
  }, [refresh]);

  async function onForceSync() {
    setBusy(true);
    try {
      const r = await forceSync();
      await refresh();
      if (r.ok) toast.success("Synced", { description: `${r.captures} captures · ${r.nodes ?? "—"} nodes · ${r.edges ?? "—"} edges` });
      else toast.error("Sync failed", { description: r.error || "couldn't reach the API" });
    } finally {
      setBusy(false);
    }
  }

  async function onShowCode() {
    const c = await pairingCode();
    if (!c) { toast.error("No pairing code", { description: "API not configured, or couldn't reach it." }); return; }
    setCode(c);
    try { await navigator.clipboard.writeText(c); toast.success("Pairing code copied", { description: "Paste it on your other surface → Link a device." }); }
    catch { toast("Copy manually", { description: "The code is shown below." }); }
  }

  async function onApplyCode() {
    const v = pasteVal.trim();
    if (!v) return;
    setPairBusy(true);
    try {
      const r = await applyPairingCode(v);
      if (r.ok) {
        toast.success("Devices linked", { description: `Now showing the vault for ${r.email}.` });
        setPasteOpen(false); setPasteVal("");
        await refresh();
      } else {
        toast.error("Couldn't link", { description: r.error || "invalid pairing code" });
      }
    } finally {
      setPairBusy(false);
    }
  }

  const stale = isVaultStale();

  return (
    <div className="mt-6">
      <SectionRule label="Vault sync & devices" />

      {stale && (
        <div className="flex items-center gap-2 mt-3 px-3 py-2" style={{ borderRadius: 8, background: "color-mix(in srgb, var(--risk) 12%, transparent)", border: "1px solid var(--line)" }}>
          <AlertTriangle size={14} strokeWidth={1.5} style={{ color: "var(--risk)" }} />
          <span style={{ fontSize: 12, color: "var(--text)" }}>Vault may be stale — Force Sync below.</span>
        </div>
      )}

      {/* Mode at a glance — the divergence is almost always here. */}
      <div className="flex items-center gap-2 mt-3 mb-1">
        {snap?.standalone ? <Smartphone size={15} strokeWidth={1.5} style={{ color: "var(--gold)" }} /> : <Globe size={15} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />}
        <span style={{ fontSize: 14, color: "var(--text)" }}>{snap?.standalone ? "Installed PWA (standalone)" : "Browser tab (Safari)"}</span>
      </div>
      <p className="cap-data mb-2" style={{ color: "var(--text-dim)" }}>
        device account · <span className="font-mono" style={{ color: "var(--text)" }}>{snap?.deviceEmail || "—"}</span>
      </p>
      <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-dim)" }}>
        If Safari and the installed app show <strong style={{ color: "var(--text)" }}>different</strong> device accounts above, they're two separate vaults.
        Link them: copy the pairing code on the one that has your data, paste it on the other.
      </p>

      {/* Status grid */}
      <div className="px-3 py-2" style={{ borderRadius: 8, background: "var(--bg)", border: "1px solid var(--line)" }}>
        <Row label="origin" value={snap?.origin || "…"} />
        <Row label="route" value={snap?.route || "…"} />
        <Row label="build" value={snap ? `${snap.buildCommit}` : "…"} />
        <Row label="built" value={snap?.buildTime ? relTime(snap.buildTime) : "…"} />
        <Row label="sw version" value={snap?.swVersion || "(none/updating)"} />
        <Row label="api url" value={snap?.apiUrl || "…"} />
        <Row label="api health" value={snap?.apiHealth || "…"} tone={snap?.apiHealth === "ok" ? "good" : snap?.apiHealth === "down" ? "bad" : undefined} />
        <Row label="auth token" value={snap?.tokenPresent ? "present" : "missing"} tone={snap?.tokenPresent ? "good" : "warn"} />
        <Row label="last sync" value={relTime(snap?.lastSync ?? null)} tone={snap?.lastSync ? undefined : "warn"} />
        <div className="my-1" style={{ borderTop: "1px solid var(--line)" }} />
        <Row label="captures · local" value={snap ? String(snap.localCaptures) : "…"} />
        <Row label="captures · server" value={snap?.serverCaptures != null ? String(snap.serverCaptures) : "—"} />
        <Row label="nodes · server" value={snap?.serverNodes != null ? String(snap.serverNodes) : "—"} />
        <Row label="edges · server" value={snap?.serverEdges != null ? String(snap.serverEdges) : "—"} />
        <Row label="namespace" value={snap?.namespace || "…"} />
      </div>

      <div className="flex gap-2 mt-3">
        <Button variant="ghost" full disabled={busy} leftIcon={<RefreshCw size={14} strokeWidth={1.5} />} onClick={onForceSync}>
          {busy ? "Syncing…" : "Force Sync"}
        </Button>
        <Button variant="ghost" full leftIcon={<Copy size={14} strokeWidth={1.5} />} onClick={onShowCode}>
          Copy pairing code
        </Button>
      </div>

      {code && (
        <div className="mt-2">
          <div className="flex items-center gap-1.5 mb-1"><Link2 size={12} strokeWidth={1.5} style={{ color: "var(--gold)" }} /><span className="cap-data" style={{ color: "var(--text-dim)" }}>this vault's pairing code — paste on your other surface</span></div>
          <code className="block text-[10px] font-mono break-all p-2" style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text-dim)" }}>{code}</code>
        </div>
      )}

      <button onClick={() => setPasteOpen((s) => !s)} className="flex items-center gap-1.5 mt-3 press" style={{ fontSize: 13, color: "var(--gold)" }}>
        {pasteOpen ? <ChevronDown size={14} strokeWidth={1.5} /> : <ChevronRight size={14} strokeWidth={1.5} />}
        <ClipboardPaste size={13} strokeWidth={1.5} /> Link a device (paste a pairing code)
      </button>
      {pasteOpen && (
        <div className="mt-2">
          <p className="text-xs leading-relaxed mb-2" style={{ color: "var(--text-dim)" }}>
            Pasting a code makes <strong style={{ color: "var(--text)" }}>this</strong> surface adopt that vault's account. Your current account is replaced; reads switch to the pasted vault.
          </p>
          <textarea
            value={pasteVal}
            onChange={(e) => setPasteVal(e.target.value)}
            placeholder="IG1.…"
            rows={2}
            className="w-full text-[11px] font-mono p-2"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text)" }}
          />
          <Button variant="primary" full disabled={pairBusy || !pasteVal.trim()} leftIcon={<Link2 size={14} strokeWidth={1.5} />} onClick={onApplyCode}>
            {pairBusy ? "Linking…" : "Use pairing code"}
          </Button>
        </div>
      )}
    </div>
  );
}
