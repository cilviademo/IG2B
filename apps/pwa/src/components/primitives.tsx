// Indigold "Vault" shared primitives. Token-driven (CSS vars) so they render
// correctly in both dark (default) and light themes. Radius scale: 6px buttons/
// inputs, 10px true cards, 0 for rules. One gold primary max per screen.

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "text";

export function Button({
  variant = "ghost",
  full,
  leftIcon,
  children,
  style,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; full?: boolean; leftIcon?: ReactNode }) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 600,
    padding: "10px 14px",
    minHeight: 44,
    width: full ? "100%" : undefined,
    transition: "border-color 160ms ease, background 160ms ease, opacity 160ms ease",
  };
  const variants: Record<Variant, React.CSSProperties> = {
    primary: { background: "var(--gold)", color: "#161118", border: "1px solid var(--gold)" },
    ghost: { background: "transparent", color: "var(--text)", border: "1px solid var(--line)" },
    text: { background: "transparent", color: "var(--gold)", border: "1px solid transparent", padding: "8px 6px", minHeight: 36 },
  };
  return (
    <button {...rest} className={`press ${className ?? ""}`} style={{ ...base, ...variants[variant], ...style }}>
      {leftIcon}
      {children}
    </button>
  );
}

// A hairline-separated, optionally-tappable list row.
export function Row({
  children,
  onClick,
  last,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  last?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 0",
        minHeight: 44,
        borderBottom: last ? "none" : "1px solid var(--line)",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// A hairline rule, optionally labelled with a quiet eyebrow.
export function SectionRule({ label }: { label?: string }) {
  if (!label) return <hr className="rule" />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
      <span style={{ fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{label}</span>
      <hr className="rule" style={{ flex: 1 }} />
    </div>
  );
}

// 6px semantic status indicator. `shape` makes status distinguishable WITHOUT relying
// on colour alone (colour-blind safe): dot = neutral/good, square = info, triangle =
// risk/warning. Defaults to a dot for back-compat.
export function Dot({ color, size = 6, pulse, shape = "dot" }: { color: string; size?: number; pulse?: boolean; shape?: "dot" | "square" | "triangle" }) {
  const cls = pulse ? "pulse-dot" : undefined;
  if (shape === "triangle") {
    // CSS triangle via borders — the bottom border carries the colour.
    return (
      <span
        className={cls}
        aria-hidden
        style={{ width: 0, height: 0, borderLeft: `${size * 0.62}px solid transparent`, borderRight: `${size * 0.62}px solid transparent`, borderBottom: `${size * 1.1}px solid ${color}`, display: "inline-block", flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      className={cls}
      aria-hidden
      style={{ width: size, height: size, borderRadius: shape === "square" ? 1 : 999, background: color, display: "inline-block", flexShrink: 0 }}
    />
  );
}

// Inviting empty/sparse state — never "gray text that reads as broken". A soft gold
// ring around an icon, a display-face headline, one sentence of why-it's-empty, and an
// optional primary action. Used wherever a live-vault surface has nothing yet.
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="animate-fade-in-up" style={{ textAlign: "center", padding: "var(--s-7) var(--s-4)", maxWidth: 340, margin: "0 auto" }}>
      {icon && (
        <div
          style={{
            width: 56, height: 56, margin: "0 auto var(--s-4)", borderRadius: 999,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "var(--gold-soft)", border: "1px solid var(--gold-line)", color: "var(--gold)",
          }}
        >
          {icon}
        </div>
      )}
      <h3 className="font-display" style={{ fontSize: "var(--t-3)", color: "var(--text)", marginBottom: "var(--s-2)" }}>{title}</h3>
      {children && <p style={{ fontSize: "var(--t-2)", color: "var(--text-dim)", lineHeight: 1.55 }}>{children}</p>}
      {action && <div style={{ marginTop: "var(--s-4)" }}>{action}</div>}
    </div>
  );
}

// 10px hairline-border chip (no fill).
export function Chip({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        lineHeight: 1.4,
        padding: "2px 8px",
        borderRadius: 6,
        border: `1px solid ${color || "var(--line)"}`,
        color: color || "var(--text-dim)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

// A genuine card surface (use sparingly — only for interactive objects).
export function Card({ children, onClick, style }: { children: ReactNode; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 10,
        padding: 16,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Mono data figure with a quiet label beneath (e.g. a stat).
export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div>
      <div className="font-data" style={{ fontSize: 22, color: "var(--text)", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{label}</div>
    </div>
  );
}
