import { useRef, useState } from "react";
import { ArrowUpDown, Download, Upload, Info } from "lucide-react";
import { toast } from "sonner";

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
    <div className="px-5 pt-5 pb-6 space-y-4">
      <div className="flex items-center gap-2">
        <ArrowUpDown size={18} style={{ color: "oklch(0.6 0.2 264)" }} />
        <h1 className="text-xl">Import / Export</h1>
      </div>

      <button
        onClick={handleExport}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-glow disabled:opacity-50"
        style={{ background: "oklch(0.78 0.14 85)", color: "oklch(0.16 0.04 280)" }}
      >
        <Download size={16} /> Export Local Data (JSON)
      </button>

      <button
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold border-glow"
        style={{ background: "oklch(0.11 0.02 280)", color: "oklch(0.75 0.01 280)" }}
      >
        <Upload size={16} /> Import Data (replace state)
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleImport} />

      {lastImport && (
        <p className="label-mono" style={{ color: "oklch(0.78 0.14 85)" }}>
          last import · {lastImport}
        </p>
      )}

      <section
        className="rounded-2xl p-4 flex gap-3"
        style={{ background: "oklch(0.11 0.02 280)", border: "1px dashed oklch(0.2 0.04 264 / 0.5)" }}
      >
        <Info size={16} className="shrink-0 mt-0.5" style={{ color: "oklch(0.72 0.15 195)" }} />
        <p className="text-xs leading-relaxed" style={{ color: "oklch(0.55 0.02 280)" }}>
          v0.1 prototype: data is in-memory and synthetic. Export bundles all seven fixtures via the
          Blob API; Import validates structure only — there is <strong style={{ color: "oklch(0.75 0.01 280)" }}>no
          persistence and no cloud sync</strong>. Everything stays on-device.
        </p>
      </section>
    </div>
  );
}
