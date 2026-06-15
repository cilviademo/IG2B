// Wave 6 — the dedicated Docker media-worker entrypoint. It consumes ONLY the media
// queue (MEDIA_QUEUE) and handles `media_extract`: fetch captions or transcribe via
// yt-dlp + ffmpeg + faster-whisper, write the transcript back onto the capture, then
// enqueue `media_ingest` (main queue) so the EXISTING synthesis handler turns it into
// knowledge through governedComplete (budget + privacy gated). Capture is instant;
// this is async + best-effort and degrades honestly — never fabricates a transcript.
//
// Runs in apps/media-worker/Dockerfile (Node + python3 + ffmpeg + yt-dlp + whisper),
// NOT in the in-process API worker. Wired only when MEDIA_WORKER=on (see render.yaml).
import * as repo from "@indigold/db";
import { consume, enqueue, recoverStale, MEDIA_QUEUE, isResearchSafe, planIntake, type Job } from "@indigold/shared";
import {
  makeWorkDir, cleanup, fetchCaptions, downloadAudio, normalizeToWav,
  probeRemoteDurationSec, probeDurationSec, transcribeWav,
} from "./lib/extract";

const MAX_MINUTES = Number(process.env.MEDIA_MAX_MINUTES || 30);
const ADVANCED = process.env.MEDIA_ADVANCED === "on";
const TRANSCRIPT_CAP = 200_000; // chars stored on the capture

/** Hand the capture to the synthesis step. With no transcript, media_ingest creates an
 *  honest "transcript unavailable — stored as a link" node (never fabricated). */
async function handoffToSynthesis(userId: string, captureId: string) {
  const ij = await enqueue("media_ingest", userId, { captureId });
  await repo.jobs.record({ id: ij.id, user_id: userId, type: ij.type, status: "queued", payload: ij.payload });
}

const mediaExtract = async (job: Job): Promise<void> => {
  const { captureId } = job.payload as { captureId: string };
  const cap = await repo.captures.get(job.user_id, captureId);
  if (!cap) { await repo.jobs.finish(job.id, "skipped", undefined, "subject_not_found"); return; }

  const plan = planIntake({ url: cap.url, captureType: cap.type, text: cap.note, source: cap.source }, ADVANCED);
  const safe = isResearchSafe(cap.sensitivity); // secret/internal must not leave the box

  // Privacy: a remote third-party fetch on secret/internal content is not allowed —
  // synthesis will mark it "secret_kept_local". (Local transcription of an uploaded
  // asset would be fine, but we have no URL fetch path for that yet.)
  if (plan.externalFetch && !safe) {
    await handoffToSynthesis(job.user_id, captureId);
    await repo.jobs.finish(job.id, "done", { status: "secret_kept_local" });
    return;
  }
  // No URL → only an uploaded asset, which needs an R2 fetch path (follow-up). Degrade.
  if (!cap.url) {
    await handoffToSynthesis(job.user_id, captureId);
    await repo.jobs.finish(job.id, "done", { status: "no_url" });
    return;
  }

  const dir = await makeWorkDir();
  let transcript = "";
  let method = "";
  try {
    // 1) Captions-first for caption-bearing platforms (free, fast, no Whisper).
    if (plan.pipeline === "captions" || plan.kind === "youtube" || plan.kind === "vimeo") {
      const cc = await fetchCaptions(cap.url, dir);
      if (cc) { transcript = cc; method = "captions"; }
    }
    // 2) Otherwise (or if no captions) transcribe — when the path calls for it.
    if (!transcript && (plan.pipeline === "transcribe" || ADVANCED)) {
      const remoteDur = await probeRemoteDurationSec(cap.url);
      if (remoteDur && remoteDur > MAX_MINUTES * 60) {
        await handoffToSynthesis(job.user_id, captureId);
        await repo.jobs.finish(job.id, "done", { status: "too_long", duration_sec: remoteDur });
        return;
      }
      const audio = await downloadAudio(cap.url, dir);
      if (audio) {
        const wav = await normalizeToWav(audio, dir);
        const dur = await probeDurationSec(wav);
        if (dur && dur > MAX_MINUTES * 60) {
          await handoffToSynthesis(job.user_id, captureId);
          await repo.jobs.finish(job.id, "done", { status: "too_long", duration_sec: dur });
          return;
        }
        transcript = await transcribeWav(wav);
        method = "whisper";
      }
    }
  } catch (e) {
    console.error(`[media-worker] extract failed for ${captureId}:`, (e as Error)?.message);
  } finally {
    await cleanup(dir);
  }

  if (transcript.trim()) {
    await repo.captures.setTranscript(job.user_id, captureId, transcript.slice(0, TRANSCRIPT_CAP), {
      method, platform: plan.platform, kind: plan.kind,
    });
    await handoffToSynthesis(job.user_id, captureId);
    await repo.jobs.finish(job.id, "done", { status: "extracted", method, transcript_chars: transcript.length });
  } else {
    // Honest: nothing extracted (no captions, blocked fetch, or empty) → synthesis makes
    // the "transcript unavailable — stored as a link" node. Never fabricate.
    await handoffToSynthesis(job.user_id, captureId);
    await repo.jobs.finish(job.id, "done", { status: "no_transcript" });
  }
};

console.log(`[indigold-media-worker] starting; consuming ${MEDIA_QUEUE}; max ${MAX_MINUTES}min; advanced=${ADVANCED}`);

// Crash recovery: requeue any media jobs orphaned in :processing by a prior crash.
recoverStale(MEDIA_QUEUE).then((n) => { if (n) console.log(`[media-worker] recovered ${n} orphaned job(s)`); }).catch(() => {});

consume(
  async (job) => {
    if (job.type !== "media_extract") {
      console.warn("[media-worker] unexpected job type on media queue:", job.type);
      await repo.jobs.finish(job.id, "skipped", undefined, "wrong_queue").catch(() => {});
      return;
    }
    const t0 = Date.now();
    await mediaExtract(job);
    console.log(`[media-worker] media_extract ${job.id} done in ${Date.now() - t0}ms`);
  },
  {
    queue: MEDIA_QUEUE,
    onError: (e, job) => console.error(`[media-worker] job ${job?.id} failed:`, (e as Error)?.message),
  },
).catch((e) => {
  console.error("[media-worker] fatal:", e);
  process.exit(1);
});
