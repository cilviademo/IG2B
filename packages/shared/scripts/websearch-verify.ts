// Web-search ToolAdapter — pure/no-network branches.  npx tsx packages/shared/scripts/websearch-verify.ts
import { makeWebSearchTool, webSearchConfigured, getTools } from "../src/providers";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => { c ? (pass++, console.log(`PASS  ${n}`)) : (fail++, console.log(`FAIL  ${n}${d ? " — " + d : ""}`)); };

const empty = {}; // no keys

ok("not configured without a key", webSearchConfigured(empty) === false);
ok("configured with TAVILY_API_KEY", webSearchConfigured({ TAVILY_API_KEY: "x" }) === true);
ok("configured with BRAVE_API_KEY", webSearchConfigured({ BRAVE_API_KEY: "x" }) === true);
ok("getTools exposes web_search adapter", getTools(empty).web_search?.name === "web_search");

(async () => {
  const tool = makeWebSearchTool(empty);
  const noQuery = await tool.run({});
  ok("empty query → error, no fabrication", noQuery.ok === false && noQuery.error === "web_search_missing_query");
  const noKey = await tool.run({ query: "anything" });
  ok("no key → not_configured (never fakes results)", noKey.ok === false && noKey.error === "web_search_not_configured");

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
