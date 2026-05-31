// Zod request/response contracts used by the API for validation.
import { z } from "zod";

export const truthLayer = z.enum(["A", "B", "C", "D", "E", "F"]);
export const sensitivity = z.enum(["public", "internal", "private", "secret"]);

export const captureCreate = z.object({
  type: z.enum([
    "apple_note",
    "web_link",
    "instagram_reel",
    "threads_post",
    "screenshot",
    "voice_memo",
    "document",
    "llm_conversation",
    "manual_text",
  ]),
  source: z.string().min(1),
  title: z.string().min(1),
  note: z.string().default(""),
  url: z.string().url().optional().or(z.literal("")).optional(),
  screenshot_ref: z.string().optional(),
  sensitivity: sensitivity.default("private"),
  captured_at: z.string().optional(),
});

export const nodeCreate = z.object({
  type: z.enum(["project", "person", "concept", "resource"]),
  title: z.string().min(1),
  summary: z.string().default(""),
  truth_layer: truthLayer.default("C"),
  truth_label: z.string().default("Knowledge"),
  mvs: z.number().int().min(0).max(100).default(50),
  tags: z.array(z.string()).default([]),
});

export const edgeCreate = z.object({
  source_id: z.string(),
  target_id: z.string(),
  relationship: z.string().min(1),
  weight: z.number().min(0).max(1).optional(),
  valid_from: z.string().optional(),
  label: z.string().default(""),
});

export const authBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const importBody = z.object({
  nodes: z.array(z.record(z.unknown())).optional(),
  edges: z.array(z.record(z.unknown())).optional(),
  captures: z.array(z.record(z.unknown())).optional(),
  timeline: z.array(z.record(z.unknown())).optional(),
});

export type CaptureCreate = z.infer<typeof captureCreate>;
export type NodeCreate = z.infer<typeof nodeCreate>;
export type EdgeCreate = z.infer<typeof edgeCreate>;
export type AuthBody = z.infer<typeof authBody>;
