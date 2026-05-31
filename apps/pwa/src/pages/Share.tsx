import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { classifyShared, CONFIDENCE_THRESHOLD, type ShareInput } from "@/lib/classify";
import { saveCapture, newCaptureId, detectDevice, type LocalCapture } from "@/lib/captureStore";
import { getPending, delPending, putFile, type PendingFile } from "@/lib/idbShare";
import { syncCaptureToApi, apiEnabled } from "@/lib/api";
import { markSynced } from "@/lib/captureStore";
import CaptureForm from "@/components/CaptureForm";
import { parseCaptureParams, type CaptureParams } from "@/lib/deeplink";

// /share — zero-friction intake. Handles:
//   • Web Share Target POST payloads (via SW -> IndexedDB, ?pending=<id>), incl. files
//   • GET deep links (?url/text/title/source/note) from the Apple Shortcut
// Auto-classifies and auto-saves. Only drops to a manual form if confidence is low.
export default function Share() {
  const [, navigate] = useLocation();
  const done = useRef(false);
  const [phase, setPhase] = useState<"working" | "fallback">("working");
  const [fallback, setFallback] = useState<CaptureParams | null>(null);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    (async () => {
      const q = new URLSearchParams(window.location.search);
      const pendingId = q.get("pending");
      let input: ShareInput;
      let fileBlobs: PendingFile[] = [];

      if (pendingId) {
        const p = await getPending(pendingId);
        if (p) {
          fileBlobs = p.files || [];
          input = {
            url: p.url || undefined,
            title: p.title || undefined,
            text: p.text || undefined,
            files: fileBlobs.map((f) => ({ name: f.name, type: f.type, size: f.size })),
          };
        } else {
          input = {};
        }
      } else {
        // Shared parser handles raw/content/text aliases + embedded URLs.
        const p = parseCaptureParams(window.location.search);
        input = {
          url: p.url || undefined,
          title: p.title || undefined,
          text: p.body || undefined,
          source: p.source || undefined,
          note: p.note || undefined,
        };
      }

      const hasAny = !!(input.url || input.title || input.text || input.note || (input.files && input.files.length));
      if (!hasAny) {
        if (pendingId) await delPending(pendingId);
        navigate("/inbox", { replace: true });
        return;
      }

      const c = classifyShared(input);

      // Low confidence -> manual fallback form (pre-filled).
      if (c.confidence < CONFIDENCE_THRESHOLD) {
        setFallback({ type: c.type, title: c.title, url: c.url, body: c.body, source: c.source, note: c.note, tags: c.tags.join(", ") });
        if (pendingId) await delPending(pendingId);
        setPhase("fallback");
        return;
      }

      // Auto-save. Persist any file blobs locally (best-effort) + record metadata.
      const capId = newCaptureId();
      const filesMeta: { name: string; type: string; size: number }[] = [];
      for (let i = 0; i < fileBlobs.length; i++) {
        const f = fileBlobs[i];
        await putFile(`${capId}:${i}`, { name: f.name, type: f.type, size: f.size, blob: f.blob });
        filesMeta.push({ name: f.name, type: f.type, size: f.size });
      }

      const cap: LocalCapture = {
        id: capId,
        type: c.type,
        title: c.title,
        source: c.source,
        url: c.url,
        body: c.body,
        user_note: c.note,
        captured_at: new Date().toISOString(),
        truth_layer: "A",
        status: "inbox",
        sensitivity: c.sensitivity,
        processing_status: "unprocessed",
        tags: c.tags,
        domain: c.domain,
        media: c.media,
        auto_classified: true,
        files: filesMeta.length ? filesMeta : undefined,
        provenance: {
          capture_method: q.get("method") || (pendingId ? "share_target" : "share_link"),
          device: q.get("device") || detectDevice(),
          app_context: "pwa",
        },
      };
      saveCapture(cap);
      if (pendingId) await delPending(pendingId);
      toast.success("Captured", { description: `Auto-classified: ${c.type.replace(/_/g, " ")} · ${c.domain}` });

      // Best-effort backend sync (non-blocking).
      if (apiEnabled()) {
        syncCaptureToApi(cap).then((ok) => ok && markSynced(cap.id)).catch(() => {});
      }
      navigate("/inbox", { replace: true });
    })();
  }, [navigate]);

  if (phase === "fallback" && fallback) {
    return (
      <div className="px-5 pt-16 flex flex-col items-center text-center gap-2">
        <p className="label-mono" style={{ color: "oklch(0.75 0.16 60)" }}>Low confidence — confirm details</p>
        <CaptureForm initial={fallback} onClose={() => navigate("/inbox")} onSaved={() => navigate("/inbox")} />
      </div>
    );
  }

  return (
    <div className="px-5 pt-24 flex flex-col items-center gap-2 text-center">
      <Sparkles size={24} style={{ color: "oklch(0.78 0.14 85)" }} className="pulse-dot" />
      <p className="label-mono">Capturing &amp; classifying…</p>
    </div>
  );
}
