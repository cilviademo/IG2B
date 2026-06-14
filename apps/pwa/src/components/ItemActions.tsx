import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";

// Reusable item-actions menu (Issue 6) — a kebab that opens a small action sheet. One
// component for every entity (captures, nodes, quests, results…). Destructive actions
// confirm; callers wire the verbs they support. Keeps actions consistent + ≥44px targets.
export interface ItemAction {
  label: string;
  icon: typeof X;
  onClick: () => void | Promise<void>;
  tone?: "default" | "danger";
  confirm?: string; // if set, window.confirm(...) gates the action
}

export default function ItemActions({ actions }: { actions: ItemAction[] }) {
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;
  return (
    <>
      <button onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label="Item actions" className="tap-target press" style={{ color: "var(--text-dim)" }}>
        <MoreHorizontal size={18} strokeWidth={1.5} />
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end" style={{ background: "rgba(8,9,12,0.5)" }} onClick={() => setOpen(false)}>
          <div className="w-full p-3 safe-bottom animate-fade-in-up" style={{ background: "var(--surface)", borderTopLeftRadius: 14, borderTopRightRadius: 14, borderTop: "1px solid var(--line)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="cap-data" style={{ color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Actions</span>
              <button onClick={() => setOpen(false)} aria-label="Close" className="tap-target" style={{ color: "var(--text-dim)" }}><X size={18} strokeWidth={1.5} /></button>
            </div>
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  onClick={async () => { if (a.confirm && !window.confirm(a.confirm)) return; setOpen(false); await a.onClick(); }}
                  className="press w-full flex items-center gap-3 px-3 text-left"
                  style={{ minHeight: 48, fontSize: 15, color: a.tone === "danger" ? "var(--risk)" : "var(--text)", borderRadius: 8 }}
                >
                  <Icon size={17} strokeWidth={1.5} style={{ color: a.tone === "danger" ? "var(--risk)" : "var(--text-dim)" }} />
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
