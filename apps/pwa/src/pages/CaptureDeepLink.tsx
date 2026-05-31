import { useState } from "react";
import { useLocation } from "wouter";
import { Sparkles } from "lucide-react";
import CaptureForm from "@/components/CaptureForm";
import { parseCaptureParams } from "@/lib/deeplink";

// /capture?type=…&title=…&url=…&body=…&source=…&note=…&tags=…
// Entry point for Apple Shortcuts / Share Sheet. Pre-fills the capture form so
// the user only taps Save. Works offline (served from the cached app shell) and
// stays local-first (saves to localStorage).
export default function CaptureDeepLink() {
  const [, navigate] = useLocation();
  // Read query params once on mount (location.search survives the SPA fallback).
  const [initial] = useState(() => parseCaptureParams(window.location.search));
  const go = () => navigate("/inbox");

  return (
    <div className="px-5 pt-16 flex flex-col items-center text-center gap-2">
      <Sparkles size={22} style={{ color: "oklch(0.78 0.14 85)" }} />
      <p className="label-mono" style={{ color: "oklch(0.55 0.02 280)" }}>Preparing your capture…</p>
      <CaptureForm initial={initial} onClose={go} onSaved={go} />
    </div>
  );
}
