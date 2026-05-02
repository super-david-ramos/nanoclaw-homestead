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
}

export interface FsWatcherDecisionData {
  fileCount: number;
  firstRun?: boolean;
  prevHash?: string;
  currHash?: string;
  vaultMissing?: boolean;
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
    return { hash: '__MISSING__', fileCount: 0 };
  }
  const files = walkFiles(rootPath);
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const accumulator = createHash('sha256');
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
    // Including a separator avoids any chance of (rel, hash) collisions
    // where different inputs produce the same flat string.
    accumulator.update(f.rel);
    accumulator.update('\0');
    accumulator.update(fileHash);
    accumulator.update('\n');
  }

  return {
    hash: accumulator.digest('hex'),
    fileCount: files.length,
  };
}

interface PersistedState {
  hash: string;
  fileCount: number;
  updatedAt: string;
}

function readState(statePath: string): PersistedState | null {
  if (!fs.existsSync(statePath)) return null;
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw) as PersistedState;
    if (typeof parsed.hash !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeState(statePath: string, state: VaultState): void {
  const payload: PersistedState = {
    hash: state.hash,
    fileCount: state.fileCount,
    updatedAt: new Date().toISOString(),
  };
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(payload, null, 2));
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
  return {
    wakeAgent: true,
    data: {
      fileCount: current.fileCount,
      prevHash: prev.hash,
      currHash: current.hash,
    },
  };
}

// CLI entry — bash invokes `bun /app/src/scripts/vault-hash.ts <root> <state>`.
// Bun runs this file by URL when imported, so we gate the CLI block to only
// fire when invoked directly. The scheduling task-script reader takes the
// last stdout line as JSON.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const [, , rootPath, statePath] = process.argv;
  if (!rootPath || !statePath) {
    console.error('usage: bun vault-hash.ts <vaultRoot> <stateFile>');
    process.exit(2);
  }
  const decision = fsWatcherDecide(rootPath, statePath);
  console.log(JSON.stringify(decision));
}
