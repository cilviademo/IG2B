# Wave 6 — Media Intelligence Engine: Step 1 binary spike (feasibility)

`Last updated: 2026-06-14 · Commit: wave6-media · By: claude (Claude Code)`

> Branch `claude/wave6-media`. **Spike only — no pipeline built.** Goal of this step: prove
> yt-dlp + FFmpeg + faster-whisper install and run in a real deploy-like env, get real CPU
> timings, and define the `render.yaml`/Dockerfile impact. **Stop after this for owner review.**

## What ran in the sandbox (a 4-core/16GB Linux x64 container — NOT Render)

| Tool | Result |
|---|---|
| **FFmpeg** | ✅ Installed (apt) `6.1.1`; audio extract/normalize works — synthesized 60s of real speech (espeak-ng) → `-ar 16000 -ac 1` WAV end-to-end. |
| **yt-dlp** | ✅ Installs + runs (`2026.06.09`). ⚠️ **YouTube extraction BLOCKED here** — "Failed to extract any player response" on every player_client (android/ios/tv/web_safari/mweb). This is YouTube's **datacenter-IP anti-bot**, the exact fragility the directive warns about. |
| **faster-whisper + ctranslate2** | ✅ Install + import OK (`ctranslate2 4.8.0`). ❌ **Model download BLOCKED** — `huggingface.co` is not in the sandbox **network egress allowlist** ("Host not in allowlist"), so `WhisperModel("base")` can't fetch weights. |

## The two blockers are ENVIRONMENT, not the tools

1. **HuggingFace egress** is blocked by this sandbox's allowlist → I could **not** run a real
   transcription, so **I have NOT measured timings and will not fabricate them.**
2. **YouTube extraction** is blocked from this datacenter IP → couldn't fetch live media.

Both are network-policy artifacts. They also flag two **real Render risks** (below).

## Real timings — MUST be measured on the Render image (owner runs)

I won't invent measured numbers. For planning, faster-whisper `base`/INT8/CPU runs at roughly
**0.2–0.5× real-time per core** on a modern x86 core (i.e. ~2–5× faster than the audio length),
but on Render's **free/shared-CPU** tiers expect it to be **much slower — plausibly slower than
real-time** (a 60s clip could take 1–3 min; a 30-min podcast 30–90+ min). These are *estimates
from published benchmarks*, not measurements. **Gate the build on the owner running this exact
spike on the real worker image:**

```
# on the Render media worker (Docker shell), with the model baked in:
ffmpeg -y -stream_loop 20 -i line.wav -ar 16000 -ac 1 -t 60 a60.wav
python3 - <<'PY'
import time; from faster_whisper import WhisperModel
m = WhisperModel("base", device="cpu", compute_type="int8")
for f,d in [("a60.wav",60),("a1800.wav",1800)]:
    t=time.time(); list(m.transcribe(f, beam_size=1)[0]); print(f, (time.time()-t), "s for", d, "s audio")
PY
```
Record real-time-factor (RTF). If RTF > ~0.5 on the chosen plan, cap media length and/or move
to a `small`/larger box, or make transcription opt-in for long media.

## render.yaml / Dockerfile impact (the key architectural finding)

**The current embedded worker can't do this.** The worker runs **in-process inside the Node
`indigold-api` service** (low-cost profile) — a Node runtime with **no Python, ffmpeg, yt-dlp,
or whisper**, and Render's native Node env has no apt. So Wave 6 needs **a dedicated
Docker-based worker service** that:
- consumes the **same Redis queue** but only handles the new `media_ingest` job,
- ships the binaries in its image, and
- **bakes the Whisper model into the image** (so there's no per-cold-start HF download and it
  works behind strict egress — solves blocker #1 for transcription).

Draft image at `apps/media-worker/Dockerfile` (this branch, not wired). render.yaml would add:

```yaml
  - type: worker
    name: indigold-media-worker
    env: docker
    plan: standard          # CPU transcription needs real CPU/RAM; NOT free-tier
    dockerfilePath: ./apps/media-worker/Dockerfile
    envVars:
      - { key: REDIS_URL, fromService: { name: indigold-cache, type: keyvalue, property: connectionString } }
      - { key: DATABASE_URL, fromDatabase: { name: indigold-db, property: connectionString } }
      - { key: ANTHROPIC_API_KEY, sync: false }   # synthesis via the SAME governedComplete path
      - { key: MEDIA_WHISPER_MODEL, value: base }
      - { key: MEDIA_MAX_MINUTES, value: "30" }    # duration guardrail
```
**Egress:** the environment's network policy must allow the media platforms (YouTube/IG/TikTok)
for yt-dlp. HuggingFace is avoided at runtime by baking the model. **Cost:** a Docker worker on
`standard` is **not free** — this is the real cost of self-hosted media intelligence; flag for the owner.

## Honesty posture carried into the build (when greenlit)
- Capture stays instant; `media_ingest` is async + best-effort; failure → "transcription
  unavailable — stored as link," never fabricated content (the directive's rule).
- Synthesis goes through `governedComplete` (budget governor + deterministic floor + privacy
  gate: secret/internal media never leaves the box — Whisper is local anyway).
- Lifecycle (Queued/Running/Transcribing/Synthesizing/Done/Failed) rides the **Task Center
  notification spine** (now reliable post-stabilization).

## Verdict / recommendation
**Feasible, with two caveats the owner must resolve first:** (1) stand up the Docker media
worker on a paid plan and **run the real timing spike** (don't build the pipeline until RTF is
acceptable); (2) confirm/own the **egress + yt-dlp fragility** for the target platforms
(YouTube datacenter blocking is real; captions-first mitigates YouTube but not Reels/TikTok).
Recommended first build step once greenlit: **YouTube captions-first** (no transcription, no HF,
proves the synthesis wiring cheaply), then the audio/Whisper path. **STOPPING here per the directive.**
