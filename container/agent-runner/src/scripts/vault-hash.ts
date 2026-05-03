/**
 * Phase 2 T-2.2 — fs-watcher for the household Obsidian vault.
 *
 * Runs as a task `script` body (bash invokes `bun /app/src/scripts/vault-hash.ts
 * <vaultRoot> <stateFile>`). Prints exactly one JSON line to stdout that the
 * scheduling pre-task gate reads:
 *
 *   { "wakeAgent": true|false, "data": { ...details } }
 *
 * Decisions:
 *
 * - Hash content, not mtime. iCloud touches mtimes spuriously when devices
 *   sync, and we don't want one wake per phone-pickup.
 * - Path-aware. A move from a/x.md to b/x.md changes the hash even though
 *   content is identical — file location matters semantically (PARA folder
 *   movement = a meaningful event for the household).
 * - Exclude vault metadata churn: `.obsidian/`, `.DS_Store`, `.trash/`. These
 *   change constantly without user-visible impact and would drown real diffs.
 * - First run is silent. A fresh deploy hashing the vault for the first time
 *   shouldn't burn an agent invocation as a phantom diff. Record baseline,
 *   return wakeAgent:false. Subsequent runs compare.
 * - Missing vault root is a soft-fail: wakeAgent:false, vaultMissing flag in
 *   data. Failed mount or fresh deploy that hasn't symlinked yet shouldn't
 *   spam the agent with "vault disappeared!" wakes.
 * - Per-file diff: state file persists a {relpath: fileHash} map so each tick
 *   can return added/removed/modified lists. Without this the agent gets
 *   only an aggregate hash delta, can't assess what the change is, and
 *   correctly stays silent every fire (which makes the watcher useless).
 *
 * Tests live alongside in vault-hash.test.ts and run under bun:test.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const EXCLUDE_DIR_NAMES = new Set(['.obsidian', '.trash']);
const EXCLUDE_BASENAMES = new Set(['.DS_Store']);

export interface VaultState {
  hash: string;
  fileCount: number;
  /** Per-file content hashes, keyed by vault-relative path. */
  files: Record<string, string>;
}

export interface FsWatcherDecisionData {
  fileCount: number;
  firstRun?: boolean;
  prevHash?: string;
  currHash?: string;
  vaultMissing?: boolean;
  /** Relpaths newly present since the last tick. Sorted. */
  added?: string[];
  /** Relpaths gone since the last tick. Sorted. */
  removed?: string[];
  /** Relpaths whose content changed since the last tick. Sorted. */
  modified?: string[];
}

export interface FsWatcherDecision {
  wakeAgent: boolean;
  data: FsWatcherDecisionData;
}

function isExcluded(rel: string): boolean {
  if (rel === '') return false;
  const base = path.basename(rel);
  if (EXCLUDE_BASENAMES.has(base)) return true;
  // Reject if any path component is in the dir-name exclude set.
  for (const part of rel.split(path.sep)) {
    if (EXCLUDE_DIR_NAMES.has(part)) return true;
  }
  return false;
}

function walkFiles(rootPath: string): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  function recurse(dirAbs: string, dirRel: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const childAbs = path.join(dirAbs, entry.name);
      const childRel = dirRel === '' ? entry.name : path.join(dirRel, entry.name);
      if (isExcluded(childRel)) continue;
      if (entry.isDirectory()) {
        recurse(childAbs, childRel);
      } else if (entry.isFile()) {
        out.push({ rel: childRel, abs: childAbs });
      }
      // Symlinks are not followed — Obsidian vault internals don't use them
      // at the user level, and following could explode the scan if a user
      // points one at /.
    }
  }
  recurse(rootPath, '');
  return out;
}

