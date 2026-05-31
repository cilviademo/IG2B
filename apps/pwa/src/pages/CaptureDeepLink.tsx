import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, Bug, ChevronDown, ChevronRight } from "lucide-react";
import CaptureForm from "@/components/CaptureForm";
import { parseCaptureParams, normalizeType, type CaptureParams } from "@/lib/deeplink";
import { classifyShared } from "@/lib/classify";

// /capture?raw=&url=&content=&title=&type=&source=&note=&tags=&method=&device=
// Apple Shortcut / Share Sheet entry. Accepts a generic `raw` payload (URL, text,
// or title) plus explicit fields, auto-detects platform/type, and fills every
// field so it's a single Save tap. Includes a hideable "Debug Intake" panel to
// confirm exactly what the Shortcut sent.
export default function CaptureDeepLink() {
  const [, navigate] = useLocation();
  const [showDebug, setShowDebug] = useState(false);

  const { initial, debug } = useMemo(() => {
    const search = window.location.search;
    const raw = new URLSearchParams(search);
    const queryParams: Record<string, string> = {};
    raw.forEach((v, k) => (queryParams[k] = v));

    const parsed = parseCaptureParams(search);
    const c = classifyShared({ url: parsed.url, title: parsed.title, text: parsed.body, source: parsed.source, note: parsed.note });

    const init: CaptureParams = {
      type: normalizeType(parsed.type) ?? c.type,
      title: parsed.title || c.title,
      url: parsed.url || c.url,
      body: parsed.body || c.body,
      source: c.source, // classifier resolves host-vs-hint precedence correctly
      note: parsed.note || c.note,
      tags: parsed.tags || c.tags.join(", "),
      method: parsed.method,
      device: parsed.device,
    };

    const debug = {
      location_href: window.location.href,
      query_params: queryParams,
      parsed_payload: parsed,
      detected_type: init.type,
      detected_source: init.source,
      received_raw: raw.get("raw") ?? "",
      confidence: c.confidence,
    };
    return { initial: init, debug };
  }, []);

  const go = () => navigate("/inbox");
  const empty = !initial.url && !initial.body && !initial.title;

  return (
    <div className="px-5 pt-12 flex flex-col items-center text-center gap-2">
      <Sparkles size={22} style={{ color: "oklch(0.78 0.14 85)" }} />
      <p className="label-mono" style={{ color: "oklch(0.55 0.02 280)" }}>Preparing your capture…</p>

      {/* Debug Intake — confirm what the Shortcut actually sent */}
      <button
        onClick={() => setShowDebug((s) => !s)}
        className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full border-glow"
        style={{ background: "oklch(0.11 0.02 280)", color: empty ? "oklch(0.75 0.16 60)" : "oklch(0.5 0.02 280)" }}
      >
        <Bug size={12} /> Debug Intake {showDebug ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {empty ? " · empty payload!" : ""}
      </button>
      {showDebug && (
        <pre
          className="w-full text-left text-[10px] font-mono overflow-x-auto rounded-xl p-3"
          style={{ background: "oklch(0.08 0.02 280)", border: "1px solid oklch(0.2 0.04 264 / 0.5)", color: "oklch(0.8 0.02 280)" }}
        >
{JSON.stringify(debug, null, 2)}
        </pre>
      )}

      <CaptureForm
        initial={initial}
        defaultProcessing="queued"
        prefilledLabel="Pre-filled from iOS Share Sheet — review and tap Save."
        onClose={go}
        onSaved={go}
      />
    </div>
  );
}
