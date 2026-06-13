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
  async triage(userId: string, id: string) {
    await query(`UPDATE captures SET status='triaged' WHERE user_id=$1 AND id=$2`, [userId, id]);
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
    input_tokens: number; output_tokens: number; cost_cents: number; source_id?: string | null; prompt_version?: string | null; status?: string;
  }) {
    await query(
      `INSERT INTO ai_calls (id,user_id,purpose,provider,model,tier,input_tokens,output_tokens,cost_cents,source_id,prompt_version,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [c.id, c.user_id, c.purpose, c.provider, c.model, c.tier, c.input_tokens, c.output_tokens, c.cost_cents, c.source_id ?? null, c.prompt_version ?? null, c.status ?? "ok"],
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
  async setProject(userId: string, id: string, projectId: string) {
    await query(`UPDATE quests SET project_id=$3, updated_at=now() WHERE user_id=$1 AND id=$2`, [userId, id, projectId]);
  },
  // Node ids that currently carry an in-play (accepted/active) quest — for Atlas badges.
  async activeNodeIds(userId: string) {
    const r = await query<{ node_id: string }>(`SELECT DISTINCT node_id FROM quests WHERE user_id=$1 AND node_id IS NOT NULL AND state IN ('accepted','active')`, [userId]);
    return r.rows.map((x) => x.node_id);
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
