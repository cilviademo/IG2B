// indigold-radian — strategic intelligence / way-ahead / forecasting (PRIVATE).
// Thin HTTP wrapper over the shared intelligence core (also runnable in-process
// inside the API for the low-cost single-service topology).
import express from "express";
import { forecast } from "@indigold/shared/intelligence";

const app = express();
app.use(express.json({ limit: "8mb" }));

app.use((req, res, next) => {
  const expected = process.env.INTERNAL_TOKEN;
  if (expected && req.path !== "/health" && req.header("x-internal") !== expected)
    return res.status(403).json({ error: "forbidden" });
  next();
});

app.get("/health", (_req, res) => res.json({ ok: true, service: "indigold-radian" }));

app.post("/forecast", (req, res) => {
  const payload = forecast(req.body?.nodes ?? [], req.body?.edges ?? [], req.body?.horizon ?? "week");
  res.json({ payload });
});

const port = Number(process.env.PORT || 7101);
app.listen(port, () => console.log(`[indigold-radian] listening on :${port}`));
