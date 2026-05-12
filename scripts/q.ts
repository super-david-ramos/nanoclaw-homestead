/**
 * scripts/q.ts — sqlite3 CLI replacement for skill SQL invocations.
 *
 * Usage:
 *   bun run scripts/q.ts <db-path> "<sql>"
 *
 * Detects queries (SELECT / WITH...SELECT) from mutations via a leading-keyword
 * regex. Queries print rows in sqlite3 CLI default ("list") format —
 * pipe-separated, no header — so existing skill text reads identically.
 * Mutations run via db.exec() so compound statements (e.g. "DELETE …; INSERT
 * …;") work without a second pass.
 *
 * Why this exists: setup/verify.ts:5 codifies that NanoClaw avoids depending
 * on the sqlite3 CLI binary; setup never installs or probes for it. Skills
 * that shell out to `sqlite3` therefore fail on hosts where it isn't
 * preinstalled (common on fresh Ubuntu — see #2191). This wrapper preserves
 * the skill-text shape (path then SQL string) while routing through bun:sqlite,
 * which ships with the bun host runtime.
 */
import { Database } from 'bun:sqlite';

const [, , dbPath, sql] = process.argv;

if (!dbPath || sql === undefined) {
  console.error('Usage: bun run scripts/q.ts <db-path> "<sql>"');
  process.exit(2);
}

const db = new Database(dbPath);
try {
  // Try preparing as a single statement. If bun:sqlite rejects (compound
  // statement, e.g. "DELETE …; INSERT …;"), fall back to db.exec which
  // executes multiple statements in one go.
  let stmt: ReturnType<typeof db.prepare> | null = null;
  try {
    stmt = db.prepare(sql);
  } catch (e: unknown) {
    db.exec(sql);
  }
  if (stmt) {
    // Statement.columnNames is empty for non-row-producing statements
    // (INSERT/UPDATE/DELETE/CREATE/DROP/etc., plus WITH…DELETE) and
    // populated for SELECT/PRAGMA/EXPLAIN/WITH…SELECT.
    if (stmt.columnNames.length > 0) {
      const rows = stmt.all() as Record<string, unknown>[];
      for (const row of rows) {
        console.log(
          Object.values(row)
            .map((v) => (v === null ? '' : String(v)))
            .join('|'),
        );
      }
    } else {
      // bun:sqlite happily prepares compound mutations but stmt.run() executes
      // only the first statement. Route through db.exec() instead, which runs
      // every statement in the buffer — matches the previous better-sqlite3
      // db.exec fallback behavior for skills that submit "DELETE …; INSERT …;".
      db.exec(sql);
    }
  }
} finally {
  db.close();
}
