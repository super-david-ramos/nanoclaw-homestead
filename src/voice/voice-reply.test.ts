import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { synthesizeReplyFile, triggeredByVoice } from './voice-reply.js';

function commandAvailable(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const fullStack = commandAvailable('say') && commandAvailable('ffmpeg');

describe('triggeredByVoice', () => {
  it('returns false when content has no attachments', () => {
    expect(triggeredByVoice({})).toBe(false);
    expect(triggeredByVoice({ attachments: [] })).toBe(false);
  });

  it('returns false when attachments are non-audio', () => {
    expect(
      triggeredByVoice({
        attachments: [{ mimeType: 'image/png' }, { mimeType: 'application/pdf' }],
      }),
    ).toBe(false);
  });

  it('returns true when at least one attachment is audio/*', () => {
    expect(triggeredByVoice({ attachments: [{ mimeType: 'audio/ogg' }] })).toBe(true);
    expect(triggeredByVoice({ attachments: [{ mimeType: 'audio/wav' }] })).toBe(true);
    expect(triggeredByVoice({ attachments: [{ mimeType: 'audio/mpeg' }] })).toBe(true);
  });

  it('returns true when audio is mixed with other attachment types', () => {
    expect(
      triggeredByVoice({
        attachments: [{ mimeType: 'image/png' }, { mimeType: 'audio/ogg' }],
      }),
    ).toBe(true);
  });

  it('does not throw on malformed attachments', () => {
    expect(triggeredByVoice({ attachments: [{}] })).toBe(false);
    expect(triggeredByVoice({ attachments: [{ mimeType: undefined }] })).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(triggeredByVoice({ attachments: [{ mimeType: 42 } as any] })).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(triggeredByVoice({ attachments: 'not-an-array' as any })).toBe(false);
  });
});

describe.skipIf(!fullStack)('synthesizeReplyFile (integration — needs say + ffmpeg)', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'voice-reply-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('returns an OutboundFile with .ogg filename and a non-empty Buffer', async () => {
    const file = await synthesizeReplyFile({ text: 'Reply test phrase.', outDir: workDir });
    expect(file.filename.endsWith('.ogg')).toBe(true);
    expect(Buffer.isBuffer(file.data)).toBe(true);
    expect(file.data.length).toBeGreaterThan(500);
  }, 30_000);

  it('cleans up the on-disk audio file once buffered into memory', async () => {
    const file = await synthesizeReplyFile({ text: 'Cleanup test.', outDir: workDir });
    // The returned OutboundFile carries the buffer; the on-disk file should
    // be gone so we don't leak tmp dirs.
    const onDisk = join(workDir, file.filename);
    expect(() => statSync(onDisk)).toThrow();
  }, 30_000);

  it('rejects empty text rather than producing an empty file', async () => {
    await expect(synthesizeReplyFile({ text: '', outDir: workDir })).rejects.toThrow();
  });
});
