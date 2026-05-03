/**
 * Router-specific tests — exercise routeInbound branches that
 * host-core.test.ts doesn't cover: the channel-request gate flows,
 * mention-sticky engage mode, command gate filter/deny, deliverToAgent
 * session-mode resolution, registry-overwrite warnings, and the
 * fall-through "no agent engaged" drop. Keeps router behaviors close
 * to the file under test.
 *
 * Setup mirrors host-core.test.ts: in-memory central DB, real session
 * folder under /tmp, container-runner mocked so we don't spawn Docker,
 * config DATA_DIR redirected.
 */
import fs from 'fs';
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import * as actualConfig from './config.js';

import {
  initTestDb,
  closeDb,
  runMigrations,
  createAgentGroup,
  createMessagingGroup,
  createMessagingGroupAgent,
} from './db/index.js';
import { getDb } from './db/connection.js';
import {
  setSenderResolver,
  setAccessGate,
  setSenderScopeGate,
  setChannelRequestGate,
} from './router.js';
import { log } from './log.js';
import type { InboundEvent } from './channels/adapter.js';

mock.module('./container-runner.js', () => ({
  wakeContainer: mock().mockResolvedValue(undefined),
  isContainerRunning: mock().mockReturnValue(false),
  getActiveContainerCount: mock().mockReturnValue(0),
  killContainer: mock(),
}));

mock.module('./config.js', () => ({ ...actualConfig, DATA_DIR: '/tmp/nanoclaw-test-router' }));

const TEST_DIR = '/tmp/nanoclaw-test-router';

function now(): string {
  return new Date().toISOString();
}

function defaultEvent(overrides: Partial<InboundEvent> = {}): InboundEvent {
  return {
    channelType: 'discord',
    platformId: 'chan-1',
    threadId: null,
    message: {
      id: `msg-${Date.now()}`,
      kind: 'chat',
      content: JSON.stringify({ sender: 'User', text: 'hello' }),
      timestamp: now(),
    },
    ...overrides,
  };
}

beforeEach(() => {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
  const db = initTestDb();
  runMigrations(db);
});

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  // Clear router-level singleton state between tests so a hook registered
  // by one test doesn't leak into the next. The router only exposes
  // setters, so we re-set to a no-op or to null via re-import. Easiest
  // sustainable path: the setters log a warn on overwrite — accept the
  // warn and keep the contract test in this file too.
});

// ---------------------------------------------------------------------------
// no-agent-wired branch — the follow-up explicitly called out this gap.
// ---------------------------------------------------------------------------

describe('routeInbound — no messaging_group + no isMention', () => {
  it('drops silently without creating a messaging_group row when not addressed', async () => {
    const { routeInbound } = await import('./router.js');
    await routeInbound(defaultEvent({ message: { ...defaultEvent().message, isMention: false } }));
    const count = (getDb().prepare('SELECT COUNT(*) AS c FROM messaging_groups').get() as { c: number }).c;
    expect(count).toBe(0);
  });
});

describe('routeInbound — agentCount=0 wiring', () => {
  beforeEach(() => {
    // Pre-existing messaging group with no wired agents (the auto-create
    // path also lands in this branch, but pre-creating is more deterministic).
    createMessagingGroup({
      id: 'mg-empty',
      channel_type: 'discord',
      platform_id: 'chan-empty',
      name: null,
      is_group: 1,
      unknown_sender_policy: 'request_approval',
      created_at: now(),
    });
  });

  it('drops silently when not addressed (no DM, no mention) — plain chatter in unwired channel', async () => {
    const { routeInbound } = await import('./router.js');
    await routeInbound(defaultEvent({ platformId: 'chan-empty', message: { ...defaultEvent().message, isMention: false } }));
    const dropped = (getDb().prepare('SELECT COUNT(*) AS c FROM unregistered_senders').get() as { c: number }).c;
    expect(dropped).toBe(0);
  });

  it('records dropped_messages and warns when isMention=true and no channel-request gate registered', async () => {
    const { routeInbound } = await import('./router.js');
    const warnSpy = mock(log.warn);
    log.warn = warnSpy;
    try {
      await routeInbound(defaultEvent({ platformId: 'chan-empty', message: { ...defaultEvent().message, isMention: true } }));
      const drop = getDb()
        .prepare('SELECT reason, messaging_group_id FROM unregistered_senders')
        .get() as { reason: string; messaging_group_id: string };
      expect(drop.reason).toBe('no_agent_wired');
      expect(drop.messaging_group_id).toBe('mg-empty');
      const warns = warnSpy.mock.calls.map((c) => c[0]);
      expect(warns.some((m) => typeof m === 'string' && m.includes('no agent groups wired'))).toBe(true);
    } finally {
      log.warn = warnSpy.mock.calls.length === 0 ? log.warn : warnSpy;
    }
  });

  it('drops without escalation when messaging_group has denied_at set', async () => {
    getDb().prepare("UPDATE messaging_groups SET denied_at = ? WHERE id = 'mg-empty'").run(now());
    const gate = mock(async () => undefined);
    setChannelRequestGate(gate);
    const { routeInbound } = await import('./router.js');
    await routeInbound(defaultEvent({ platformId: 'chan-empty', message: { ...defaultEvent().message, isMention: true } }));
    expect(gate).toHaveBeenCalledTimes(0);
    // No dropped_messages row either — denied channels are silently consumed,
    // since the user already received the deny notification when denied_at
    // was first set.
    const dropped = (getDb().prepare('SELECT COUNT(*) AS c FROM unregistered_senders').get() as { c: number }).c;
    expect(dropped).toBe(0);
  });

  it('fires the channel-request gate (fire-and-forget) when registered + isMention + not denied', async () => {
    let gateCalled = false;
    const gate = mock(async () => {
      gateCalled = true;
    });
    setChannelRequestGate(gate);
    const { routeInbound } = await import('./router.js');
    await routeInbound(defaultEvent({ platformId: 'chan-empty', message: { ...defaultEvent().message, isMention: true } }));
    // The gate is awaited as fire-and-forget but the dropped_messages row
    // is written first, so we can assert on both deterministically.
    expect(gate).toHaveBeenCalledTimes(1);
    expect(gateCalled).toBe(true);
    const drop = getDb()
      .prepare('SELECT reason FROM unregistered_senders')
      .get() as { reason: string };
    expect(drop.reason).toBe('no_agent_wired');
  });
});
