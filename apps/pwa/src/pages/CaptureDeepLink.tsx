import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Sparkles, Bug, ChevronDown, ChevronRight, Check } from "lucide-react";
import CaptureForm from "@/components/CaptureForm";
import { parseCaptureParams, normalizeType, type CaptureParams } from "@/lib/deeplink";
import { classifyShared } from "@/lib/classify";
import { persistCaptureFromParams, markSynced } from "@/lib/captureStore";
import { CAPTURE_TYPE_LABEL } from "@/lib/types";
import { apiEnabled, syncCaptureToApi } from "@/lib/api";

// /capture?raw=&url=&content=&title=&type=&source=&note=&tags=&method=&device=
// Apple Shortcut / Share Sheet entry. Accepts a generic `raw` payload (URL, text,
// or title) plus explicit fields, auto-detects platform/type, and fills every
// field. When opened from the Share Sheet (source=ios_share_sheet) with non-empty
// content, it AUTO-SAVES once on mount (zero taps), shows "Captured ✓", and
// redirects. Manual opens keep the Confirm form. A hideable "Debug Intake" panel
// shows exactly what the Shortcut sent.
export default function CaptureDeepLink() {
  const [, navigate] = useLocation();
  const [showDebug, setShowDebug] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const didAutoSave = useRef(false);

  const { initial, debug, parsed } = useMemo(() => {
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
    return { initial: init, debug, parsed };
  }, []);

  const go = () => navigate("/inbox");
  const empty = !initial.url && !initial.body && !initial.title;

  // Auto-save for Share Sheet captures: source=ios_share_sheet AND non-empty
  // content. Fires once (ref guard); empty payloads fall through to the form.
  const shouldAutoSave =
    parsed.source === "ios_share_sheet" && !!((parsed.body ?? "").trim() || (parsed.url ?? "").trim());

  useEffect(() => {
    if (!shouldAutoSave || didAutoSave.current) return;
    didAutoSave.current = true;
    const cap = persistCaptureFromParams(
      {
        type: initial.type as never,
        title: initial.title,
        url: initial.url,
        body: initial.body,
        source: initial.source,
        note: initial.note,
        tags: initial.tags,
        sensitivity: "internal",
        processing: "queued",
      },
      { method: initial.method || "share_sheet", autoClassified: true },
    );
    if (!cap) return; // nothing saved -> render the form as a fallback
    setAutoSaved(true);
    toast.success("Captured ✓", { description: `${CAPTURE_TYPE_LABEL[cap.type]} filed to your Intake Queue.` });
    if (apiEnabled()) syncCaptureToApi(cap).then((ok) => ok && markSynced(cap.id)).catch(() => {});
    const t = setTimeout(() => navigate("/inbox", { replace: true }), 700);
    return () => clearTimeout(t);
  }, [shouldAutoSave, initial, navigate]);

  // Auto-save success screen (no form)
  if (autoSaved) {
    return (
      <div className="px-5 pt-24 flex flex-col items-center gap-3 text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "oklch(0.6 0.18 145 / 0.18)", color: "oklch(0.7 0.16 150)" }}
        >
          <Check size={24} />
        </div>
        <p className="text-lg" style={{ color: "oklch(0.92 0.01 280)" }}>Captured ✓</p>
        <p className="label-mono">Filed to your Intake Queue…</p>
      </div>
    );
  }

  // If we're going to auto-save, don't flash the form first.
  if (shouldAutoSave) {
    return (
      <div className="px-5 pt-24 flex flex-col items-center gap-2 text-center">
        <Sparkles size={24} style={{ color: "oklch(0.78 0.14 85)" }} className="pulse-dot" />
        <p className="label-mono">Capturing…</p>
      </div>
    );
  }

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
