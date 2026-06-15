import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronRight, ExternalLink, MessageCircle, FileText, Globe, Sparkles, Cpu } from "lucide-react";

// Evidence Drawer (Intelligence review): exposes the provenance behind a Radian answer —
// vault sources vs external sources, and whether it was deterministic or model-reasoned, with
// the grounding. Collapsible so the answer stays clean; tap to see "why these sources."
export interface EvidenceDrawerProps {
  sources?: { id?: string; title: string; url?: string }[];
  grounding?: string;
  provider?: string;
  deterministic?: boolean;
  usedWeb?: boolean;
  webNote?: string;
  onDiscuss?: (nodeId: string, title: string) => void;
}

const GROUND_LABEL: Record<string, string> = { vault: "Vault-grounded", mixed: "General + your vault", general: "General reasoning — not live web-verified" };

export default function EvidenceDrawer({ sources = [], grounding, provider, deterministic, usedWeb, webNote, onDiscuss }: EvidenceDrawerProps) {
  const [open, setOpen] = useState(false);
  const vault = sources.filter((s) => !s.url);
  const external = sources.filter((s) => s.url);
  const total = sources.length;
  const reasoning = deterministic ? "Deterministic (no model)" : provider && provider !== "deterministic" ? `Reasoned · ${provider}` : "Reasoned";

  return (
    <div className="mt-2" style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
      <button onClick={() => setOpen((o) => !o)} className="press inline-flex items-center gap-1 cap-data" style={{ color: "var(--text-dim)" }}>
        {open ? <ChevronDown size={12} strokeWidth={1.5} /> : <ChevronRight size={12} strokeWidth={1.5} />}
        Sources &amp; provenance{total ? ` · ${total}` : ""}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {vault.length > 0 && (
            <div>
              <div className="cap-data mb-1 inline-flex items-center gap-1" style={{ color: "var(--text-dim)" }}><FileText size={10} strokeWidth={1.5} /> From your vault</div>
              <div className="flex flex-wrap gap-1.5">
                {vault.map((s, i) => (
                  <button key={i} onClick={() => s.id && onDiscuss?.(s.id, s.title)} disabled={!s.id || !onDiscuss} className="press inline-flex items-center gap-1 text-[11px] px-2 py-0.5 truncate" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--text-dim)", maxWidth: 200 }}>
                    <MessageCircle size={9} strokeWidth={1.5} /> {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          {external.length > 0 && (
            <div>
              <div className="cap-data mb-1 inline-flex items-center gap-1" style={{ color: "var(--text-dim)" }}><Globe size={10} strokeWidth={1.5} /> From the web</div>
              <div className="flex flex-wrap gap-1.5">
                {external.map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1 text-[11px] px-2 py-0.5 truncate" style={{ borderRadius: 6, border: "1px solid var(--line)", color: "var(--info)", maxWidth: 220 }}>
                    <ExternalLink size={9} strokeWidth={1.5} /> {s.title}
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="cap-data flex items-center gap-2 flex-wrap" style={{ color: "var(--text-dim)" }}>
            <span className="inline-flex items-center gap-1">{deterministic ? <Cpu size={10} strokeWidth={1.5} /> : <Sparkles size={10} strokeWidth={1.5} />} {reasoning}</span>
            {grounding && <span>· {GROUND_LABEL[grounding] || grounding}</span>}
            {usedWeb && <span style={{ color: "var(--good)" }}>· web-verified</span>}
          </div>
          {webNote && <p className="cap-data" style={{ color: "var(--text-dim)" }}>{webNote}</p>}
          {total === 0 && !grounding && <p className="cap-data" style={{ color: "var(--text-dim)" }}>No external sources — answered from reasoning.</p>}
          <Link href="/research" className="press cap-data inline-block" style={{ color: "var(--gold)" }}>Open Research Inbox →</Link>
        </div>
      )}
    </div>
  );
}
