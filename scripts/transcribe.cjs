// transcribe.cjs — turn a voiceover file into the word timestamps the whole
// animation is built on.
//
//   node scripts/transcribe.cjs vo.mp3
//   node scripts/transcribe.cjs narration.wav --out story/beatwords.json
//
// This is the step that makes "let the agent handle it" true rather than a
// promise. It produces exactly the file story.js reads:
//
//   [{ "t": 0.16, "e": 0.28, "w": "Two" }, ...]
//
// Providers, in order of preference:
//
//   ELEVENLABS_API_KEY   ElevenLabs Scribe. Word timestamps, no local install.
//   whisper              an OpenAI-Whisper CLI already on PATH, if no key.
//
// Set the key in your shell, never in this file:
//   macOS/Linux  export ELEVENLABS_API_KEY="..."
//   Windows      setx ELEVENLABS_API_KEY "..."
//
// Either way the output shape is the same, and story.js does not care which
// produced it. If you would rather use another service, map its word list to
// {t, e, w} and write it to story/beatwords.json yourself — that is the entire
// contract.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { root: DIR } = require('./env.cjs');

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf('--' + n); return i > -1 ? args[i + 1] : d; };
const AUDIO = args.find((a) => !a.startsWith('--') && !/(^|\/)beatwords\.json$/.test(a));
const OUT = path.resolve(DIR, argOf('out', 'story/beatwords.json'));

if (!AUDIO) {
  console.error('usage: node scripts/transcribe.cjs <voiceover.mp3> [--out story/beatwords.json]');
  process.exit(1);
}
if (!fs.existsSync(AUDIO)) {
  console.error(`no such file: ${AUDIO}`);
  process.exit(1);
}

const write = (words) => {
  if (!words.length) {
    console.error('no words came back — the transcription returned nothing.');
    console.error('If the audio is music or silence, that is expected; otherwise try again.');
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(words, null, 0) + '\n');
  const last = words[words.length - 1];
  console.log(`wrote ${path.relative(DIR, OUT)} — ${words.length} words, ends at ${last.e.toFixed(2)}s`);
  console.log('\nNext: set DURATION in story/story.js to at least this, then write the anchors.');
};

// ---- ElevenLabs Scribe ---------------------------------------------------
async function elevenlabs() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const file = fs.readFileSync(AUDIO);
  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('file', new Blob([file]), path.basename(AUDIO));
  console.log('transcribing with ElevenLabs Scribe…');
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': key },   // never logged, never written to disk
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs returned ${res.status}${body ? ': ' + body.slice(0, 300) : ''}`);
  }
  const data = await res.json();
  const words = (data.words || [])
    .filter((w) => (w.type ? w.type === 'word' : true))
    .map((w) => ({ t: +w.start, e: +w.end, w: String(w.text).trim() }))
    .filter((w) => w.w && Number.isFinite(w.t) && Number.isFinite(w.e));
  return words;
}

// ---- Whisper CLI ---------------------------------------------------------
function whisper() {
  const probe = spawnSync('whisper', ['--help'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) return null;
  console.log('transcribing with whisper…');
  const tmp = path.join(require('os').tmpdir(), `mb-whisper-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  const r = spawnSync('whisper', [
    AUDIO, '--model', 'small', '--output_format', 'json',
    '--word_timestamps', 'True', '--output_dir', tmp,
  ], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('whisper failed — see its output above');
  const jf = fs.readdirSync(tmp).find((f) => f.endsWith('.json'));
  if (!jf) throw new Error('whisper produced no JSON');
  const data = JSON.parse(fs.readFileSync(path.join(tmp, jf), 'utf8'));
  const words = [];
  for (const seg of data.segments || []) {
    for (const w of seg.words || []) {
      const text = String(w.word || '').trim();
      if (text) words.push({ t: +w.start, e: +w.end, w: text });
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return words;
}

(async () => {
  try {
    let words = await elevenlabs();
    if (!words) {
      console.log('ELEVENLABS_API_KEY is not set — looking for a local whisper…');
      words = whisper();
    }
    if (!words) {
      console.error('No transcription provider available.\n');
      console.error('Either:');
      console.error('  export ELEVENLABS_API_KEY="your key"   (then run this again)');
      console.error('  or install whisper:  pip install -U openai-whisper');
      console.error('  or make story/beatwords.json yourself from any word-timed transcript.');
      process.exit(1);
    }
    write(words);
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
})();