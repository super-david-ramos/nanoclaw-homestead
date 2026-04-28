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

describe('auto-skill-save SKILL.md structure', () => {
  const { frontmatter, body } = splitFrontmatter(raw);
  const fm = parseFrontmatter(frontmatter);

  it('declares name = auto-skill-save', () => {
    expect(fm.name).toBe('auto-skill-save');
  });

  it('description mentions the eligibility threshold or approval gate', () => {
    expect(fm.description).toBeDefined();
    expect(fm.description.length).toBeGreaterThan(20);
    const mentionsThreshold = /5\+\s*tool calls/i.test(fm.description);
    const mentionsApproval = /approval/i.test(fm.description);
    expect(
      mentionsThreshold || mentionsApproval,
      'description must reference the 5+ tool-call threshold or the approval gate',
    ).toBe(true);
  });

  it('contains required section headers', () => {
    const required = [
      '## When to consider running',
      '## What NOT to save',
      '## The propose-and-confirm flow',
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
