/**
 * Tests for the runner's container.json loader. Focused on the `model` field
 * since that's the new addition; existing fields are smoke-tested for
 * defaults to lock the contract.
 *
 * loadConfig() reads from a hard-coded /workspace/agent/container.json path
 * which we can't easily redirect without dependency injection. We exercise
 * the parsing logic via a parallel parseConfig export instead.
 */
import { describe, it, expect } from 'bun:test';

import { parseConfig } from './config.js';

describe('parseConfig — model field', () => {
  it('returns model when set', () => {
    const cfg = parseConfig({ model: 'claude-haiku-4-5-20251001' });
    expect(cfg.model).toBe('claude-haiku-4-5-20251001');
  });

  it('returns undefined model when absent (default = SDK chooses, currently sonnet)', () => {
    const cfg = parseConfig({});
    expect(cfg.model).toBeUndefined();
  });

  it('ignores non-string model values defensively', () => {
    // Wrong type in the JSON shouldn't crash the runner; treat as unset.
    const cfg = parseConfig({ model: 42 as unknown as string });
    expect(cfg.model).toBeUndefined();

    const cfg2 = parseConfig({ model: null as unknown as string });
    expect(cfg2.model).toBeUndefined();
  });

  it('preserves other fields alongside model', () => {
    const cfg = parseConfig({
      provider: 'claude',
      assistantName: 'BarnabyTest',
      model: 'claude-haiku-4-5-20251001',
    });
    expect(cfg.provider).toBe('claude');
    expect(cfg.assistantName).toBe('BarnabyTest');
    expect(cfg.model).toBe('claude-haiku-4-5-20251001');
  });
});

describe('parseConfig — defaults', () => {
  it('falls back to provider=claude when unset', () => {
    expect(parseConfig({}).provider).toBe('claude');
  });

  it('falls back to maxMessagesPerPrompt=10 when unset', () => {
    expect(parseConfig({}).maxMessagesPerPrompt).toBe(10);
  });

  it('preserves explicit overrides', () => {
    const cfg = parseConfig({ provider: 'opencode', maxMessagesPerPrompt: 5 });
    expect(cfg.provider).toBe('opencode');
    expect(cfg.maxMessagesPerPrompt).toBe(5);
  });
});
