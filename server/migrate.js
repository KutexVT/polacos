import { pool, tx } from "./db.js";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
export async function migrate() {
  await tx(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(290117)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
    );
    for (const name of (
      await readdir(fileURLToPath(new URL("../migrations/", import.meta.url)))
    )
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        !(
          await db.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      ) {
        await db.query(
          await readFile(
            new URL("../migrations/" + name, import.meta.url),
            "utf8",
          ),
        );
        await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          name,
        ]);
      }
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate();
  await pool.end();
  console.log("Migraciones aplicadas");
}
