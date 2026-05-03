/**
 * CLI bootstrap for vault-hash. Kept in a separate file so vault-hash.ts
 * itself is 100% library code (no execution side-effects on import).
 *
 * Invoked by the fs-watcher schedule_task script body:
 *   bun /app/src/scripts/vault-hash-cli.ts <vaultRoot> <stateFile>
 *
 * cliMain owns the testable surface; this module only wires process.argv +
 * the exit code.
 */
import { cliMain } from './vault-hash.js';

const code = cliMain(process.argv);
if (code !== 0) process.exit(code);
