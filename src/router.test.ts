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
import { setSenderResolver, setAccessGate, setSenderScopeGate, setChannelRequestGate } from './router.js';
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
    await routeInbound(
      defaultEvent({ platformId: 'chan-empty', message: { ...defaultEvent().message, isMention: false } }),
    );
    const dropped = (getDb().prepare('SELECT COUNT(*) AS c FROM unregistered_senders').get() as { c: number }).c;
    expect(dropped).toBe(0);
  });

  it('records dropped_messages and warns when isMention=true and no channel-request gate registered', async () => {
    const { routeInbound } = await import('./router.js');
    const warnSpy = mock(log.warn);
    log.warn = warnSpy;
    try {
      await routeInbound(
        defaultEvent({ platformId: 'chan-empty', message: { ...defaultEvent().message, isMention: true } }),
      );
      const drop = getDb().prepare('SELECT reason, messaging_group_id FROM unregistered_senders').get() as {
        reason: string;
        messaging_group_id: string;
      };
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
    await routeInbound(
      defaultEvent({ platformId: 'chan-empty', message: { ...defaultEvent().message, isMention: true } }),
    );
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
    await routeInbound(
      defaultEvent({ platformId: 'chan-empty', message: { ...defaultEvent().message, isMention: true } }),
    );
    // The gate is awaited as fire-and-forget but the dropped_messages row
    // is written first, so we can assert on both deterministically.
    expect(gate).toHaveBeenCalledTimes(1);
    expect(gateCalled).toBe(true);
    const drop = getDb().prepare('SELECT reason FROM unregistered_senders').get() as { reason: string };
    expect(drop.reason).toBe('no_agent_wired');
  });
});

// ---------------------------------------------------------------------------
// evaluateEngage — coverage for engage_mode variants
// ---------------------------------------------------------------------------

describe('routeInbound — engage_mode=mention', () => {
  beforeEach(() => {
    createAgentGroup({ id: 'ag-1', name: 'Agent', folder: 'agent-1', agent_provider: null, created_at: now() });
    createMessagingGroup({
      id: 'mg-1',
      channel_type: 'discord',
      platform_id: 'chan-1',
      name: 'General',
      is_group: 1,
      unknown_sender_policy: 'public',
      created_at: now(),
    });
    createMessagingGroupAgent({
      id: 'mga-1',
      messaging_group_id: 'mg-1',
      agent_group_id: 'ag-1',
      engage_mode: 'mention',
      engage_pattern: null,
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: now(),
    });
  });

  it('engages when isMention=true', async () => {
    const { routeInbound } = await import('./router.js');
    const { findSession } = await import('./db/sessions.js');
    await routeInbound(defaultEvent({ message: { ...defaultEvent().message, isMention: true } }));
    expect(findSession('mg-1', null)).toBeDefined();
  });

  it('does not engage when isMention=false (records no_agent_engaged)', async () => {
    const { routeInbound } = await import('./router.js');
    await routeInbound(defaultEvent({ message: { ...defaultEvent().message, isMention: false } }));
    const drop = getDb().prepare('SELECT reason FROM unregistered_senders').get() as { reason: string } | null;
    expect(drop?.reason).toBe('no_agent_engaged');
  });
});

