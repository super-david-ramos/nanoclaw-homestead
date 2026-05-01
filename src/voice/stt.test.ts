import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { resolveWhisperConfig, transcribeAudio } from './stt.js';

function commandAvailable(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const haveWhisperCli = commandAvailable('whisper-cli');
const haveFfmpeg = commandAvailable('ffmpeg');
const haveSay = commandAvailable('say');
const fullStack = haveWhisperCli && haveFfmpeg && haveSay;

describe('resolveWhisperConfig', () => {
  it('falls back to /opt/homebrew binary + data/models default when env is unset', () => {
    const cfg = resolveWhisperConfig({});
    expect(cfg.whisperBin).toContain('whisper-cli');
    expect(cfg.modelPath).toContain('ggml-base.bin');
  });

  it('honors WHISPER_BIN and WHISPER_MODEL overrides', () => {
    const cfg = resolveWhisperConfig({
      WHISPER_BIN: '/custom/whisper',
      WHISPER_MODEL: '/custom/model.bin',
    });
    expect(cfg.whisperBin).toBe('/custom/whisper');
    expect(cfg.modelPath).toBe('/custom/model.bin');
  });
});

describe.skipIf(!fullStack)('transcribeAudio (integration — needs whisper-cli + ffmpeg + say)', () => {
  let baseDir: string;
  let aiffPath: string;

  beforeAll(() => {
    if (!fullStack) return;
    // Sanity: model file must exist for the integration test to be meaningful.
    const cfg = resolveWhisperConfig({});
    try {
      statSync(cfg.modelPath);
    } catch {
      throw new Error(
        `Model file missing at ${cfg.modelPath}. Download via: ` +
          `curl -L -o ${cfg.modelPath} https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`,
      );
    }
  });

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'stt-test-'));
    aiffPath = join(baseDir, 'fixture.aiff');
    // macOS `say` synthesizes the fixture so we don't have to commit binary
    // audio. The voice/rate are pinned for reproducibility across machines.
    execFileSync('say', ['-v', 'Samantha', '-r', '170', '-o', aiffPath, 'Hello world this is Barnaby.']);
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('transcribes a synthesized AIFF clip to text containing the spoken phrase', async () => {
    const text = await transcribeAudio({ path: aiffPath, mime: 'audio/aiff' });

    const lower = text.toLowerCase();
    // Whisper occasionally renders "Barnaby" as "Barnabe" or similar — assert
    // the high-confidence words instead of the proper noun.
    expect(lower).toMatch(/hello/);
    expect(lower).toMatch(/world/);
  }, 30_000);

  it('rejects when the input file does not exist', async () => {
    await expect(transcribeAudio({ path: '/nonexistent/path.wav' })).rejects.toThrow(/not found|enoent|no such file/i);
  });
});
