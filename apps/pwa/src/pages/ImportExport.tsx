import { useRef, useState } from "react";
import { Download, Upload, Info, KeyRound, Copy, Eye, EyeOff, Activity } from "lucide-react";
import { toast } from "sonner";
import { apiEnabled, apiBaseUrl, getToken, ensureSession, lastSessionError, syncCaptureToApi, lastSyncError } from "@/lib/api";
import { Button, SectionRule, Dot } from "@/components/primitives";

const DATA_FILES = [
  "sample_nodes",
  "sample_edges",
  "sample_timeline",
  "sample_inbox",
  "sample_dashboard",
  "sample_context_pack",
  "sample_weekly_brief",
] as const;

export default function ImportExport() {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [token, setTokenState] = useState<string | null>(getToken());
  const [revealToken, setRevealToken] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

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

  async function handleExport() {
    setBusy(true);
    try {
      const entries = await Promise.all(
        DATA_FILES.map(async (name) => {
          const res = await fetch(`/data/${name}.json`);
          return [name, await res.json()] as const;
        }),
      );
      const bundle = {
        app: "Indigold",
        version: "0.1.0",
        synthetic: true,
        exported_at: new Date().toISOString(),
        data: Object.fromEntries(entries),
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "indigold_export.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Exported", { description: "7 fixtures bundled into indigold_export.json" });
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
      <h1 className="text-xl font-display mb-5">Input / output</h1>

      {/* Data */}
      <SectionRule label="Data" />
      <div className="flex gap-2 mt-3 mb-2">
        <Button variant="ghost" full disabled={busy} leftIcon={<Download size={15} strokeWidth={1.5} />} onClick={handleExport}>Export</Button>
        <Button variant="ghost" full leftIcon={<Upload size={15} strokeWidth={1.5} />} onClick={() => fileRef.current?.click()}>Import</Button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />
      {lastImport && (
        <p className="cap-data mb-1" style={{ color: "var(--text-dim)" }}>last import · {lastImport}</p>
      )}

      {/* Device token */}
      <div className="mt-6"><SectionRule label="Device token" /></div>
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
