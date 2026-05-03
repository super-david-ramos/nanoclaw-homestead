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
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { cliMain, computeVaultState, fsWatcherDecide } from './vault-hash.js';

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

    fs.mkdirSync(path.join(VAULT, 'subdir'), { recursive: true });
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

  it('returns __MISSING__ sentinel state when the root path does not exist', () => {
    // Direct call (fsWatcherDecide guards earlier; computeVaultState is also
    // a public export so we cover its early-return branch independently).
    const result = computeVaultState('/tmp/definitely-does-not-exist-' + Date.now());
    expect(result.hash).toBe('__MISSING__');
    expect(result.fileCount).toBe(0);
    expect(result.files).toEqual({});
  });

  it('skips unreadable subdirectories without throwing', () => {
    // walkFiles wraps readdirSync in try/catch so a single permission-denied
    // subdirectory doesn't sink the scan. Test by chmod 000 on a child dir.
    write('areas/health.md', 'h1');
    fs.mkdirSync(path.join(VAULT, 'locked'), { recursive: true });
    fs.writeFileSync(path.join(VAULT, 'locked/secret.md'), 'should not be read');
    fs.chmodSync(path.join(VAULT, 'locked'), 0o000);

    try {
      const result = computeVaultState(VAULT);
      // Only the readable file is hashed.
      expect(result.fileCount).toBe(1);
      expect(Object.keys(result.files)).toEqual(['areas/health.md']);
    } finally {
      // Restore permissions so afterEach can clean up.
      fs.chmodSync(path.join(VAULT, 'locked'), 0o755);
    }
  });

  it('handles a file deleted mid-scan (read race) by skipping it', () => {
    // Surrounding code path: deletion between two consecutive scans is
    // visible in the next result (no crash, fileCount drops).
    write('a.md', 'a');
    write('b.md', 'b');
    const before = computeVaultState(VAULT);
    expect(before.fileCount).toBe(2);

    fs.rmSync(path.join(VAULT, 'b.md'));
    const after = computeVaultState(VAULT);
    expect(after.fileCount).toBe(1);
    expect(Object.keys(after.files)).toEqual(['a.md']);
  });

  it('exercises the read-race catch when readFileSync throws mid-scan', () => {
    // The catch on line 116 fires when walkFiles returned a path but
    // readFileSync subsequently throws (file deleted between the readdir
    // and read steps). Spy on fs.readFileSync to simulate that race for
    // one specific file.
    write('a.md', 'a-content');
    write('b.md', 'b-content');

    const orig = fs.readFileSync;
    const spy = spyOn(fs, 'readFileSync').mockImplementation(((p: string, ...rest: unknown[]) => {
      if (typeof p === 'string' && p.endsWith('/b.md')) {
        throw new Error('ENOENT: vanished mid-scan');
      }
      return (orig as any)(p, ...rest);
    }) as typeof fs.readFileSync);

    try {
      const result = computeVaultState(VAULT);
      // a.md was readable; b.md vanished mid-read and got skipped quietly.
      expect(result.fileCount).toBe(1);
      expect(Object.keys(result.files)).toEqual(['a.md']);
    } finally {
      spy.mockRestore();
    }
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

// -----------------------------------------------------------------------------
// cliMain — the testable CLI entry. Returns an exit code so tests assert it
// without ending the runner. task-script.ts depends on the last stdout line
// parsing as JSON, so we lock that contract here.
// -----------------------------------------------------------------------------

describe('cliMain', () => {
  it('prints a JSON decision and returns 0 on valid args', () => {
    fs.mkdirSync(VAULT, { recursive: true });
    fs.writeFileSync(path.join(VAULT, 'a.md'), 'a');

    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = cliMain(['bun', 'vault-hash.ts', VAULT, STATE], {
      out: (s) => stdout.push(s),
      err: (s) => stderr.push(s),
    });

    expect(code).toBe(0);
    expect(stdout).toHaveLength(1);
    const decision = JSON.parse(stdout[0]);
    expect(decision.wakeAgent).toBe(false);
    expect(decision.data.firstRun).toBe(true);
    expect(decision.data.fileCount).toBe(1);
    expect(stderr).toHaveLength(0);
  });

  it('returns 2 with usage error on missing rootPath', () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = cliMain(['bun', 'vault-hash.ts'], {
      out: (s) => stdout.push(s),
      err: (s) => stderr.push(s),
    });

    expect(code).toBe(2);
    expect(stderr.join('\n')).toContain('usage:');
    expect(stdout).toHaveLength(0);
  });

  it('returns 2 when only one arg is provided', () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = cliMain(['bun', 'vault-hash.ts', VAULT], {
      out: (s) => stdout.push(s),
      err: (s) => stderr.push(s),
    });

    expect(code).toBe(2);
    expect(stderr.join('\n')).toContain('usage:');
  });

  it('uses console default IO when no io override is supplied — success path', () => {
    // Default io path — covers the optional-parameter default's `out` closure.
    fs.mkdirSync(VAULT, { recursive: true });
    fs.writeFileSync(path.join(VAULT, 'a.md'), 'a');

    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const code = cliMain(['bun', 'vault-hash.ts', VAULT, STATE]);
      expect(code).toBe(0);
      expect(logSpy).toHaveBeenCalledTimes(1);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('uses console default IO when no io override is supplied — error path', () => {
    // Default io path — covers the optional-parameter default's `err` closure.
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const code = cliMain(['bun', 'vault-hash.ts']); // missing args
      expect(code).toBe(2);
      expect(errSpy).toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});

// -----------------------------------------------------------------------------
// per-file diff (T-2.2 follow-up: agent needs to know WHAT changed, not just
// THAT something changed — without it, Barnaby correctly stays silent on every
// fire because he can't tell whether the change is noteworthy)
// -----------------------------------------------------------------------------

describe('fsWatcherDecide diff', () => {
  it('content edit reports the relpath under modified, leaves added/removed empty', () => {
    write('areas/health.md', 'v1');
    write('projects/garden.md', 'g1');
    fsWatcherDecide(VAULT, STATE);

    write('areas/health.md', 'v2');
    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(true);
    expect(decision.data.modified).toEqual(['areas/health.md']);
    expect(decision.data.added).toEqual([]);
    expect(decision.data.removed).toEqual([]);
  });

  it('new file reports the relpath under added', () => {
    write('areas/health.md', 'v1');
    fsWatcherDecide(VAULT, STATE);

    write('projects/garden.md', 'g1');
    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(true);
    expect(decision.data.added).toEqual(['projects/garden.md']);
    expect(decision.data.modified).toEqual([]);
    expect(decision.data.removed).toEqual([]);
  });

  it('deleted file reports the relpath under removed', () => {
    write('areas/health.md', 'v1');
    write('projects/garden.md', 'g1');
    fsWatcherDecide(VAULT, STATE);

    fs.rmSync(path.join(VAULT, 'projects/garden.md'));
    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(true);
    expect(decision.data.removed).toEqual(['projects/garden.md']);
    expect(decision.data.added).toEqual([]);
    expect(decision.data.modified).toEqual([]);
  });

  it('moved file shows up as removed-then-added (path change is what matters semantically)', () => {
    write('areas/health.md', 'v1');
    fsWatcherDecide(VAULT, STATE);

    fs.mkdirSync(path.join(VAULT, 'projects'), { recursive: true });
    fs.renameSync(path.join(VAULT, 'areas/health.md'), path.join(VAULT, 'projects/health.md'));
    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(true);
    expect(decision.data.removed).toEqual(['areas/health.md']);
    expect(decision.data.added).toEqual(['projects/health.md']);
    expect(decision.data.modified).toEqual([]);
  });

  it('mixed change populates all three lists, sorted by relpath', () => {
    write('a.md', 'a1');
    write('b.md', 'b1');
    write('c.md', 'c1');
    fsWatcherDecide(VAULT, STATE);

    write('a.md', 'a2'); // modified
    fs.rmSync(path.join(VAULT, 'b.md')); // removed
    write('d.md', 'd1'); // added
    write('e.md', 'e1'); // added
    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(true);
    expect(decision.data.modified).toEqual(['a.md']);
    expect(decision.data.removed).toEqual(['b.md']);
    expect(decision.data.added).toEqual(['d.md', 'e.md']);
  });

  it('first run does not include diff lists — they are not meaningful pre-baseline', () => {
    write('a.md', 'a1');
    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(false);
    expect(decision.data.firstRun).toBe(true);
    expect(decision.data.added).toBeUndefined();
    expect(decision.data.removed).toBeUndefined();
    expect(decision.data.modified).toBeUndefined();
  });

  it('persists per-file hashes so successive ticks can diff the next tick', () => {
    write('a.md', 'a1');
    write('b.md', 'b1');
    fsWatcherDecide(VAULT, STATE);

    const persisted = JSON.parse(fs.readFileSync(STATE, 'utf8')) as {
      files?: Record<string, string>;
    };
    expect(persisted.files).toBeDefined();
    expect(Object.keys(persisted.files!).sort()).toEqual(['a.md', 'b.md']);
    // Hashes are non-empty strings.
    expect(persisted.files!['a.md'].length).toBeGreaterThan(0);
    expect(persisted.files!['b.md'].length).toBeGreaterThan(0);
  });

  it('garbage state file (invalid JSON) is treated as missing — re-baselines silently', () => {
    write('a.md', 'a1');
    fs.writeFileSync(STATE, 'not json {{{');

    const decision = fsWatcherDecide(VAULT, STATE);

    expect(decision.wakeAgent).toBe(false);
    expect(decision.data.firstRun).toBe(true);

    const persisted = JSON.parse(fs.readFileSync(STATE, 'utf8')) as { hash: string };
    expect(typeof persisted.hash).toBe('string');
  });

  it('state file with non-string hash is treated as missing', () => {
    // Defensive: if some previous version wrote a numeric or null hash,
    // we should not crash trying to compare it.
    write('a.md', 'a1');
    fs.writeFileSync(STATE, JSON.stringify({ hash: 123, files: {} }));

    const decision = fsWatcherDecide(VAULT, STATE);
    expect(decision.wakeAgent).toBe(false);
    expect(decision.data.firstRun).toBe(true);
  });

  it('legacy state file (no per-file map) is treated as missing — re-baselines silently', () => {
    // Simulate an old state file from before the per-file upgrade.
    write('a.md', 'a1');
    fs.writeFileSync(
      STATE,
      JSON.stringify({ hash: 'legacy-hash', fileCount: 1, updatedAt: new Date().toISOString() }),
    );

    const decision = fsWatcherDecide(VAULT, STATE);

    // Silent re-baseline — no spurious wake from the format upgrade.
    expect(decision.wakeAgent).toBe(false);
    expect(decision.data.firstRun).toBe(true);

    // The new state file has the per-file map.
    const persisted = JSON.parse(fs.readFileSync(STATE, 'utf8')) as {
      files?: Record<string, string>;
    };
    expect(persisted.files).toBeDefined();
    expect(Object.keys(persisted.files!)).toEqual(['a.md']);
  });
});
