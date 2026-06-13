// Event Store read API (Cognition Wave A). The events themselves are append-only;
// this is read-only. Replay a capture's full lifecycle by correlation_id.
import { Router } from "express";
import * as repo from "@indigold/db";
import type { Authed } from "../middleware/auth";

export const eventsRouter = Router();

// Recent events for the owner (activity feed substrate).
eventsRouter.get("/", async (req: Authed, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  res.json({ items: await repo.events.recent(req.userId!, limit) });
});

// Counts by type (Meta/analytics substrate).
eventsRouter.get("/summary", async (req: Authed, res) => {
  res.json({ by_type: await repo.events.countByType(req.userId!) });
});

// Replay: the full ordered lifecycle of one correlation id (usually a capture).
eventsRouter.get("/correlation/:id", async (req: Authed, res) => {
  const items = await repo.events.byCorrelation(req.params.id);
  const mine = items.filter((e) => !e.user_id || e.user_id === req.userId);
  res.json({ correlation_id: req.params.id, count: mine.length, items: mine });
});

// All events touching one subject.
eventsRouter.get("/subject/:type/:id", async (req: Authed, res) => {
  const items = await repo.events.bySubject(req.params.type, req.params.id);
  res.json({ items: items.filter((e) => !e.user_id || e.user_id === req.userId) });
});
