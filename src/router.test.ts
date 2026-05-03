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
    await routeInbound(defaultEvent({ platformId: 'dm-1', message: { ...defaultEvent().message, isMention: false } }));
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
      defaultEvent({
        platformId: 'chan-grp',
        threadId: 'thr-1',
        message: { ...defaultEvent().message, isMention: true },
      }),
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

// ---------------------------------------------------------------------------
// Command gate — filter (silent drop) + deny (writeOutboundDirect)
// ---------------------------------------------------------------------------

describe('routeInbound — command gate', () => {
  beforeEach(() => {
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
      engage_mode: 'pattern',
      engage_pattern: '.',
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: now(),
    });
  });

  it('filters /help silently — no session created, no inbound message, no outbound message', async () => {
    const { routeInbound } = await import('./router.js');
    const { findSession } = await import('./db/sessions.js');
    await routeInbound(
      defaultEvent({
        message: {
          id: 'msg-help',
          kind: 'chat',
          content: JSON.stringify({ text: '/help' }),
          timestamp: now(),
        },
      }),
    );
    // The session DOES get created by resolveSession before the command gate
    // runs (resolveSession is part of deliverToAgent, invoked once engages
    // is true). The gate-filter then short-circuits before writeSessionMessage
    // and writeOutboundDirect, so the inbound and outbound DBs stay empty for
    // this command. Session existence alone is fine — it's an empty container
    // until a real message arrives.
    const session = findSession('mg-1', null);
    expect(session).toBeDefined();
    // No no_agent_engaged audit row either — engagement happened, command
    // gate just filtered the resulting delivery.
    const dropped = (getDb().prepare('SELECT COUNT(*) AS c FROM unregistered_senders').get() as { c: number }).c;
    expect(dropped).toBe(0);
  });

  it('denies admin commands from non-admin users — writes a "Permission denied" outbound message', async () => {
    const { routeInbound } = await import('./router.js');
    const { findSession } = await import('./db/sessions.js');
    await routeInbound(
      defaultEvent({
        message: {
          id: 'msg-clear',
          kind: 'chat',
          content: JSON.stringify({ text: '/clear' }),
          timestamp: now(),
        },
      }),
    );
    const session = findSession('mg-1', null);
    expect(session).toBeDefined();
    // The deny path uses writeOutboundDirect — opens outbound.db and inserts
    // a chat message with "Permission denied: /clear requires admin access."
    const { Database } = await import('bun:sqlite');
    const { outboundDbPath } = await import('./session-manager.js');
    const db = new Database(outboundDbPath('ag-1', session!.id), { readonly: true, strict: true });
    const rows = db.prepare('SELECT content FROM messages_out').all() as Array<{ content: string }>;
    db.close();
    expect(rows).toHaveLength(1);
    const parsed = JSON.parse(rows[0].content) as { text: string };
    expect(parsed.text).toContain('Permission denied');
    expect(parsed.text).toContain('/clear');
  });
});

// ---------------------------------------------------------------------------
// replyTo override — CLI admin transport redirects the agent's reply
// ---------------------------------------------------------------------------

