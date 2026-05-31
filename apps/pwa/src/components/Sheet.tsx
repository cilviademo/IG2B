import { X } from "lucide-react";
import type { ReactNode } from "react";

// Mobile-first bottom sheet. Sits above the tab bar (z-60).
export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 flex items-end"
      style={{ background: "oklch(0.04 0.02 280 / 0.6)", zIndex: 60 }}
      onClick={onClose}
    >
      <div
        className="relative w-full rounded-t-3xl p-5 safe-bottom animate-fade-in-up"
        style={{
          background: "oklch(0.12 0.02 280)",
          border: "1px solid oklch(0.2 0.04 264 / 0.5)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg">{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: "oklch(0.55 0.02 280)" }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
