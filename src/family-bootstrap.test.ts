import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapFamilyFolder, FAMILY_PARA_FOLDERS, FAMILY_SKILL_TIERS } from './family-bootstrap.js';

describe('bootstrapFamilyFolder', () => {
  let baseDir: string;
  let target: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'family-bootstrap-'));
    target = join(baseDir, 'family');
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('creates the PARA folders with .gitkeep markers', () => {
    bootstrapFamilyFolder(target);

    for (const folder of FAMILY_PARA_FOLDERS) {
      const dir = join(target, folder);
      expect(statSync(dir).isDirectory(), `${folder}/ should be a directory`).toBe(true);
      expect(existsSync(join(dir, '.gitkeep')), `${folder}/.gitkeep should exist`).toBe(true);
    }
  });

  it('creates the skills tier folders with .gitkeep markers', () => {
    bootstrapFamilyFolder(target);

    expect(statSync(join(target, 'skills')).isDirectory()).toBe(true);
    for (const tier of FAMILY_SKILL_TIERS) {
      const dir = join(target, 'skills', tier);
      expect(statSync(dir).isDirectory(), `skills/${tier}/ should be a directory`).toBe(true);
      expect(existsSync(join(dir, '.gitkeep')), `skills/${tier}/.gitkeep should exist`).toBe(true);
    }
  });

  it('is idempotent: a second call is a no-op and does not overwrite existing files', () => {
    bootstrapFamilyFolder(target);

    const userNote = join(target, 'projects', 'birthday-party.md');
    writeFileSync(userNote, '# Birthday party planning\n');

    expect(() => bootstrapFamilyFolder(target)).not.toThrow();

    expect(readFileSync(userNote, 'utf8')).toBe('# Birthday party planning\n');
    for (const folder of FAMILY_PARA_FOLDERS) {
      expect(existsSync(join(target, folder, '.gitkeep'))).toBe(true);
    }
  });

  it('creates the target directory if missing', () => {
    expect(existsSync(target)).toBe(false);
    bootstrapFamilyFolder(target);
    expect(statSync(target).isDirectory()).toBe(true);
  });
});
