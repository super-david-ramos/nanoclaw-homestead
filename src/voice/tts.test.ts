import { execFileSync } from 'node:child_process';
import { rmSync, statSync } from 'node:fs';

import { afterEach, describe, expect, it } from 'vitest';

import { synthesizeSpeech } from './tts.js';

function commandAvailable(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const haveSay = commandAvailable('say');
const haveFfmpeg = commandAvailable('ffmpeg');
const fullStack = haveSay && haveFfmpeg;

describe.skipIf(!fullStack)('synthesizeSpeech (integration — needs macOS say + ffmpeg)', () => {
  const created: string[] = [];
  afterEach(() => {
    for (const p of created.splice(0)) {
      try {
        rmSync(p, { force: true });
      } catch {
        /* swallow */
      }
    }
  });

  it('writes a non-empty OGG/Opus file by default', async () => {
    const out = await synthesizeSpeech({ text: 'Hello from Barnaby.' });
    created.push(out.path);

    expect(out.mime).toBe('audio/ogg');
    expect(out.path.endsWith('.ogg')).toBe(true);
    const size = statSync(out.path).size;
    expect(size).toBeGreaterThan(500);
  }, 30_000);

  it('honors the format=aiff option for the raw say output', async () => {
    const out = await synthesizeSpeech({ text: 'AIFF mode', format: 'aiff' });
    created.push(out.path);

    expect(out.mime).toBe('audio/aiff');
    expect(out.path.endsWith('.aiff')).toBe(true);
    const size = statSync(out.path).size;
    expect(size).toBeGreaterThan(500);
  }, 30_000);

  it('honors a custom voice name', async () => {
    // 'Daniel' is a default macOS voice on US English systems; if absent
    // `say` still works but uses the default voice — we just assert no throw.
    const out = await synthesizeSpeech({ text: 'Different voice', voice: 'Daniel' });
    created.push(out.path);
    expect(statSync(out.path).size).toBeGreaterThan(500);
  }, 30_000);

  it('rejects empty input rather than spawning a zero-byte file', async () => {
    await expect(synthesizeSpeech({ text: '' })).rejects.toThrow(/non-empty|text/i);
  });
});
