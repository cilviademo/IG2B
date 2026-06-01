import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Sparkles, Bug, ChevronDown, ChevronRight, Check, Pencil, AlertTriangle } from "lucide-react";
import CaptureForm from "@/components/CaptureForm";
import { parseCaptureParams, normalizeType, type CaptureParams } from "@/lib/deeplink";
import { classifyShared } from "@/lib/classify";
import { persistCaptureFromParams, removeCapture, markSynced, type LocalCapture } from "@/lib/captureStore";
import { CAPTURE_TYPE_LABEL } from "@/lib/types";
import { apiEnabled, syncCaptureToApi } from "@/lib/api";

// /capture?raw=&url=&content=&title=&type=&source=&note=&tags=&method=&device=
// Apple Shortcut / Share Sheet entry. Accepts a generic `raw` payload (URL, text,
// or title) plus explicit fields, auto-detects platform/type, and fills every
// field. When opened from the Share Sheet (source=ios_share_sheet) with non-empty
// content it AUTO-SAVES once on mount (zero taps), then shows a success screen
// with the key fields + Edit / Done. Manual opens keep the Confirm form. A
// hideable "Debug Intake" panel shows exactly what the Shortcut sent.

function recordToParams(r: LocalCapture): CaptureParams {
  return {
    type: r.type,
    title: r.title,
    url: r.url,
    body: r.body,
    source: r.source,
    note: r.user_note,
    tags: r.tags.join(", "),
  };
}

export default function CaptureDeepLink() {
  const [, navigate] = useLocation();
  const [showDebug, setShowDebug] = useState(false);
  const [saved, setSaved] = useState<LocalCapture | null>(null);
  const [editing, setEditing] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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

  const go = () => navigate("/inbox", { replace: true });
  const empty = !initial.url && !initial.body && !initial.title;

  // Auto-save for Share Sheet captures: source=ios_share_sheet AND non-empty
  // content. Fires once (ref guard); empty/error falls through to the form.
  const shouldAutoSave =
    parsed.source === "ios_share_sheet" && !!((parsed.body ?? "").trim() || (parsed.url ?? "").trim());

  useEffect(() => {
    if (!shouldAutoSave || didAutoSave.current) return;
    didAutoSave.current = true;
    try {
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
      setAttempted(true);
      if (!cap) {
        setSaveError("Couldn't read the shared item — review and save manually.");
        return; // -> form fallback
      }
      setSaved(cap);
      toast.success("Captured ✓", { description: `${CAPTURE_TYPE_LABEL[cap.type]} filed to your Intake Queue.` });
      if (apiEnabled()) syncCaptureToApi(cap).then((ok) => ok && markSynced(cap.id)).catch(() => {});
    } catch (e) {
      setAttempted(true);
      setSaveError(e instanceof Error ? e.message : "Save failed — review and save manually.");
    }
  }, [shouldAutoSave, initial]);

  // ---- Edit mode: the same Confirm form, pre-filled from the saved record.
  // Re-saving creates a fresh record then removes the original (no duplicate);
  // cancelling keeps the original.
  if (editing && saved) {
    return (
      <div className="px-5 pt-12 flex flex-col items-center text-center gap-2">
        <CaptureForm
          initial={recordToParams(saved)}
          defaultProcessing={saved.processing_status}
          prefilledLabel="Editing your capture — revise and re-save."
          onSaved={() => {
            removeCapture(saved.id);
            go();
          }}
          onClose={go}
        />
      </div>
    );
  }

  // ---- Success screen: key fields + Edit + Done (no auto-redirect).
  if (saved) {
    const Field = ({ label, value }: { label: string; value?: string }) =>
      value ? (
        <div className="w-full">
          <div className="label-mono">{label}</div>
          <div className="text-sm break-words" style={{ color: "oklch(0.85 0.01 280)" }}>{value}</div>
        </div>
      ) : null;
    return (
      <div className="px-5 pt-20 flex flex-col items-center gap-4 text-center">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: "oklch(0.6 0.18 145 / 0.18)", color: "oklch(0.7 0.16 150)" }}
        >
          <Check size={28} />
        </div>
        <p className="text-xl" style={{ color: "oklch(0.92 0.01 280)" }}>Captured ✓</p>

        <div
          className="w-full rounded-2xl p-4 flex flex-col gap-3 text-left border-glow"
          style={{ background: "oklch(0.11 0.02 280)" }}
        >
          <Field label="Type" value={CAPTURE_TYPE_LABEL[saved.type]} />
          <Field label="Title" value={saved.title} />
          <Field label="URL" value={saved.url || undefined} />
        </div>

        <div className="flex gap-2 w-full">
          <button
            onClick={() => setEditing(true)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold border-glow"
            style={{ background: "oklch(0.11 0.02 280)", color: "oklch(0.75 0.01 280)" }}
          >
            <Pencil size={15} /> Edit
          </button>
          <button
            onClick={go}
            className="flex-1 rounded-xl py-3 text-sm font-semibold"
            style={{ background: "oklch(0.78 0.14 85)", color: "oklch(0.16 0.04 280)" }}
          >
            Done
          </button>
        </div>
        <p className="label-mono" style={{ color: "oklch(0.4 0.02 280)" }}>Filed to your Universal Intake Queue.</p>
      </div>
    );
  }

  // ---- Still attempting auto-save (brief, before the effect resolves).
  if (shouldAutoSave && !attempted) {
    return (
      <div className="px-5 pt-24 flex flex-col items-center gap-2 text-center">
        <Sparkles size={24} style={{ color: "oklch(0.78 0.14 85)" }} className="pulse-dot" />
        <p className="label-mono">Capturing…</p>
      </div>
    );
  }

  // ---- Confirm form: manual opens, and the auto-save error/empty fallback.
  return (
    <div className="px-5 pt-12 flex flex-col items-center text-center gap-2">
      <Sparkles size={22} style={{ color: "oklch(0.78 0.14 85)" }} />
      <p className="label-mono" style={{ color: "oklch(0.55 0.02 280)" }}>Preparing your capture…</p>

      {saveError && (
        <div
          className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs"
          style={{ background: "oklch(0.6 0.22 25 / 0.12)", color: "oklch(0.78 0.16 35)" }}
        >
          <AlertTriangle size={14} className="shrink-0" /> {saveError}
        </div>
      )}

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