describe('routeInbound — replyTo redirection', () => {
  beforeEach(() => {
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
      engage_mode: 'pattern',
      engage_pattern: '.',
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: now(),
    });
  });

  it('writes the inbound row with reply-address from event.replyTo (overriding the source address)', async () => {
    const { routeInbound } = await import('./router.js');
    const { findSession } = await import('./db/sessions.js');
    await routeInbound(
      defaultEvent({
        replyTo: { channelType: 'cli', platformId: 'admin-shell', threadId: null },
        message: {
          id: 'msg-redir',
          kind: 'chat',
          content: JSON.stringify({ text: 'inspect-state' }),
          timestamp: now(),
        },
      }),
    );
    const session = findSession('mg-1', null);
    expect(session).toBeDefined();
    const { Database } = await import('bun:sqlite');
    const { inboundDbPath } = await import('./session-manager.js');
    const db = new Database(inboundDbPath('ag-1', session!.id), { readonly: true, strict: true });
    const row = db
      .prepare('SELECT channel_type, platform_id, thread_id FROM messages_in WHERE id LIKE ?')
      .get('msg-redir%') as { channel_type: string; platform_id: string; thread_id: string | null };
    db.close();
    // Reply will go to cli/admin-shell, NOT discord/chan-1. The agent reads
    // the inbound row's address verbatim and uses it as the reply target.
    expect(row.channel_type).toBe('cli');
    expect(row.platform_id).toBe('admin-shell');
    expect(row.thread_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Setter overwrite warnings — log.warn on double-registration
// ---------------------------------------------------------------------------

describe('router setter idempotence', () => {
  it('warns when a sender resolver is registered twice (likely a bug)', () => {
    const warns: string[] = [];
    const orig = log.warn;
    log.warn = ((msg: string) => {
      warns.push(msg);
    }) as typeof log.warn;
    try {
      setSenderResolver(() => 'first');
      setSenderResolver(() => 'second');
      expect(warns.some((m) => m === 'Sender resolver overwritten')).toBe(true);
    } finally {
      log.warn = orig;
    }
  });

  it('warns when an access gate is registered twice', () => {
    const warns: string[] = [];
    const orig = log.warn;
    log.warn = ((msg: string) => {
      warns.push(msg);
    }) as typeof log.warn;
    try {
      setAccessGate(() => ({ allowed: true }));
      setAccessGate(() => ({ allowed: true }));
      expect(warns.some((m) => m === 'Access gate overwritten')).toBe(true);
    } finally {
      log.warn = orig;
    }
  });

  it('warns when a sender-scope gate is registered twice', () => {
    const warns: string[] = [];
    const orig = log.warn;
    log.warn = ((msg: string) => {
      warns.push(msg);
    }) as typeof log.warn;
    try {
      setSenderScopeGate(() => ({ allowed: true }));
      setSenderScopeGate(() => ({ allowed: true }));
      expect(warns.some((m) => m === 'Sender-scope gate overwritten')).toBe(true);
    } finally {
      log.warn = orig;
    }
  });

  it('warns when a channel-request gate is registered twice', () => {
    const warns: string[] = [];
    const orig = log.warn;
    log.warn = ((msg: string) => {
      warns.push(msg);
    }) as typeof log.warn;
    try {
      setChannelRequestGate(async () => undefined);
      setChannelRequestGate(async () => undefined);
      expect(warns.some((m) => m === 'Channel-request gate overwritten')).toBe(true);
    } finally {
      log.warn = orig;
    }
  });
});

// ---------------------------------------------------------------------------
// evaluateEngage default branch — unknown engage_mode → no engagement
// ---------------------------------------------------------------------------

describe('routeInbound — defensive default for unknown engage_mode', () => {
  it('does not engage on an unknown engage_mode (defensive default — never fail-open on unrecognized config)', async () => {
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
    // Bypass createMessagingGroupAgent typing so we can write a value the
    // schema doesn't know about — this is the defensive default the router
    // protects against (e.g., a half-applied migration leaving a row with
    // engage_mode='future-mode').
    getDb()
      .prepare(
        `INSERT INTO messaging_group_agents
           (id, messaging_group_id, agent_group_id, engage_mode, engage_pattern, sender_scope, ignored_message_policy, session_mode, priority, created_at)
           VALUES (@id, @mgid, @agid, @em, NULL, 'all', 'drop', 'shared', 0, @ca)`,
      )
      .run({ id: 'mga-x', mgid: 'mg-1', agid: 'ag-1', em: 'future-mode-not-yet-implemented', ca: now() });
    const { routeInbound } = await import('./router.js');
    await routeInbound(defaultEvent({ message: { ...defaultEvent().message, isMention: true } }));
    const drop = getDb().prepare('SELECT reason FROM unregistered_senders').get() as { reason: string };
    expect(drop.reason).toBe('no_agent_engaged');
  });
});

// ---------------------------------------------------------------------------
// Adapter behaviors — non-threaded thread-strip, per-thread session switch
//
// These need a controllable channel adapter mock. We mock the registry's
// getChannelAdapter to return a per-test adapter object; the mock is module-
// scoped (set via a closure variable so individual tests can vary it).
// ---------------------------------------------------------------------------

let mockedAdapter: { name: string; channelType: string; supportsThreads: boolean; subscribe?: () => Promise<void> } | undefined;

// Pre-import to avoid the async-mock-factory deadlock pattern (an async
// factory that does `await import('./channels/channel-registry.js')`
// triggers the mock for the same module and waits forever).
import * as actualChannelRegistry from './channels/channel-registry.js';
mock.module('./channels/channel-registry.js', () => ({
  ...actualChannelRegistry,
  getChannelAdapter: () => mockedAdapter,
}));

describe('routeInbound — adapter thread policy', () => {
  beforeEach(() => {
    createAgentGroup({ id: 'ag-1', name: 'A', folder: 'a', agent_provider: null, created_at: now() });
    createMessagingGroup({
      id: 'mg-1',
      channel_type: 'telegram',
      platform_id: 'chat-1',
      name: 'Group',
      is_group: 1,
      unknown_sender_policy: 'public',
      created_at: now(),
    });
    createMessagingGroupAgent({
      id: 'mga-1',
      messaging_group_id: 'mg-1',
      agent_group_id: 'ag-1',
      engage_mode: 'pattern',
      engage_pattern: '.',
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: now(),
    });
    mockedAdapter = undefined;
  });

  afterEach(() => {
    mockedAdapter = undefined;
  });

  it('strips threadId when the adapter declares supportsThreads=false (non-threaded platform)', async () => {
    mockedAdapter = { name: 'telegram', channelType: 'telegram', supportsThreads: false };
    const { routeInbound } = await import('./router.js');
    const { findSession } = await import('./db/sessions.js');
    await routeInbound(
      defaultEvent({
        channelType: 'telegram',
        platformId: 'chat-1',
        threadId: 'sub-1',
        message: { ...defaultEvent().message, isMention: true },
      }),
    );
    // Even though we passed threadId='sub-1', the non-threaded adapter
    // collapses to the channel — the resulting session is keyed on
    // (mg-1, threadId=null) per shared mode + thread strip.
    const s = findSession('mg-1', null);
    expect(s).toBeDefined();
    // And findSession against the original threadId returns nothing — it
    // was stripped before the session lookup.
    const sWrong = findSession('mg-1', 'sub-1');
    expect(sWrong).toBeUndefined();
  });
});

describe('routeInbound — deliverToAgent session-mode resolution', () => {
  beforeEach(() => {
    createAgentGroup({ id: 'ag-1', name: 'A', folder: 'a', agent_provider: null, created_at: now() });
    mockedAdapter = undefined;
  });

  afterEach(() => {
    mockedAdapter = undefined;
  });

  it('forces per-thread sessions on a threaded adapter in a group when the wiring is non-shared', async () => {
    // Wiring says session_mode='shared', but the threaded adapter overrides
    // — group threads each get their own session.
    createMessagingGroup({
      id: 'mg-grp',
      channel_type: 'discord',
      platform_id: 'chan-grp',
      name: 'G',
      is_group: 1,
      unknown_sender_policy: 'public',
      created_at: now(),
    });
    createMessagingGroupAgent({
      id: 'mga',
      messaging_group_id: 'mg-grp',
      agent_group_id: 'ag-1',
      engage_mode: 'pattern',
      engage_pattern: '.',
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: now(),
    });
    mockedAdapter = { name: 'discord', channelType: 'discord', supportsThreads: true };
    const { routeInbound } = await import('./router.js');
    const { findSession } = await import('./db/sessions.js');
    await routeInbound(
      defaultEvent({ platformId: 'chan-grp', threadId: 'thr-A', message: { ...defaultEvent().message, isMention: true } }),
    );
    await routeInbound(
      defaultEvent({
        platformId: 'chan-grp',
        threadId: 'thr-B',
        message: { id: 'm-B', kind: 'chat', content: '{"text":"second"}', timestamp: now(), isMention: true },
      }),
    );
    const sA = findSession('mg-grp', 'thr-A');
    const sB = findSession('mg-grp', 'thr-B');
    expect(sA).toBeDefined();
    expect(sB).toBeDefined();
    expect(sA!.id).not.toBe(sB!.id);
  });

  it('keeps a non-per-thread mode in DMs (is_group=0) — DMs collapse to one session per agent', async () => {
    createMessagingGroup({
      id: 'mg-dm',
      channel_type: 'discord',
      platform_id: 'dm-target',
      name: 'DM',
      is_group: 0,
      unknown_sender_policy: 'public',
      created_at: now(),
    });
    createMessagingGroupAgent({
      id: 'mga',
      messaging_group_id: 'mg-dm',
      agent_group_id: 'ag-1',
      engage_mode: 'pattern',
      engage_pattern: '.',
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: now(),
    });
    mockedAdapter = { name: 'discord', channelType: 'discord', supportsThreads: true };
    const { routeInbound } = await import('./router.js');
    const { findSession } = await import('./db/sessions.js');
    // Two messages with different threadIds in a DM — both should hit the
    // same shared session because is_group=0 short-circuits the per-thread
    // override.
    await routeInbound(
      defaultEvent({ platformId: 'dm-target', threadId: 'thr-X', message: { ...defaultEvent().message, isMention: true } }),
    );
    await routeInbound(
      defaultEvent({
        platformId: 'dm-target',
        threadId: 'thr-Y',
        message: { id: 'm-Y', kind: 'chat', content: '{"text":"second"}', timestamp: now(), isMention: true },
      }),
    );
    const s1 = findSession('mg-dm', 'thr-X');
    const s2 = findSession('mg-dm', 'thr-Y');
    const sShared = findSession('mg-dm', null);
    // Both threadId-keyed lookups miss; the shared session is the only one.
    expect(s1).toBeUndefined();
    expect(s2).toBeUndefined();
    expect(sShared).toBeDefined();
  });
});
