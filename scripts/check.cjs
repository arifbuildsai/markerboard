// check.cjs — the pre-render gate.
//
//   node scripts/check.cjs
//
// Eight measurements. Each one exists because a real build shipped with the
// defect it catches, and each one is a number, not an opinion:
//
//   1. transcript loaded        — no words means every mark is timed to a guess
//   2. every anchor resolved    — one mistyped word and a mark lands in silence
//   3. nothing is late          — lettering may lead its word, never trail it
//   4. hand speed               — text written too fast reads as a machine,
//                                 which is what "abrupt" actually means
//   5. one pen                  — no two sets of letters in the same place at
//                                 the same time
//   6. sound on the picture clock — every cue lands inside a mark's own window
//   7. the board is never blank — a camera move over empty board flashes white
//   8. the picture never freezes — long still stretches read as a stall
//
// Gates 3 and 5 measure different things for lettering and for rules, because
// they are different things on a board. Lettering is what a viewer reads
// against the voice, so it is held to the word it serves and must not collide
// with other lettering. Rules — a bar chart cascading in, a tally's row lines —
// are drawn by the same one pen, several of them within a second, and flagging
// that as "many hands" is measuring coincidence instead of a defect. The
// medium has exactly one pen by construction (a single TIP in medium.js), so
// the question worth asking is not "how many are drawing" but "do any letters
// overwrite each other".
//
// Gate 6 exists because the second sync rule — sound is scheduled from the same
// times the picture uses — was prose that nothing enforced. It caught a real
// 1.9 s sound/picture drift in the reference piece.
//
// Exit code 1 on any hard failure, so it can gate a render in a shell.
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { findChrome, fileUrl, root: DIR } = require('./env.cjs');

