import type { Database } from 'bun:sqlite';
import type { Migration } from './index.js';

export const migration015: Migration = {
  version: 15,
  name: 'cli-scope',
  up(db: Database) {
    db.prepare("ALTER TABLE container_configs ADD COLUMN cli_scope TEXT NOT NULL DEFAULT 'group'").run();
  },
};
