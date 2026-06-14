# Wave 6 — media worker image. A Docker worker that consumes the dedicated media queue
# (indigold:jobs:media) and handles ONLY `media_extract`: yt-dlp (captions/download) +
# FFmpeg (normalize audio) + faster-whisper (local transcription), then hands the
# transcript to the existing `media_ingest` synthesis (governedComplete: budget + privacy
# gated). The Whisper model is BAKED IN so there is no per-cold-start HuggingFace download
# (works behind strict egress; faster cold starts).
#
# Cost: this needs a PAID Render plan (CPU transcription is not free-tier). It is wired
# only when the owner enables it (see render.yaml + MEDIA_WORKER=on). Run the timing spike
# in 17_WAVE6_MEDIA_SPIKE.md on THIS image before relying on Whisper for long media.

FROM node:22-bookworm-slim

# System binaries: ffmpeg + python + pip (yt-dlp/faster-whisper are Python).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Python media stack.
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp faster-whisper

# Bake the default Whisper model into the image (no runtime HF fetch). Override via build arg.
ARG WHISPER_MODEL=base
ENV MEDIA_WHISPER_MODEL=${WHISPER_MODEL}
ENV MEDIA_TRANSCRIBE_PY=/app/apps/media-worker/transcribe.py
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('${WHISPER_MODEL}', device='cpu', compute_type='int8')"

WORKDIR /app
# Monorepo build context (root): install + build the Node worker that drives the python tools.
COPY . .
RUN corepack enable && npm ci && npm --workspace apps/worker run build

# The media worker entrypoint — consumes the media queue (media_extract) only.
CMD ["node", "apps/worker/dist/media.js"]
