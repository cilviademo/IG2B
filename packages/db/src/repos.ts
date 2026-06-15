// Thin repository layer over Postgres. Returns plain rows.
import { query } from "./client";
import { id, type IndigoldEvent, type EventType, type EventActor } from "@indigold/shared";
import type {
  Capture,
  GraphNode,
  GraphEdge,
  TimelineEvent,
  ContextPack,
  Brief,
  User,
} from "@indigold/shared/types";

// ---- users ----
export const users = {
  async create(u: { id: string; email: string; password_hash: string }) {
    await query(
      `INSERT INTO users (id, email, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO NOTHING`,
      [u.id, u.email, u.password_hash],
    );
    return this.byEmail(u.email);
  },
  async byEmail(email: string) {
    const r = await query<User & { password_hash: string }>(`SELECT * FROM users WHERE email=$1`, [email]);
    return r.rows[0] || null;
  },
  async byId(id: string) {
    const r = await query<User>(`SELECT id, email, created_at FROM users WHERE id=$1`, [id]);
    return r.rows[0] || null;
  },
  // Upgrade an (anonymous device) account in place: set a real email + password so
  // the SAME user id — and therefore all its data — becomes recoverable by login.
  async claim(userId: string, email: string, password_hash: string) {
    await query(`UPDATE users SET email=$2, password_hash=$3 WHERE id=$1`, [userId, email, password_hash]);
    return this.byId(userId);
  },
};

// ---- sessions (durable backstop; Redis stays the fast cache) ----
export const sessions = {
  async put(token: string, userId: string, email: string, ttlSec: number) {
    const expires = new Date(Date.now() + ttlSec * 1000).toISOString();
    await query(
      `INSERT INTO sessions (token, user_id, email, expires_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT (token) DO UPDATE SET user_id=$2, email=$3, expires_at=$4`,
      [token, userId, email, expires],
    );
  },
  async get(token: string) {
    const r = await query<{ user_id: string; email: string }>(
      `SELECT user_id, email FROM sessions WHERE token=$1 AND expires_at > now()`,
      [token],
    );
    return r.rows[0] || null;
  },
  async del(token: string) {
    await query(`DELETE FROM sessions WHERE token=$1`, [token]);
  },
};

// ---- conversations + messages (Sprint 3: durable threads) ----
export interface ConversationRow { id: string; user_id: string; title: string; anchor_type: string; anchor_id: string | null; status: string; created_at: string; updated_at: string }
export interface MessageRow { id: string; conversation_id: string; user_id: string; role: string; text: string; sources: unknown; meta: unknown; created_at: string }

export const conversations = {
  async create(c: { id: string; user_id: string; title: string; anchor_type?: string; anchor_id?: string | null }) {
    await query(
      `INSERT INTO conversations (id, user_id, title, anchor_type, anchor_id) VALUES ($1,$2,$3,$4,$5)`,
      [c.id, c.user_id, c.title.slice(0, 120), c.anchor_type ?? "open", c.anchor_id ?? null],
    );
    return this.get(c.user_id, c.id);
  },
  async list(userId: string, limit = 50) {
    const r = await query<ConversationRow>(`SELECT * FROM conversations WHERE user_id=$1 AND status<>'archived' ORDER BY updated_at DESC LIMIT $2`, [userId, limit]);
    return r.rows;
  },
  // Thread search (Sprint 3b): match the title OR any message text in the thread.
  // Case-insensitive substring; archived threads excluded; most-recent first.
  async search(userId: string, q: string, limit = 50) {
    const like = `%${q.replace(/[%_]/g, (m) => "\\" + m)}%`;
    const r = await query<ConversationRow>(
      `SELECT c.* FROM conversations c
         WHERE c.user_id=$1 AND c.status<>'archived'
           AND (c.title ILIKE $2 OR EXISTS (
             SELECT 1 FROM messages m WHERE m.conversation_id=c.id AND m.text ILIKE $2))
         ORDER BY c.updated_at DESC LIMIT $3`,
      [userId, like, limit],
    );
    return r.rows;
  },
  async get(userId: string, id: string) {
    const r = await query<ConversationRow>(`SELECT * FROM conversations WHERE user_id=$1 AND id=$2`, [userId, id]);
    return r.rows[0] || null;
  },
  async findAnchored(userId: string, anchorType: string, anchorId: string) {
    const r = await query<ConversationRow>(`SELECT * FROM conversations WHERE user_id=$1 AND anchor_type=$2 AND anchor_id=$3 AND status<>'archived' ORDER BY updated_at DESC LIMIT 1`, [userId, anchorType, anchorId]);
    return r.rows[0] || null;
  },
  async touch(id: string) {
    await query(`UPDATE conversations SET updated_at=now() WHERE id=$1`, [id]);
  },
  async setStatus(userId: string, id: string, status: string) {
    await query(`UPDATE conversations SET status=$3, updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id, status]);
  },
  async setTitle(userId: string, id: string, title: string) {
    await query(`UPDATE conversations SET title=$3, updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id, title.slice(0, 120)]);
  },
};

