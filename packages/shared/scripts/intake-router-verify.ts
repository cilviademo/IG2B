// Wave 6 Universal Intake Router tests — pure.  npx tsx packages/shared/scripts/intake-router-verify.ts
import { detectIntake, planIntake, DEGRADATION_ORDER } from "../src/intake-router";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// Detection by URL host.
ok("youtube detected", detectIntake({ url: "https://www.youtube.com/watch?v=abc" }).kind === "youtube");
ok("youtu.be detected", detectIntake({ url: "https://youtu.be/abc" }).kind === "youtube");
ok("tiktok detected", detectIntake({ url: "https://www.tiktok.com/@x/video/1" }).kind === "tiktok");
ok("instagram reel detected", detectIntake({ url: "https://www.instagram.com/reel/x/" }).kind === "reel");
ok("vimeo detected", detectIntake({ url: "https://vimeo.com/123" }).kind === "vimeo");
ok("reddit detected", detectIntake({ url: "https://reddit.com/r/x/comments/y" }).kind === "reddit");
ok("bare url", detectIntake({ url: "https://example.com" }).kind === "url");
// Detection by mime/filename.
ok("audio upload", detectIntake({ mime: "audio/mpeg", filename: "ep.mp3" }).kind === "audio");
ok("voice memo by name", detectIntake({ filename: "voice memo.m4a" }).kind === "voice_memo");
ok("video upload", detectIntake({ mime: "video/mp4", filename: "clip.mp4" }).kind === "video");
ok("pdf", detectIntake({ filename: "paper.pdf" }).kind === "pdf");
ok("screenshot by name", detectIntake({ mime: "image/png", filename: "Screenshot 2026.png" }).kind === "screenshot");
ok("plain text", detectIntake({ text: "a short thought" }).kind === "text");

// Planning — safest path + honest degradation.
const yt = planIntake({ url: "https://youtu.be/x" });
ok("youtube → captions-first, no transcription", yt.pipeline === "captions" && yt.needsTranscription === false && yt.degradeTo === "metadata_only");
const reel = planIntake({ url: "https://instagram.com/reel/x" });
ok("reel default → metadata only (no scrape)", reel.pipeline === "metadata_only" && reel.advancedOnly === true);
const reelAdv = planIntake({ url: "https://instagram.com/reel/x" }, true);
ok("reel advanced opt-in → transcribe", reelAdv.pipeline === "transcribe" && reelAdv.needsTranscription === true);
const audio = planIntake({ mime: "audio/mp4", filename: "memo.m4a" });
ok("audio → transcribe (media worker)", audio.pipeline === "transcribe" && audio.needsTranscription === true);
const url = planIntake({ url: "https://example.com/x" });
ok("url → safe metadata fetch, externalFetch true", url.pipeline === "url" && url.externalFetch === true);
const txt = planIntake({ text: "idea" });
ok("text → text pipeline, no external fetch", txt.pipeline === "text" && txt.externalFetch === false);
ok("every plan has an honest degradeTo", [yt, reel, audio, url, txt].every((p) => !!p.degradeTo));
ok("degradation order ends at metadata_only", DEGRADATION_ORDER[DEGRADATION_ORDER.length - 1] === "metadata_only");

ok("captureType instagram_reel → reel", detectIntake({ captureType: "instagram_reel" }).kind === "reel");
ok("captureType voice_memo → voice_memo", detectIntake({ captureType: "voice_memo" }).kind === "voice_memo");
ok("web_link still refines to youtube by host", detectIntake({ captureType: "web_link", url: "https://youtu.be/x" }).kind === "youtube");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
