import { useEffect, useRef, useState } from "react";
import { useJson } from "@/hooks/useJson";
import { type GraphNode, type GraphEdge, type TruthLayer, TRUTH_LAYER_COLORS } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { Globe2, X, Plus, Minus, Locate, Layers } from "lucide-react";

const GRAPH_IMG = "/images/graph-constellation.png";
const HIGH_MVS = 85; // globes at/above this gently pulse
const CLUSTER_AUTO_AT = 40; // auto-cluster by layer above this node count

interface SimNode {
  node: GraphNode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  degree: number;
  phase: number;
}

type RGB = [number, number, number];
const hexToRgb = (hex: string): RGB => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lighten = (c: RGB, f: number): RGB => [
  Math.round(c[0] + (255 - c[0]) * f),
  Math.round(c[1] + (255 - c[1]) * f),
  Math.round(c[2] + (255 - c[2]) * f),
];
const darken = (c: RGB, f: number): RGB => [
  Math.round(c[0] * (1 - f)),
  Math.round(c[1] * (1 - f)),
  Math.round(c[2] * (1 - f)),
];
const LAYER_ORDER: TruthLayer[] = ["A", "B", "C", "D", "E", "F"];

export default function Atlas() {
  const nodesRes = useJson<{ nodes: GraphNode[] }>("/data/sample_nodes.json");
  const edgesRes = useJson<{ edges: GraphEdge[] }>("/data/sample_edges.json");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const selectedRef = useRef<string | null>(null);
  const clusterRef = useRef(false);
  const [cluster, setCluster] = useState(false);
  const apiRef = useRef<{ zoom: (f: number) => void; reset: () => void } | null>(null);

  useEffect(() => {
    selectedRef.current = selected?.id ?? null;
  }, [selected]);
  useEffect(() => {
    clusterRef.current = cluster;
  }, [cluster]);

  const nodes = nodesRes.data?.nodes;
  const edges = edgesRes.data?.edges;

  useEffect(() => {
    if (!nodes || !edges) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // auto-enable clustering for large graphs
    if (nodes.length > CLUSTER_AUTO_AT) {
      clusterRef.current = true;
      setCluster(true);
    }

    const dpr = window.devicePixelRatio || 1;
    let W = wrap.clientWidth;
    let H = wrap.clientHeight;

    // per-layer cluster centroids (recomputed on resize)
    const layersPresent = LAYER_ORDER.filter((L) => nodes.some((n) => n.truth_layer === L));
    let clusters: Record<string, { x: number; y: number }> = {};
    function computeClusters() {
      clusters = {};
      const R = Math.min(W, H) * 0.32;
      layersPresent.forEach((L, i) => {
        const a = (i / layersPresent.length) * Math.PI * 2 - Math.PI / 2;
        clusters[L] = { x: W / 2 + Math.cos(a) * R, y: H / 2 + Math.sin(a) * R };
      });
    }
    function sizeCanvas() {
      W = wrap!.clientWidth;
      H = wrap!.clientHeight;
      canvas!.width = W * dpr;
      canvas!.height = H * dpr;
      canvas!.style.width = W + "px";
      canvas!.style.height = H + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      computeClusters();
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

    const sim: SimNode[] = nodes.map((node, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      const deg = degree[node.id] || 0;
      return {
        node,
        x: W / 2 + Math.cos(a) * Math.min(W, H) * 0.32 + (Math.random() - 0.5) * 20,
        y: H / 2 + Math.sin(a) * Math.min(W, H) * 0.32 + (Math.random() - 0.5) * 20,
        vx: 0,
        vy: 0,
        r: 16 + deg * 3.2 + (node.mvs / 100) * 10,
        degree: deg,
        phase: Math.random() * Math.PI * 2,
      };
    });
    const byId = new Map(sim.map((s) => [s.node.id, s]));
    const links = edges.filter((e) => byId.has(e.source_id) && byId.has(e.target_id));

    const view = { scale: 1, tx: 0, ty: 0 };
    const hoverRef = { id: null as string | null };
    const screenToWorld = (px: number, py: number) => ({
      x: (px - view.tx) / view.scale,
      y: (py - view.ty) / view.scale,
    });
    function zoomAround(px: number, py: number, factor: number) {
      const ns = Math.max(0.4, Math.min(3, view.scale * factor));
      const f = ns / view.scale;
      view.tx = px - (px - view.tx) * f;
      view.ty = py - (py - view.ty) * f;
      view.scale = ns;
    }
    apiRef.current = {
      zoom: (f) => zoomAround(W / 2, H / 2, f),
      reset: () => {
        view.scale = 1;
        view.tx = 0;
        view.ty = 0;
      },
    };

    const pointers = new Map<number, { x: number; y: number }>();
    let dragNode: SimNode | null = null;
    let panning = false;
    let moved = false;
    let last = { x: 0, y: 0 };
    let pinchDist = 0;

    function localPoint(ev: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }
    function pick(px: number, py: number): SimNode | null {
      const w = screenToWorld(px, py);
      for (let i = sim.length - 1; i >= 0; i--) {
        const dx = sim[i].x - w.x;
        const dy = sim[i].y - w.y;
        if (dx * dx + dy * dy <= (sim[i].r + 6) * (sim[i].r + 6)) return sim[i];
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
        return;
      }
      const hit = pick(p.x, p.y);
      if (hit) dragNode = hit;
      else panning = true;
    }
    function onPointerMove(ev: PointerEvent) {
      const p = localPoint(ev);
      if (!pointers.has(ev.pointerId)) {
        if (ev.buttons === 0) {
          const hit = pick(p.x, p.y);
          hoverRef.id = hit ? hit.node.id : null;
          canvas!.style.cursor = hit ? "pointer" : "grab";
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
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
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
    }
    function onPointerUp(ev: PointerEvent) {
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
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);

    let raf = 0;
    let time = 0;
    function tick() {
      time += 0.045;
      const clustering = clusterRef.current;
      for (let i = 0; i < sim.length; i++) {
        for (let j = i + 1; j < sim.length; j++) {
          const a = sim[i];
          const b = sim[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          let d = Math.sqrt(d2);
          const f = 9000 / d2;
          a.vx += (dx / d) * f;
          a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f;
          b.vy -= (dy / d) * f;
          const minD = a.r + b.r + 14;
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
        const rest = a.r + b.r + 70;
        const f = (d - rest) * 0.015 * (0.5 + (e.weight || 0.5));
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      }
      for (const s of sim) {
        if (s === dragNode) continue;
        if (clustering) {
          const c = clusters[s.node.truth_layer] || { x: W / 2, y: H / 2 };
          s.vx += (c.x - s.x) * 0.022;
          s.vy += (c.y - s.y) * 0.022;
        } else {
          s.vx += (W / 2 - s.x) * 0.0016;
          s.vy += (H / 2 - s.y) * 0.0016;
        }
        s.vx *= 0.86;
        s.vy *= 0.86;
        s.vx = Math.max(-8, Math.min(8, s.vx));
        s.vy = Math.max(-8, Math.min(8, s.vy));
        s.x += s.vx;
        s.y += s.vy;
      }
      draw();
      raf = requestAnimationFrame(tick);
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      const { scale, tx, ty } = view;
      const active = selectedRef.current || hoverRef.id;
      const neighbors = active ? adj[active] : null;
      const isLit = (id: string) => !active || id === active || (neighbors ? neighbors.has(id) : false);

      // edges (curved)
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
        const off = Math.min(46, len * 0.12);
        const cx = mx + (-ey / len) * off;
        const cy = my + (ex / len) * off;

        if (active && !lit) {
          ctx!.strokeStyle = "rgba(120,120,170,0.05)";
          ctx!.lineWidth = 1;
        } else if (lit) {
          ctx!.strokeStyle = "rgba(212,175,71,0.6)";
          ctx!.lineWidth = 2;
        } else {
          ctx!.strokeStyle = `rgba(120,120,200,${0.1 + (e.weight || 0.3) * 0.18})`;
          ctx!.lineWidth = 1 + (e.weight || 0.3);
        }
        ctx!.beginPath();
        ctx!.moveTo(ax, ay);
        ctx!.quadraticCurveTo(cx, cy, bx, by);
        ctx!.stroke();

        // relationship label on lit edges
        if (lit) {
          const lx = 0.25 * ax + 0.5 * cx + 0.25 * bx;
          const ly = 0.25 * ay + 0.5 * cy + 0.25 * by;
          const text = e.relationship.replace(/_/g, " ");
          ctx!.font = '9px "JetBrains Mono", monospace';
          ctx!.textAlign = "center";
          const tw = ctx!.measureText(text).width;
          ctx!.fillStyle = "rgba(8,8,18,0.82)";
          ctx!.fillRect(lx - tw / 2 - 4, ly - 7, tw + 8, 14);
          ctx!.fillStyle = "rgba(232,201,100,0.95)";
          ctx!.fillText(text, lx, ly + 2.5);
        }
      }

      // nodes (smaller under larger)
      const order = [...sim].sort((p, q) => p.r - q.r);
      for (const s of order) {
        const sx = s.x * scale + tx;
        const sy = s.y * scale + ty;
        const sr = s.r * scale;
        const base = hexToRgb(TRUTH_LAYER_COLORS[s.node.truth_layer]);
        const lit = isLit(s.node.id);
        const alpha = lit ? 1 : 0.22;
        const pulse = s.node.mvs >= HIGH_MVS ? 0.5 + 0.5 * Math.sin(time + s.phase) : 0;
        drawGlobe(ctx!, sx, sy, sr, base, alpha, selectedRef.current === s.node.id, pulse);

        if (sr > 7) {
          const fs = Math.max(9, Math.min(15, 11 * scale));
          ctx!.font = `${fs}px "JetBrains Mono", monospace`;
          ctx!.textAlign = "center";
          let label = s.node.title;
          if (label.length > 20) label = label.slice(0, 19) + "…";
          ctx!.fillStyle = rgba([8, 8, 18], 0.85 * alpha);
          ctx!.fillText(label, sx, sy + sr + fs + 3);
          ctx!.fillStyle = rgba(lighten(base, 0.7), alpha);
          ctx!.fillText(label, sx, sy + sr + fs + 2);
        }
      }

      // cluster layer captions
      if (clusterRef.current) {
        ctx!.textAlign = "center";
        ctx!.font = '10px "JetBrains Mono", monospace';
        for (const L of layersPresent) {
          const c = clusters[L];
          if (!c) continue;
          const base = hexToRgb(TRUTH_LAYER_COLORS[L]);
          ctx!.fillStyle = rgba(lighten(base, 0.5), 0.85);
          ctx!.fillText(`LAYER ${L}`, c.x * scale + tx, c.y * scale + ty - Math.min(W, H) * 0.18 * scale);
        }
      }
    }

    tick();
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      apiRef.current = null;
    };
  }, [nodes, edges]);

  if (nodesRes.loading || edgesRes.loading) return <Loading label="Liminal Atlas" />;
  if (nodesRes.error || edgesRes.error || !nodes || !edges)
    return <ErrorState message={nodesRes.error ?? edgesRes.error ?? "no data"} />;

  return (
    <div className="relative" style={{ height: "calc(100dvh - 64px - env(safe-area-inset-top))" }}>
      <div
        ref={wrapRef}
        className="absolute inset-0 overflow-hidden"
        style={{ background: "radial-gradient(120% 120% at 50% 0%, oklch(0.95 0.01 280), oklch(0.96 0.006 280))" }}
      >
        <img
          src={GRAPH_IMG}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: 0.12 }}
        />
        <canvas ref={canvasRef} className="absolute inset-0 touch-none" style={{ cursor: "grab" }} />
      </div>

      <div
        className="absolute top-0 left-0 right-0 px-5 pt-4 pb-8 pointer-events-none"
        style={{ background: "linear-gradient(to bottom, oklch(0.985 0.004 280 / 0.9), transparent)" }}
      >
        <div className="flex items-center gap-2">
          <Globe2 size={16} style={{ color: "oklch(0.62 0.13 85)" }} />
          <span className="label-mono">Liminal Atlas</span>
          <span className="label-mono ml-auto">
            {nodes.length} nodes · {edges.length} edges
          </span>
        </div>
        <p className="label-mono mt-1" style={{ color: "oklch(0.55 0.015 280)" }}>
          tap a globe · drag to move · pinch / scroll to zoom
        </p>
      </div>

      <div className="absolute right-4 bottom-4 flex flex-col gap-2">
        <button
          aria-label="Cluster by Truth Layer"
          onClick={() => setCluster((c) => !c)}
          className="w-10 h-10 rounded-full flex items-center justify-center border-glow"
          style={{
            background: cluster ? "oklch(0.45 0.22 264 / 0.85)" : "oklch(0.97 0.006 280 / 0.92)",
            color: cluster ? "oklch(0.22 0.02 280)" : "oklch(0.38 0.02 280)",
            backdropFilter: "blur(8px)",
          }}
        >
          <Layers size={17} />
        </button>
        {[
          { icon: Plus, fn: () => apiRef.current?.zoom(1.25), label: "Zoom in" },
          { icon: Minus, fn: () => apiRef.current?.zoom(0.8), label: "Zoom out" },
          { icon: Locate, fn: () => apiRef.current?.reset(), label: "Reset view" },
        ].map(({ icon: Icon, fn, label }) => (
          <button
            key={label}
            aria-label={label}
            onClick={fn}
            className="w-10 h-10 rounded-full flex items-center justify-center border-glow"
            style={{ background: "oklch(0.97 0.006 280 / 0.92)", color: "oklch(0.38 0.02 280)", backdropFilter: "blur(8px)" }}
          >
            <Icon size={17} />
          </button>
        ))}
      </div>

      {selected && <NodeSheet node={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function drawGlobe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  base: RGB,
  alpha: number,
  selected: boolean,
  pulse: number,
) {
  if (r <= 0) return;
  // outer halo / glow — high-MVS nodes breathe
  const haloR = r * (2.6 + pulse * 0.5);
  const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, haloR);
  glow.addColorStop(0, rgba(base, (0.4 + pulse * 0.25) * alpha));
  glow.addColorStop(1, rgba(base, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();

  const hx = x - r * 0.34;
  const hy = y - r * 0.34;
  const sphere = ctx.createRadialGradient(hx, hy, r * 0.1, x, y, r);
  sphere.addColorStop(0, rgba(lighten(base, 0.6), alpha));
  sphere.addColorStop(0.45, rgba(base, alpha));
  sphere.addColorStop(1, rgba(darken(base, 0.5), alpha));
  ctx.fillStyle = sphere;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.strokeStyle = rgba(lighten(base, 0.45), 0.5 * alpha);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.55);
  spec.addColorStop(0, rgba([255, 255, 255], 0.55 * alpha));
  spec.addColorStop(1, rgba([255, 255, 255], 0));
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.55, 0, Math.PI * 2);
  ctx.fill();

  if (selected) {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "rgba(212,175,71,0.95)";
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function NodeSheet({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const color = TRUTH_LAYER_COLORS[node.truth_layer];
  return (
    <div className="absolute inset-0 z-40 flex items-end" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "oklch(0.45 0.03 280 / 0.4)" }} />
      <div
        className="relative w-full rounded-t-3xl p-5 safe-bottom animate-fade-in-up"
        style={{ background: "oklch(0.955 0.006 280)", border: "1px solid oklch(0.55 0.03 264 / 0.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4" style={{ color: "oklch(0.46 0.02 280)" }}>
          <X size={20} />
        </button>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wide"
            style={{ background: "oklch(0.45 0.22 264 / 0.2)", color: "oklch(0.5 0.2 264)" }}
          >
            {node.type}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono" style={{ background: color + "22", color }}>
            Layer {node.truth_layer} · {node.truth_label}
          </span>
        </div>
        <h2 className="text-lg mb-1.5">{node.title}</h2>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "oklch(0.38 0.02 280)" }}>
          {node.summary}
        </p>
        <div className="flex items-center gap-4">
          <div>
            <div className="label-mono">Memory Value</div>
            <div className="text-2xl glow-text-gold" style={{ color: "oklch(0.62 0.13 85)" }}>
              {node.mvs}
            </div>
          </div>
          <div className="flex-1">
            <div className="label-mono mb-1">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {node.tags.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: "oklch(0.93 0.008 280)", color: "oklch(0.46 0.02 280)" }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
