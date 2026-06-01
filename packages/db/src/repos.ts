// Thin repository layer over Postgres. Returns plain rows.
import { query } from "./client";
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
  async create(n: GraphNode & { source_capture_id?: string | null }) {
    await query(
      `INSERT INTO nodes (id,user_id,type,title,summary,truth_layer,truth_label,mvs,tags,source_capture_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [n.id, n.user_id, n.type, n.title, n.summary, n.truth_layer, n.truth_label, n.mvs,
       JSON.stringify(n.tags ?? []), n.source_capture_id ?? null],
    );
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
};

export const audit = {
  async log(entry: { user_id?: string; actor: string; action: string; target?: string; meta?: object }) {
    await query(`INSERT INTO audit_logs (user_id,actor,action,target,meta) VALUES ($1,$2,$3,$4,$5)`,
      [entry.user_id ?? null, entry.actor, entry.action, entry.target ?? null, JSON.stringify(entry.meta ?? {})]);
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
