// Frame-step the piece into build_video.mp4, then synthesise the marker sounds
// into build_fx.wav. mux.cjs joins both with the voiceover.
//
//   node scripts/render.cjs                     full render
//   node scripts/render.cjs --stills 2,8,14     PNGs into ./out/, for spot checks
//   node scripts/render.cjs --fps 60            60 fps instead of 30
//
// Why frame-stepping: the page is a pure function of t (see medium.js), so this
// asks the browser for one exact picture per frame instead of recording playback.
// A dropped frame is impossible and the output is identical on every machine.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { findChrome, findFfmpeg, fileUrl, root: DIR } = require('./env.cjs');

const FPS = +(process.argv.includes('--fps') ? process.argv[process.argv.indexOf('--fps') + 1] : 30);

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const STILLS = arg('stills', null);

(async () => {
  const CHROME = findChrome();
  const FFMPEG = findFfmpeg();
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    protocolTimeout: 240000,
    userDataDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'markerboard-')),
    args: ['--allow-file-access-from-files', '--disable-web-security', '--font-render-hinting=none', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(fileUrl(path.join(DIR, 'index.html')), { waitUntil: 'load' });
  await page.waitForFunction('window.PLAYER_READY === true', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 500));
  if (errs.length) { console.error('PAGEERR: ' + errs.join(' | ')); process.exit(1); }

  const meta = await page.evaluate(() => ({
    D: window.DURATION, vo: window.VO_AT, words: window.WORD_COUNT,
    misses: window.ANCHOR_MISSES, A: window.ANCHORS,
  }));
  console.log(JSON.stringify(meta));
  if (!meta.words) { console.error('FATAL: transcript empty — timeline is unanchored'); process.exit(1); }
  if (meta.misses && meta.misses.length) { console.error('FATAL: unresolved anchors: ' + meta.misses.join(', ')); process.exit(1); }

  const D = meta.D;

  if (STILLS) {
    const outd = path.join(DIR, 'out'); fs.mkdirSync(outd, { recursive: true });
    for (const s of STILLS.split(',')) {
      const t = parseFloat(s);
      const b64 = await page.evaluate((tt) => {
        window.seek(tt);
        return document.getElementById('cv').toDataURL('image/png');
      }, t);
      const f = path.join(outd, 's' + String(t).replace('.', '_') + '.png');
      fs.writeFileSync(f, Buffer.from(b64.split(',')[1], 'base64'));
      console.log('wrote', f);
    }
    await browser.close();
    return;
  }

  const nFrames = Math.round(D * FPS);
  const vpath = path.join(DIR, 'build_video.mp4');
  const ff = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), vpath],
  { stdio: ['pipe', 'ignore', 'inherit'] });

  const write = (buf) => new Promise((res, rej) => {
    if (ff.stdin.write(buf)) res(); else ff.stdin.once('drain', res);
    ff.stdin.on('error', rej);
  });

  const t0 = Date.now();
  for (let i = 0; i < nFrames; i++) {
    const b64 = await page.evaluate((tt) => {
      window.seek(tt);
      return document.getElementById('cv').toDataURL('image/jpeg', 0.95);
    }, i / FPS);
    await write(Buffer.from(b64.split(',')[1], 'base64'));
    if (i % 60 === 0) console.log(`frame ${i}/${nFrames}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('video done', vpath);

  const fx = await page.evaluate(async (Dd) => {
    const r = await SOUND.renderOffline(window.scoreSound, Dd, 48000, { voiceover: true });
    const n = r.inter.length, i16 = new Int16Array(n);
    for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, r.inter[i])); i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
    const bytes = new Uint8Array(i16.buffer);
    let s = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return { b64: btoa(s), frames: r.frames, sr: r.sr, peak: r.peak };
  }, D);

  const raw = Buffer.from(fx.b64, 'base64');
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + raw.length, 4); hdr.write('WAVE', 8);
  hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
  hdr.writeUInt32LE(fx.sr, 24); hdr.writeUInt32LE(fx.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(raw.length, 40);
  fs.writeFileSync(path.join(DIR, 'build_fx.wav'), Buffer.concat([hdr, raw]));
  console.log('fx wav done', (raw.length / 4 / fx.sr).toFixed(2) + 's', 'peak', fx.peak.toFixed(3));

  await browser.close();
})().catch((e) => {
  const msg = String((e && e.message) || e);
  if (/Could not find|CHROME_PATH|FFMPEG_PATH|FFPROBE_PATH/.test(msg)) console.error(msg);
  else console.error(e);
  process.exit(1);
});