export const messages = {
  async add(m: { id: string; conversation_id: string; user_id: string; role: string; text: string; sources?: unknown; meta?: unknown }) {
    await query(
      `INSERT INTO messages (id, conversation_id, user_id, role, text, sources, meta) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [m.id, m.conversation_id, m.user_id, m.role, m.text, JSON.stringify(m.sources ?? []), JSON.stringify(m.meta ?? {})],
    );
  },
  async list(userId: string, conversationId: string, limit = 200) {
    const r = await query<MessageRow>(`SELECT * FROM messages WHERE user_id=$1 AND conversation_id=$2 ORDER BY created_at ASC LIMIT $3`, [userId, conversationId, limit]);
    return r.rows;
  },
};

// ---- capture-only tokens (Security review, Finding A) — scoped iOS Shortcut credential ----
export const captureTokens = {
  async create(t: { id: string; user_id: string; token_hash: string; scopes: string[]; label?: string | null }) {
    await query(
      `INSERT INTO capture_tokens (id, user_id, token_hash, scopes, label) VALUES ($1,$2,$3,$4,$5)`,
      [t.id, t.user_id, t.token_hash, t.scopes, t.label ?? null],
    );
  },
  async listForUser(userId: string) {
    const r = await query(`SELECT id, user_id, scopes, label, created_at, last_used_at, revoked_at FROM capture_tokens WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    return r.rows;
  },
  async findActiveByHash(hash: string) {
    const r = await query<{ id: string; user_id: string; scopes: string[] }>(
      `SELECT id, user_id, scopes FROM capture_tokens WHERE token_hash=$1 AND revoked_at IS NULL LIMIT 1`, [hash]);
    return r.rows[0] || null;
  },
  async touch(id: string) {
    await query(`UPDATE capture_tokens SET last_used_at=now() WHERE id=$1`, [id]);
  },
  async revoke(userId: string, id: string) {
    await query(`UPDATE capture_tokens SET revoked_at=now() WHERE user_id=$1 AND id=$2 AND revoked_at IS NULL`, [userId, id]);
  },
};

// ---- external evidence (Phase 1) — the Research Inbox; public-world facts, never auto-promoted ----
export const evidence = {
  // Insert if new (dedupe by content_hash). Returns true when a row was actually inserted.
  async upsert(e: {
    id: string; user_id: string; connector: string; external_id: string; canonical_url: string;
    title: string; summary: string; authors: string[]; source_name: string; source_kind: string;
    observed_at: string | null; retrieved_at: string; valid_until: string | null; refresh_after: string | null;
    license: string | null; attribution: string; content_hash: string; claim_candidates: string[]; status: string;
  }): Promise<boolean> {
    const r = await query(
      `INSERT INTO external_evidence
         (id,user_id,connector,external_id,canonical_url,title,summary,authors,source_name,source_kind,
          observed_at,retrieved_at,valid_until,refresh_after,license,attribution,content_hash,claim_candidates,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (user_id, content_hash) DO NOTHING`,
      [e.id, e.user_id, e.connector, e.external_id, e.canonical_url, e.title, e.summary, JSON.stringify(e.authors),
       e.source_name, e.source_kind, e.observed_at, e.retrieved_at, e.valid_until, e.refresh_after, e.license,
       e.attribution, e.content_hash, JSON.stringify(e.claim_candidates), e.status],
    );
    return (r.rowCount ?? 0) > 0;
  },
  async listInbox(userId: string, status?: string, limit = 100) {
    const where = status ? ` AND status=$2` : "";
    const params = status ? [userId, status, limit] : [userId, limit];
    const r = await query(`SELECT * FROM external_evidence WHERE user_id=$1${where} ORDER BY retrieved_at DESC LIMIT $${status ? 3 : 2}`, params);
    return r.rows;
  },
  async get(userId: string, id: string) {
    const r = await query(`SELECT * FROM external_evidence WHERE user_id=$1 AND id=$2`, [userId, id]);
    return r.rows[0] || null;
  },
  async setStatus(userId: string, id: string, status: string) {
    await query(`UPDATE external_evidence SET status=$3 WHERE user_id=$1 AND id=$2`, [userId, id, status]);
  },
  async seenHashes(userId: string, limit = 1000): Promise<Set<string>> {
    const r = await query<{ content_hash: string }>(`SELECT content_hash FROM external_evidence WHERE user_id=$1 ORDER BY retrieved_at DESC LIMIT $2`, [userId, limit]);
    return new Set(r.rows.map((x) => x.content_hash));
  },
};

// ---- claims (Intelligence review) — epistemic layer above nodes/evidence ----
export const claims = {
  async create(c: {
    id: string; user_id: string; statement: string; claim_type: string; subject: string; subject_kind: string;
    confidence: number; observed_at: string | null; valid_from: string | null; valid_until: string | null;
    owner_status: string; evidence: unknown;
  }) {
    await query(
      `INSERT INTO claims (id,user_id,statement,claim_type,subject,subject_kind,confidence,observed_at,valid_from,valid_until,owner_status,evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [c.id, c.user_id, c.statement, c.claim_type, c.subject, c.subject_kind, c.confidence, c.observed_at, c.valid_from, c.valid_until, c.owner_status, JSON.stringify(c.evidence ?? [])],
    );
  },
  async list(userId: string, subject?: string) {
    const where = subject ? ` AND subject=$2` : "";
    const r = await query(`SELECT * FROM claims WHERE user_id=$1${where} ORDER BY updated_at DESC`, subject ? [userId, subject] : [userId]);
    return r.rows;
  },
  async get(userId: string, id: string) {
    const r = await query(`SELECT * FROM claims WHERE user_id=$1 AND id=$2`, [userId, id]);
    return r.rows[0] || null;
  },
  async setOwnerStatus(userId: string, id: string, status: string) {
    await query(`UPDATE claims SET owner_status=$3, updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id, status]);
  },
  async setEvidenceAndConfidence(userId: string, id: string, evidence: unknown, confidence: number) {
    await query(`UPDATE claims SET evidence=$3, confidence=$4, updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id, JSON.stringify(evidence ?? []), confidence]);
  },
};

// ---- feed sources (Phase 2 — RSS/Atom connector) ----
export const feeds = {
  async add(f: { id: string; user_id: string; url: string; title?: string }) {
    await query(
      `INSERT INTO feeds (id, user_id, url, title) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, url) DO NOTHING`,
      [f.id, f.user_id, f.url, f.title ?? ""],
    );
  },
  async list(userId: string) {
    const r = await query(`SELECT * FROM feeds WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    return r.rows;
  },
  async get(userId: string, id: string) {
    const r = await query<{ id: string; user_id: string; url: string; title: string }>(`SELECT * FROM feeds WHERE user_id=$1 AND id=$2`, [userId, id]);
    return r.rows[0] || null;
  },
  async remove(userId: string, id: string) {
    await query(`DELETE FROM feeds WHERE user_id=$1 AND id=$2`, [userId, id]);
  },
  async markPolled(userId: string, id: string, status: string) {
    await query(`UPDATE feeds SET last_polled=now(), last_status=$3 WHERE user_id=$1 AND id=$2`, [userId, id, status.slice(0, 120)]);
  },
};

