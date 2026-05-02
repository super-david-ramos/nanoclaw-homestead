import { readFileSync, rmSync } from 'node:fs';
import { basename } from 'node:path';

import type { OutboundFile } from '../channels/adapter.js';
import { synthesizeSpeech } from './tts.js';

export interface InboundContentLike {
  attachments?: Array<{ mimeType?: unknown }> | unknown;
}

/**
 * Decides whether an outbound reply to this triggering inbound message should
 * be voice. Rule: "match the medium" — if the user spoke (any audio/*
 * attachment), the agent voice-replies. Symmetric in DM and group, and
 * symmetric across users so we don't need to resolve "whose preference?"
 * for groups.
 *
 * Tolerant of malformed shapes (returns false rather than throwing) so a
 * weird inbound from a misbehaving channel adapter never breaks delivery.
 */
export function triggeredByVoice(content: InboundContentLike): boolean {
  const atts = content.attachments;
  if (!Array.isArray(atts)) return false;
  for (const a of atts) {
    if (!a || typeof a !== 'object') continue;
    const mime = (a as { mimeType?: unknown }).mimeType;
    if (typeof mime === 'string' && mime.startsWith('audio/')) return true;
  }
  return false;
}

export interface SynthesizeReplyOpts {
  text: string;
  /** Override tmp dir for tests / outbox staging. Defaults to OS tmpdir. */
  outDir?: string;
}

/**
 * Run text through host-side TTS, read the resulting OGG/Opus into memory,
 * delete the on-disk file, and return the OutboundFile shape the delivery
 * adapter takes. The Buffer is what gets handed across the adapter boundary;
 * the file is just a tmp staging area for ffmpeg's encoder.
 *
 * Throws if the underlying synthesizer rejects (e.g. empty text). Caller
 * decides whether to fall back to text-only delivery — the voice-reply
 * gate in delivery.ts catches and logs.
 */
export async function synthesizeReplyFile(opts: SynthesizeReplyOpts): Promise<OutboundFile> {
  const synth = await synthesizeSpeech({ text: opts.text, outDir: opts.outDir, format: 'ogg' });
  try {
    const data = readFileSync(synth.path);
    return { filename: basename(synth.path), data };
  } finally {
    rmSync(synth.path, { force: true });
  }
}
