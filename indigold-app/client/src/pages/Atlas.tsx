import { useEffect, useRef, useState } from "react";
import { useJson } from "@/hooks/useJson";
import { type GraphNode, type GraphEdge, TRUTH_LAYER_COLORS } from "@/lib/types";
import { Loading, ErrorState } from "@/components/State";
import { Globe2, X } from "lucide-react";

const GRAPH_IMG = "/images/graph-constellation.png";

interface SimNode {
  node: GraphNode;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export default function Atlas() {
  const nodesRes = useJson<{ nodes: GraphNode[] }>("/data/sample_nodes.json");
  const edgesRes = useJson<{ edges: GraphEdge[] }>("/data/sample_edges.json");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<GraphNode | null>(null);

  const nodes = nodesRes.data?.nodes;
  const edges = edgesRes.data?.edges;

  useEffect(() => {
    if (!nodes || !edges) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let W = wrap.clientWidth;
    let H = wrap.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.scale(dpr, dpr);

    const sim: SimNode[] = nodes.map((node, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      return {
        node,
        x: W / 2 + Math.cos(a) * Math.min(W, H) * 0.3,
        y: H / 2 + Math.sin(a) * Math.min(W, H) * 0.3,
        vx: 0,
        vy: 0,
        r: 6 + (node.mvs / 100) * 8,
      };
    });
    const byId = new Map(sim.map((s) => [s.node.id, s]));
    const links = edges.filter((e) => byId.has(e.source_id) && byId.has(e.target_id));

    let dragging: SimNode | null = null;
    let moved = false;
    let down: { x: number; y: number } | null = null;

    function pointFromEvent(ev: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }
    function pick(px: number, py: number): SimNode | null {
      for (let i = sim.length - 1; i >= 0; i--) {
        const dx = sim[i].x - px;
        const dy = sim[i].y - py;
        if (dx * dx + dy * dy <= (sim[i].r + 8) * (sim[i].r + 8)) return sim[i];
      }
      return null;
    }
    function onDown(ev: PointerEvent) {
      const p = pointFromEvent(ev);
      down = p;
      moved = false;
      dragging = pick(p.x, p.y);
      if (dragging) canvas!.setPointerCapture(ev.pointerId);
    }
    function onMove(ev: PointerEvent) {
      if (!dragging || !down) return;
      const p = pointFromEvent(ev);
      if (Math.abs(p.x - down.x) + Math.abs(p.y - down.y) > 6) moved = true;
      dragging.x = p.x;
      dragging.y = p.y;
      dragging.vx = 0;
      dragging.vy = 0;
    }
    function onUp() {
      if (dragging && !moved) setSelected(dragging.node);
      dragging = null;
      down = null;
    }
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    let raf = 0;
    function tick() {
      // Repulsion (Coulomb)
      for (let i = 0; i < sim.length; i++) {
        for (let j = i + 1; j < sim.length; j++) {
          const dx = sim[i].x - sim[j].x;
          const dy = sim[i].y - sim[j].y;
          const d2 = dx * dx + dy * dy || 0.01;
          const d = Math.sqrt(d2);
          const f = 2000 / d2;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          sim[i].vx += fx;
          sim[i].vy += fy;
          sim[j].vx -= fx;
          sim[j].vy -= fy;
        }
      }
      // Attraction (spring) along edges
      for (const e of links) {
        const a = byId.get(e.source_id)!;
        const b = byId.get(e.target_id)!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (d - 120) * 0.01;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      // Center gravity + integrate + damping + clamp
      for (const s of sim) {
        if (s === dragging) continue;
        s.vx += (W / 2 - s.x) * 0.001;
        s.vy += (H / 2 - s.y) * 0.001;
        s.vx *= 0.9;
        s.vy *= 0.9;
        s.x += s.vx;
        s.y += s.vy;
        s.x = Math.max(20, Math.min(W - 20, s.x));
        s.y = Math.max(20, Math.min(H - 20, s.y));
      }
      draw();
      raf = requestAnimationFrame(tick);
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      // edges
      ctx!.lineWidth = 1;
      ctx!.strokeStyle = "rgba(79, 70, 229, 0.15)";
      for (const e of links) {
        const a = byId.get(e.source_id)!;
        const b = byId.get(e.target_id)!;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.stroke();
      }
      // nodes
      for (const s of sim) {
        const color = TRUTH_LAYER_COLORS[s.node.truth_layer];
        // glow
        const grad = ctx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
        grad.addColorStop(0, color + "55");
        grad.addColorStop(1, color + "00");
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
        ctx!.fill();
        // core
        ctx!.fillStyle = color;
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fill();
        // label
        ctx!.fillStyle = "rgba(235, 235, 255, 0.85)";
        ctx!.font = '10px "JetBrains Mono", monospace';
        ctx!.textAlign = "center";
        let label = s.node.title;
        if (label.length > 16) label = label.slice(0, 15) + "…";
        ctx!.fillText(label, s.x, s.y + s.r + 12);
      }
    }

    tick();
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
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
        style={{ background: "oklch(0.08 0.02 280)" }}
      >
        <img
          src={GRAPH_IMG}
          alt=""
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: 0.15 }}
        />
        <canvas ref={canvasRef} className="absolute inset-0 touch-none" />
      </div>

      {/* header overlay */}
      <div
        className="absolute top-0 left-0 right-0 px-5 pt-4 pb-6 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, oklch(0.08 0.02 280 / 0.9), transparent)",
        }}
      >
        <div className="flex items-center gap-2">
          <Globe2 size={16} style={{ color: "oklch(0.78 0.14 85)" }} />
          <span className="label-mono">Liminal Atlas</span>
          <span className="label-mono ml-auto">
            {nodes.length} nodes · {edges.length} edges
          </span>
        </div>
      </div>

      {/* node detail bottom sheet */}
      {selected && <NodeSheet node={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function NodeSheet({ node, onClose }: { node: GraphNode; onClose: () => void }) {
  const color = TRUTH_LAYER_COLORS[node.truth_layer];
  return (
    <div className="absolute inset-0 z-40 flex items-end" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "oklch(0.04 0.02 280 / 0.6)" }} />
      <div
        className="relative w-full rounded-t-3xl p-5 safe-bottom animate-fade-in-up"
        style={{ background: "oklch(0.12 0.02 280)", border: "1px solid oklch(0.2 0.04 264 / 0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4" style={{ color: "oklch(0.55 0.02 280)" }}>
          <X size={20} />
        </button>
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wide"
            style={{ background: "oklch(0.45 0.22 264 / 0.2)", color: "oklch(0.6 0.2 264)" }}
          >
            {node.type}
          </span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-mono"
            style={{ background: color + "22", color }}
          >
            Layer {node.truth_layer} · {node.truth_label}
          </span>
        </div>
        <h2 className="text-lg mb-1.5">{node.title}</h2>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "oklch(0.75 0.01 280)" }}>
          {node.summary}
        </p>
        <div className="flex items-center gap-4 mb-3">
          <div>
            <div className="label-mono">Memory Value</div>
            <div className="text-2xl glow-text-gold" style={{ color: "oklch(0.78 0.14 85)" }}>
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
                  style={{ background: "oklch(0.14 0.02 280)", color: "oklch(0.55 0.02 280)" }}
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
