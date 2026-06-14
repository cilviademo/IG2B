// Wave 6 — media extraction primitives. These shell out to binaries that ONLY exist
// in the dedicated Docker media-worker image (apps/media-worker/Dockerfile): yt-dlp,
// ffmpeg/ffprobe, and python3 + faster-whisper. They are never called from the
// in-process API worker. Everything is best-effort and degrades honestly — a failure
// returns null/throws and the caller falls back to an honest "stored as a link" node.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { subtitleToText } from "@indigold/shared";

const PY_SCRIPT = process.env.MEDIA_TRANSCRIBE_PY || path.resolve("apps/media-worker/transcribe.py");

interface RunResult { stdout: string; stderr: string }

/** Run a binary with an argument list (no shell — avoids injection) and a timeout. */
function run(cmd: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stderr }));
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export async function makeWorkDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "ig-media-"));
}

export async function cleanup(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** Captions-first (YouTube/Vimeo): fetch human or auto subtitles, no transcription.
 *  Cheap, fast, no Whisper, no HuggingFace — the recommended first proof. */
export async function fetchCaptions(url: string, dir: string): Promise<string | null> {
  const out = path.join(dir, "cc.%(ext)s");
  try {
    await run("yt-dlp", [
      "--skip-download", "--write-subs", "--write-auto-subs",
      "--sub-langs", "en.*,en", "--sub-format", "vtt/srt/best",
      "--no-playlist", "-o", out, url,
    ], 90_000);
  } catch {
    return null; // no captions / fetch blocked → caller degrades
  }
  const files = (await readdir(dir)).filter((f) => f.startsWith("cc.") && /\.(vtt|srt)$/i.test(f));
  if (!files.length) return null;
  const text = subtitleToText(await readFile(path.join(dir, files[0]), "utf8"));
  return text.length > 0 ? text : null;
}

/** Best-effort remote duration (seconds) WITHOUT downloading — a guard against pulling
 *  hours of media. Returns null if unknown. */
export async function probeRemoteDurationSec(url: string): Promise<number | null> {
  try {
    const { stdout } = await run("yt-dlp", ["--no-playlist", "--print", "%(duration)s", "--skip-download", url], 60_000);
    const n = parseInt(stdout.trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Download the best audio stream for a URL into the work dir. Returns the file path. */
export async function downloadAudio(url: string, dir: string): Promise<string | null> {
  const out = path.join(dir, "src.%(ext)s");
  try {
    await run("yt-dlp", ["-f", "bestaudio/best", "--no-playlist", "-o", out, url], 300_000);
  } catch {
    return null;
  }
  const files = (await readdir(dir)).filter((f) => f.startsWith("src."));
  return files.length ? path.join(dir, files[0]) : null;
}

/** Normalize any audio/video file to 16kHz mono WAV (what Whisper expects). */
export async function normalizeToWav(input: string, dir: string): Promise<string> {
  const wav = path.join(dir, "audio.wav");
  await run("ffmpeg", ["-y", "-i", input, "-vn", "-ar", "16000", "-ac", "1", wav], 300_000);
  return wav;
}

/** Local duration of a normalized file (seconds). */
export async function probeDurationSec(file: string): Promise<number | null> {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], 30_000);
    const n = parseFloat(stdout.trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Transcribe a 16kHz WAV with local faster-whisper (model baked into the image). */
export async function transcribeWav(wav: string, timeoutMs = 30 * 60_000): Promise<string> {
  const { stdout } = await run("python3", [PY_SCRIPT, wav], timeoutMs);
  return stdout.trim();
}
