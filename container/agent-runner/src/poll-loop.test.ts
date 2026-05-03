import { describe, it, expect, beforeEach, afterEach } from 'bun:test';

import { initTestSessionDb, closeSessionDb, getInboundDb, getOutboundDb } from './db/connection.js';
import { getPendingMessages, markCompleted } from './db/messages-in.js';
import { getUndeliveredMessages } from './db/messages-out.js';
import { formatMessages, extractRouting } from './formatter.js';
import { MockProvider } from './providers/mock.js';
import { processFollowUpMessages } from './poll-loop.js';
import type { AgentQuery, ProviderEvent } from './providers/types.js';

beforeEach(() => {
  initTestSessionDb();
});

afterEach(() => {
  closeSessionDb();
});

function insertMessage(id: string, kind: string, content: object, opts?: { processAfter?: string; trigger?: 0 | 1 }) {
  getInboundDb()
    .prepare(
      `INSERT INTO messages_in (id, kind, timestamp, status, process_after, trigger, content)
     VALUES (?, ?, datetime('now'), 'pending', ?, ?, ?)`,
    )
    .run(id, kind, opts?.processAfter ?? null, opts?.trigger ?? 1, JSON.stringify(content));
}

describe('formatter', () => {
  it('should format a single chat message', () => {
    insertMessage('m1', 'chat', { sender: 'John', text: 'Hello world' });
    const messages = getPendingMessages();
    const prompt = formatMessages(messages);
    expect(prompt).toContain('sender="John"');
    expect(prompt).toContain('Hello world');
  });

  it('should format multiple chat messages as XML block', () => {
    insertMessage('m1', 'chat', { sender: 'John', text: 'Hello' });
    insertMessage('m2', 'chat', { sender: 'Jane', text: 'Hi there' });
    const messages = getPendingMessages();
    const prompt = formatMessages(messages);
    expect(prompt).toContain('<messages>');
    expect(prompt).toContain('</messages>');
    expect(prompt).toContain('sender="John"');
    expect(prompt).toContain('sender="Jane"');
  });

  it('should format task messages', () => {
    insertMessage('m1', 'task', { prompt: 'Review open PRs' });
    const messages = getPendingMessages();
    const prompt = formatMessages(messages);
    expect(prompt).toContain('[SCHEDULED TASK]');
    expect(prompt).toContain('Review open PRs');
  });

  it('should format webhook messages', () => {
    insertMessage('m1', 'webhook', { source: 'github', event: 'push', payload: { ref: 'main' } });
    const messages = getPendingMessages();
    const prompt = formatMessages(messages);
    expect(prompt).toContain('[WEBHOOK: github/push]');
  });

  it('should format system messages', () => {
    insertMessage('m1', 'system', { action: 'register_group', status: 'success', result: { id: 'ag-1' } });
    const messages = getPendingMessages();
    const prompt = formatMessages(messages);
    expect(prompt).toContain('[SYSTEM RESPONSE]');
    expect(prompt).toContain('register_group');
  });

  it('should handle mixed kinds', () => {
    insertMessage('m1', 'chat', { sender: 'John', text: 'Hello' });
    insertMessage('m2', 'system', { action: 'test', status: 'ok', result: null });
    const messages = getPendingMessages();
    const prompt = formatMessages(messages);
    expect(prompt).toContain('sender="John"');
    expect(prompt).toContain('[SYSTEM RESPONSE]');
  });

  it('should escape XML in content', () => {
    insertMessage('m1', 'chat', { sender: 'A<B', text: 'x > y && z' });
    const messages = getPendingMessages();
    const prompt = formatMessages(messages);
    expect(prompt).toContain('A&lt;B');
    expect(prompt).toContain('x &gt; y &amp;&amp; z');
  });
});

