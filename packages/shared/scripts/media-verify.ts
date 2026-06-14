// Wave 6 media-worker captions parser — pure.  npx tsx packages/shared/scripts/media-verify.ts
import { subtitleToText } from "../src/intake-router";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// WebVTT with header, timing cues and inline tags.
const vtt = [
  "WEBVTT", "Kind: captions", "Language: en", "",
  "00:00:00.000 --> 00:00:02.000",
  "Hello and <c>welcome</c> back", "",
  "00:00:02.000 --> 00:00:04.000",
  "to the show", "",
].join("\n");
ok("vtt → clean text", subtitleToText(vtt) === "Hello and welcome back to the show");

// SRT with numeric indices.
const srt = ["1", "00:00:01,000 --> 00:00:02,000", "First line", "", "2", "00:00:02,000 --> 00:00:03,000", "Second line"].join("\n");
ok("srt → strips indices + cues", subtitleToText(srt) === "First line Second line");

// Auto-captions repeat the rolling line — adjacent dups collapse.
const dup = ["WEBVTT", "", "00:00:00.000 --> 00:00:01.000", "the quick brown", "", "00:00:01.000 --> 00:00:02.000", "the quick brown", "", "00:00:02.000 --> 00:00:03.000", "fox jumps"].join("\n");
ok("collapses adjacent duplicate cues", subtitleToText(dup) === "the quick brown fox jumps");

// Entities + whitespace normalized; empty → empty.
ok("nbsp + whitespace normalized", subtitleToText("WEBVTT\n\n00:00 --> 00:01\na&nbsp;&nbsp;b   c") === "a b c");
ok("empty subtitle → empty string", subtitleToText("WEBVTT\n\n") === "");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
