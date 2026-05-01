import { synthesizeSpeech } from '../../../../src/voice/tts.js';

(async () => {
  const text = process.argv[2];
  const outDir = process.argv[3];
  if (!text || !outDir) {
    console.error('usage: synth.ts <text> <outDir>');
    process.exit(2);
  }
  const result = await synthesizeSpeech({ text, outDir });
  process.stdout.write(result.path);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
