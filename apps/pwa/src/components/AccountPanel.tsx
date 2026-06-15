import { useState } from "react";
import { ShieldCheck, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Button, SectionRule } from "@/components/primitives";
import { accountEmail, isClaimed, claim, login, logout } from "@/lib/sync";
import { apiEnabled } from "@/lib/api";

// The durable identity. A real email + password means a reinstall or iOS storage
// wipe never loses your vault — you log back in and it's there — and iCloud
// Keychain autofills/syncs it across Safari + the installed PWA, so the two
// surfaces converge with no pairing codes. "Secure this vault" upgrades the
// current (anonymous) account in place, preserving its data.
export default function AccountPanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"secure" | "login">("secure");
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(isClaimed());
  const [err, setErr] = useState<string | null>(null); // persistent auth-debug line

  if (!apiEnabled()) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || password.length < 8) {
      setErr("Enter a valid email and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const r = mode === "secure" ? await claim(email.trim(), password) : await login(email.trim(), password);
      if (r.ok) {
        toast.success(mode === "secure" ? "Vault secured" : "Signed in", { description: `Recoverable on any device as ${r.email}.` });
        setClaimed(true);
        setPassword("");
        setErr(null);
      } else {
        setErr(r.error || "auth failed");
        toast.error(mode === "secure" ? "Couldn't secure vault" : "Couldn't sign in", { description: r.error });
      }
    } finally {
      setBusy(false);
    }
  }

  function onLogout() {
    logout();
    setClaimed(false);
    toast("Signed out", { description: "This surface will use a fresh account until you log back in." });
  }

  const inputStyle: React.CSSProperties = { background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--text)", fontSize: 14, padding: "10px 12px", width: "100%" };

  return (
    <div className="mt-6">
      <SectionRule label="Account" />

      {claimed ? (
        <>
          <div className="flex items-center gap-2 mt-3 mb-1">
            <ShieldCheck size={15} strokeWidth={1.5} style={{ color: "var(--good)" }} />
            <span style={{ fontSize: 14, color: "var(--text)" }}>Signed in</span>
          </div>
          <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-dim)" }}>
            <span className="font-mono" style={{ color: "var(--text)" }}>{accountEmail()}</span> — your vault is recoverable on any device by logging in with this email + password. iCloud Keychain keeps Safari and the installed app in sync.
          </p>
          <Button variant="ghost" full leftIcon={<LogOut size={14} strokeWidth={1.5} />} onClick={onLogout}>Sign out</Button>
        </>
      ) : (
        <>
          <p className="text-xs leading-relaxed mt-3 mb-2" style={{ color: "var(--text-dim)" }}>
            Secure your vault with an email + password so a reinstall or storage wipe never loses it. <strong style={{ color: "var(--text)" }}>Secure this vault</strong> keeps your current data; <strong style={{ color: "var(--text)" }}>Log in</strong> restores an existing vault on this surface.
          </p>
          <div className="flex gap-2 mb-2">
            {(["secure", "login"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="press flex-1 py-1.5 text-xs font-semibold"
                style={{ borderRadius: 8, border: `1px solid ${mode === m ? "var(--gold-line)" : "var(--line)"}`, color: mode === m ? "var(--gold)" : "var(--text-dim)" }}
              >
                {m === "secure" ? "Secure this vault" : "Log in"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="flex flex-col gap-2">
            <input type="email" inputMode="email" autoComplete="username" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <input type="password" autoComplete={mode === "secure" ? "new-password" : "current-password"} placeholder="password (8+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
            <Button variant="primary" full disabled={busy} type="submit">
              {busy ? "…" : mode === "secure" ? "Secure vault" : "Log in"}
            </Button>
          </form>
          {err && (
            <p className="text-xs leading-relaxed mt-2 p-2" style={{ borderRadius: 6, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--risk)" }}>
              {err}
            </p>
          )}
        </>
      )}
    </div>
  );
}