const INK_FLOOR = 4.0;      // % of frame that must carry ink at all times
const STATIC_MAX = 1.6;     // longest stretch with no visible change, in seconds
const SPEED_MAX = 22.0;     // chars/s before lettering reads as a machine
const LAG_MAX = 0.2;        // s lettering may trail its own word
const INK_FPS = 8;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: 'new', protocolTimeout: 240000,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'mb-check-')),
    args: ['--allow-file-access-from-files', '--disable-web-security',
      '--font-render-hinting=none', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 760, deviceScaleFactor: 1 });
  await page.goto(fileUrl(path.join(DIR, 'index.html')), { waitUntil: 'load' });
  await page.waitForFunction('window.PLAYER_READY === true', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 400));

  // Measure each lettered mark's real drawn band on the page's own canvas, with
  // the page's own fonts, before reading anything back. Guessing an advance
  // width is how a checker starts reporting collisions nobody can see.
  const meta = await page.evaluate(() => {
    const ctx = document.getElementById('cv').getContext('2d');
    const FONT = window.WB.FONT, FW = window.WB.FW;
    for (const m of window.__marks) {
      if (!m.text) continue;
      ctx.save();
      ctx.font = `${FW[m.font]} ${m.size}px ${FONT[m.font]}`;
      const wpx = ctx.measureText(m.text).width;
      ctx.restore();
      m.box = [m.x, m.y - m.size * 0.82, m.x + wpx, m.y + m.size * 0.24];
    }
    return {
      D: window.DURATION,
      words: window.WORD_COUNT,
      misses: window.ANCHOR_MISSES || [],
      scoreTimes: window.__scoreTimes || [],
      coda: window.__coda || [],
      marks: window.__marks.map((m) => ({
        a: m.a, b: m.b, kind: m.kind, chars: m.chars || 0, w: m.w,
        s: m.s || '', box: m.box || null,
      })),
    };
  });

  const fails = [];
  const say = (ok, label, detail) => {
    console.log(`${ok ? ' ok ' : 'FAIL'}  ${label.padEnd(28)} ${detail}`);
    if (!ok) fails.push(label);
  };

  // ---- 1. transcript
  say(meta.words > 0, 'transcript loaded', `${meta.words} words`);

  // ---- 2. anchors
  if (!meta.words) {
    await browser.close();
    console.error('\nCannot check timing without a transcript. Aborting.');
    process.exit(1);
  }
  say(meta.misses.length === 0, 'anchors resolved',
    meta.misses.length ? meta.misses.join(', ') : 'all words found');

  const M = meta.marks;

  // ---- 3. lateness, measured on lettering.
  // Only letters are held to the word at hand. A rule drawn a fraction after the
  // word it underlines is still following the narration; a caption that arrives
  // after its sentence has moved on is the sync defect, and that is what this
  // gate is for. Rules are reported for information but not failed: on this
  // reference the worst rule is +0.44 s and the picture is correct, because a
  // cascade of chart rules is a single gesture that outlives one word.
  const lettered = M.filter((m) => m.chars > 0 && typeof m.w === 'number');
  const ruled = M.filter((m) => !m.chars && typeof m.w === 'number');
  let maxLag = -Infinity; let lagWhere = '';
  for (const m of lettered) {
    const lag = m.a - m.w;
    if (lag > maxLag) { maxLag = lag; lagWhere = `"${m.s}"@${m.a.toFixed(2)}`; }
  }
  let ruleLag = -Infinity;
  for (const m of ruled) ruleLag = Math.max(ruleLag, m.a - m.w);
  if (!lettered.length) {
    console.log(' --   nothing is late           no lettered marks — not measured');
  } else {
    say(maxLag <= LAG_MAX, 'nothing is late',
      `lettering worst +${maxLag.toFixed(2)}s ${lagWhere} (rule worst +${ruleLag.toFixed(2)}s, not gated)`);
  }

  // ---- 4. write speed per lettered mark. SPEED_MAX is calibrated, not derived:
  // the approved reference peaks at 19.7 chars/s on a short label, and it reads
  // fine because the label is 15 characters and it lands inside its own word.
  // The gate is set 10% above that so it catches a runaway and passes a flourish.
  const speeds = lettered
    .filter((m) => m.chars > 1 && m.b > m.a)
    .map((m) => ({ v: m.chars / (m.b - m.a), a: m.a, chars: m.chars, s: m.s }));
  speeds.sort((x, y) => y.v - x.v);
  const worst = speeds[0];
  say(!worst || worst.v <= SPEED_MAX, 'hand speed',
    worst ? `fastest ${worst.v.toFixed(1)} chars/s at ${worst.a.toFixed(1)}s "${worst.s}"` : 'no text marks');

  // ---- 5. two sets of letters in one place.
  // The old version counted every mark whose window overlapped, which fires on a
  // bar chart (six rules, one pen) and on two captions stacked 80 px apart. The
  // defect a viewer sees is letters drawn over letters, so this tests boxes.
  // Boxes come from story.js: [x0, y0, x1, y1] in world units, padded a little
  // so a touching pair still counts as a collision.
  let clashes = 0; let clashAt = 0; let clashWhat = '';
  for (let i = 0; i < lettered.length; i++) {
    const p = lettered[i];
    if (!p.box) continue;
    for (let j = i + 1; j < lettered.length; j++) {
      const q = lettered[j];
      if (!q.box) continue;
      if (p.a >= q.b || q.a >= p.b) continue;              // not on screen together
      const ox = Math.min(p.box[2], q.box[2]) - Math.max(p.box[0], q.box[0]);
      const oy = Math.min(p.box[3], q.box[3]) - Math.max(p.box[1], q.box[1]);
      if (ox > 4 && oy > 4) {                             // >4 world units both axes
        clashes++;
        if (!clashAt) { clashAt = Math.max(p.a, q.a); clashWhat = `"${p.s}" / "${q.s}"`; }
      }
    }
  }
  say(clashes === 0, 'one pen',
    clashes ? `${clashes} letter collisions, first at ${clashAt.toFixed(2)}s ${clashWhat}`
      : `${lettered.length} lettered marks, no overlapping lettering`);

  // ---- 5b. the sound clock is the picture clock.
  // The second sync rule says audio is scheduled from the same times the picture
  // uses. That is prose until something measures it: story.js replays the score
  // against a recording kit, and every fired cue must land inside a mark's own
  // window. Not at its start — the score lays one stroke per word across a
  // caption's write-on window, which is the whole point of `write()`. A sound
  // list with its own hand-typed times drifts outside the windows and trips this.
  // 0.35 s of slack for the felt tip touching down before the ink commits.
  const AUDIO_NEAR = 0.35;
  // A declared coda is a sound with no mark behind it on purpose — the cap going
  // back on as the piece comes to rest. story.js labels those, so they are excused
  // here. Anything else outside every mark is a cue that has drifted.
  const coda = new Set((meta.coda || []).map((t) => t.toFixed(3)));
  const scoreT = (meta.scoreTimes || []).filter((t) => !coda.has(t.toFixed(3)));
  const nCoda = (meta.coda || []).length;
  if (!scoreT.length) {
    console.log(' --   sound on the picture clock  no times recorded — not measured');
  } else {
    let far = 0; let farWhat = '';
    for (const t of scoreT) {
      let inside = false;
      for (const m of M) {
        if (t >= m.a - AUDIO_NEAR && t <= m.b + AUDIO_NEAR) { inside = true; break; }
      }
      if (!inside) { far++; if (!farWhat) farWhat = `${t.toFixed(2)}s`; }
    }
    say(far === 0, 'sound on the picture clock',
      `${scoreT.length} cues, ${far} outside every mark`
      + (nCoda ? ` (+${nCoda} declared coda)` : '')
      + (far ? ` — first at ${farWhat}` : ''));
  }

  // ---- 6 + 7. pixels
  const n = Math.round(meta.D * INK_FPS);
  const px = await page.evaluate(async ({ n, fps }) => {
    const cv = document.getElementById('cv');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const W = cv.width, H = cv.height;
    const prev = new Uint8ClampedArray(W * H);
    const cur = new Uint8ClampedArray(W * H);
    const ink = []; const chg = [];
    for (let i = 0; i < n; i++) {
      window.seek(i / fps);
      const d = ctx.getImageData(0, 0, W, H).data;
      let dark = 0;
      for (let p = 0, q = 0; p < d.length; p += 4, q++) {
        const l = (d[p] * 299 + d[p + 1] * 587 + d[p + 2] * 114) / 1000;
        if (l < 175) dark++;
        cur[q] = l;
      }
      ink.push((dark / (W * H)) * 100);
      if (i > 0) {
        let c = 0;
        for (let q = 0; q < cur.length; q++) if (Math.abs(cur[q] - prev[q]) > 6) c++;
        chg.push((c / (W * H)) * 100);
      }
      prev.set(cur);
    }
    return { ink, chg };
  }, { n, fps: INK_FPS });

  const minInk = Math.min(...px.ink);
  const minAt = px.ink.indexOf(minInk) / INK_FPS;
  say(minInk >= INK_FLOOR, 'board never blank',
    `min ink ${minInk.toFixed(2)}% at ${minAt.toFixed(2)}s (floor ${INK_FLOOR}%)`);

  let run = 0; let worstRun = 0; let runAt = 0;
  px.chg.forEach((c, i) => {
    if (c < 0.15) { run++; if (run > worstRun) { worstRun = run; runAt = (i - run + 1) / INK_FPS; } }
    else run = 0;
  });
  const longest = worstRun / INK_FPS;
  say(longest <= STATIC_MAX, 'picture never freezes',
    `longest still ${longest.toFixed(2)}s at ${runAt.toFixed(2)}s (max ${STATIC_MAX}s)`);

  const inkMean = px.ink.reduce((a, b) => a + b, 0) / px.ink.length;
  console.log(`\n     ${M.length} marks over ${meta.D}s · ink mean ${inkMean.toFixed(1)}% `
    + `range ${minInk.toFixed(1)}–${Math.max(...px.ink).toFixed(1)}%`);

  await browser.close();

  if (fails.length) {
    console.error(`\n${fails.length} check(s) failed: ${fails.join(', ')}`);
    process.exit(1);
  }
  console.log('\nall checks pass');
})().catch((e) => {
  // Environment problems (no Chrome, no ffmpeg) arrive as messages a new user can
  // act on; don't bury them under a stack trace. Real bugs still show the stack.
  const msg = String((e && e.message) || e);
  if (/Could not find|CHROME_PATH|FFMPEG_PATH|FFPROBE_PATH/.test(msg)) {
    console.error(msg);
  } else {
    console.error(e);
  }
  process.exit(1);
});