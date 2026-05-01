import { transcribeAudio } from '../../../../src/voice/stt.js';

(async () => {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: transcribe.ts <audio-path>');
    process.exit(2);
  }
  const text = await transcribeAudio({ path, mime: 'audio/ogg' });
  process.stdout.write(text);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
