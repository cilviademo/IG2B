// Idempotent migrator: applies the embedded schema. Run via `npm run migrate`
// or called on API boot. Embedding the DDL keeps it bundle-safe (no file reads).
import { db } from "./client";
import { SCHEMA_SQL } from "./schema";

export async function migrate(): Promise<void> {
  await db().query(SCHEMA_SQL);
  console.log("[migrate] schema applied");
}

// Allow running directly: `node dist/migrate.js`
if (process.argv[1] && /migrate/.test(process.argv[1])) {
  migrate()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[migrate] failed:", e);
      process.exit(1);
    });
}
