// Shared constants used across client (and a future server).

export const APP_NAME = "Indigold";
export const APP_VERSION = "0.1.0";

export const ROUTES = {
  dashboard: "/",
  inbox: "/inbox",
  timeline: "/timeline",
  atlas: "/atlas",
  context: "/context",
  brief: "/brief",
  io: "/io",
} as const;

export type RouteKey = keyof typeof ROUTES;
