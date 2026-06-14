#!/usr/bin/env python3
"""Wave 6 media-worker — local transcription with faster-whisper.

Usage: python3 transcribe.py <path-to-16kHz-mono.wav>
Prints the transcript to stdout (logs go to stderr). The model is baked into the
Docker image (MEDIA_WHISPER_MODEL, default "base") so there is no runtime
HuggingFace download — this works behind strict egress and avoids cold-start fetches.
"""
import os
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: transcribe.py <audio.wav>", file=sys.stderr)
        return 2
    wav = sys.argv[1]
    model_name = os.environ.get("MEDIA_WHISPER_MODEL", "base")
    try:
        from faster_whisper import WhisperModel
    except Exception as e:  # pragma: no cover - import guard
        print(f"faster_whisper unavailable: {e}", file=sys.stderr)
        return 3

    # CPU + int8: the smallest reliable footprint for shared/standard Render CPUs.
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    # beam_size=1 is fastest; bump for accuracy once the RTF budget is known.
    segments, info = model.transcribe(wav, beam_size=1, vad_filter=True)
    print(f"[transcribe] model={model_name} lang={getattr(info, 'language', '?')} "
          f"dur={getattr(info, 'duration', 0):.0f}s", file=sys.stderr)

    parts = []
    for seg in segments:
        text = (seg.text or "").strip()
        if text:
            parts.append(text)
    sys.stdout.write(" ".join(parts).strip())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
