import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKILL_PATH = join(__dirname, '..', 'SKILL.md');
const raw = readFileSync(SKILL_PATH, 'utf8');

function splitFrontmatter(source: string): { frontmatter: string; body: string } {
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error('SKILL.md is missing a leading --- frontmatter block');
  }
  return { frontmatter: match[1], body: match[2] };
}

function parseFrontmatter(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

describe('role-resolver SKILL.md structure', () => {
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm = parseFrontmatter(frontmatter);

  it('declares name = role-resolver', () => {
    expect(fm.name).toBe('role-resolver');
  });

  it('has a non-empty description', () => {
    expect(fm.description).toBeDefined();
    expect(fm.description.length).toBeGreaterThan(20);
  });

  it('contains required section headers', () => {
    const required = [
      '## The rule',
      '## Where to read sender + role',
      '## Failure modes to avoid',
    ];
    for (const heading of required) {
      expect(body, `expected to find heading "${heading}"`).toContain(heading);
    }
  });

  it('matches the checked-in snapshot', () => {
    expect(raw).toMatchSnapshot();
  });
});
