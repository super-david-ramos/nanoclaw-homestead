/**
 * Runner config — reads /workspace/agent/container.json at startup.
 *
 * This file is mounted read-only inside the container. The host writes it;
 * the runner only reads. All NanoClaw-specific configuration lives here
 * instead of environment variables.
 */
import fs from 'fs';

const CONFIG_PATH = '/workspace/agent/container.json';

export interface RunnerConfig {
  provider: string;
  assistantName: string;
  groupName: string;
  agentGroupId: string;
  maxMessagesPerPrompt: number;
  mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
  /**
   * Optional model identifier (e.g. 'claude-haiku-4-5-20251001'). When set,
   * the runner injects ANTHROPIC_MODEL into the provider's env so the
   * Claude SDK uses this model. When unset, the SDK picks its default
   * (currently Sonnet for the claude_code preset).
   *
   * Per-agent-group selection: the test agent runs Haiku (cheap +
   * deterministic for sandbox round trips), production stays Sonnet.
   */
  model?: string;
  effort?: string;
}

const DEFAULT_MAX_MESSAGES = 10;

let _config: RunnerConfig | null = null;

/**
 * Pure parser — split out from loadConfig so tests don't need the
 * /workspace/agent/container.json path to exist. Defensive about field
 * types since container.json is hand-edited or written by self-mod.
 */
export function parseConfig(raw: Record<string, unknown>): RunnerConfig {
  return {
    provider: typeof raw.provider === 'string' ? raw.provider : 'claude',
    assistantName: typeof raw.assistantName === 'string' ? raw.assistantName : '',
    groupName: typeof raw.groupName === 'string' ? raw.groupName : '',
    agentGroupId: typeof raw.agentGroupId === 'string' ? raw.agentGroupId : '',
    maxMessagesPerPrompt:
      typeof raw.maxMessagesPerPrompt === 'number' ? raw.maxMessagesPerPrompt : DEFAULT_MAX_MESSAGES,
    mcpServers: (raw.mcpServers as RunnerConfig['mcpServers']) || {},
    model: typeof raw.model === 'string' && raw.model.length > 0 ? raw.model : undefined,
    effort: typeof raw.effort === 'string' && raw.effort.length > 0 ? raw.effort : undefined,
  };
}

/**
 * Load config from container.json. Called once at startup.
 * Falls back to sensible defaults for any missing field.
 */
export function loadConfig(): RunnerConfig {
  if (_config) return _config;

  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    console.error(`[config] Failed to read ${CONFIG_PATH}, using defaults`);
  }

  _config = parseConfig(raw);
  return _config;
}

/** Get the loaded config. Throws if loadConfig() hasn't been called. */
export function getConfig(): RunnerConfig {
  if (!_config) throw new Error('Config not loaded — call loadConfig() first');
  return _config;
}
