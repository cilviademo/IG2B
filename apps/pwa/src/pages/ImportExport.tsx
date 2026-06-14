import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Download, Upload, Info, KeyRound, Copy, Eye, EyeOff, Activity, Cpu, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { apiEnabled, apiBaseUrl, getToken, ensureSession, lastSessionError, syncCaptureToApi, lastSyncError, fetchLlmStatus, fetchCaptures, getLiveNodes, getLiveEdges, type LlmStatus } from "@/lib/api";
import { listCaptures } from "@/lib/captureStore";
import { Button, SectionRule, Dot } from "@/components/primitives";
import AiUsagePanel from "@/components/AiUsagePanel";
import AccountPanel from "@/components/AccountPanel";
import VaultSyncPanel from "@/components/VaultSyncPanel";

export default function ImportExport() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [revealToken, setRevealToken] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [llm, setLlm] = useState<LlmStatus | null>(null);

  // Safe LLM provider + budget status (no secrets) for the admin card.
  useEffect(() => {
    if (apiEnabled()) fetchLlmStatus().then(setLlm).catch(() => {});
  }, []);
  const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  // Runs ONE real capture POST against /captures and reports the exact result —
  // turns the silent "(local)" fallback into a visible HTTP status so we can see
  // whether sync is failing on auth (401), validation (400), server (500), or CORS.
  async function testSync() {
    if (!apiEnabled()) {
      setSyncMsg("API not configured (VITE_API_URL unset)");
      return;
    }
    setSyncBusy(true);
    setSyncMsg("testing…");
    try {
      const ok = await syncCaptureToApi({
        type: "manual_text",
        source: "sync_test",
        title: `Sync test ${new Date().toISOString().slice(11, 19)}`,
        user_note: "Diagnostic capture from the I/O tab",
        sensitivity: "internal",
      });
      setSyncMsg(ok ? "✓ Sync OK — capture reached the database" : `✗ ${lastSyncError() || "sync failed"}`);
    } catch (e) {
      setSyncMsg(`✗ ${e instanceof Error ? e.message : "sync failed"}`);
    } finally {
      setSyncBusy(false);
    }
  }

  // The API token is the device bearer session used to authenticate uploads.
  // Ensures a session exists (registers the silent device account if needed),
  // then copies the token so it can be pasted into the iOS Shortcut's
  // Authorization: Bearer <token> header for /capture/upload.
  async function copyApiToken() {
    if (!apiEnabled()) {
      toast.error("API not configured", { description: "VITE_API_URL is unset; uploads/token need the backend." });
      return;
    }
    setTokenBusy(true);
    try {
      let t = getToken();
      if (!t) {
        const ok = await ensureSession();
        t = ok ? getToken() : null;
      }
      if (!t) throw new Error(lastSessionError() || "Couldn't reach the API to get a token");
      setTokenState(t);
      try {
        await navigator.clipboard.writeText(t);
        toast.success("API token copied", { description: "Paste into the Shortcut's Authorization header (after 'Bearer ')." });
      } catch {
        setRevealToken(true);
        toast("Copy manually", { description: "Clipboard blocked — token is shown below." });
      }
    } catch (e) {
      toast.error("Token unavailable", { description: e instanceof Error ? e.message : "unknown" });
    } finally {
      setTokenBusy(false);
    }
  }

  // Real backup of YOUR vault — captures + nodes + edges from the server (plus the
  // local capture cache), NOT the demo fixtures. A restore point you can trust.
  async function handleExport() {
    setBusy(true);
    try {
      let serverCaptures: unknown[] = [];
      let nodes: unknown[] = [];
      let edges: unknown[] = [];
      if (apiEnabled()) {
        const [caps, nr, er] = await Promise.all([fetchCaptures(), getLiveNodes(), getLiveEdges()]);
        serverCaptures = caps ?? [];
        nodes = (nr?.nodes as unknown[]) ?? [];
        edges = (er?.edges as unknown[]) ?? [];
      }
      const localCaptures = listCaptures();
      const bundle = {
        app: "Indigold",
        version: "0.1.0",
        synthetic: false,
        exported_at: new Date().toISOString(),
        source: apiEnabled() ? apiBaseUrl() : "local-only",
        vault: { captures: serverCaptures, nodes, edges, local_captures: localCaptures },
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `indigold_vault_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Vault exported", { description: `${serverCaptures.length} captures · ${nodes.length} nodes · ${edges.length} edges` });
    } catch (e) {
      toast.error("Export failed", { description: e instanceof Error ? e.message : "unknown" });
    } finally {
      setBusy(false);
    }
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        // Mock v0.1 validation — shape check only, no persistence.
        const d = parsed.data ?? parsed;
        const hasNodes = Array.isArray(d.sample_nodes?.nodes ?? d.nodes);
        if (!hasNodes) throw new Error("missing nodes[] — not an Indigold bundle");
        const count = (d.sample_nodes?.nodes ?? d.nodes).length;
        setLastImport(`${file.name} · ${count} nodes`);
        toast.success("Import validated", {
          description: `${file.name} passed the shape check (v0.1 does not persist).`,
        });
      } catch (err) {
        toast.error("Import failed", { description: err instanceof Error ? err.message : "invalid JSON" });
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="px-5 pt-6 pb-6">
      <h1 className="text-xl font-display mb-1">Settings</h1>
      <p className="cap-data mb-5" style={{ color: "var(--text-dim)" }}>vault sync · connections · import/export · API · advanced</p>

      {/* Durable identity first — a real login is the recoverable fix for the
          installed-PWA / Safari storage-wipe divergence. */}
      <AccountPanel />

      {/* One vault reality — environment parity, Force Sync, device pairing. */}
      <VaultSyncPanel />

      {/* Connections — honest: connectors are designed (seam) but not yet wired. */}
      <SectionRule label="Connections" />
      <p className="text-xs leading-relaxed mt-3 mb-2" style={{ color: "var(--text-dim)" }}>
        Capture today via the <strong style={{ color: "var(--text)" }}>iOS Shortcut</strong> (share → /capture).
        Source connectors (Gmail, Calendar, Drive, Readwise…) are designed and arrive in a later wave — none are active yet.
      </p>

      {/* Import / Export */}
      <div className="mt-6"><SectionRule label="Import / export" /></div>
      <div className="flex gap-2 mt-3 mb-2">
        <Button variant="ghost" full disabled={busy} leftIcon={<Download size={15} strokeWidth={1.5} />} onClick={handleExport}>Export</Button>
        <Button variant="ghost" full leftIcon={<Upload size={15} strokeWidth={1.5} />} onClick={() => fileRef.current?.click()}>Import</Button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />
      {lastImport && (
        <p className="cap-data mb-1" style={{ color: "var(--text-dim)" }}>last import · {lastImport}</p>
      )}

      {/* Intelligence — LLM providers + budget (safe status only, never a secret) */}
      {llm && (
        <>
          <div className="mt-6"><SectionRule label="API" /></div>
          <div className="flex items-center gap-2 mt-3 mb-1.5">
            <Cpu size={15} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
            <span style={{ fontSize: 14, color: "var(--text)" }}>Providers</span>
            <span className="cap-data ml-auto" style={{ color: "var(--text-dim)" }}>mode · {llm.mode}</span>
          </div>
          <div className="space-y-1.5">
            {Object.entries(llm.providers).map(([name, p]) => (
              <div key={name} className="flex items-center justify-between" style={{ fontSize: 12 }}>
                <span className="font-mono" style={{ color: "var(--text-dim)" }}>{name}{name === llm.default_provider ? " (default)" : ""}</span>
                <span className="flex items-center gap-1.5" style={{ color: p.configured ? "var(--good)" : "var(--text-dim)" }}>
                  <Dot color={p.configured ? "var(--good)" : "var(--text-dim)"} /> {p.configured ? "configured" : "missing key"}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 mt-2" style={{ borderTop: "1px solid var(--line)", fontSize: 12 }}>
            <span style={{ color: "var(--text-dim)" }}>Budget · {llm.budget.state}</span>
            <span className="font-data" style={{ color: llm.budget.state === "ok" ? "var(--good)" : "var(--gold)" }}>
              {dollars(llm.budget.month_to_date_cents)} / {dollars(llm.budget.monthly_budget_cents)}
            </span>
          </div>
          {llm.budget.state !== "ok" && (
            <p className="cap-data mt-1" style={{ color: "var(--gold)" }}>
              Governor {llm.budget.state} — AI work is degraded/queued, not silently spending.
            </p>
          )}
          {/* Spend-by-purpose: where this month's tokens went (no silent drain). */}
          {llm.budget.by_purpose && llm.budget.by_purpose.length > 0 && (
            <div className="mt-2 space-y-1">
              <span className="cap-data" style={{ color: "var(--text-dim)" }}>this month, by purpose</span>
              {llm.budget.by_purpose.slice(0, 6).map((p) => (
                <div key={p.purpose} className="flex items-center justify-between" style={{ fontSize: 11 }}>
                  <span className="font-mono" style={{ color: "var(--text-dim)" }}>{p.purpose}<span style={{ opacity: 0.6 }}> ·{p.calls}</span></span>
                  <span className="font-data" style={{ color: "var(--text-dim)" }}>{dollars(p.cents)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* AI Usage / Token Observatory */}
      <AiUsagePanel />

      {/* Device token */}
      <div className="mt-6"><SectionRule label="Advanced" /></div>
      <p className="cap-data mt-2 mb-1" style={{ color: "var(--text-dim)" }}>device token — raw API access</p>
      <div className="flex items-center gap-2 mt-3 mb-1.5">
        <KeyRound size={15} strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
        <span style={{ fontSize: 14, color: "var(--text)" }}>API token</span>
      </div>
      <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-dim)" }}>
        For the iOS Shortcut <strong style={{ color: "var(--text)" }}>file-upload</strong> branch.
        Paste into the Shortcut’s header: <span className="font-mono">Authorization: Bearer &lt;token&gt;</span>.
        Treat it like a password — it authenticates your vault uploads.
      </p>
      {/* the screen's one gold primary */}
      <Button variant="primary" full disabled={tokenBusy} leftIcon={<Copy size={15} strokeWidth={1.5} />} onClick={copyApiToken}>
        {tokenBusy ? "Preparing…" : "Copy API token"}
      </Button>
      {token && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>token</span>
            <button onClick={() => setRevealToken((r) => !r)} className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--gold)" }}>
              {revealToken ? <EyeOff size={11} strokeWidth={1.5} /> : <Eye size={11} strokeWidth={1.5} />} {revealToken ? "Hide" : "Reveal"}
            </button>
          </div>
          <code className="block text-[10px] font-mono break-all p-2" style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 6, color: "var(--text-dim)" }}>
            {revealToken ? token : "•".repeat(Math.min(40, token.length))}
          </code>
        </div>
      )}

      {/* Sync */}
      <div className="mt-6"><SectionRule label="Sync" /></div>
      {apiEnabled() && (
        <p className="cap-data mt-3 mb-2" style={{ color: "var(--text-dim)" }}>endpoint · {apiBaseUrl()}/capture/upload</p>
      )}
      <Button variant="ghost" full disabled={syncBusy} leftIcon={<Activity size={14} strokeWidth={1.5} />} onClick={testSync}>
        {syncBusy ? "Testing sync…" : "Test sync"}
      </Button>
      {syncMsg && (
        <div className="flex items-center gap-2 mt-2">
          <Dot color={syncMsg.startsWith("✓") ? "var(--good)" : "var(--risk)"} />
          <span className="font-mono break-words" style={{ fontSize: 12, color: "var(--text-dim)" }}>{syncMsg}</span>
        </div>
      )}

      <div className="mt-6"><SectionRule label="Admin" /></div>
      <Link href="/diagnostics" className="tap-row flex items-center gap-2 mt-3" style={{ fontSize: 14, color: "var(--text)" }}>
        <ShieldCheck size={15} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
        Diagnostics — Verification Center + Debug Console
      </Link>

      <hr className="rule mt-6 mb-3" />
      <div className="flex gap-3">
        <Info size={15} className="shrink-0 mt-0.5" strokeWidth={1.5} style={{ color: "var(--text-dim)" }} />
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-dim)" }}>
          Captures sync with the live API when online; a local cache stays available offline. File
          assets are stored <strong style={{ color: "var(--text)" }}>privately</strong> and shown through
          time-limited signed URLs.
        </p>
      </div>
    </div>
  );
}
