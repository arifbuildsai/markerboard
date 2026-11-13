// mux.cjs — join the rendered picture, the voiceover and the marker effects into
// one delivery file. Runs the same on Windows, macOS and Linux; there is no shell
// script to source and no `#!/bin/bash` line to break on a machine without bash.
//
//   node scripts/mux.cjs [voiceover.mp3] [out.mp4]
//
// Defaults: ./vo.mp3 and ./out.mp4. build_video.mp4 / build_fx.wav come from
// scripts/render.cjs.
//
// The audio graph, and why it looks like this:
//
//   [1:a] loudnorm I=-17 TP=-2  asplit 2
//       The voice is normalised first and split: one copy is the mix input, the
//       other is the sidechain key. Normalising before the split means the duck
//       depth is consistent no matter how hot the take came in.
//
//   [2:a] loudnorm I=-26 TP=-4 LRA=20
//       Effects sit ~9 LU under the voice before ducking even starts.
//
//   sidechaincompress threshold 0.05 ratio 3 attack 10 release 250
//       The marker steps back whenever the narrator speaks and returns in the
//       gaps. Slow attack and release: a fast ducker makes the pen sound like it
//       is stuttering in time with words.
//
//   amix normalize=0, loudnorm I=-15.2 TP=-2.2 LRA=11, aresample 48000
//       Two measured deviations from the naive spec (I=-16 TP=-1.5):
//         * pre-encode TP=-2.2 instead of -1.5. AAC inter-sample overshoot adds
//           roughly 1 dB on percussive material; targeting -1.5 on the pre-encode
//           pass lands the DELIVERED file at about -0.7 dBTP, i.e. clipping.
//           -2.2 lands it at -2.1 dBTP, comfortably inside the -1.5 cap.
//         * explicit aresample=48000 plus -ar 48000. loudnorm runs internally at
//           192 kHz and leaks a 96 kHz stream into the AAC otherwise.
//
// Measured on the reference build: -15.9 LUFS integrated, -2.1 dBTP. Platforms
// lift -15.9 to their -14 target; anything hotter here gets turned down again.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { findFfmpeg, findFfprobe, root: DIR } = require('./env.cjs');

const VO = path.resolve(DIR, process.argv[2] || 'vo.mp3');
const OUT = path.resolve(DIR, process.argv[3] || 'out.mp4');
const VIDEO = path.join(DIR, 'build_video.mp4');
const FX = path.join(DIR, 'build_fx.wav');

const need = [[VIDEO, 'run `npm run render` first'], [FX, 'run `npm run render` first'], [VO, 'pass a voiceover path, or put your narration at vo.mp3']];
for (const [f, hint] of need) {
  if (!fs.existsSync(f)) {
    console.error(`missing ${path.relative(DIR, f)} — ${hint}`);
    process.exit(1);
  }
}

const FILTER = [
  '[1:a]pan=stereo|c0=c0|c1=c0,loudnorm=I=-17:TP=-2,asplit=2[v1][v2]',
  '[2:a]loudnorm=I=-26:TP=-4:LRA=20[fx0]',
  '[fx0][v1]sidechaincompress=threshold=0.05:ratio=3:attack=10:release=250[fx]',
  '[v2][fx]amix=inputs=2:normalize=0,loudnorm=I=-15.2:TP=-2.2:LRA=11,aresample=48000[a]',
].join(';');

const run = (tool, args, label) => {
  const r = spawnSync(tool, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n${label} failed (exit ${r.status}).`);
    if (r.error) console.error(r.error.message);
    process.exit(1);
  }
  return r;
};

console.log('muxing');
run(findFfmpeg(), [
  '-y', '-hide_banner', '-loglevel', 'warning',
  '-i', VIDEO, '-i', VO, '-i', FX,
  '-filter_complex', FILTER,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
  OUT,
], 'ffmpeg mux');

const FFPROBE = findFfprobe();
console.log('\n--- delivered');
run(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration,size',
  '-show_entries', 'stream=codec_name,width,height,r_frame_rate,sample_rate',
  '-of', 'default=nw=1', OUT], 'ffprobe');

console.log('--- loudness');
const probe = spawnSync(findFfmpeg(), ['-hide_banner', '-nostats', '-i', OUT,
  '-af', 'loudnorm=print_format=summary', '-f', 'null', '-'], { encoding: 'utf8' });
const text = (probe.stdout || '') + (probe.stderr || '');
for (const line of text.split(/\r?\n/)) {
  if (/Input Integrated|Input True Peak|Input LRA/.test(line)) console.log(line.trim());
}

// A quiet sanity check: the delivered file should be within a hair of the video's
// length. A mismatch means the voiceover is a different take from the transcript,
// which is the single most common cause of "the timing is all wrong".
const dur = (f) => Number((spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
  '-of', 'default=nw=1:nk=1', f], { encoding: 'utf8' }).stdout || '0').trim());
const dv = dur(VIDEO), do_ = dur(OUT);
if (Math.abs(dv - do_) > 0.05) {
  console.warn(`\nwarning: video is ${dv.toFixed(2)}s but the output is ${do_.toFixed(2)}s.`);
  console.warn('The picture and the take may not match — check that vo.mp3 and');
  console.warn('story/beatwords.json come from the same recording.');
}