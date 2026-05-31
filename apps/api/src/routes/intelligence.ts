import { Router } from "express";
import * as repo from "@indigold/db";
import { id, addUsage, getUsage } from "@indigold/shared";
import { radian, encompass } from "../lib/services";
import type { Authed } from "../middleware/auth";

// ---- context packs (Encompass) ----
export const contextRouter = Router();
contextRouter.get("/", async (req: Authed, res) => res.json({ items: await repo.contextPacks.list(req.userId!) }));
contextRouter.get("/:id", async (req: Authed, res) => {
  const p = await repo.contextPacks.get(req.userId!, req.params.id);
  return p ? res.json(p) : res.status(404).json({ error: "not_found" });
});
contextRouter.post("/", async (req: Authed, res) => {
  const purpose = (req.body?.purpose as string) || "Working context";
  const tokenBudget = Number(req.body?.token_budget) || 4000;
  const nodes = await repo.nodes.list(req.userId!);
  const edges = await repo.edges.list(req.userId!);
  try {
    const pack = await encompass.assemble({ purpose, tokenBudget, nodes, edges });
    const stored = {
      id: id("ctx"),
      user_id: req.userId!,
      title: pack.title,
      purpose: pack.purpose,
      token_budget: pack.token_budget,
      source_nodes: pack.source_nodes,
      sections: pack.sections as never,
    };
    await repo.contextPacks.create(stored);
    await addUsage(req.userId!, { apiCalls: 1, tokens: pack.token_budget.used });
    res.status(201).json(stored);
  } catch (e) {
    res.status(502).json({ error: "encompass_unavailable", detail: String(e) });
  }
});

// ---- briefs (Radian) ----
export const briefsRouter = Router();
briefsRouter.get("/", async (req: Authed, res) => res.json({ items: await repo.briefs.list(req.userId!) }));
briefsRouter.post("/forecast", async (req: Authed, res) => {
  const nodes = await repo.nodes.list(req.userId!);
  const edges = await repo.edges.list(req.userId!);
  try {
    const { payload } = await radian.forecast({ nodes, edges, horizon: req.body?.horizon || "week" });
    const brief = { id: id("brief"), user_id: req.userId!, kind: "forecast" as const, period: new Date().toISOString().slice(0, 10), payload };
    await repo.briefs.create(brief);
    await addUsage(req.userId!, { apiCalls: 1 });
    res.status(201).json(brief);
  } catch (e) {
    res.status(502).json({ error: "radian_unavailable", detail: String(e) });
  }
});

// ---- usage (token budget) ----
export const usageRouter = Router();
usageRouter.get("/", async (req: Authed, res) => {
  const dailyBudget = Number(process.env.DAILY_TOKEN_BUDGET || 200000);
  const u = await getUsage(req.userId!);
  res.json({ ...u, dailyBudget, remaining: Math.max(0, dailyBudget - u.tokens) });
});
