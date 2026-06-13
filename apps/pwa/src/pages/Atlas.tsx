import { useEffect, useRef, useState } from "react";
import { useJson } from "@/hooks/useJson";
import { type GraphNode, type GraphEdge } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { Share2, X, Plus, Minus, Locate, Sparkles } from "lucide-react";
import CompanionPanel from "@/components/CompanionPanel";
import { deriveNodeState, NODE_STATE_STYLE, LEGEND, isForgottenGem, isResurfaced, type NodeState } from "@/lib/nodeState";
import { inferTracks, trackColor, type Track } from "@/lib/progression";
import { getQuestNodeStatus, getProgression, getLiveNodes, getLiveEdges } from "@/lib/api";

// Atlas — the constellation. Flat luminous points on a deep indigo-black field,
// hairline edges, organic force layout. Color encodes node type (a desaturated
// family); size encodes Memory Value (MVS) + degree. Selection is the only glow.

const NODE_COLOR: Record<string, string> = {
  project: "#EAE6DA", // cream
  person: "#4FA08B", // good/green
  concept: "#6B7DB3", // knowledge/blue
  resource: "#C9A45C", // theme/gold
};
const FALLBACK_COLOR = "#8E929C";
const FIELD = "#0C0D11";

interface SimNode {
  node: GraphNode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  degree: number;
}

type RGB = [number, number, number];
const hexToRgb = (hex: string): RGB => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const darken = (c: RGB, f: number): RGB => [Math.round(c[0] * (1 - f)), Math.round(c[1] * (1 - f)), Math.round(c[2] * (1 - f))];

// Optional synthetic graph for perf testing: /atlas?synthetic=200
function syntheticGraph(n: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const types = ["project", "person", "concept", "resource"] as const;
  const nodes: GraphNode[] = Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    type: types[i % types.length],
    title: `Node ${i}`,
    summary: "Synthetic perf node.",
    truth_layer: "C",
    truth_label: "Knowledge",
    mvs: 40 + ((i * 37) % 60),
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    tags: [],
  }));
  const edges: GraphEdge[] = [];
  for (let i = 1; i < n; i++) {
    edges.push({ source_id: `s${i}`, target_id: `s${(i * 7) % i}`, relationship: "linked", valid_from: "2026-01-01", label: "" });
  }
  return { nodes, edges };
}

