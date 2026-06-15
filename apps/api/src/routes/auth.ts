import { Router } from "express";
import { users, audit } from "@indigold/db";
import { contracts, token, id } from "@indigold/shared";
import { hashPassword, verifyPassword } from "../lib/password";
import { validate } from "../lib/validate";
import { requireAuth, type Authed } from "../middleware/auth";
import { putSession, dropSession } from "../lib/session";

const r = Router();

r.post("/register", validate(contracts.authBody), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const existing = await users.byEmail(email);
  if (existing) return res.status(409).json({ error: "email_in_use" });
  const user = await users.create({ id: id("user"), email, password_hash: await hashPassword(password) });
  if (!user) return res.status(500).json({ error: "create_failed" });
  const tok = token();
  await putSession(tok, { userId: user.id, email });
  await audit.log({ user_id: user.id, actor: "api", action: "register" });
  res.json({ token: tok, user: { id: user.id, email } });
});

r.post("/login", validate(contracts.authBody), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await users.byEmail(email);
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return res.status(401).json({ error: "invalid_credentials" });
  const tok = token();
  await putSession(tok, { userId: user.id, email });
  await audit.log({ user_id: user.id, actor: "api", action: "login" });
  res.json({ token: tok, user: { id: user.id, email } });
});

// Claim: turn the current (anonymous device) account into a recoverable one by
// setting a real email + password ON THE SAME user id — so all existing data is
// preserved and the vault can be reached later by login (the durable fix for the
// installed-PWA / Safari storage-wipe divergence).
r.post("/claim", requireAuth, validate(contracts.authBody), async (req: Authed, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const existing = await users.byEmail(email);
  if (existing && existing.id !== req.userId) return res.status(409).json({ error: "email_in_use" });
  try {
    const user = await users.claim(req.userId!, email, await hashPassword(password));
    if (!user) return res.status(500).json({ error: "claim_failed" });
  } catch {
    return res.status(409).json({ error: "email_in_use" });
  }
  const tok = token();
  await putSession(tok, { userId: req.userId!, email });
  await audit.log({ user_id: req.userId!, actor: "api", action: "claim" });
  res.json({ token: tok, user: { id: req.userId, email } });
});

r.post("/logout", requireAuth, async (req, res) => {
  const header = req.header("authorization") || "";
  await dropSession(header.slice(7));
  res.json({ ok: true });
});

r.get("/me", requireAuth, async (req: Authed, res) => {
  res.json({ id: req.userId, email: req.email });
});

export default r;
