// Postgres connection pool. Render Postgres requires SSL; local does not.
import pg from "pg";

const { Pool } = pg;
let pool: pg.Pool | null = null;

export function db(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || "postgres://localhost:5432/indigold";
    const local = /localhost|127\.0\.0\.1/.test(connectionString);
    pool = new Pool({
      connectionString,
      ssl: local ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX || 8),
      connectionTimeoutMillis: 5000,
    });
    pool.on("error", (e: Error) => console.error("[pg] pool error:", e.message));
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return db().query<T>(text, params as never[]);
}

export async function dbHealthy(): Promise<boolean> {
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
