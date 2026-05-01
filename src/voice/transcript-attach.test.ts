import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { attachVoiceTranscripts, type AttachmentLike } from './transcript-attach.js';

describe('attachVoiceTranscripts', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'transcript-attach-test-'));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  function audioAttachment(mimeType: string, payload = 'fake-audio-bytes'): AttachmentLike {
    return { mimeType, data: Buffer.from(payload).toString('base64') };
  }

  it('returns empty and mutates nothing when there are no attachments', async () => {
    const out = await attachVoiceTranscripts([]);
    expect(out).toEqual([]);
  });

  it('skips non-audio attachments entirely', async () => {
    const transcribe = vi.fn();
    const atts: AttachmentLike[] = [
      { mimeType: 'image/png', data: Buffer.from('img').toString('base64') },
      { mimeType: 'application/pdf', data: Buffer.from('pdf').toString('base64') },
    ];
    const out = await attachVoiceTranscripts(atts, { transcribe });
    expect(out).toEqual([]);
    expect(transcribe).not.toHaveBeenCalled();
    expect(atts[0].transcript).toBeUndefined();
  });

  it('skips audio attachments that have no data', async () => {
    const transcribe = vi.fn();
    const atts: AttachmentLike[] = [{ mimeType: 'audio/ogg' }];
    const out = await attachVoiceTranscripts(atts, { transcribe });
    expect(out).toEqual([]);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('transcribes audio attachments and mutates each entry with a transcript field', async () => {
    const transcribe = vi.fn().mockResolvedValueOnce('first transcript').mockResolvedValueOnce('second transcript');
    const atts: AttachmentLike[] = [audioAttachment('audio/ogg', 'a'), audioAttachment('audio/wav', 'b')];

    const out = await attachVoiceTranscripts(atts, { transcribe, tmpDir: baseDir });

    expect(out).toEqual(['first transcript', 'second transcript']);
    expect(atts[0].transcript).toBe('first transcript');
    expect(atts[1].transcript).toBe('second transcript');
    expect(transcribe).toHaveBeenCalledTimes(2);
    // Tmp file was passed by absolute path to the transcriber.
    const firstCallPath = (transcribe.mock.calls[0][0] as { path: string }).path;
    expect(firstCallPath.startsWith(baseDir)).toBe(true);
  });

  it('continues past a failed transcription and reports a warning, not a throw', async () => {
    const transcribe = vi
      .fn()
      .mockRejectedValueOnce(new Error('whisper crashed'))
      .mockResolvedValueOnce('survivor transcript');
    const atts: AttachmentLike[] = [audioAttachment('audio/ogg', 'a'), audioAttachment('audio/ogg', 'b')];

    const out = await attachVoiceTranscripts(atts, { transcribe, tmpDir: baseDir });

    expect(out).toEqual(['survivor transcript']);
    expect(atts[0].transcript).toBeUndefined();
    expect(atts[1].transcript).toBe('survivor transcript');
  });

  it('cleans up the tmp file even when transcription throws', async () => {
    const observed: string[] = [];
    const transcribe = vi.fn(async (opts: { path: string }) => {
      observed.push(opts.path);
      writeFileSync(opts.path + '.canary', 'check');
      throw new Error('boom');
    });
    const atts: AttachmentLike[] = [audioAttachment('audio/ogg', 'a')];

    await attachVoiceTranscripts(atts, { transcribe, tmpDir: baseDir });

    // The tmp audio file the helper wrote must be gone after the call.
    const fs = await import('node:fs');
    expect(fs.existsSync(observed[0])).toBe(false);
  });
});
