import { useCallback, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

// Reusable open-state with localStorage persistence (per `persistKey`). Exposed as a
// hook so a panel can gate its data fetch on `open` (fetch ONLY when expanded — the
// Home fan-out fix) while CollapsibleSection renders the chevron in controlled mode.
export function useCollapsed(persistKey?: string, defaultOpen = true) {
  const storeKey = persistKey ? `indigold_collapse_${persistKey}` : null;
  const [open, setOpen] = useState(() => {
    if (!storeKey) return defaultOpen;
    const v = localStorage.getItem(storeKey);
    return v == null ? defaultOpen : v === "1";
  });
  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (storeKey) { try { localStorage.setItem(storeKey, next ? "1" : "0"); } catch { /* quota */ } }
      return next;
    });
  }, [storeKey]);
  return { open, toggle };
}

// A reusable show/hide section. The header is a tap target with a rotating chevron;
// the collapsed/expanded state persists in localStorage (per `persistKey`) so a hidden
// section stays hidden across reloads. Used across Mission Control, Quests and the
// Time Machine so any list-heavy surface can be tidied away. Pass `open`+`onToggle`
// (from `useCollapsed`) to run controlled so a parent can lazy-load on expand.
export default function CollapsibleSection({
  title,
  tint = "var(--text-dim)",
  action,
  persistKey,
  defaultOpen = true,
  open: openProp,
  onToggle,
  children,
}: {
  title: ReactNode;
  tint?: string;
  action?: ReactNode;
  persistKey?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  // Controlled (open prop supplied) vs. self-managed. The internal hook only persists
  // when self-managed — when controlled, the parent's useCollapsed owns persistence.
  const controlled = openProp !== undefined;
  const internal = useCollapsed(controlled ? undefined : persistKey, defaultOpen);
  const open = controlled ? openProp! : internal.open;
  const toggle = controlled ? (onToggle ?? (() => {})) : internal.toggle;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left py-0.5"
        >
          <ChevronDown
            size={13}
            strokeWidth={1.5}
            style={{ color: tint, transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform .15s ease", flexShrink: 0 }}
          />
          {title}
        </button>
        {action && <span className="shrink-0">{action}</span>}
      </div>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}
