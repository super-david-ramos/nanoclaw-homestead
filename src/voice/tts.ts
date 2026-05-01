import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

export type TtsFormat = 'aiff' | 'ogg';

export interface SynthesizeOpts {
  text: string;
  /** Optional macOS `say` voice name. Falls through to the system default if unset. */
  voice?: string;
  /** Output container. `ogg` post-processes through ffmpeg to OGG/Opus, suitable for
   *  voice notes on Telegram, WhatsApp, etc. `aiff` is the raw `say` output. */
  format?: TtsFormat;
  /** Where to drop the resulting file. Defaults to OS tmpdir. Caller is responsible
   *  for cleanup (or for handing the path to a delivery layer that consumes it). */
  outDir?: string;
}

export interface SynthesizeResult {
  path: string;
  mime: string;
}

/**
 * Synthesize spoken text to an audio file using macOS `say` on the host,
 * optionally post-processing through `ffmpeg` for delivery-ready Opus.
 *
 * Per docs/plan/decisions/03-voice.md (Resolved 2026-05-01): host-side,
 * shell-out per call, no daemon. The decision doc references Kokoro 82M
 * as the eventual quality target — this MVP uses macOS's built-in TTS
 * to land voice replies on a fresh install with zero extra installs and
 * zero model downloads. Swap-in path: replace the `say` invocation with
 * the Kokoro CLI when we add that dependency.
 *
 * Throws if `text` is empty (skip the round-trip rather than ship a
 * silent file).
 */
export async function synthesizeSpeech(opts: SynthesizeOpts): Promise<SynthesizeResult> {
  if (!opts.text || !opts.text.trim()) {
    throw new Error('synthesizeSpeech: text must be a non-empty string');
  }
  const format: TtsFormat = opts.format ?? 'ogg';
  const outDir = opts.outDir ?? mkdtempSync(join(tmpdir(), 'tts-'));
  const aiffPath = join(outDir, `out-${process.pid}-${Date.now()}.aiff`);

  const sayArgs = ['-o', aiffPath];
  if (opts.voice) sayArgs.push('-v', opts.voice);
  sayArgs.push(opts.text);

  await execFileP('say', sayArgs);

  if (format === 'aiff') {
    return { path: aiffPath, mime: 'audio/aiff' };
  }

  // Convert to OGG/Opus. -c:a libopus is broadly supported by chat platforms
  // expecting voice notes. -y to overwrite, -loglevel error to keep stderr
  // quiet on success — errors surface via the rejected execFileP promise.
  const oggPath = aiffPath.replace(/\.aiff$/, '.ogg');
  try {
    await execFileP('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-i',
      aiffPath,
      '-c:a',
      'libopus',
      '-b:a',
      '24k',
      oggPath,
    ]);
  } finally {
    rmSync(aiffPath, { force: true });
  }
  return { path: oggPath, mime: 'audio/ogg' };
}