export function computeVaultState(rootPath: string): VaultState {
  if (!fs.existsSync(rootPath)) {
    return { hash: '__MISSING__', fileCount: 0, files: {} };
  }
  const files = walkFiles(rootPath);
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const accumulator = createHash('sha256');
  const perFile: Record<string, string> = {};
  for (const f of files) {
    let content: Buffer;
    try {
      content = fs.readFileSync(f.abs);
    } catch {
      // Read race (file deleted mid-scan) — treat as absent. The next tick
      // will reflect the deletion in the path list.
      continue;
    }
    const fileHash = createHash('sha256').update(content).digest('hex');
    perFile[f.rel] = fileHash;
    // Including a separator avoids any chance of (rel, hash) collisions
    // where different inputs produce the same flat string.
    accumulator.update(f.rel);
    accumulator.update('\0');
    accumulator.update(fileHash);
    accumulator.update('\n');
  }

  return {
    hash: accumulator.digest('hex'),
    fileCount: Object.keys(perFile).length,
    files: perFile,
  };
}

interface PersistedState {
  hash: string;
  fileCount: number;
  /** Required since the per-file-diff upgrade. Legacy state files lack this. */
  files: Record<string, string>;
  updatedAt: string;
}

function readState(statePath: string): PersistedState | null {
  if (!fs.existsSync(statePath)) return null;
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (typeof parsed.hash !== 'string') return null;
    // Legacy state files (pre-per-file-diff) lack the `files` map. Treat as
    // missing → re-baseline. The agent gets one silent tick instead of a
    // bogus "everything changed" wake during the format upgrade.
    if (!parsed.files || typeof parsed.files !== 'object') return null;
    return parsed as PersistedState;
  } catch {
    return null;
  }
}

function writeState(statePath: string, state: VaultState): void {
  const payload: PersistedState = {
    hash: state.hash,
    fileCount: state.fileCount,
    files: state.files,
    updatedAt: new Date().toISOString(),
  };
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(payload, null, 2));
}

function diffFiles(
  prev: Record<string, string>,
  curr: Record<string, string>,
): { added: string[]; removed: string[]; modified: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  for (const rel of Object.keys(curr)) {
    if (!(rel in prev)) added.push(rel);
    else if (prev[rel] !== curr[rel]) modified.push(rel);
  }
  for (const rel of Object.keys(prev)) {
    if (!(rel in curr)) removed.push(rel);
  }

  added.sort();
  removed.sort();
  modified.sort();
  return { added, removed, modified };
}

export function fsWatcherDecide(rootPath: string, statePath: string): FsWatcherDecision {
  if (!fs.existsSync(rootPath)) {
    return { wakeAgent: false, data: { fileCount: 0, vaultMissing: true } };
  }

  const current = computeVaultState(rootPath);
  const prev = readState(statePath);

  if (!prev) {
    writeState(statePath, current);
    return {
      wakeAgent: false,
      data: { fileCount: current.fileCount, firstRun: true, currHash: current.hash },
    };
  }

  if (prev.hash === current.hash) {
    return { wakeAgent: false, data: { fileCount: current.fileCount } };
  }

  writeState(statePath, current);
  const { added, removed, modified } = diffFiles(prev.files, current.files);
  return {
    wakeAgent: true,
    data: {
      fileCount: current.fileCount,
      prevHash: prev.hash,
      currHash: current.hash,
      added,
      removed,
      modified,
    },
  };
}

// CLI entry — bash invokes `bun /app/src/scripts/vault-hash.ts <root> <state>`.
// Extracted as a testable function. The scheduling task-script reader takes
// the last stdout line as JSON.
//
// `argv` mirrors `process.argv` shape: [bin, script, ...args]. Returns the
// process exit code; tests can assert it without ending the test runner.
export function cliMain(
  argv: string[],
  io: { out: (s: string) => void; err: (s: string) => void } = {
    out: (s) => console.log(s),
    err: (s) => console.error(s),
  },
): number {
  const [, , rootPath, statePath] = argv;
  if (!rootPath || !statePath) {
    io.err('usage: bun vault-hash.ts <vaultRoot> <stateFile>');
    return 2;
  }
  const decision = fsWatcherDecide(rootPath, statePath);
  io.out(JSON.stringify(decision));
  return 0;
}

// CLI bootstrap lives in vault-hash-cli.ts — that file's only job is to
// invoke cliMain(process.argv) so this module stays 100% library-only and
// fully unit-testable. The scheduling task script invokes vault-hash-cli.ts
// directly; see DEFAULT_FS_WATCHER_SCRIPT in src/modules/scheduling/fs-watcher.ts
// (host-side helper).
