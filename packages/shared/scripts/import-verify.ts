// Vault import/restore normalization — pure.  npx tsx packages/shared/scripts/import-verify.ts
import { normalizeImportNode, normalizeImportCapture, normalizeImportTimeline } from "../src/importmap";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

// Node: defaults fill in for a sparse record; ids/owner are set by the importer.
const n0 = normalizeImportNode({}, "node_new", "u1");
ok("node defaults: type/layer/label/mvs/tags", n0.type === "concept" && n0.truth_layer === "C" && n0.truth_label === "Knowledge" && n0.mvs === 50 && n0.tags.length === 0);
ok("node uses provided id + user", n0.id === "node_new" && n0.user_id === "u1");
const n1 = normalizeImportNode({ type: "project", title: "BTZ", mvs: 88, tags: ["a", 2] }, "x", "u1");
ok("node preserves provided fields", n1.type === "project" && n1.title === "BTZ" && n1.mvs === 88);
ok("node coerces tags to strings", n1.tags.length === 2 && n1.tags.every((t) => typeof t === "string"));
ok("node bad mvs → 50", normalizeImportNode({ mvs: "oops" }, "x", "u1").mvs === 50);

// Capture: Truth Layer A, original id preserved, safe defaults, null assets when absent.
const c0 = normalizeImportCapture({ id: "cap_1", title: "Note", note: "body" }, "u1");
ok("capture preserves original id (round-trip)", c0.id === "cap_1");
ok("capture is always Truth Layer A", c0.truth_layer === "A");
ok("capture defaults type/source/sensitivity/status", c0.type === "manual_text" && c0.source === "import" && c0.sensitivity === "internal" && c0.status === "inbox");
ok("capture null url/screenshot when absent", c0.url === null && c0.screenshot_ref === null);
const c1 = normalizeImportCapture({ id: "c2", type: "web_link", url: "https://x.com", sensitivity: "secret" }, "u9");
ok("capture preserves url + sensitivity + owner", c1.url === "https://x.com" && c1.sensitivity === "secret" && c1.user_id === "u9");

// Timeline: enum-validated with safe defaults; node_id remapped to the new node id.
const t0 = normalizeImportTimeline({ id: "tl1", title: "Launch", type: "bogus", significance: "weird" }, "u1", () => null);
ok("timeline preserves id + safe enum defaults", t0.id === "tl1" && t0.type === "milestone" && t0.significance === "medium");
ok("timeline null node_id when none", t0.node_id === null);
const t1 = normalizeImportTimeline({ id: "t2", type: "insight", significance: "high", node_id: "oldNode" }, "u1", (o) => (o === "oldNode" ? "newNode" : null));
ok("timeline keeps valid enums", t1.type === "insight" && t1.significance === "high");
ok("timeline remaps node_id via resolver", t1.node_id === "newNode");
ok("timeline drops node_id that no longer resolves", normalizeImportTimeline({ node_id: "gone" }, "u1", () => null).node_id === null);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