// ---- captures ----
export const captures = {
  async create(c: Capture & { raw?: object }) {
    await query(
      `INSERT INTO captures (id,user_id,type,source,captured_at,truth_layer,status,sensitivity,processing_status,title,note,url,screenshot_ref,raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [c.id, c.user_id, c.type, c.source, c.captured_at, c.truth_layer, c.status, c.sensitivity,
       c.processing_status, c.title, c.note, c.url ?? null, c.screenshot_ref ?? null, JSON.stringify(c.raw ?? {})],
    );
  },
  async list(userId: string, status?: string) {
    const r = status
      ? await query<Capture>(`SELECT * FROM captures WHERE user_id=$1 AND status=$2 ORDER BY captured_at DESC`, [userId, status])
      : await query<Capture>(`SELECT * FROM captures WHERE user_id=$1 ORDER BY captured_at DESC`, [userId]);
    return r.rows;
  },
  async get(userId: string, id: string) {
    const r = await query<Capture>(`SELECT * FROM captures WHERE user_id=$1 AND id=$2`, [userId, id]);
    return r.rows[0] || null;
  },
  async setProcessing(id: string, status: string) {
    await query(`UPDATE captures SET processing_status=$2 WHERE id=$1`, [id, status]);
  },
  // Wave 6: the media-worker writes the extracted transcript (+ media meta) back into
  // the immutable capture's `raw` JSONB; the media_ingest synthesis handler reads it.
  // Merges (||) so we never clobber other raw fields.
  async setTranscript(userId: string, id: string, transcript: string, media?: object) {
    await query(
      `UPDATE captures SET raw = raw || $3::jsonb WHERE user_id=$1 AND id=$2`,
      [userId, id, JSON.stringify({ transcript, ...(media ? { media } : {}) })],
    );
  },
  async triage(userId: string, id: string) {
    await query(`UPDATE captures SET status='triaged' WHERE user_id=$1 AND id=$2`, [userId, id]);
  },
  // Item management: soft-archive (reversible; hidden from inbox) vs. permanent delete.
  async archive(userId: string, id: string) {
    await query(`UPDATE captures SET status='archived' WHERE user_id=$1 AND id=$2`, [userId, id]);
  },
  async unarchive(userId: string, id: string) {
    await query(`UPDATE captures SET status='inbox' WHERE user_id=$1 AND id=$2`, [userId, id]);
  },
  async remove(userId: string, id: string) {
    await query(`DELETE FROM captures WHERE user_id=$1 AND id=$2`, [userId, id]);
  },
};

// ---- nodes ----
export const nodes = {
  async create(n: GraphNode & { source_capture_id?: string | null; meta?: object }) {
    await query(
      `INSERT INTO nodes (id,user_id,type,title,summary,truth_layer,truth_label,mvs,tags,source_capture_id,meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [n.id, n.user_id, n.type, n.title, n.summary, n.truth_layer, n.truth_label, n.mvs,
       JSON.stringify(n.tags ?? []), n.source_capture_id ?? null, JSON.stringify(n.meta ?? {})],
    );
  },
  async setMeta(userId: string, id: string, meta: object) {
    await query(`UPDATE nodes SET meta=$3, updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id, JSON.stringify(meta)]);
  },
  // Merge an owner-feedback signal into meta.feedback (used for arrival-card ranking).
  async setFeedback(userId: string, id: string, feedback: object) {
    await query(
      `UPDATE nodes SET meta = meta || jsonb_build_object('feedback', $3::jsonb), updated_at=now() WHERE user_id=$1 AND id=$2`,
      [userId, id, JSON.stringify(feedback)],
    );
  },
  // Idempotent theme node (Stage 9): one per (user, tag), refreshed each consolidation.
  async upsertTheme(userId: string, tag: string, nodeIds: string[]) {
    const tid = `theme_${userId.slice(-8)}_${tag.replace(/[^a-z0-9]/gi, "").slice(0, 24)}`;
    await query(
      `INSERT INTO nodes (id,user_id,type,title,summary,truth_layer,truth_label,mvs,tags,meta)
       VALUES ($1,$2,'concept',$3,$4,'C','Theme',$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET summary=$4, mvs=$5, tags=$6, meta=$7, updated_at=now()`,
      [tid, userId, `Theme: ${tag}`, `${nodeIds.length} related nodes`, Math.min(90, 50 + nodeIds.length * 4),
       JSON.stringify([tag]), JSON.stringify({ theme: true, node_ids: nodeIds })],
    );
    return tid;
  },
  async list(userId: string) {
    const r = await query<GraphNode>(`SELECT * FROM nodes WHERE user_id=$1 ORDER BY mvs DESC`, [userId]);
    return r.rows;
  },
  async get(userId: string, id: string) {
    const r = await query<GraphNode>(`SELECT * FROM nodes WHERE user_id=$1 AND id=$2`, [userId, id]);
    return r.rows[0] || null;
  },
  async byIds(userId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const r = await query<GraphNode>(`SELECT * FROM nodes WHERE user_id=$1 AND id = ANY($2)`, [userId, ids]);
    return r.rows;
  },
  async update(userId: string, id: string, patch: Partial<GraphNode>) {
    const fields: string[] = [];
    const vals: unknown[] = [userId, id];
    for (const [k, v] of Object.entries(patch)) {
      if (["title", "summary", "truth_layer", "truth_label", "mvs", "tags"].includes(k)) {
        vals.push(k === "tags" ? JSON.stringify(v) : v);
        fields.push(`${k}=$${vals.length}`);
      }
    }
    if (!fields.length) return;
    await query(`UPDATE nodes SET ${fields.join(",")}, updated_at=now() WHERE user_id=$1 AND id=$2`, vals);
  },
  async remove(userId: string, id: string) {
    await query(`DELETE FROM nodes WHERE user_id=$1 AND id=$2`, [userId, id]);
  },
};

// ---- edges ----
export const edges = {
  async create(e: GraphEdge) {
    await query(
      `INSERT INTO edges (id,user_id,source_id,target_id,relationship,weight,valid_from,valid_until,label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.id, e.user_id, e.source_id, e.target_id, e.relationship, e.weight ?? 0.5,
       e.valid_from, e.valid_until ?? null, e.label],
    );
  },
  async list(userId: string) {
    const r = await query<GraphEdge>(`SELECT * FROM edges WHERE user_id=$1`, [userId]);
    return r.rows;
  },
};

// ---- timeline ----
export const timeline = {
  async remove(userId: string, id: string) { await query(`DELETE FROM timeline_events WHERE user_id=$1 AND id=$2`, [userId, id]); },
  async create(t: TimelineEvent) {
    await query(
      `INSERT INTO timeline_events (id,user_id,date,type,significance,title,description,node_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [t.id, t.user_id, t.date, t.type, t.significance, t.title, t.description, t.node_id ?? null],
    );
  },
  async list(userId: string) {
    const r = await query<TimelineEvent>(`SELECT * FROM timeline_events WHERE user_id=$1 ORDER BY date DESC`, [userId]);
    return r.rows;
  },
};

// ---- context packs ----
export const contextPacks = {
  async remove(userId: string, id: string) { await query(`DELETE FROM context_packs WHERE user_id=$1 AND id=$2`, [userId, id]); },
  async create(p: ContextPack) {
    await query(
      `INSERT INTO context_packs (id,user_id,title,purpose,token_budget_total,token_budget_used,source_nodes,sections)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.id, p.user_id, p.title, p.purpose, p.token_budget.total, p.token_budget.used,
       JSON.stringify(p.source_nodes), JSON.stringify(p.sections)],
    );
  },
  async list(userId: string) {
    const r = await query(`SELECT * FROM context_packs WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    return r.rows;
  },
  async get(userId: string, id: string) {
    const r = await query(`SELECT * FROM context_packs WHERE user_id=$1 AND id=$2`, [userId, id]);
    return r.rows[0] || null;
  },
};

// ---- briefs ----
export const briefs = {
  async remove(userId: string, id: string) { await query(`DELETE FROM briefs WHERE user_id=$1 AND id=$2`, [userId, id]); },
  async create(b: Brief) {
    await query(`INSERT INTO briefs (id,user_id,kind,period,payload) VALUES ($1,$2,$3,$4,$5)`,
      [b.id, b.user_id, b.kind, b.period, JSON.stringify(b.payload)]);
  },
  async list(userId: string) {
    const r = await query<Brief>(`SELECT * FROM briefs WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    return r.rows;
  },
};

// ---- jobs + audit + usage ----
export const jobs = {
  async record(j: { id: string; user_id: string; type: string; status: string; payload?: object }) {
    await query(`INSERT INTO jobs (id,user_id,type,status,payload) VALUES ($1,$2,$3,$4,$5)
                 ON CONFLICT (id) DO UPDATE SET status=$4, updated_at=now()`,
      [j.id, j.user_id, j.type, j.status, JSON.stringify(j.payload ?? {})]);
  },
  async finish(id: string, status: string, result?: object, error?: string) {
    await query(`UPDATE jobs SET status=$2, result=$3, error=$4, updated_at=now() WHERE id=$1`,
      [id, status, result ? JSON.stringify(result) : null, error ?? null]);
  },
  async get(userId: string, id: string) {
    const r = await query<{ id: string; type: string; status: string; result: unknown; error: string | null; updated_at: string }>(
      `SELECT id, type, status, result, error, updated_at FROM jobs WHERE user_id=$1 AND id=$2`,
      [userId, id],
    );
    return r.rows[0] || null;
  },
  // Observability: job counts by status (Debug Console). Reasons (skipped/budget/etc.)
  // live in the `error` column; surface the recent ones so failures aren't silent.
  async countByStatus(userId: string) {
    const r = await query<{ status: string; n: string }>(`SELECT status, COUNT(*)::text AS n FROM jobs WHERE user_id=$1 GROUP BY status`, [userId]);
    return r.rows.map((x) => ({ status: x.status, count: Number(x.n) }));
  },
  async recentProblems(userId: string, limit = 8) {
    const r = await query<{ id: string; type: string; status: string; error: string | null; updated_at: string }>(
      `SELECT id, type, status, error, updated_at FROM jobs
        WHERE user_id=$1 AND status IN ('failed','skipped','queued') ORDER BY updated_at DESC LIMIT $2`, [userId, limit]);
    return r.rows;
  },
};

export const audit = {
  async log(entry: { user_id?: string; actor: string; action: string; target?: string; meta?: object }) {
    await query(`INSERT INTO audit_logs (user_id,actor,action,target,meta) VALUES ($1,$2,$3,$4,$5)`,
      [entry.user_id ?? null, entry.actor, entry.action, entry.target ?? null, JSON.stringify(entry.meta ?? {})]);
  },
};

// ---- Cognition Wave A: Event Store (append-only spine) ----
export interface EventInput {
  user_id?: string | null;
  actor: EventActor;
  event_type: EventType;
  subject_type: string;
  subject_id?: string | null;
  payload?: object;
  correlation_id?: string | null;
}
export const events = {
  async append(e: EventInput) {
    const evId = id("evt");
    await query(
      `INSERT INTO events (id,user_id,actor,event_type,subject_type,subject_id,payload,correlation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [evId, e.user_id ?? null, e.actor, e.event_type, e.subject_type, e.subject_id ?? null, JSON.stringify(e.payload ?? {}), e.correlation_id ?? null],
    );
    return evId;
  },
  // Full lifecycle of one subject (usually a capture) in order — the replay path.
  async byCorrelation(correlationId: string) {
    const r = await query<IndigoldEvent>(`SELECT * FROM events WHERE correlation_id=$1 ORDER BY ts ASC`, [correlationId]);
    return r.rows;
  },
  async bySubject(subjectType: string, subjectId: string) {
    const r = await query<IndigoldEvent>(`SELECT * FROM events WHERE subject_type=$1 AND subject_id=$2 ORDER BY ts ASC`, [subjectType, subjectId]);
    return r.rows;
  },
  async recent(userId: string, limit = 50) {
    const r = await query<IndigoldEvent>(`SELECT * FROM events WHERE user_id=$1 ORDER BY ts DESC LIMIT $2`, [userId, limit]);
    return r.rows;
  },
  // Full chronological history (export bundle / replay). Bounded for safety.
  async listForUser(userId: string, limit = 10000) {
    const r = await query<IndigoldEvent>(`SELECT * FROM events WHERE user_id=$1 ORDER BY ts ASC LIMIT $2`, [userId, limit]);
    return r.rows;
  },
  async countByType(userId: string) {
    const r = await query<{ event_type: string; n: string }>(`SELECT event_type, COUNT(*)::text AS n FROM events WHERE user_id=$1 GROUP BY event_type`, [userId]);
    return r.rows.map((x) => ({ event_type: x.event_type, count: Number(x.n) }));
  },
};

/** Best-effort emit. An event-log failure must NEVER fail a business write
 *  (Wave A iron rule). Emit in the same logical operation as the state change. */
export async function emitEvent(e: EventInput): Promise<void> {
  try {
    await events.append(e);
  } catch (err) {
    console.error("[events] emit failed:", (err as Error)?.message);
  }
}

// ---- Cognition Wave B: Constraint Engine (one profile row per user) ----
export const constraints = {
  async get(userId: string): Promise<Record<string, unknown> | null> {
    const r = await query<{ profile: Record<string, unknown> }>(`SELECT profile FROM constraints WHERE user_id=$1`, [userId]);
    return r.rows[0]?.profile ?? null;
  },
  async set(userId: string, profile: object) {
    await query(
      `INSERT INTO constraints (user_id, profile) VALUES ($1,$2)
       ON CONFLICT (user_id) DO UPDATE SET profile=$2, updated_at=now()`,
      [userId, JSON.stringify(profile)],
    );
  },
};

export interface Asset {
  id: string;
  user_id: string;
  capture_id: string | null;
  storage_key: string;
  filename: string;
  mime: string;
  size_bytes: number;
  visibility: string;
  status: string;
  created_at?: string;
}

export const assets = {
  async create(a: Omit<Asset, "created_at">) {
    await query(
      `INSERT INTO assets (id,user_id,capture_id,storage_key,filename,mime,size_bytes,visibility,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [a.id, a.user_id, a.capture_id, a.storage_key, a.filename, a.mime, a.size_bytes, a.visibility, a.status],
    );
  },
  async get(userId: string, id: string) {
    const r = await query<Asset>(`SELECT * FROM assets WHERE user_id=$1 AND id=$2`, [userId, id]);
    return r.rows[0] || null;
  },
  async byCapture(userId: string, captureId: string) {
    const r = await query<Asset>(`SELECT * FROM assets WHERE user_id=$1 AND capture_id=$2`, [userId, captureId]);
    return r.rows;
  },
  async listForUser(userId: string) {
    const r = await query<Asset>(`SELECT * FROM assets WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    return r.rows;
  },
};

export const usage = {
  async add(userId: string, d: { tokens?: number; apiCalls?: number; costCents?: number }) {
    const day = new Date().toISOString().slice(0, 10);
    await query(
      `INSERT INTO api_usage (user_id,day,tokens,api_calls,cost_cents) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id,day) DO UPDATE SET
         tokens=api_usage.tokens+$3, api_calls=api_usage.api_calls+$4, cost_cents=api_usage.cost_cents+$5`,
      [userId, day, d.tokens ?? 0, d.apiCalls ?? 0, d.costCents ?? 0],
    );
  },
};

// ---- RADIAN 2.0 (Wave 0) ----

export interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  status: string;
  tags: string[];
  objectives: string;
  created_at?: string;
  updated_at?: string;
}

export const projects = {
  async remove(userId: string, id: string) { await query(`DELETE FROM projects WHERE user_id=$1 AND id=$2`, [userId, id]); },
  async list(userId: string) {
    const r = await query<ProjectRow>(`SELECT * FROM projects WHERE user_id=$1 ORDER BY name ASC`, [userId]);
    return r.rows;
  },
  async get(userId: string, id: string) {
    const r = await query<ProjectRow>(`SELECT * FROM projects WHERE user_id=$1 AND id=$2`, [userId, id]);
    return r.rows[0] || null;
  },
  async count(userId: string) {
    const r = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM projects WHERE user_id=$1`, [userId]);
    return Number(r.rows[0]?.n || 0);
  },
  async upsert(p: { id: string; user_id: string; name: string; description?: string; status?: string; tags?: string[]; objectives?: string }) {
    await query(
      `INSERT INTO projects (id,user_id,name,description,status,tags,objectives)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET name=$3, description=$4, status=$5, tags=$6, objectives=$7, updated_at=now()`,
      [p.id, p.user_id, p.name, p.description ?? "", p.status ?? "active", JSON.stringify(p.tags ?? []), p.objectives ?? ""],
    );
  },
  async patch(userId: string, id: string, patch: Partial<Pick<ProjectRow, "name" | "description" | "status" | "tags" | "objectives">>) {
    const fields: string[] = [];
    const vals: unknown[] = [userId, id];
    for (const [k, val] of Object.entries(patch)) {
      if (["name", "description", "status", "tags", "objectives"].includes(k)) {
        vals.push(k === "tags" ? JSON.stringify(val) : val);
        fields.push(`${k}=$${vals.length}`);
      }
    }
    if (!fields.length) return;
    await query(`UPDATE projects SET ${fields.join(",")}, updated_at=now() WHERE user_id=$1 AND id=$2`, vals);
  },
};

export const aiCalls = {
  async log(c: {
    id: string; user_id: string; purpose: string; provider: string; model: string; tier: string;
    input_tokens: number; output_tokens: number; cost_cents: number; source_id?: string | null; prompt_version?: string | null; status?: string; latency_ms?: number;
  }) {
    await query(
      `INSERT INTO ai_calls (id,user_id,purpose,provider,model,tier,input_tokens,output_tokens,cost_cents,source_id,prompt_version,status,latency_ms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [c.id, c.user_id, c.purpose, c.provider, c.model, c.tier, c.input_tokens, c.output_tokens, c.cost_cents, c.source_id ?? null, c.prompt_version ?? null, c.status ?? "ok", Math.round(c.latency_ms ?? 0)],
    );
  },
  /** Month-to-date spend in cents (the budget governor's input). */
  async monthCostCents(userId: string) {
    const r = await query<{ c: string }>(
      `SELECT COALESCE(SUM(cost_cents),0)::text AS c FROM ai_calls
       WHERE user_id=$1 AND created_at >= date_trunc('month', now())`,
      [userId],
    );
    return Number(r.rows[0]?.c || 0);
  },
  /** Spend grouped by purpose this month (Meta-Radian input). */
  async monthByPurpose(userId: string) {
    const r = await query<{ purpose: string; cost: string; calls: string }>(
      `SELECT purpose, COALESCE(SUM(cost_cents),0)::text AS cost, COUNT(*)::text AS calls FROM ai_calls
       WHERE user_id=$1 AND created_at >= date_trunc('month', now()) GROUP BY purpose ORDER BY 2 DESC`,
      [userId],
    );
    return r.rows.map((x) => ({ purpose: x.purpose, cost_cents: Number(x.cost), calls: Number(x.calls) }));
  },
  /** Usage Observatory: aggregate calls/tokens/cost over a window (day or month). */
  async windowStats(userId: string, since: "day" | "month") {
    const trunc = since === "day" ? "day" : "month";
    const r = await query<{ calls: string; input: string; output: string; cost: string }>(
      `SELECT COUNT(*)::text AS calls,
              COALESCE(SUM(input_tokens),0)::text AS input,
              COALESCE(SUM(output_tokens),0)::text AS output,
              COALESCE(SUM(cost_cents),0)::text AS cost
         FROM ai_calls
        WHERE user_id=$1 AND created_at >= date_trunc('${trunc}', now())`,
      [userId],
    );
    const x = r.rows[0];
    return { calls: Number(x?.calls || 0), input_tokens: Number(x?.input || 0), output_tokens: Number(x?.output || 0), cost_cents: Number(x?.cost || 0) };
  },
  /** Last N AI calls for the Observatory feed (no secrets; metadata only). */
  async recent(userId: string, limit = 10) {
    const r = await query<{ purpose: string; provider: string; model: string; input_tokens: string; output_tokens: string; cost_cents: string; status: string; latency_ms: string; source_id: string | null; created_at: string }>(
      `SELECT purpose, provider, model, input_tokens, output_tokens, cost_cents, status, latency_ms, source_id, created_at
         FROM ai_calls WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );
    return r.rows.map((x) => ({
      purpose: x.purpose, provider: x.provider, model: x.model,
      input_tokens: Number(x.input_tokens), output_tokens: Number(x.output_tokens),
      cost_cents: Number(x.cost_cents), status: x.status, latency_ms: Number(x.latency_ms),
      source_id: x.source_id, created_at: x.created_at,
    }));
  },
};

export const opportunities = {
  async create(o: { id: string; user_id: string; thesis: string; contributing_nodes: string[]; confidence: number; leverage: string; first_move: string; decay_date?: string | null }) {
    await query(
      `INSERT INTO opportunities (id,user_id,thesis,contributing_nodes,confidence,leverage,first_move,decay_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [o.id, o.user_id, o.thesis, JSON.stringify(o.contributing_nodes), o.confidence, o.leverage, o.first_move, o.decay_date ?? null],
    );
  },
  async list(userId: string) {
    const r = await query(`SELECT * FROM opportunities WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    return r.rows;
  },
  async setStatus(userId: string, id: string, status: string) {
    await query(`UPDATE opportunities SET status=$3 WHERE user_id=$1 AND id=$2`, [userId, id, status]);
  },
  // Expire opportunities past their decay date (re-evaluation; never auto-promoted).
  async expireStale(userId: string) {
    await query(`UPDATE opportunities SET status='expired' WHERE user_id=$1 AND status='review' AND decay_date IS NOT NULL AND decay_date < now()::date`, [userId]);
  },
  async recentTheses(userId: string, days = 30) {
    const r = await query<{ thesis: string }>(`SELECT thesis FROM opportunities WHERE user_id=$1 AND created_at > now() - ($2 || ' days')::interval`, [userId, String(days)]);
    return r.rows.map((x) => x.thesis);
  },
};

export const decisions = {
  async create(d: { id: string; user_id: string; decision: string; reasoning?: string; confidence?: number; expected_outcome?: string; review_by?: string | null }) {
    await query(
      `INSERT INTO decisions (id,user_id,decision,reasoning,confidence,expected_outcome,review_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [d.id, d.user_id, d.decision, d.reasoning ?? "", d.confidence ?? 0.5, d.expected_outcome ?? "", d.review_by ?? null],
    );
  },
  async list(userId: string) {
    const r = await query(`SELECT * FROM decisions WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
    return r.rows;
  },
  async due(userId: string) {
    const r = await query(`SELECT * FROM decisions WHERE user_id=$1 AND status='open' AND review_by IS NOT NULL AND review_by <= now()::date ORDER BY review_by ASC`, [userId]);
    return r.rows;
  },
  async recordOutcome(userId: string, id: string, outcome: string, success: boolean) {
    await query(`UPDATE decisions SET outcome=$3, outcome_success=$4, outcome_at=now(), status='reviewed' WHERE user_id=$1 AND id=$2`, [userId, id, outcome, success]);
  },
  async forCalibration(userId: string) {
    const r = await query<{ confidence: number; outcome_success: boolean | null }>(`SELECT confidence, outcome_success FROM decisions WHERE user_id=$1`, [userId]);
    return r.rows;
  },
};

// ---- Semantic memory (embeddings; pgvector-capable) ----
export const embeddings = {
  async upsert(e: { subject_type: string; subject_id: string; user_id: string; model: string; dim: number; vector: number[]; content_hash: string }) {
    await query(
      `INSERT INTO embeddings (subject_type,subject_id,user_id,model,dim,vector,content_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (subject_type,subject_id) DO UPDATE SET user_id=$3, model=$4, dim=$5, vector=$6, content_hash=$7, updated_at=now()`,
      [e.subject_type, e.subject_id, e.user_id, e.model, e.dim, JSON.stringify(e.vector), e.content_hash],
    );
  },
  // content_hash so we re-embed only when content changed (cost discipline).
  async hash(subjectType: string, subjectId: string) {
    const r = await query<{ content_hash: string }>(`SELECT content_hash FROM embeddings WHERE subject_type=$1 AND subject_id=$2`, [subjectType, subjectId]);
    return r.rows[0]?.content_hash ?? null;
  },
  // All vectors for one user + model (same model only — dims must match for cosine).
  async listForUser(userId: string, model: string) {
    const r = await query<{ subject_type: string; subject_id: string; model: string; vector: unknown }>(
      `SELECT subject_type, subject_id, model, vector FROM embeddings WHERE user_id=$1 AND model=$2`,
      [userId, model],
    );
    return r.rows.map((x) => ({ subject_type: x.subject_type, subject_id: x.subject_id, model: x.model, vector: (typeof x.vector === "string" ? JSON.parse(x.vector) : x.vector) as number[] }));
  },
  async count(userId: string) {
    const r = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM embeddings WHERE user_id=$1`, [userId]);
    return Number(r.rows[0]?.n || 0);
  },
};

// ---- Living OS Wave G3: Quests / Actions ----
export interface QuestRow {
  id: string; user_id: string; title: string; summary: string; kind: string; state: string;
  source_type: string; source_id?: string | null; node_id?: string | null; project_id?: string | null;
  snooze_until?: string | null; meta?: Record<string, unknown>; created_at?: string; updated_at?: string;
}
export const quests = {
  async create(q: { id: string; user_id: string; title: string; summary?: string; kind?: string; state?: string; source_type?: string; source_id?: string | null; node_id?: string | null; meta?: object }) {
    await query(
      `INSERT INTO quests (id,user_id,title,summary,kind,state,source_type,source_id,node_id,meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [q.id, q.user_id, q.title, q.summary ?? "", q.kind ?? "side", q.state ?? "suggested",
       q.source_type ?? "system", q.source_id ?? null, q.node_id ?? null, JSON.stringify(q.meta ?? {})],
    );
  },
  async list(userId: string, states?: string[]) {
    if (states && states.length) {
      const r = await query<QuestRow>(`SELECT * FROM quests WHERE user_id=$1 AND state = ANY($2) ORDER BY updated_at DESC`, [userId, states]);
      return r.rows;
    }
    const r = await query<QuestRow>(`SELECT * FROM quests WHERE user_id=$1 ORDER BY updated_at DESC`, [userId]);
    return r.rows;
  },
  async get(userId: string, id: string) {
    const r = await query<QuestRow>(`SELECT * FROM quests WHERE user_id=$1 AND id=$2`, [userId, id]);
    return r.rows[0] || null;
  },
  async setState(userId: string, id: string, state: string) {
    await query(`UPDATE quests SET state=$3, updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id, state]);
  },
  async snooze(userId: string, id: string, until: string) {
    await query(`UPDATE quests SET snooze_until=$3, updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id, until]);
  },
  async resume(userId: string, id: string) {
    await query(`UPDATE quests SET snooze_until=NULL, updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id]);
  },
  async setProject(userId: string, id: string, projectId: string) {
    await query(`UPDATE quests SET project_id=$3, updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id, projectId]);
  },
  async remove(userId: string, id: string) {
    await query(`DELETE FROM quests WHERE user_id=$1 AND id=$2`, [userId, id]);
  },
  // Node ids that carry a quest worth badging on the Atlas — ACTIVE or COMPLETED
  // (never merely suggested), per the G3 UX contract.
  async activeNodeIds(userId: string) {
    const r = await query<{ node_id: string }>(`SELECT DISTINCT node_id FROM quests WHERE user_id=$1 AND node_id IS NOT NULL AND state IN ('accepted','active','completed')`, [userId]);
    return r.rows.map((x) => x.node_id);
  },
  // Node ids grouped by quest state set (for distinct Atlas badges: active vs done).
  async nodeIdsByStates(userId: string, states: string[]) {
    const r = await query<{ node_id: string }>(`SELECT DISTINCT node_id FROM quests WHERE user_id=$1 AND node_id IS NOT NULL AND state = ANY($2)`, [userId, states]);
    return r.rows.map((x) => x.node_id);
  },
};

// ---- Living OS Wave G4: XP ledger (provenance for progression) ----
export interface XpRow { id: string; user_id: string; track: string; amount: number; source_type: string; source_id?: string | null; reason: string; created_at?: string }
export const xp = {
  async log(r: { id: string; user_id: string; track: string; amount: number; source_type?: string; source_id?: string | null; reason?: string }) {
    await query(
      `INSERT INTO xp_ledger (id,user_id,track,amount,source_type,source_id,reason) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [r.id, r.user_id, r.track, r.amount, r.source_type ?? "quest", r.source_id ?? null, r.reason ?? ""],
    );
  },
  // Has a grant already been recorded for this source? (idempotent grants.)
  async hasGrant(userId: string, sourceType: string, sourceId: string) {
    const r = await query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM xp_ledger WHERE user_id=$1 AND source_type=$2 AND source_id=$3`, [userId, sourceType, sourceId]);
    return Number(r.rows[0]?.n || 0) > 0;
  },
  async since(userId: string, iso: string) {
    const r = await query<XpRow>(`SELECT * FROM xp_ledger WHERE user_id=$1 AND created_at >= $2 ORDER BY created_at DESC`, [userId, iso]);
    return r.rows;
  },
  // Distinct UTC days (YYYY-MM-DD) that have at least one grant — for streaks.
  async activeDays(userId: string, limit = 60) {
    const r = await query<{ d: string }>(`SELECT DISTINCT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD') AS d FROM xp_ledger WHERE user_id=$1 ORDER BY d DESC LIMIT $2`, [userId, limit]);
    return r.rows.map((x) => x.d);
  },
};

export const promptOverrides = {
  async get(userId: string, key: string) {
    const r = await query<{ version: string }>(`SELECT version FROM prompt_overrides WHERE user_id=$1 AND key=$2`, [userId, key]);
    return r.rows[0] || null;
  },
  async set(userId: string, key: string, version: string, body?: object) {
    await query(
      `INSERT INTO prompt_overrides (user_id,key,version,body) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id,key) DO UPDATE SET version=$3, body=$4, updated_at=now()`,
      [userId, key, version, body ? JSON.stringify(body) : null],
    );
  },
};
