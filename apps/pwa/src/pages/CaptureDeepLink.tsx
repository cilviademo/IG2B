import { useState } from "react";
import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";
import CaptureForm from "@/components/CaptureForm";
import { parseCaptureParams, normalizeType, type CaptureParams } from "@/lib/deeplink";
import { classifyShared } from "@/lib/classify";

// /capture?title=&url=&content=&type=&source=&note=&tags=
// Apple Shortcut / Share Sheet entry. Auto-detects platform + fills every field
// (even if the shortcut only sends a url + content) so it's a single Save tap.
// Works offline (cached shell) and stays local-first.
export default function CaptureDeepLink() {
  const [, navigate] = useLocation();
  const [initial] = useState<CaptureParams>(() => {
    const raw = parseCaptureParams(window.location.search);
    // Infer type/source/tags/title from the URL + content when not explicit.
    const c = classifyShared({ url: raw.url, title: raw.title, text: raw.body, source: raw.source, note: raw.note });
    return {
      type: normalizeType(raw.type) ?? c.type,
      title: raw.title || c.title,
      url: raw.url || c.url,
      body: raw.body || c.body,
      source: raw.source || c.source,
      note: raw.note || c.note,
      tags: raw.tags || c.tags.join(", "),
    };
  });
  const go = () => navigate("/inbox");

  return (
    <div className="px-5 pt-16 flex flex-col items-center text-center gap-2">
      <Sparkles size={22} style={{ color: "oklch(0.78 0.14 85)" }} />
      <p className="label-mono" style={{ color: "oklch(0.55 0.02 280)" }}>Preparing your capture…</p>
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
