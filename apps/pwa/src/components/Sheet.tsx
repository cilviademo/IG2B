import { X } from "lucide-react";
import type { ReactNode } from "react";

// Mobile-first bottom sheet. Sits above the tab bar (z-60).
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 flex items-end"
      style={{ background: "rgba(8,9,12,0.55)", zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="relative w-full p-5 safe-bottom animate-fade-in-up"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--line)",
          borderTopLeftRadius: 10,
          borderTopRightRadius: 10,
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display">{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: "var(--text-dim)" }}>
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
