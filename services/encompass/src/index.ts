// indigold-encompass — retrieval, context assembly, graph intelligence (PRIVATE).
// Thin HTTP wrapper over the shared intelligence core (also runnable in-process
// inside the API for the low-cost single-service topology).
import express from "express";
import { assemble, retrieve } from "@indigold/shared/intelligence";

const app = express();
app.use(express.json({ limit: "8mb" }));

app.use((req, res, next) => {
  const expected = process.env.INTERNAL_TOKEN;
  if (expected && req.path !== "/health" && req.header("x-internal") !== expected)
    return res.status(403).json({ error: "forbidden" });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "indigold-encompass" }));

app.post("/retrieve", (req, res) => {
  res.json({ results: retrieve(String(req.body?.query || ""), req.body?.nodes ?? []) });
});

app.post("/assemble", (req, res) => {
  res.json(assemble({ purpose: req.body?.purpose, tokenBudget: Number(req.body?.tokenBudget) || 4000, nodes: req.body?.nodes ?? [], edges: req.body?.edges ?? [] }));
});

const port = Number(process.env.PORT || 7102);
app.listen(port, () => console.log(`[indigold-encompass] listening on :${port}`));