export default function Atlas() {
  const params = new URLSearchParams(window.location.search);
  const synthetic = Number(params.get("synthetic") || 0);
  const focusId = params.get("focus");
  const nodesRes = useJson<{ nodes: GraphNode[] }>(synthetic ? "" : "/data/sample_nodes.json");
  const edgesRes = useJson<{ edges: GraphEdge[] }>(synthetic ? "" : "/data/sample_edges.json");
  // Live graph: when the API is reachable, the Atlas shows YOUR real vault (so quest
  // badges land on real nodes and "View on Atlas" resolves). Falls back to the bundled
  // sample when offline/standalone.
  const [live, setLive] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [companion, setCompanion] = useState<GraphNode | null>(null);
  const selectedRef = useRef<string | null>(null);
  const focusRef = useRef<string | null>(focusId);
  const apiRef = useRef<{ zoom: (f: number) => void; reset: () => void; redraw: () => void; focus: (id: string) => void } | null>(null);
  // G4 progress layer (live API only): active-quest diamonds, completed checkmarks,
  // and project-momentum badges (keyed by node title == registry project name).
  const questActiveRef = useRef<Set<string>>(new Set());
  const questDoneRef = useRef<Set<string>>(new Set());
  const momentumRef = useRef<Map<string, { badge: string; color: string }>>(new Map());
  const [hintOff, setHintOff] = useState(() => localStorage.getItem("indigold_atlas_hint") === "off");

  useEffect(() => {
    if (synthetic) return;
    let cancelled = false;
    (async () => {
      const [nr, er] = await Promise.all([getLiveNodes(), getLiveEdges()]);
      const n = nr?.nodes as GraphNode[] | undefined;
      const e = er?.edges as GraphEdge[] | undefined;
      if (!cancelled && n && e && n.length) setLive({ nodes: n, edges: e });
    })();
    return () => { cancelled = true; };
  }, [synthetic]);

  useEffect(() => {
    selectedRef.current = selected?.id ?? null;
  }, [selected]);

  // Best-effort: pull quest node status + project momentum, then redraw the badges.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [status, prog] = await Promise.all([getQuestNodeStatus(), getProgression()]);
      if (cancelled) return;
      if (status) { questActiveRef.current = new Set(status.active); questDoneRef.current = new Set(status.completed); }
      const p = prog as { projects?: { name: string; badge: string; color: string }[] } | null;
      if (p?.projects) momentumRef.current = new Map(p.projects.map((x) => [x.name, { badge: x.badge, color: x.color }]));
      apiRef.current?.redraw();
    })();
    return () => { cancelled = true; };
  }, []);

  const g = synthetic ? syntheticGraph(synthetic) : null;
  // Live vault wins when present; else the bundled sample (or synthetic for perf tests).
  const nodes = g ? g.nodes : (live?.nodes ?? nodesRes.data?.nodes);
  const edges = g ? g.edges : (live?.edges ?? edgesRes.data?.edges);

  useEffect(() => {
    if (!nodes || !edges) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const dpr = window.devicePixelRatio || 1;
    let W = wrap.clientWidth;
    let H = wrap.clientHeight;

    function sizeCanvas() {
      W = wrap!.clientWidth;
      H = wrap!.clientHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    sizeCanvas();

    const degree: Record<string, number> = {};
    edges.forEach((e) => {
      degree[e.source_id] = (degree[e.source_id] || 0) + 1;
      degree[e.target_id] = (degree[e.target_id] || 0) + 1;
    });
    const adj: Record<string, Set<string>> = {};
    nodes.forEach((n) => (adj[n.id] = new Set()));
    edges.forEach((e) => {
      adj[e.source_id]?.add(e.target_id);
      adj[e.target_id]?.add(e.source_id);
    });

    // Living node states — computed once at render time from the graph we already
    // hold (no model calls). Pulse only applies when motion is allowed.
    const now = Date.now();
    const stateById = new Map<string, NodeState>();
    nodes.forEach((n) => stateById.set(n.id, deriveNodeState(n, edges, now)));
    // G8 Memory Palace overlays (render-time, deterministic):
    //  · cluster = dominant skill track → "galaxy" tint + constellation edges
    //  · forgotten gems (high value gone quiet) glow gold
    //  · resurfaced ideas (old, freshly touched) pulse
    const dayms = 86400000;
    const recencyOf = (n: GraphNode) => { const u = (n as { updated_at?: string }).updated_at; return u ? (now - new Date(u).getTime()) / dayms : 999; };
    const createdOf = (n: GraphNode) => { const c = (n as { created_at?: string }).created_at; return c ? (now - new Date(c).getTime()) / dayms : 999; };
    const clusterById = new Map<string, { track: Track; color: string }>();
    const gemById = new Set<string>();
    const resurfacedById = new Set<string>();
    nodes.forEach((n) => {
      const track = inferTracks(n.title, n.tags || [])[0] as Track;
      clusterById.set(n.id, { track, color: trackColor(track) });
      if (isForgottenGem(n.mvs, recencyOf(n))) gemById.add(n.id);
      if (isResurfaced(createdOf(n), recencyOf(n))) resurfacedById.add(n.id);
    });
    const hasPulse = !reduceMotion && (resurfacedById.size > 0 || nodes.some((n) => NODE_STATE_STYLE[stateById.get(n.id)!].pulse));

    // Flat points: radius 3–8px by MVS + a gentle degree boost.
    const sim: SimNode[] = nodes.map((node, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      const deg = degree[node.id] || 0;
      return {
        node,
        x: W / 2 + Math.cos(a) * Math.min(W, H) * 0.28 + (Math.random() - 0.5) * 24,
        y: H / 2 + Math.sin(a) * Math.min(W, H) * 0.28 + (Math.random() - 0.5) * 24,
        vx: 0,
        vy: 0,
        r: 3 + (node.mvs / 100) * 4 + Math.min(deg, 6) * 0.4,
        degree: deg,
      };
    });
    const byId = new Map(sim.map((s) => [s.node.id, s]));
    const links = edges.filter((e) => byId.has(e.source_id) && byId.has(e.target_id));
    // Top-N by MVS — these get labels at mid zoom.
    const topIds = new Set([...sim].sort((p, q) => q.node.mvs - p.node.mvs).slice(0, Math.min(6, sim.length)).map((s) => s.node.id));

    const view = { scale: 1, tx: 0, ty: 0 };
    const hoverRef = { id: null as string | null };
    const screenToWorld = (px: number, py: number) => ({ x: (px - view.tx) / view.scale, y: (py - view.ty) / view.scale });
    function zoomAround(px: number, py: number, factor: number) {
      const ns = Math.max(0.4, Math.min(4, view.scale * factor));
      const f = ns / view.scale;
      view.tx = px - (px - view.tx) * f;
      view.ty = py - (py - view.ty) * f;
      view.scale = ns;
      kick();
    }
    apiRef.current = {
      zoom: (f) => zoomAround(W / 2, H / 2, f),
      reset: () => {
        view.scale = 1;
        view.tx = 0;
        view.ty = 0;
        kick();
      },
      redraw: () => kick(),
      // Center + select a node by id (used by "View on Atlas" deep links). Clears the
      // pending focus only on success, so a focus survives the sample→live graph swap.
      focus: (fid: string) => {
        const s = byId.get(fid);
        if (!s) return;
        view.scale = 1.8;
        view.tx = W / 2 - s.x * view.scale;
        view.ty = H / 2 - s.y * view.scale;
        setSelected(s.node);
        focusRef.current = null;
        kick();
      },
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let dragNode: SimNode | null = null;
    let panning = false;
    let moved = false;
    let last = { x: 0, y: 0 };
    let pinchDist = 0;
    let longPress: number | null = null;
    const clearLongPress = () => {
      if (longPress !== null) {
        clearTimeout(longPress);
        longPress = null;
      }
    };

    function localPoint(ev: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }
    function pick(px: number, py: number): SimNode | null {
      const w = screenToWorld(px, py);
      // Generous tap target (>=44px) regardless of the small visual radius.
      const padW = Math.max(9, 22 / view.scale);
      for (let i = sim.length - 1; i >= 0; i--) {
        const dx = sim[i].x - w.x;
        const dy = sim[i].y - w.y;
        const t = sim[i].r + padW;
        if (dx * dx + dy * dy <= t * t) return sim[i];
      }
      return null;
    }
    function onPointerDown(ev: PointerEvent) {
      const p = localPoint(ev);
      pointers.set(ev.pointerId, p);
      canvas!.setPointerCapture(ev.pointerId);
      moved = false;
      last = p;
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        dragNode = null;
        panning = false;
        clearLongPress();
        return;
      }
      const hit = pick(p.x, p.y);
      if (hit) {
        dragNode = hit;
        // Long-press a node → open the Companion Panel (phone-first interaction).
        clearLongPress();
        longPress = window.setTimeout(() => {
          longPress = null;
          if (!moved) {
            dragNode = null; // a long-press is intent to ask, not to drag
            setCompanion(hit.node);
          }
        }, 500);
      } else panning = true;
      kick();
    }
    function onPointerMove(ev: PointerEvent) {
      const p = localPoint(ev);
      if (!pointers.has(ev.pointerId)) {
        if (ev.buttons === 0) {
          const hit = pick(p.x, p.y);
          hoverRef.id = hit ? hit.node.id : null;
          canvas!.style.cursor = hit ? "pointer" : "grab";
          if (!frozen) kick();
        }
        return;
      }
      pointers.set(ev.pointerId, p);
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        if (pinchDist > 0) zoomAround(mid.x, mid.y, dist / pinchDist);
        pinchDist = dist;
        moved = true;
        return;
      }
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) {
        moved = true;
        clearLongPress();
      }
      if (dragNode) {
        const w = screenToWorld(p.x, p.y);
        dragNode.x = w.x;
        dragNode.y = w.y;
        dragNode.vx = 0;
        dragNode.vy = 0;
      } else if (panning) {
        view.tx += dx;
        view.ty += dy;
      }
      last = p;
      kick();
    }
    function onPointerUp(ev: PointerEvent) {
      clearLongPress();
      const p = pointers.get(ev.pointerId);
      pointers.delete(ev.pointerId);
      if (!moved && p && pointers.size === 0) {
        const hit = pick(p.x, p.y);
        setSelected(hit ? hit.node : null);
        hoverRef.id = hit ? hit.node.id : null;
      }
      if (pointers.size < 2) pinchDist = 0;
      if (pointers.size === 0) {
        dragNode = null;
        panning = false;
      }
      kick();
    }
    function onWheel(ev: WheelEvent) {
      ev.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      zoomAround(ev.clientX - rect.left, ev.clientY - rect.top, Math.exp(-ev.deltaY * 0.0015));
    }
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    const onResize = () => {
      sizeCanvas();
      kick();
    };
    window.addEventListener("resize", onResize);

    // Faint, static star speckle (seeded) — barely-there texture on the field.
    const stars = Array.from({ length: 64 }, (_, i) => {
      const s = Math.sin(i * 91.7) * 43758.5453;
      const rx = s - Math.floor(s);
      const s2 = Math.sin(i * 12.3) * 24634.633;
      const ry = s2 - Math.floor(s2);
      return { fx: rx, fy: ry, a: 0.04 + ((i % 5) / 5) * 0.06 };
    });

    // Continuous-but-settling simulation. We render on demand (a "kick" budget of
    // frames) so an idle, settled graph costs nothing — and reduced-motion freezes
    // drift entirely after warmup.
    let raf = 0;
    let energyFrames = reduceMotion ? 0 : 240; // frames left to keep simulating
    let frozen = false;
    function kick() {
      energyFrames = Math.max(energyFrames, reduceMotion ? 1 : 30);
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function step() {
      for (let i = 0; i < sim.length; i++) {
        for (let j = i + 1; j < sim.length; j++) {
          const a = sim[i];
          const b = sim[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy || 0.01;
          const d = Math.sqrt(d2);
          const f = 2600 / d2; // charge
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f;
          b.vy -= (dy / d) * f;
          const minD = a.r + b.r + 10; // collide
          if (d < minD) {
            const push = (minD - d) * 0.5;
            a.vx += (dx / d) * push;
            a.vy += (dy / d) * push;
            b.vx -= (dx / d) * push;
            b.vy -= (dy / d) * push;
          }
        }
      }
      for (const e of links) {
        const a = byId.get(e.source_id)!;
        const b = byId.get(e.target_id)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const rest = a.r + b.r + 42; // link
        const f = (d - rest) * 0.02 * (0.5 + (e.weight || 0.5));
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      for (const s of sim) {
        if (s === dragNode) continue;
        s.vx += (W / 2 - s.x) * 0.0018;
        s.vy += (H / 2 - s.y) * 0.0018;
        s.vx *= 0.85;
        s.vy *= 0.85;
        s.vx = Math.max(-8, Math.min(8, s.vx));
        s.vy = Math.max(-8, Math.min(8, s.vy));
        s.x += s.vx;
        s.y += s.vy;
      }
    }
    function tick() {
      if (reduceMotion && !frozen) {
        for (let k = 0; k < 220; k++) step(); // settle synchronously, once
        frozen = true;
      } else if (!frozen && energyFrames > 0) {
        step();
      }
      energyFrames--;
      draw();
      // Keep a gentle heartbeat alive when living nodes pulse (motion allowed only).
      if (energyFrames > 0 || dragNode || panning || hasPulse || (!reduceMotion && questActiveRef.current.size > 0)) raf = requestAnimationFrame(tick);
      else raf = 0;
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      // subtle radial vignette
      const vg = ctx!.createRadialGradient(W / 2, H * 0.32, Math.min(W, H) * 0.1, W / 2, H * 0.5, Math.max(W, H) * 0.8);
      vg.addColorStop(0, "#14161c");
      vg.addColorStop(1, FIELD);
      ctx!.fillStyle = vg;
      ctx!.fillRect(0, 0, W, H);
      for (const st of stars) {
        ctx!.fillStyle = rgba([234, 230, 218], st.a);
        ctx!.fillRect(st.fx * W, st.fy * H, 1, 1);
      }

      const { scale, tx, ty } = view;
      const active = selectedRef.current || hoverRef.id;
      const neighbors = active ? adj[active] : null;
      const isLit = (id: string) => !active || id === active || (neighbors ? neighbors.has(id) : false);

      // G8 galaxies — a soft nebula per skill-track cluster, drawn behind everything.
      // One radial gradient per cluster (≤8) → cheap; gives the "galaxy" depth.
      const gal: Record<string, { x: number; y: number; n: number; color: string }> = {};
      for (const s of sim) {
        const c = clusterById.get(s.node.id);
        if (!c) continue;
        const g = (gal[c.track] ||= { x: 0, y: 0, n: 0, color: c.color });
        g.x += s.x * scale + tx; g.y += s.y * scale + ty; g.n++;
      }
      for (const k of Object.keys(gal)) {
        const g = gal[k];
        if (g.n < 3) continue;
        const cx = g.x / g.n, cy = g.y / g.n;
        const rad = Math.min(280, (70 + g.n * 16) * Math.max(0.7, Math.min(1.4, scale)));
        const rgb = hexToRgb(g.color);
        const neb = ctx!.createRadialGradient(cx, cy, 0, cx, cy, rad);
        neb.addColorStop(0, rgba(rgb, 0.07));
        neb.addColorStop(1, rgba(rgb, 0));
        ctx!.fillStyle = neb;
        ctx!.beginPath();
        ctx!.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx!.fill();
      }

      // edges — hairlines (constellation lines tint to the cluster when both ends share it)
      for (const e of links) {
        const a = byId.get(e.source_id)!;
        const b = byId.get(e.target_id)!;
        const lit = !!active && (e.source_id === active || e.target_id === active);
        const ax = a.x * scale + tx;
        const ay = a.y * scale + ty;
        const bx = b.x * scale + tx;
        const by = b.y * scale + ty;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const ex = bx - ax;
        const ey = by - ay;
        const len = Math.hypot(ex, ey) || 1;
        const off = Math.min(28, len * 0.08);
        const cx = mx + (-ey / len) * off;
        const cy = my + (ex / len) * off;
        const ca = clusterById.get(e.source_id), cb = clusterById.get(e.target_id);
        const sameCluster = ca && cb && ca.track === cb.track;
        if (active && !lit) {
          ctx!.strokeStyle = rgba([142, 146, 156], 0.06);
          ctx!.lineWidth = 0.5;
        } else if (lit) {
          ctx!.strokeStyle = rgba([201, 164, 92], 0.6);
          ctx!.lineWidth = 1;
        } else if (sameCluster) {
          ctx!.strokeStyle = rgba(hexToRgb(ca!.color), 0.34); // constellation line
          ctx!.lineWidth = 0.7;
        } else {
          ctx!.strokeStyle = rgba([142, 146, 156], 0.18);
          ctx!.lineWidth = 0.6;
        }
        ctx!.beginPath();
        ctx!.moveTo(ax, ay);
        ctx!.quadraticCurveTo(cx, cy, bx, by);
        ctx!.stroke();
      }

      // a slow shared pulse phase (0..1), only when motion is allowed
      const motion = hasPulse || (!reduceMotion && questActiveRef.current.size > 0);
      const pulseT = motion ? (Math.sin(performance.now() * 0.0028) + 1) / 2 : 0;

      // nodes — flat luminous points
      for (const s of sim) {
        const sx = s.x * scale + tx;
        const sy = s.y * scale + ty;
        const sr = Math.max(2, s.r * Math.min(1.6, Math.max(0.85, scale)));
        const base = hexToRgb(NODE_COLOR[s.node.type] || FALLBACK_COLOR);
        const lit = isLit(s.node.id);
        const st = NODE_STATE_STYLE[stateById.get(s.node.id) || "stable"];
        const alpha = (lit ? 0.85 : 0.25) * st.dim;
        const isSel = selectedRef.current === s.node.id;

        // living-state glow — a soft colored halo whose strength breathes for
        // pulsing states (legendary/growing/critical). Suppressed for dimmed/far nodes.
        if (st.glow > 0 && st.ring && lit) {
          const ringRgb = hexToRgb(st.ring);
          const g = st.glow * (st.pulse ? 0.55 + pulseT * 0.45 : 1);
          const halo = ctx!.createRadialGradient(sx, sy, sr, sx, sy, sr * 3.4);
          halo.addColorStop(0, rgba(ringRgb, 0.28 * g));
          halo.addColorStop(1, rgba(ringRgb, 0));
          ctx!.fillStyle = halo;
          ctx!.beginPath();
          ctx!.arc(sx, sy, sr * 3.4, 0, Math.PI * 2);
          ctx!.fill();
        }

        // G8 — forgotten gems still GLOW (gold) even when dimmed, so high value gone
        // quiet draws the eye instead of disappearing.
        if (gemById.has(s.node.id)) {
          const gem = ctx!.createRadialGradient(sx, sy, sr, sx, sy, sr * 3.8);
          gem.addColorStop(0, rgba([230, 199, 110], 0.22));
          gem.addColorStop(1, rgba([230, 199, 110], 0));
          ctx!.fillStyle = gem;
          ctx!.beginPath();
          ctx!.arc(sx, sy, sr * 3.8, 0, Math.PI * 2);
          ctx!.fill();
        }
        // G8 — resurfaced ideas pulse: an expanding gold ring (motion only).
        if (resurfacedById.has(s.node.id) && motion && lit) {
          ctx!.strokeStyle = rgba([230, 199, 110], 0.5 * (1 - pulseT));
          ctx!.lineWidth = 1.25;
          ctx!.beginPath();
          ctx!.arc(sx, sy, sr + 4 + pulseT * 8, 0, Math.PI * 2);
          ctx!.stroke();
        }

        if (isSel) {
          // the only glow: soft gold halo + ring
          const halo = ctx!.createRadialGradient(sx, sy, sr, sx, sy, sr * 4.5);
          halo.addColorStop(0, rgba([201, 164, 92], 0.32));
          halo.addColorStop(1, rgba([201, 164, 92], 0));
          ctx!.fillStyle = halo;
          ctx!.beginPath();
          ctx!.arc(sx, sy, sr * 4.5, 0, Math.PI * 2);
          ctx!.fill();
        }

        ctx!.fillStyle = rgba(base, alpha);
        ctx!.beginPath();
        ctx!.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx!.fill();
        // 1px darker rim
        ctx!.lineWidth = 1;
        ctx!.strokeStyle = rgba(darken(base, 0.45), alpha);
        ctx!.beginPath();
        ctx!.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx!.stroke();

        // living-state ring — a thin colored emphasis ring (not the selection halo).
        if (st.ring && lit && !isSel) {
          const ringRgb = hexToRgb(st.ring);
          const ra = (st.pulse ? 0.55 + pulseT * 0.4 : 0.7);
          ctx!.lineWidth = 1.25;
          ctx!.strokeStyle = rgba(ringRgb, ra);
          ctx!.beginPath();
          ctx!.arc(sx, sy, sr + 3, 0, Math.PI * 2);
          ctx!.stroke();
        }
        // badge — a small marker for blocked (⊘) / critical (!) nodes.
        if (st.badge && lit && scale >= 0.85) {
          const bx = sx + sr + 4;
          const by = sy - sr - 4;
          ctx!.fillStyle = rgba(hexToRgb(st.ring || "#C25450"), 0.95);
          ctx!.font = '600 10px "Inter Tight", system-ui, sans-serif';
          ctx!.textAlign = "center";
          ctx!.fillText(st.badge, bx, by + 3);
        }

        // G4 progress layer — all static (reduced-motion safe), explained by the legend.
        if (lit && scale >= 0.85) {
          const qx = sx - sr - 5;
          const qy = sy - sr - 4;
          // active-quest gold diamond (top-left) — breathes when motion is allowed.
          if (questActiveRef.current.has(s.node.id)) {
            const d = 3.2 + pulseT * 1.1;
            ctx!.fillStyle = rgba([201, 164, 92], 0.6 + pulseT * 0.4);
            ctx!.beginPath();
            ctx!.moveTo(qx, qy - d); ctx!.lineTo(qx + d, qy); ctx!.lineTo(qx, qy + d); ctx!.lineTo(qx - d, qy);
            ctx!.closePath(); ctx!.fill();
          } else if (questDoneRef.current.has(s.node.id)) {
            // completed-quest green check (top-left)
            ctx!.strokeStyle = rgba([79, 160, 139], 0.95);
            ctx!.lineWidth = 1.4;
            ctx!.beginPath();
            ctx!.moveTo(qx - 3, qy); ctx!.lineTo(qx - 0.5, qy + 2.5); ctx!.lineTo(qx + 3.5, qy - 2.5);
            ctx!.stroke();
          }
          // project-momentum badge (bottom-right) for nodes that are registry projects
          const mom = momentumRef.current.get(s.node.title);
          if (mom) {
            ctx!.fillStyle = mom.color;
            ctx!.font = '600 9px "Inter Tight", system-ui, sans-serif';
            ctx!.textAlign = "center";
            ctx!.fillText(mom.badge, sx + sr + 5, sy + sr + 6);
          }
        }

        if (isSel) {
          ctx!.lineWidth = 1.5;
          ctx!.strokeStyle = rgba([201, 164, 92], 0.95);
          ctx!.beginPath();
          ctx!.arc(sx, sy, sr + 4, 0, Math.PI * 2);
          ctx!.stroke();
        }

        // labels obey zoom: none when far; top-N at mid; all/neighbors when close
        // or selected. 11px Inter Tight, dim, no glow.
        const showLabel =
          (active ? neighbors?.has(s.node.id) || s.node.id === active : false) ||
          (scale >= 1.6) ||
          (scale >= 0.95 && topIds.has(s.node.id));
        if (showLabel && !(active && !lit)) {
          ctx!.font = '11px "Inter Tight", system-ui, sans-serif';
          ctx!.textAlign = "center";
          let label = s.node.title;
          if (label.length > 22) label = label.slice(0, 21) + "…";
          ctx!.fillStyle = rgba([142, 146, 156], isSel ? 1 : 0.85);
          ctx!.fillText(label, sx, sy + sr + 13);
        }
      }
    }

    kick();
    if (reduceMotion) raf = requestAnimationFrame(tick);
    // Deep-link focus: center + select the requested node once the layout has settled.
    let focusTimer = 0;
    if (focusRef.current) {
      const fid = focusRef.current;
      if (reduceMotion) apiRef.current?.focus(fid);
      else focusTimer = window.setTimeout(() => apiRef.current?.focus(fid), 650);
    }
    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(focusTimer);
      clearLongPress();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      apiRef.current = null;
    };
  }, [nodes, edges]);

  if (!synthetic && (nodesRes.loading || edgesRes.loading)) return <Loading label="Liminal Atlas" />;
  if (!nodes || !edges) return <ErrorState message={nodesRes.error ?? edgesRes.error ?? "no data"} />;

  function dismissHint() {
    localStorage.setItem("indigold_atlas_hint", "off");
    setHintOff(true);
  }

  return (
    <div className="relative" style={{ height: "calc(100dvh - 64px - env(safe-area-inset-top))", background: FIELD }}>
      <div ref={wrapRef} className="absolute inset-0 overflow-hidden" style={{ background: FIELD }}>
        <canvas ref={canvasRef} className="absolute inset-0 touch-none" style={{ cursor: "grab" }} />
      </div>

      {/* Header — one quiet line; counts in mono */}
      <div className="absolute top-0 left-0 right-0 px-5 pt-4 pointer-events-none">
        <div className="flex items-center gap-2">
          <Share2 size={15} strokeWidth={1.5} style={{ color: "#C9A45C" }} />
          <span className="text-sm font-display" style={{ color: "#EAE6DA" }}>Liminal Atlas</span>
          <span className="cap-data ml-auto" style={{ color: "#8E929C" }}>
            {nodes.length} nodes · {edges.length} edges
          </span>
        </div>
        {!hintOff && (
          <div className="flex items-center gap-2 mt-2 pointer-events-auto">
            <span className="text-xs" style={{ color: "#8E929C" }}>Tap to focus · long-press to ask Radian · drag · pinch to zoom</span>
            <button onClick={dismissHint} aria-label="Dismiss hint" style={{ color: "#8E929C" }}>
              <X size={13} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {/* Controls — 36px ghost circles, hairline border, bottom-right */}
      <div className="absolute right-4 bottom-4 flex flex-col gap-2">
        {[
          { icon: Plus, fn: () => apiRef.current?.zoom(1.25), label: "Zoom in" },
          { icon: Minus, fn: () => apiRef.current?.zoom(0.8), label: "Zoom out" },
          { icon: Locate, fn: () => apiRef.current?.reset(), label: "Reset view" },
        ].map(({ icon: Icon, fn, label }) => (
          <button
            key={label}
            aria-label={label}
            onClick={fn}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(19,21,26,0.7)", border: "1px solid #22252D", color: "#8E929C", backdropFilter: "blur(8px)" }}
          >
            <Icon size={16} strokeWidth={1.5} />
          </button>
        ))}
      </div>

      {/* State legend — explainability for the living visuals (quiet, bottom-left) */}
      <StateLegend />

      {selected && (
        <NodeSheet
          node={selected}
          onClose={() => setSelected(null)}
          onAsk={() => {
            setCompanion(selected);
            setSelected(null);
          }}
        />
      )}

      {companion && (
        <CompanionPanel
          subjectType="node"
          subjectId={companion.id}
          title={companion.title}
          onClose={() => setCompanion(null)}
        />
      )}
    </div>
  );
}

function StateLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute left-4 bottom-4">
      {open ? (
        <div
          className="p-3 animate-fade-in-up"
          style={{ background: "rgba(19,21,26,0.82)", border: "1px solid #22252D", borderRadius: 10, backdropFilter: "blur(8px)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="cap-data" style={{ color: "#8E929C" }}>node states</span>
            <button onClick={() => setOpen(false)} aria-label="Hide legend" className="ml-auto" style={{ color: "#8E929C" }}>
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {LEGEND.map((s) => {
              const st = NODE_STATE_STYLE[s];
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: st.ring || "#3A3D45", boxShadow: st.glow ? `0 0 5px ${st.ring}` : undefined, opacity: st.dim }}
                  />
                  <span className="text-[11px]" style={{ color: "#8E929C" }}>{st.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 grid grid-cols-2 gap-x-4 gap-y-1.5" style={{ borderTop: "1px solid #22252D" }}>
            <div className="flex items-center gap-1.5">
              <span className="inline-block" style={{ width: 7, height: 7, background: "#C9A45C", transform: "rotate(45deg)" }} />
              <span className="text-[11px]" style={{ color: "#8E929C" }}>Active quest</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]" style={{ color: "#4FA08B" }}>✓</span>
              <span className="text-[11px]" style={{ color: "#8E929C" }}>Quest done</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]" style={{ color: "#C9A45C" }}>✦</span>
              <span className="text-[11px]" style={{ color: "#8E929C" }}>Project momentum</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px]" style={{ color: "#E6C76E" }}>◌</span>
              <span className="text-[11px]" style={{ color: "#8E929C" }}>Gem / resurfaced</span>
            </div>
          </div>
          <div className="mt-1.5 text-[11px]" style={{ color: "#8E929C" }}>Galaxies = skill clusters · constellation lines link a domain</div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="px-2.5 h-9 rounded-full text-[11px]"
          style={{ background: "rgba(19,21,26,0.7)", border: "1px solid #22252D", color: "#8E929C", backdropFilter: "blur(8px)" }}
        >
          states
        </button>
      )}
    </div>
  );
}

function NodeSheet({ node, onClose, onAsk }: { node: GraphNode; onClose: () => void; onAsk: () => void }) {
  const color = NODE_COLOR[node.type] || FALLBACK_COLOR;
  return (
    <div className="absolute inset-0 z-40 flex items-end" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(8,9,12,0.55)" }} />
      <div
        className="relative w-full p-5 safe-bottom animate-fade-in-up"
        style={{ background: "#13151A", borderTop: "1px solid #22252D", borderTopLeftRadius: 10, borderTopRightRadius: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4" style={{ color: "#8E929C" }}>
          <X size={18} strokeWidth={1.5} />
        </button>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          <span className="text-xs" style={{ color: "#8E929C" }}>{node.type}</span>
          <span className="cap-data" style={{ color: "#8E929C" }}>· Layer {node.truth_layer} · {node.truth_label}</span>
        </div>
        <h2 className="text-lg font-display mb-1.5" style={{ color: "#EAE6DA" }}>{node.title}</h2>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "#8E929C" }}>{node.summary}</p>
        <button
          onClick={onAsk}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold mb-4"
          style={{ borderRadius: 6, border: "1px solid #3A3320", color: "#C9A45C" }}
        >
          <Sparkles size={13} strokeWidth={1.5} /> Ask Radian
        </button>
        <div className="flex items-end gap-5">
          <div>
            <div className="text-xs mb-0.5" style={{ color: "#8E929C" }}>Memory value</div>
            <div className="text-2xl font-data" style={{ color: "#C9A45C" }}>{node.mvs}</div>
          </div>
          {node.tags.length > 0 && (
            <div className="flex-1">
              <div className="text-xs mb-1" style={{ color: "#8E929C" }}>Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {node.tags.map((t) => (
                  <span key={t} className="text-[11px] px-2 py-0.5" style={{ borderRadius: 6, border: "1px solid #22252D", color: "#EAE6DA" }}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
