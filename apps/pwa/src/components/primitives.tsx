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
    <button {...rest} style={{ ...base, ...variants[variant], ...style }}>
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

// 6px semantic status dot.
export function Dot({ color, size = 6, pulse }: { color: string; size?: number; pulse?: boolean }) {
  return (
    <span
      className={pulse ? "pulse-dot" : undefined}
      style={{ width: size, height: size, borderRadius: 999, background: color, display: "inline-block", flexShrink: 0 }}
    />
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
