import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { log } from '../log.js';
import { transcribeAudio as defaultTranscribeAudio } from './stt.js';

export interface AttachmentLike {
  mimeType?: string;
  /** base64-encoded payload, populated by the channel adapter's fetchData step. */
  data?: string;
  /** Set in-place by attachVoiceTranscripts for audio attachments. */
  transcript?: string;
}

export interface AttachOpts {
  /** Injectable so tests don't need a real whisper-cli on PATH. */
  transcribe?: (opts: { path: string; mime?: string }) => Promise<string>;
  /** Where to drop the temp audio file. Defaults to OS tmpdir. Tests override for isolation. */
  tmpDir?: string;
}

/**
 * Walk a list of channel-adapter attachments, transcribe any audio entries
 * via local Whisper, and mutate each successful entry with a `transcript`
 * field. Returns the list of successful transcripts in order so the caller
 * can splice them into the message text for agents that don't inspect the
 * attachments array.
 *
 * Failure-tolerant by design: a transcription crash logs a warning and
 * continues — the rest of the attachments still get processed, the
 * non-voice channel content still flows.
 */
export async function attachVoiceTranscripts(attachments: AttachmentLike[], opts: AttachOpts = {}): Promise<string[]> {
  const transcribe = opts.transcribe ?? defaultTranscribeAudio;
  const tmpRoot = opts.tmpDir ?? tmpdir();
  const transcripts: string[] = [];
  let counter = 0;

  for (const att of attachments) {
    if (!att.mimeType?.startsWith('audio/')) continue;
    if (!att.data) continue;

    const ext = mimeToExt(att.mimeType);
    const tmpPath = join(tmpRoot, `voice-${process.pid}-${Date.now()}-${counter++}${ext}`);

    try {
      writeFileSync(tmpPath, Buffer.from(att.data, 'base64'));
      const text = await transcribe({ path: tmpPath, mime: att.mimeType });
      att.transcript = text;
      if (text) transcripts.push(text);
    } catch (err) {
      log.warn('Voice transcription failed; continuing without transcript', {
        mime: att.mimeType,
        err,
      });
    } finally {
      if (existsSync(tmpPath)) rmSync(tmpPath, { force: true });
    }
  }

  return transcripts;
}

function mimeToExt(mime: string): string {
  // Just enough fidelity for ffmpeg to pick the right demuxer; falling back
  // to .bin still works because ffmpeg sniffs the container regardless of
  // extension. The hint just makes debugging easier.
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('aac') || mime.includes('m4a') || mime.includes('mp4')) return '.m4a';
  if (mime.includes('aiff')) return '.aiff';
  return '.bin';
}
