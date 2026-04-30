import { createAgentGroup, getAgentGroup, getAgentGroupByFolder } from './db/agent-groups.js';
import {
  createMessagingGroup,
  createMessagingGroupAgent,
  getMessagingGroupAgentByPair,
  getMessagingGroupByPlatform,
} from './db/messaging-groups.js';
import { namespacedPlatformId } from './platform-id.js';
import type { AgentGroup, EngageMode, MessagingGroup, MessagingGroupAgent } from './types.js';

export const FAMILY_DEFAULTS = {
  agentName: 'Barnaby',
  folder: 'family',
  engageMode: 'mention' as EngageMode,
} as const;

export interface FamilyAgentBootstrapOpts {
  telegramChatId: string;
  agentName?: string;
  folder?: string;
  groupName?: string | null;
  engageMode?: EngageMode;
  engagePattern?: string | null;
  now?: () => string;
  generateId?: (prefix: string) => string;
}

export interface FamilyAgentBootstrapResult {
  agentGroup: AgentGroup;
  messagingGroup: MessagingGroup;
  wiring: MessagingGroupAgent;
}

export function ensureFamilyAgent(opts: FamilyAgentBootstrapOpts): FamilyAgentBootstrapResult {
  const nowFn = opts.now ?? (() => new Date().toISOString());
  const genId = opts.generateId ?? defaultGenerateId;
  const agentName = opts.agentName ?? FAMILY_DEFAULTS.agentName;
  const folder = opts.folder ?? FAMILY_DEFAULTS.folder;
  const engageMode = opts.engageMode ?? FAMILY_DEFAULTS.engageMode;
  const engagePattern = engageMode === 'pattern' ? (opts.engagePattern ?? '.') : null;

  let ag = getAgentGroupByFolder(folder);
  if (!ag) {
    const id = genId('ag');
    createAgentGroup({
      id,
      name: agentName,
      folder,
      agent_provider: null,
      created_at: nowFn(),
    });
    ag = getAgentGroup(id);
  }
  if (!ag) throw new Error(`Failed to resolve agent group for folder=${folder}`);

  const platformId = namespacedPlatformId('telegram', opts.telegramChatId);
  let mg = getMessagingGroupByPlatform('telegram', platformId);
  if (!mg) {
    createMessagingGroup({
      id: genId('mg'),
      channel_type: 'telegram',
      platform_id: platformId,
      name: opts.groupName ?? null,
      is_group: 1,
      unknown_sender_policy: 'strict',
      created_at: nowFn(),
    });
    mg = getMessagingGroupByPlatform('telegram', platformId);
  }
  if (!mg) throw new Error(`Failed to resolve messaging group for ${platformId}`);

  let wiring = getMessagingGroupAgentByPair(mg.id, ag.id);
  if (!wiring) {
    createMessagingGroupAgent({
      id: genId('mga'),
      messaging_group_id: mg.id,
      agent_group_id: ag.id,
      engage_mode: engageMode,
      engage_pattern: engagePattern,
      sender_scope: 'all',
      ignored_message_policy: 'drop',
      session_mode: 'shared',
      priority: 0,
      created_at: nowFn(),
    });
    wiring = getMessagingGroupAgentByPair(mg.id, ag.id);
  }
  if (!wiring) throw new Error(`Failed to wire messaging group ${mg.id} to agent group ${ag.id}`);

  return { agentGroup: ag, messagingGroup: mg, wiring };
}

function defaultGenerateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
