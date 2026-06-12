// RADIAN admin surface (Wave 0): Project Registry CRUD + budget/governor status.
// Everything keys off the registry, so it's editable at runtime without redeploy.
import { Router } from "express";
import * as repo from "@indigold/db";
import { seedProjectsIfEmpty, budgetStatus } from "@indigold/db";
import { id } from "@indigold/shared";
import type { Authed } from "../middleware/auth";

export const projectsRouter = Router();

// List (seeds the 8 default domains on first use — idempotent).
projectsRouter.get("/", async (req: Authed, res) => {
  await seedProjectsIfEmpty(req.userId!);
  res.json({ items: await repo.projects.list(req.userId!) });
});

// Create a new project/domain.
projectsRouter.post("/", async (req: Authed, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "name_required" });
  const pid = id("proj");
  await repo.projects.upsert({
    id: pid, user_id: req.userId!, name,
    description: String(req.body?.description || ""),
    status: req.body?.status === "dormant" ? "dormant" : "active",
    tags: Array.isArray(req.body?.tags) ? req.body.tags.map(String) : [],
    objectives: String(req.body?.objectives || ""),
  });
  res.status(201).json(await repo.projects.get(req.userId!, pid));
});

// Update objectives/status/tags/etc. (no DELETE — set status:"dormant" instead).
projectsRouter.patch("/:id", async (req: Authed, res) => {
  const existing = await repo.projects.get(req.userId!, req.params.id);
  if (!existing) return res.status(404).json({ error: "not_found" });
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "description", "status", "objectives"] as const) {
    if (typeof req.body?.[k] === "string") patch[k] = req.body[k];
  }
  if (Array.isArray(req.body?.tags)) patch.tags = req.body.tags.map(String);
  await repo.projects.patch(req.userId!, req.params.id, patch);
  res.json(await repo.projects.get(req.userId!, req.params.id));
});

export const radianRouter = Router();

// Budget governor + provider snapshot. Surfaces the REAL state (ok/degrade/block)
// and month-to-date spend so cost is never a silent surprise.
radianRouter.get("/status", async (req: Authed, res) => {
  res.json(await budgetStatus(req.userId!));
});
