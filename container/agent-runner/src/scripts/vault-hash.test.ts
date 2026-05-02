/**
 * Tests for vault-hash — the fs-watcher script that detects content changes in
 * the household's Obsidian vault. Runs inside the container as a task `script`
 * (bash invokes `bun /app/src/scripts/vault-hash.ts <root> <state>`); the
 * decision is what bridges into wakeAgent for the scheduled task.
 *
 * Hashes content not mtimes — iCloud touches mtimes spuriously on sync. Excludes
 * .obsidian/, .DS_Store, .trash/ so vault metadata churn doesn't fire false
 * wakes. First run records a baseline silently — phantom diffs from a fresh
 * deploy would burn an agent invocation for no reason.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { computeVaultState, fsWatcherDecide } from './vault-hash.js';

const ROOT = '/tmp/nanoclaw-vault-hash-test';
const VAULT = path.join(ROOT, 'vault');
const STATE = path.join(ROOT, 'state.json');

beforeEach(() => {
  if (fs.existsSync(ROOT)) fs.rmSync(ROOT, { recursive: true });
  fs.mkdirSync(VAULT, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(ROOT)) fs.rmSync(ROOT, { recursive: true });
});

function write(rel: string, content: string) {
  const p = path.join(VAULT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function bumpMtime(rel: string) {
  // Push mtime forward without changing content, simulating an iCloud touch.
  const p = path.join(VAULT, rel);
  const future = new Date(Date.now() + 60_000);
  fs.utimesSync(p, future, future);
}

// -----------------------------------------------------------------------------
// computeVaultState — pure content-hash function
// -----------------------------------------------------------------------------

describe('computeVaultState', () => {
  it('produces a stable hash for the same content, ignoring mtime', () => {
    write('areas/health.md', '# Health\n');
    write('projects/2026-q2.md', '# Q2\n');

    const a = computeVaultState(VAULT);
    bumpMtime('areas/health.md');
    bumpMtime('projects/2026-q2.md');
    const b = computeVaultState(VAULT);

    expect(a.hash).toBe(b.hash);
    expect(a.fileCount).toBe(2);
    expect(b.fileCount).toBe(2);
  });

  it('changes the hash when file content changes', () => {
    write('areas/health.md', '# Health\n');
    const before = computeVaultState(VAULT).hash;

    write('areas/health.md', '# Health\nupdated\n');
    const after = computeVaultState(VAULT).hash;

    expect(after).not.toBe(before);
  });

  it('changes the hash when a new file is added', () => {
    write('areas/health.md', '# Health\n');
    const before = computeVaultState(VAULT);

    write('projects/garden.md', '# Garden\n');
    const after = computeVaultState(VAULT);

    expect(after.hash).not.toBe(before.hash);
    expect(after.fileCount).toBe(2);
    expect(before.fileCount).toBe(1);
  });

  it('changes the hash when a file is removed', () => {
    write('a.md', 'a');
    write('b.md', 'b');
    const before = computeVaultState(VAULT);

    fs.rmSync(path.join(VAULT, 'b.md'));
    const after = computeVaultState(VAULT);

    expect(after.hash).not.toBe(before.hash);
    expect(after.fileCount).toBe(1);
  });

  it('hash includes the file path — moving a file changes the hash', () => {
    write('a.md', 'same content');
    const before = computeVaultState(VAULT).hash;

    fs.renameSync(path.join(VAULT, 'a.md'), path.join(VAULT, 'subdir/a.md'));
    const after = computeVaultState(VAULT).hash;

    expect(after).not.toBe(before);
  });

  it('excludes .obsidian/ — modifying it does not change the hash', () => {
    write('areas/health.md', '# Health\n');
    write('.obsidian/workspace.json', '{"x":1}');
    const before = computeVaultState(VAULT).hash;

    write('.obsidian/workspace.json', '{"x":2}');
    write('.obsidian/plugins/themes/foo.css', 'body{}');
    const after = computeVaultState(VAULT).hash;

    expect(after).toBe(before);
  });

  it('excludes .DS_Store at any depth', () => {
    write('areas/health.md', '# Health\n');
    write('.DS_Store', 'x');
    write('areas/.DS_Store', 'y');
    const before = computeVaultState(VAULT).hash;

    write('.DS_Store', 'mutated');
    write('areas/.DS_Store', 'mutated');
    const after = computeVaultState(VAULT).hash;

    expect(after).toBe(before);
  });

  it('excludes .trash/', () => {
    write('areas/health.md', '# Health\n');
    write('.trash/old-note.md', 'deleted');
    const before = computeVaultState(VAULT).hash;

    write('.trash/old-note.md', 'mutated trash');
    write('.trash/another.md', 'fresh trash');
    const after = computeVaultState(VAULT).hash;

    expect(after).toBe(before);
  });

  it('returns a stable empty-vault hash with fileCount=0', () => {
    const a = computeVaultState(VAULT);
    expect(a.fileCount).toBe(0);
    expect(typeof a.hash).toBe('string');
    expect(a.hash.length).toBeGreaterThan(0);

    // .obsidian/.DS_Store presence still counts as empty.
    write('.obsidian/x.json', '{}');
    write('.DS_Store', 'x');
    const b = computeVaultState(VAULT);
    expect(b.fileCount).toBe(0);
    expect(b.hash).toBe(a.hash);
  });
});

// -----------------------------------------------------------------------------
// fsWatcherDecide — read state → compute → compare → write → emit decision
// -----------------------------------------------------------------------------

describe('fsWatcherDecide', () => {
  it('first run records baseline silently — wakeAgent=false, firstRun:true', () => {
    write('areas/health.md', '# Health\n');
    expect(fs.existsSync(STATE)).toBe(false);

    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(false);
    expect(decision.data.firstRun).toBe(true);
    expect(decision.data.fileCount).toBe(1);
    expect(fs.existsSync(STATE)).toBe(true);
  });

  it('second run with no changes returns wakeAgent=false', () => {
    write('areas/health.md', '# Health\n');
    fsWatcherDecide(VAULT, STATE);

    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(false);
    expect(decision.data.firstRun).toBeUndefined();
    expect(decision.data.fileCount).toBe(1);
  });

  it('detecting a content change flips wakeAgent and updates the state', () => {
    write('areas/health.md', 'v1');
    fsWatcherDecide(VAULT, STATE);
    const stateAfterBaseline = JSON.parse(fs.readFileSync(STATE, 'utf8')) as { hash: string };

    write('areas/health.md', 'v2');
    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(true);
    expect(decision.data.fileCount).toBe(1);
    expect(decision.data.prevHash).toBe(stateAfterBaseline.hash);
    expect(decision.data.currHash).not.toBe(stateAfterBaseline.hash);

    const stateAfterChange = JSON.parse(fs.readFileSync(STATE, 'utf8')) as { hash: string };
    expect(stateAfterChange.hash).toBe(decision.data.currHash);
  });

  it('a second tick after a change returns wakeAgent=false (state was updated)', () => {
    write('areas/health.md', 'v1');
    fsWatcherDecide(VAULT, STATE);

    write('areas/health.md', 'v2');
    fsWatcherDecide(VAULT, STATE);

    const third = fsWatcherDecide(VAULT, STATE);
    expect(third.wakeAgent).toBe(false);
  });

  it('iCloud-style mtime-only touches do NOT flip wakeAgent', () => {
    write('areas/health.md', '# Health\n');
    fsWatcherDecide(VAULT, STATE);

    bumpMtime('areas/health.md');
    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(false);
  });

  it('changes in .obsidian/ do NOT flip wakeAgent', () => {
    write('areas/health.md', '# Health\n');
    write('.obsidian/workspace.json', '{}');
    fsWatcherDecide(VAULT, STATE);

    write('.obsidian/workspace.json', '{"changed":1}');
    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(false);
  });

  it('handles missing-vault-root gracefully — wakeAgent=false, no throw', () => {
    fs.rmSync(VAULT, { recursive: true });
    expect(() => fsWatcherDecide(VAULT, STATE)).not.toThrow();
    const decision = fsWatcherDecide(VAULT, STATE);
    expect(decision.wakeAgent).toBe(false);
  });
});