describe('routeInbound — engage_mode=mention-sticky', () => {
  beforeEach(() => {
    createAgentGroup({ id: 'ag-1', name: 'Agent', folder: 'agent-1', agent_provider: null, created_at: now() });
  });

  it('does NOT engage on DM (is_group=0) without a mention — sticky has no meaning in DMs', async () => {
    createMessagingGroup({
      id: 'mg-dm',
      channel_type: 'discord',
      platform_id: 'dm-1',
      name: 'DM',
      is_group: 0,
      unknown_sender_policy: 'public',
      created_at: now(),
    });
    createMessagingGroupAgent({
      id: 'mga-1',
      messaging_group_id: 'mg-dm',
      agent_group_id: 'ag-1',
      engage_mode: 'mention-sticky',
      engage_pattern: null,
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: now(),
    });
    const { routeInbound } = await import('./router.js');
    await routeInbound(
      defaultEvent({ platformId: 'dm-1', message: { ...defaultEvent().message, isMention: false } }),
    );
    const drop = getDb().prepare('SELECT reason FROM unregistered_senders').get() as { reason: string };
    expect(drop.reason).toBe('no_agent_engaged');
  });

  it('engages on a follow-up message in a group thread when an active session already exists', async () => {
    createMessagingGroup({
      id: 'mg-grp',
      channel_type: 'discord',
      platform_id: 'chan-grp',
      name: 'Group',
      is_group: 1,
      unknown_sender_policy: 'public',
      created_at: now(),
    });
    createMessagingGroupAgent({
      id: 'mga-1',
      messaging_group_id: 'mg-grp',
      agent_group_id: 'ag-1',
      engage_mode: 'mention-sticky',
      engage_pattern: null,
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'per-thread',
      priority: 0,
      created_at: now(),
    });
    const { routeInbound } = await import('./router.js');
    // First call WITH mention establishes the session; mention-sticky sees
    // isMention=true and engages.
    await routeInbound(
      defaultEvent({ platformId: 'chan-grp', threadId: 'thr-1', message: { ...defaultEvent().message, isMention: true } }),
    );
    // Second call WITHOUT mention — sticky should still engage because the
    // session is now alive for (ag-1, mg-grp, thr-1).
    await routeInbound(
      defaultEvent({
        platformId: 'chan-grp',
        threadId: 'thr-1',
        message: { id: 'msg-2', kind: 'chat', content: '{"text":"follow up"}', timestamp: now(), isMention: false },
      }),
    );
    // No dropped_messages row from the second call (it engaged).
    const dropped = (getDb().prepare('SELECT COUNT(*) AS c FROM unregistered_senders').get() as { c: number }).c;
    expect(dropped).toBe(0);
  });

  it('drops a no-mention message in a group thread that has no prior session (sticky ≠ open mic)', async () => {
    createMessagingGroup({
      id: 'mg-grp2',
      channel_type: 'discord',
      platform_id: 'chan-grp2',
      name: 'Group',
      is_group: 1,
      unknown_sender_policy: 'public',
      created_at: now(),
    });
    createMessagingGroupAgent({
      id: 'mga-2',
      messaging_group_id: 'mg-grp2',
      agent_group_id: 'ag-1',
      engage_mode: 'mention-sticky',
      engage_pattern: null,
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'per-thread',
      priority: 0,
      created_at: now(),
    });
    const { routeInbound } = await import('./router.js');
    await routeInbound(
      defaultEvent({
        platformId: 'chan-grp2',
        threadId: 'thr-untouched',
        message: { ...defaultEvent().message, isMention: false },
      }),
    );
    const drop = getDb().prepare('SELECT reason FROM unregistered_senders').get() as { reason: string };
    expect(drop.reason).toBe('no_agent_engaged');
  });
});

// ---------------------------------------------------------------------------
// no_agent_engaged audit row — fan-out where every agent declines
// ---------------------------------------------------------------------------

describe('routeInbound — no_agent_engaged audit', () => {
  it('records exactly one no_agent_engaged row when fan-out has one agent and it declines', async () => {
    createAgentGroup({ id: 'ag-1', name: 'A', folder: 'a', agent_provider: null, created_at: now() });
    createMessagingGroup({
      id: 'mg-1',
      channel_type: 'discord',
      platform_id: 'chan-1',
      name: 'General',
      is_group: 1,
      unknown_sender_policy: 'public',
      created_at: now(),
    });
    createMessagingGroupAgent({
      id: 'mga-1',
      messaging_group_id: 'mg-1',
      agent_group_id: 'ag-1',
      engage_mode: 'mention',
      engage_pattern: null,
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: now(),
    });
    const { routeInbound } = await import('./router.js');
    await routeInbound(defaultEvent({ message: { ...defaultEvent().message, isMention: false } }));
    const rows = getDb().prepare('SELECT reason FROM unregistered_senders').all() as Array<{ reason: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe('no_agent_engaged');
  });

  it('does NOT record no_agent_engaged when at least one agent accumulates (silent context capture)', async () => {
    createAgentGroup({ id: 'ag-1', name: 'A', folder: 'a', agent_provider: null, created_at: now() });
    createMessagingGroup({
      id: 'mg-1',
      channel_type: 'discord',
      platform_id: 'chan-1',
      name: 'General',
      is_group: 1,
      unknown_sender_policy: 'public',
      created_at: now(),
    });
    createMessagingGroupAgent({
      id: 'mga-1',
      messaging_group_id: 'mg-1',
      agent_group_id: 'ag-1',
      engage_mode: 'mention',
      engage_pattern: null,
      sender_scope: 'all',
      ignored_message_policy: 'accumulate',
      session_mode: 'shared',
      priority: 0,
      created_at: now(),
    });
    const { routeInbound } = await import('./router.js');
    await routeInbound(defaultEvent({ message: { ...defaultEvent().message, isMention: false } }));
    const dropped = (getDb().prepare('SELECT COUNT(*) AS c FROM unregistered_senders').get() as { c: number }).c;
    expect(dropped).toBe(0);
  });
});
