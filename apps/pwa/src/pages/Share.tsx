import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { classifyShared } from "@/lib/classify";
import { saveCapture, newCaptureId, detectDevice, type LocalCapture } from "@/lib/captureStore";

// /share — the zero-friction entry point (Web Share Target + Apple Shortcut).
// Receives a shared payload, AUTO-CLASSIFIES it, saves to the local intake queue,
// and bounces to the queue. No type picker, no form, no questions.
export default function Share() {
  const [, navigate] = useLocation();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return; // guard against StrictMode double-invoke / reloads
    done.current = true;

    const q = new URLSearchParams(window.location.search);
    const input = {
      url: q.get("url") || undefined,
      title: q.get("title") || undefined,
      text: q.get("text") || q.get("body") || undefined,
      source: q.get("source") || undefined,
      note: q.get("note") || undefined,
    };
    if (!input.url && !input.title && !input.text && !input.note) {
      navigate("/inbox", { replace: true });
      return;
    }

    const c = classifyShared(input);
    const cap: LocalCapture = {
      id: newCaptureId(),
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
      provenance: { capture_method: "share_target", device: detectDevice(), app_context: "pwa" },
    };
    saveCapture(cap);
    toast.success("Captured", { description: `Auto-classified: ${c.type.replace(/_/g, " ")} · ${c.domain}` });
    navigate("/inbox", { replace: true });
  }, [navigate]);

  return (
    <div className="px-5 pt-24 flex flex-col items-center gap-2 text-center">
      <Sparkles size={24} style={{ color: "oklch(0.78 0.14 85)" }} className="pulse-dot" />
      <p className="label-mono">Capturing &amp; classifying…</p>
    </div>
  );
}