describe('accumulate gate (trigger column)', () => {
  it('getPendingMessages returns both trigger=0 and trigger=1 rows', () => {
    // trigger=0 rides along as context, trigger=1 is the wake-eligible row.
    // The poll loop's gate depends on this data contract.
    insertMessage('m1', 'chat', { sender: 'A', text: 'chit chat' }, { trigger: 0 });
    insertMessage('m2', 'chat', { sender: 'B', text: 'actual mention' }, { trigger: 1 });
    const messages = getPendingMessages();
    expect(messages).toHaveLength(2);
    const byId = Object.fromEntries(messages.map((m) => [m.id, m]));
    expect(byId.m1.trigger).toBe(0);
    expect(byId.m2.trigger).toBe(1);
  });

  it('trigger=0-only batch: gate predicate `some(trigger===1)` is false', () => {
    insertMessage('m1', 'chat', { sender: 'A', text: 'noise' }, { trigger: 0 });
    insertMessage('m2', 'chat', { sender: 'B', text: 'more noise' }, { trigger: 0 });
    const messages = getPendingMessages();
    // This is the exact predicate the poll loop uses to skip accumulate-only
    // batches — gate should be false, so the loop sleeps without waking the agent.
    expect(messages.some((m) => m.trigger === 1)).toBe(false);
  });

  it('mixed batch: gate is true → loop proceeds, accumulated rows ride along', () => {
    insertMessage('m1', 'chat', { sender: 'A', text: 'earlier chatter' }, { trigger: 0 });
    insertMessage('m2', 'chat', { sender: 'B', text: 'the real mention' }, { trigger: 1 });
    const messages = getPendingMessages();
    expect(messages.some((m) => m.trigger === 1)).toBe(true);
    // Both messages are present for the formatter → agent sees the prior context.
    expect(messages.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
  });

  it('trigger column defaults to 1 for legacy inserts without explicit value', () => {
    // The schema default is 1 (see src/db/schema.ts INBOUND_SCHEMA) — existing
    // rows / tests without the column set are effectively wake-eligible.
    getInboundDb()
      .prepare(
        `INSERT INTO messages_in (id, kind, timestamp, status, content)
         VALUES ('m1', 'chat', datetime('now'), 'pending', '{"text":"hi"}')`,
      )
      .run();
    const [msg] = getPendingMessages();
    expect(msg.trigger).toBe(1);
  });
});

describe('routing', () => {
  it('should extract routing from messages', () => {
    getInboundDb()
      .prepare(
        `INSERT INTO messages_in (id, kind, timestamp, status, platform_id, channel_type, thread_id, content)
       VALUES ('m1', 'chat', datetime('now'), 'pending', 'chan-123', 'discord', 'thread-456', '{"text":"hi"}')`,
      )
      .run();

    const messages = getPendingMessages();
    const routing = extractRouting(messages);
    expect(routing.platformId).toBe('chan-123');
    expect(routing.channelType).toBe('discord');
    expect(routing.threadId).toBe('thread-456');
    expect(routing.inReplyTo).toBe('m1');
  });
});

describe('mock provider', () => {
  it('should produce init + result events', async () => {
    const provider = new MockProvider({}, (prompt) => `Echo: ${prompt}`);
    const query = provider.query({
      prompt: 'Hello',
      cwd: '/tmp',
    });

    const events: Array<{ type: string }> = [];
    setTimeout(() => query.end(), 50);

    for await (const event of query.events) {
      events.push(event);
    }

    const typed = events.filter((e) => e.type !== 'activity');
    expect(typed.length).toBeGreaterThanOrEqual(2);
    expect(typed[0].type).toBe('init');
    expect(typed[1].type).toBe('result');
    expect((typed[1] as { text: string }).text).toBe('Echo: Hello');
  });

  it('should handle push() during active query', async () => {
    const provider = new MockProvider({}, (prompt) => `Re: ${prompt}`);
    const query = provider.query({
      prompt: 'First',
      cwd: '/tmp',
    });

    const events: Array<{ type: string; text?: string }> = [];

    setTimeout(() => query.push('Second'), 30);
    setTimeout(() => query.end(), 60);

    for await (const event of query.events) {
      events.push(event);
    }

    const results = events.filter((e) => e.type === 'result');
    expect(results).toHaveLength(2);
    expect(results[0].text).toBe('Re: First');
    expect(results[1].text).toBe('Re: Second');
  });
});

describe('end-to-end with mock provider', () => {
  it('should read messages_in, process with mock provider, write messages_out', async () => {
    // Insert a chat message into inbound DB
    insertMessage('m1', 'chat', { sender: 'User', text: 'What is 2+2?' });

    // Read and process
    const messages = getPendingMessages();
    expect(messages).toHaveLength(1);

    const routing = extractRouting(messages);
    const prompt = formatMessages(messages);

    // Create mock provider and run query
    const provider = new MockProvider({}, () => 'The answer is 4');
    const query = provider.query({
      prompt,
      cwd: '/tmp',
    });

    // Process events — simulate what poll-loop does
    const { markProcessing } = await import('./db/messages-in.js');
    const { writeMessageOut } = await import('./db/messages-out.js');

    markProcessing(['m1']);

    setTimeout(() => query.end(), 50);

    for await (const event of query.events) {
      if (event.type === 'result' && event.text) {
        writeMessageOut({
          id: `out-${Date.now()}`,
          in_reply_to: routing.inReplyTo,
          kind: 'chat',
          platform_id: routing.platformId,
          channel_type: routing.channelType,
          thread_id: routing.threadId,
          content: JSON.stringify({ text: event.text }),
        });
      }
    }

    markCompleted(['m1']);

    // Verify: message was processed (not pending, acked in processing_ack)
    const processed = getPendingMessages();
    expect(processed).toHaveLength(0);

    // Verify: response was written to outbound DB
    const outMessages = getUndeliveredMessages();
    expect(outMessages).toHaveLength(1);
    expect(JSON.parse(outMessages[0].content).text).toBe('The answer is 4');
    expect(outMessages[0].in_reply_to).toBe('m1');
  });
});

// ----------------------------------------------------------------------------
// processFollowUpMessages — the active-query follow-up gate.
//
// Regression-driven: in the Phase 2 fs-watcher live test (2026-05-02), the
// agent's first task fired correctly with the script's diff data, but the
// poll-loop's `setInterval` then kept finding new pending fs-watcher rows
// (recurrences) and pushed them as raw `formatMessages(...)` follow-ups
// without applying pre-task scripts. The agent correctly responded "no
// scriptOutput data — staying silent" to each of those, polluting the active
// query and burning tokens on every recurrence tick. Mirror the initial
// batch's gate: scripts run, wakeAgent=false rows skip-without-pushing.
// ----------------------------------------------------------------------------

interface RecordingQuery extends AgentQuery {
  pushed: string[];
}

function recordingQuery(): RecordingQuery {
  const pushed: string[] = [];
  return {
    pushed,
    push(message: string) {
      pushed.push(message);
    },
    end() {},
    abort() {},
    events: (async function* (): AsyncIterable<ProviderEvent> {})(),
  };
}

const noopLog = (_msg: string) => {};

describe('processFollowUpMessages', () => {
  it('regression: a wakeAgent=false task is NOT pushed and is marked completed', async () => {
    // The original bug: this row was pushed as a raw follow-up, the agent
    // saw a prompt with no scriptOutput, and replied "no script output data
    // — staying silent." Forever, in a loop, until the host killed the
    // container.
    insertMessage('t-skip', 'task', {
      prompt: 'should not reach the agent',
      script: `echo '{"wakeAgent":false}'`,
    });

    const query = recordingQuery();
    await processFollowUpMessages(query, noopLog);

    expect(query.pushed).toHaveLength(0);
    expect(getPendingMessages()).toHaveLength(0);
  });

  it('a wakeAgent=true task is pushed exactly once with scriptOutput merged into content', async () => {
    insertMessage('t-wake', 'task', {
      prompt: 'real briefing',
      script: `echo '{"wakeAgent":true,"data":{"diff":"x"}}'`,
    });

    const query = recordingQuery();
    await processFollowUpMessages(query, noopLog);

    expect(query.pushed).toHaveLength(1);
    expect(query.pushed[0]).toContain('real briefing');
    // The script's data must reach the agent — that's the whole point of
    // the gate. Without this assertion, regression #1 could re-appear in a
    // different shape (script ran but output got stripped before push).
    // Formatter pretty-prints scriptOutput, so the spacing in the rendered
    // JSON depends on JSON.stringify(..., null, 2) — match flexibly.
    expect(query.pushed[0]).toMatch(/"diff"\s*:\s*"x"/);
    expect(getPendingMessages()).toHaveLength(0);
  });

  it('a non-task chat message is pushed unchanged (no script gate applies)', async () => {
    insertMessage('c1', 'chat', { sender: 'Alice', text: 'hello' });

    const query = recordingQuery();
    await processFollowUpMessages(query, noopLog);

    expect(query.pushed).toHaveLength(1);
    expect(query.pushed[0]).toContain('Alice');
    expect(query.pushed[0]).toContain('hello');
    expect(getPendingMessages()).toHaveLength(0);
  });

  it('mixed batch — wake task + skip task + chat — pushes only the wake task and the chat', async () => {
    insertMessage('t-wake', 'task', {
      prompt: 'wake-prompt',
      script: `echo '{"wakeAgent":true,"data":{}}'`,
    });
    insertMessage('t-skip', 'task', {
      prompt: 'skip-prompt',
      script: `echo '{"wakeAgent":false}'`,
    });
    insertMessage('c1', 'chat', { sender: 'Bob', text: 'pushed' });

    const query = recordingQuery();
    await processFollowUpMessages(query, noopLog);

    expect(query.pushed).toHaveLength(1);
    const pushed = query.pushed[0];
    expect(pushed).toContain('wake-prompt');
    expect(pushed).toContain('Bob');
    expect(pushed).toContain('pushed');
    expect(pushed).not.toContain('skip-prompt');

    // Both the wake and the skip should be marked completed; chat too.
    expect(getPendingMessages()).toHaveLength(0);
  });

  it('script error or invalid output is treated as wakeAgent=false (skipped, no push)', async () => {
    insertMessage('t-broken', 'task', {
      prompt: 'broken-script',
      script: `echo 'not json'`,
    });

    const query = recordingQuery();
    await processFollowUpMessages(query, noopLog);

    expect(query.pushed).toHaveLength(0);
    expect(getPendingMessages()).toHaveLength(0);
  });

  it('system messages are filtered out — left pending, not pushed (existing follow-up filter is preserved)', async () => {
    // System messages are MCP tool responses — they go back to the active
    // query through the SDK's own channel, not through messages_in. The
    // active-poll loop must not touch them.
    insertMessage('s1', 'system', { text: 'tool result' });
    insertMessage('c1', 'chat', { sender: 'Alice', text: 'real chat' });

    const query = recordingQuery();
    await processFollowUpMessages(query, noopLog);

    expect(query.pushed).toHaveLength(1);
    expect(query.pushed[0]).toContain('real chat');
    expect(query.pushed[0]).not.toContain('tool result');

    // The system message is still pending — the gate doesn't touch it.
    const stillPending = getPendingMessages();
    expect(stillPending.map((m) => m.id)).toContain('s1');
    expect(stillPending.map((m) => m.id)).not.toContain('c1');
  });

  it('clear-command chat messages are filtered out — left pending for the next initial batch', async () => {
    // Clear commands need to reset the continuation; that's a top-level
    // poll-loop concern, not a follow-up push concern.
    insertMessage('c-clear', 'chat', { sender: 'Alice', text: '/clear' });
    insertMessage('c-real', 'chat', { sender: 'Bob', text: 'normal' });

    const query = recordingQuery();
    await processFollowUpMessages(query, noopLog);

    expect(query.pushed).toHaveLength(1);
    expect(query.pushed[0]).toContain('normal');
    expect(query.pushed[0]).not.toContain('/clear');

    const stillPending = getPendingMessages();
    expect(stillPending.map((m) => m.id)).toContain('c-clear');
  });

  it('empty pending queue is a no-op — no push, no error', async () => {
    const query = recordingQuery();
    await processFollowUpMessages(query, noopLog);
    expect(query.pushed).toHaveLength(0);
  });

  it('all-skipped batch produces no push (everything got gated)', async () => {
    insertMessage('t-skip-1', 'task', {
      prompt: 'skip me',
      script: `echo '{"wakeAgent":false}'`,
    });
    insertMessage('t-skip-2', 'task', {
      prompt: 'skip me too',
      script: `echo '{"wakeAgent":false}'`,
    });

    const query = recordingQuery();
    await processFollowUpMessages(query, noopLog);

    expect(query.pushed).toHaveLength(0);
    expect(getPendingMessages()).toHaveLength(0);
  });
});
