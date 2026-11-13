// doctor.cjs — check that this machine can actually build a video, before you
// spend time writing a story on a setup that cannot render it.
//
//   node scripts/doctor.cjs
//
// Run this first on a new machine. It reports each measured value rather than a
// green tick, so a failure tells you what to install instead of just "error".
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const env = require('./env.cjs');

const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failures++; };
let failures = 0;

console.log(`markerboard doctor — ${process.platform} ${process.arch}, node ${process.version}`);
console.log(`project: ${env.root}\n`);

// ---- node
const major = +process.versions.node.split('.')[0];
major >= 18 ? ok(`node ${process.version}`) : bad(`node ${process.version} is too old — need 18+`);

// ---- the one dependency
// Resolved by its own package.json: resolving the entry point and walking up
// lands in lib/cjs/, not the package root. The entry is kept so the launch test
// below drives the same module the render scripts will.
let puppeteerEntry = null;
try {
  const pj = require.resolve('puppeteer-core/package.json', { paths: [env.root] });
  const v = JSON.parse(fs.readFileSync(pj, 'utf8')).version;
  puppeteerEntry = require.resolve('puppeteer-core', { paths: [env.root] });
  ok(`puppeteer-core ${v}`);
} catch {
  bad('puppeteer-core is not installed — run `npm install` in the project root');
}

// ---- chrome
let chrome;
try {
  chrome = env.findChrome();
  ok(`chrome: ${chrome}`);
  // Ask it for a version, which is the only real proof it will launch headless.
  const v = spawnSync(chrome, ['--version'], { encoding: 'utf8' });
  if (v.status === 0) ok(`chrome version: ${(v.stdout || v.stderr).trim().split(/\r?\n/)[0]}`);
  else console.log('  --   chrome did not answer --version (some builds do not) — launch is tested below');
} catch (e) {
  bad(e.message.split('\n')[0]);
}

// ---- ffmpeg / ffprobe
let ffmpeg, ffprobe;
try {
  ffmpeg = env.findFfmpeg();
  const v = spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' });
  ok(`ffmpeg: ${ffmpeg}`);
  ok(`  ${(v.stdout || '').split(/\r?\n/)[0]}`);
} catch (e) { bad(e.message.split('\n')[0]); }
try {
  ffprobe = env.findFfprobe();
  ok(`ffprobe: ${ffprobe}`);
} catch (e) { bad(e.message.split('\n')[0]); }

// ---- fonts, which is the failure that looks like a rendering bug
if (chrome) {
  const puppeteer = require(puppeteerEntry || 'puppeteer-core');
  (async () => {
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: chrome, headless: 'new', protocolTimeout: 60000,
        userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mb-doctor-')),
        args: ['--allow-file-access-from-files', '--disable-web-security'],
      });
      const page = await browser.newPage();
      ok('chrome launches headless');
      await page.goto(env.fileUrl(path.join(env.root, 'index.html')), { waitUntil: 'load', timeout: 30000 });
      const fonts = await page.evaluate(async () => {
        try { await document.fonts.ready; } catch (e) { /* older engines */ }
        const has = (f) => document.fonts.check(f);
        return {
          marker: has('400 66px "Permanent Marker"'),
          kalam: has('700 38px "Kalam"'),
          loaded: document.fonts.size,
        };
      });
      hasFont(fonts.marker, 'Permanent Marker');
      hasFont(fonts.kalam, 'Kalam');
      if (!fonts.marker || !fonts.kalam) {
        console.log('       Without them the render falls back to a system cursive face and');
        console.log('       will not match the demo. Open index.html once with a network');
        console.log('       connection so Chrome caches the fonts, then re-run.');
      }
    } catch (e) {
      bad(`chrome could not open the page: ${String(e.message).split('\n')[0]}`);
    } finally {
      if (browser) await browser.close();
      finish();
    }
  })();
} else {
  finish();
}

function hasFont(present, name) {
  present ? ok(`font loaded: ${name}`) : bad(`font missing: ${name}`);
}

function finish() {
  console.log('');
  if (failures) {
    console.error(`${failures} problem(s). Fix those, then run \`npm run doctor\` again.`);
    process.exit(1);
  }
  console.log('Everything is in place. Next: read SKILL.md, or `npm run check`.');
}