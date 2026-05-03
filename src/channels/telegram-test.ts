/**
 * Telegram TEST channel adapter — a parallel Telegram bot wired to a separate
 * test agent group ("BarnabyTest" / `family-test`) so changes can be validated
 * end-to-end against a real Telegram round trip without touching the live
 * family bot.
 *
 * Channel-type is `'telegram-test'` so messaging_groups for the test bot
 * stay distinct from production. The chat-sdk Telegram adapter still emits
 * platform_ids prefixed with `'telegram:'` (it's the same underlying
 * platform); only the registry-level channel-type differs. Outbound
 * delivery looks up the adapter by channel-type and routes through the
 * test bot's polling client.
 *
 * Self-disabling: returns null from the factory if `TELEGRAM_TEST_BOT_TOKEN`
 * isn't in `.env`. So the production install (which has only
 * `TELEGRAM_BOT_TOKEN`) doesn't accidentally spin up a phantom test bot.
 *
 * Pairing is intentionally NOT wired here — the test bot is provisioned via
 * `scripts/init-test-bot-agent.ts` against a known chat ID (yours). Strangers
 * who DM the test bot get dropped silently rather than triggering the pairing
 * flow.
 */
import { createTelegramAdapter } from '@chat-adapter/telegram';

import { readEnvFile } from '../env.js';
import { log } from '../log.js';
import { createChatSdkBridge, type ReplyContext } from './chat-sdk-bridge.js';
import { sanitizeTelegramLegacyMarkdown } from './telegram-markdown-sanitize.js';
import { registerChannelAdapter } from './channel-registry.js';
import type { ChannelAdapter, ChannelSetup } from './adapter.js';

const TEST_CHANNEL_TYPE = 'telegram-test';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractReplyContext(raw: Record<string, any>): ReplyContext | null {
  if (!raw.reply_to_message) return null;
  const reply = raw.reply_to_message;
  return {
    text: reply.text || reply.caption || '',
    sender: reply.from?.first_name || reply.from?.username || 'Unknown',
  };
}

async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const delay = Math.min(16000, 1000 * 2 ** (attempt - 1));
      log.warn('Telegram-test setup failed, retrying', { label, attempt, delayMs: delay, err });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

registerChannelAdapter(TEST_CHANNEL_TYPE, {
  factory: () => {
    const env = readEnvFile(['TELEGRAM_TEST_BOT_TOKEN']);
    if (!env.TELEGRAM_TEST_BOT_TOKEN) return null;
    const token = env.TELEGRAM_TEST_BOT_TOKEN;

    const telegramAdapter = createTelegramAdapter({
      botToken: token,
      mode: 'polling',
    });
    const bridge = createChatSdkBridge({
      adapter: telegramAdapter,
      concurrency: 'concurrent',
      extractReplyContext,
      supportsThreads: false,
      transformOutboundText: sanitizeTelegramLegacyMarkdown,
    });

    // Override channelType on the wrapped adapter so it registers separately
    // from the production telegram bot in the active-adapters map. name is
    // preserved as the chat-sdk-emitted value so logs stay consistent with
    // chat-sdk's own bookkeeping.
    const wrapped: ChannelAdapter = {
      ...bridge,
      channelType: TEST_CHANNEL_TYPE,
      async setup(hostConfig: ChannelSetup) {
        return withRetry(() => bridge.setup(hostConfig), 'bridge.setup');
      },
    };
    return wrapped;
  },
});
