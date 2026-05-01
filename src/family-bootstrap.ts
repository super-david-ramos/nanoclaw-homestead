import { closeSync, existsSync, lstatSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';

export const FAMILY_PARA_FOLDERS = ['projects', 'areas', 'resources', 'archive', 'conversations'] as const;

export const FAMILY_SKILL_TIERS = ['users', 'roles', 'shared'] as const;

function ensureGitkeptDir(dir: string): void {
  // If this PARA folder has been symlinked out (e.g. to an Obsidian / iCloud
  // vault root for browsing), don't pollute the symlinked target with a
  // .gitkeep marker. The symlink existing is itself enough for the host
  // and container to mount the path.
  if (existsSync(dir) && lstatSync(dir).isSymbolicLink()) return;
  mkdirSync(dir, { recursive: true });
  const marker = join(dir, '.gitkeep');
  if (!existsSync(marker)) {
    closeSync(openSync(marker, 'w'));
  }
}

export function bootstrapFamilyFolder(targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });

  for (const folder of FAMILY_PARA_FOLDERS) {
    ensureGitkeptDir(join(targetDir, folder));
  }

  for (const tier of FAMILY_SKILL_TIERS) {
    ensureGitkeptDir(join(targetDir, 'skills', tier));
  }
}

const invokedAsScript =
  typeof process !== 'undefined' && process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (invokedAsScript) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: tsx src/family-bootstrap.ts <target-dir>');
    process.exit(1);
  }
  bootstrapFamilyFolder(target);
  console.log(`Bootstrapped ${target}`);
}
