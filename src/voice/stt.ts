import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export interface WhisperConfig {
  whisperBin: string;
  modelPath: string;
}

export interface TranscribeOpts {
  /** Absolute path to the audio file. Any format ffmpeg can read. */
  path: string;
  /** Optional MIME hint — informational; transcoding is decided by content, not MIME. */
  mime?: string;
}

const DEFAULT_WHISPER_BIN = '/opt/homebrew/bin/whisper-cli';
const DEFAULT_MODEL_REL = 'data/models/ggml-base.bin';

export function resolveWhisperConfig(env: Partial<NodeJS.ProcessEnv> = process.env): WhisperConfig {
  return {
    whisperBin: env.WHISPER_BIN || DEFAULT_WHISPER_BIN,
    modelPath: env.WHISPER_MODEL || resolve(process.cwd(), DEFAULT_MODEL_REL),
  };
}

/**
 * Transcribe an audio file to text using local whisper.cpp.
 *
 * Pipeline:
 *   1. ffmpeg → 16 kHz mono WAV in a tmp dir (whisper.cpp's required input shape;
 *      Telegram/Baileys voice arrives as Opus-in-OGG, iMessage as m4a, etc.).
 *   2. whisper-cli with `-otxt` writes a sibling .txt file we read back.
 *   3. Tmp dir cleaned up unconditionally.
 *
 * Errors propagate from ffmpeg / whisper-cli stdout/stderr — caller decides retry.
 *
 * Host-side only. The agent container never sees this code path; it gets the
 * resulting transcript on the message it pulls from inbound.db.
 */
export async function transcribeAudio(opts: TranscribeOpts): Promise<string> {
  if (!existsSync(opts.path)) {
    throw new Error(`Audio file not found: ${opts.path}`);
  }

  const cfg = resolveWhisperConfig();
  const workDir = mkdtempSync(join(tmpdir(), 'stt-'));
  const wavPath = join(workDir, 'input.wav');
  // whisper-cli emits `<wav-base>.txt` next to the WAV when -otxt is set.
  const expectedTxtPath = `${wavPath}.txt`;

  try {
    // 1. Normalize to 16 kHz mono WAV. -y to overwrite, -loglevel error to keep
    //    stderr quiet on success (errors still surface via reject).
    await execFileP('ffmpeg', ['-y', '-loglevel', 'error', '-i', opts.path, '-ac', '1', '-ar', '16000', wavPath]);

    // 2. Transcribe. -nt drops timestamps; -otxt writes <wav>.txt; the model
    //    file path is required (no implicit lookup).
    await execFileP(cfg.whisperBin, ['-m', cfg.modelPath, '-f', wavPath, '-nt', '-otxt']);

    if (!existsSync(expectedTxtPath)) {
      throw new Error(`whisper-cli did not produce expected output at ${expectedTxtPath}`);
    }
    return readFileSync(expectedTxtPath, 'utf8').trim();
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
