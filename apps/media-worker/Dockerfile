# Wave 6 — media worker image (SPIKE DRAFT, not wired into render.yaml yet).
# A Docker worker that consumes the same Redis queue but handles ONLY `media_ingest`:
# yt-dlp (download/extract) + FFmpeg (normalize audio) + faster-whisper (local transcription),
# then synthesis via the existing governedComplete path. The Whisper model is BAKED IN so there
# is no per-cold-start HuggingFace download (works behind strict egress; faster cold starts).
#
# Build the real timing spike on this image BEFORE building the pipeline (see 17_WAVE6_MEDIA_SPIKE.md).

FROM node:22-bookworm-slim

# System binaries: ffmpeg + python + pip (yt-dlp/faster-whisper are Python).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Python media stack (pin in a real build).
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp faster-whisper

# Bake the default Whisper model into the image (no runtime HF fetch). Override size via build arg.
ARG WHISPER_MODEL=base
ENV MEDIA_WHISPER_MODEL=${WHISPER_MODEL}
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

WORKDIR /app
# Monorepo build context: copy + build the worker (Node) that calls the python tools as subprocesses.
COPY . .
RUN corepack enable && npm ci && npm --workspace apps/worker run build || true   # wire properly when greenlit

# The media worker entrypoint (consumes Redis `media_ingest` only) — added when the pipeline is built.
CMD ["node", "apps/worker/dist/media.js"]
