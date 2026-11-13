// ---------------------------------------------------------------------------
// story.js — THE EPISODE. This is the only file you rewrite per video.
//
// Structure, top to bottom:
//   1. word anchors      fail-loud lookups into the transcript
//   2. the A table       one row per spoken beat, resolved to real times
//   3. the camera        where the frame is looking, and when it travels
//   4. story(t)          the marks and the windows in which they draw
//   5. scoreSound(k)     the marker sounds, on the same times
//
// The two rules that matter, both learned the hard way on a real piece:
//   * a mark may LEAD its word by at most 0.2 s and must NEVER LAG it. Lagging is
//     far worse than being early: audio-ahead / picture-behind reads as a broken
//     player, not as a style choice. If your strokes do not fit the words at hand
//     speed, remove content — do not let strokes run past their words.
//   * sound must be scheduled from the SAME times the picture uses, never from
//     its own list, or the two drift apart and nothing will show you where.
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  // ============ 1. word anchors (fail-loud) =================================
  // Anchoring every time to the transcript means a new voice take costs you a
  // re-transcription and nothing else. It also means a typo in a word becomes a
  // hard error at load, not a mark silently landing in the wrong place.
  const WORDS = window.BEATWORDS || [];
  if (!WORDS.length) throw new Error('beatwords.json did not load — timeline would be unanchored');

  // lower-case, drop every non-alphanumeric except the $ and the decimal point
  // that "$4.25" needs, then drop a trailing full stop ("year." -> "year").
  const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9$.]/g, '').replace(/\.+$/, '');
  const MISSED = [];
  // at(word, fallback, nth) — nth picks the 2nd, 3rd... occurrence, for words that
  // recur: "Number" opens both the first lesson and the second.
  function at(word, fallback, nth) {
    const want = norm(word);
    const hits = WORDS.filter((x) => norm(x.w) === want);
    const n = nth == null ? 0 : nth;
    if (!hits[n]) { MISSED.push(word + (nth ? '#' + (nth + 1) : '')); return fallback; }
    return hits[n].t;
  }

  // The medium's primitives, pulled in once. `ell` and `win` are the two the
  // story needs most: ell() returns a circle/ring/arc as points, win() is the
  // 0..1 progress of a mark inside its own write-on window.
  const { ell, win } = WB;

  // Zone centres on the board. Everything in story() is written in world
  // coordinates, so these are the anchors the camera keys and the stereo panner
  // share. At k=0.85 the glass shows 1506 x 847 world units, so zones must be
  // spaced wider than that or two lessons share the frame.
  const ZA = [640, 360];       // the hook
  const ZB = [2400, 560];      // number one
  const ZC = [4750, 560];      // the tally

  const VO_AT = 0.0;          // the take starts the piece (hook on the first line)
  const DURATION = 30.0;      // last word ends 28.86 + ~1 s of takeaway hold

  // ============ 2. the beats ================================================
  // One row per idea, resolved against the transcript. Every time used anywhere
  // below comes from here, so retiming means editing this table and nothing else.
  const A = {
    // 1 HOOK — "Two numbers. Both true. Both from the same government, in the same year."
    two: at('Two', 0.16), numbers: at('numbers', 0.36),
    both1: at('both', 1.40), true1: at('true', 1.72),
    government: at('government', 3.48), year: at('year', 4.78),
    // 2 NUMBER ONE — "Number one: May 2026."
    numberOne: at('Number', 5.52), one: at('one', 5.82),
    may: at('May', 6.50), y2026: at('2026', 6.96),
    // 3 THE CLAIM — "Pakistan's Central Bank reports the largest remittance month ... history."
    sbp: at('Central', 8.88), reports: at('reports', 9.58),
    largest: at('largest', 10.32), remittance: at('remittance', 10.82),
    month: at('month', 11.30), history: at('history', 12.30),
    // 4 THE FIGURE — "$4 billion, 250 million, through the banks."
    dollar4: at('$4', 13.06), billion: at('billion', 13.36),
    mil250: at('250', 14.04), million: at('million', 15.08),
    through: at('through', 15.44), banks: at('banks', 16.34),
    // 5 NUMBER TWO — "Number two, from the state's own crackdown tally,"
    numberTwo: at('Number', 17.26, 1), two2: at('two', 17.56, 1),
    states: at("state's", 18.46), own: at('own', 18.90),
    crackdown: at('crackdown', 19.14), tally: at('tally', 19.62),
    // 6 THE WINDOW — "since January 2025,"
    since: at('since', 20.22), january: at('January', 20.52), y2025: at('2025', 21.06),
    // 7 THE TALLY — "551 raids, 576 cases filed,"
    n551: at('551', 22.48), raids: at('raids', 23.66),
    n576: at('576', 24.56), cases: at('cases', 25.74), filed: at('filed', 26.18),
    // 8 ARRESTS — "703 people arrested"
    n703: at('703', 27.08), people: at('people', 27.94), arrested: at('arrested', 28.34),
    end: 29.9,
  };

  // ============ 3. the camera ===============================================
  // The camera travels across one big board, in the pauses between sentences,
  // 4.98-5.49 before "Number one", 16.73-17.25 before "Number two". Each travel
  // starts a beat early so the new zone already has ink when the camera lands.
  // Zones (ZA/ZB/ZC) are reused by scoreSound for stereo panning.
  const CAM = [
    [0, ZA[0], ZA[1], 0.86],
    [4.98, ZA[0], ZA[1], 0.88],
    [5.16, 1520, 470, 0.72],          // dolly OUT across the crossing, both lessons in frame
    [5.34, ZB[0], ZB[1], 0.85],       // -> number one, inside the pause before "Number one"
    [16.66, ZB[0], ZB[1], 0.86],
    [16.84, 3575, 520, 0.72],         // dolly out again, then punch in on the tally
    [17.02, ZC[0], ZC[1], 0.85],      // -> the tally, inside the pause before "Number two"
    [27.30, ZC[0], ZC[1], 0.87],
    [30.00, ZC[0] - 60, ZC[1] + 90, 0.84],
  ];

  // ============ 4. story ====================================================
  // txt(s,x,y,size,font,role,a,b) — [a,b) is the write-on window on the VO clock.
  // Anchoring rule (anim2.txt): a mark may lead its word by at most 0.2 s and may
  // never lag it, so every `a` is (word time - 0.2) or later, plus an explicit
  // residue pass so the pen is never idle long enough for the board to look empty.
  //
  // Visible world windows (k = 0.85): A 0..1280 · B 1647..3153 · C 3997..5503.
  // On-screen glass: world y 167..901.
  function story(t) {
    const items = [];
    const txt = (s, x, y, size, font, role, a, b, rot) => items.push({ k: 'text', s, x, y, size, font, role, a, b, rot: rot || 0 });
    const ln = (pts, role, w, a, b) => items.push({ k: 'line', pts, role, w, a, b });

    // Travel ink. The camera crosses a stretch of board that nothing is written on,
    // so without this the glass paints blank white for ~0.2 s mid-pan (measured:
    // 0.08 % ink at t=5.25) — a full-frame white flash between lessons, which the
    // v4 sync standard rejects. Each travel therefore gets a bold double-traced
    // connector arrow — the medium's own idiom (a whiteboard flows one idea into
    // the next) drawn by the pen on the same clock as the pan, so the crossing is
    // always carrying stroke. The arrows make no claim of their own.
    const arrow = (x0, x1, y, role, a, b, th) => {
      const pts = [];
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        pts.push([x0 + (x1 - x0) * u, y - Math.sin(u * Math.PI) * 26]);  // one relaxed bow, not a sawtooth
      }
      ln(pts, role, th, a, b);                                              // first trace
      ln(pts.map((p) => [p[0] + 3, p[1] + th * 1.1]), role, th * 0.75, a + 0.02, b + 0.04); // double trace
      ln([[x1 - 38, y - 36 + 26], [x1 + 2, y + 26], [x1 - 38, y + 36 + 26]], role, th, b - 0.06, b + 0.10);
    };
    // Both arrows are placed so that they stay inside the camera frustum for the
    // whole travel, at the y band that is empty in both neighbouring lessons.
    // (A static arrow drawn where the pen "should" be ends up off-frame at the
    // worst instant — measured: the first attempt vanished at t=5.2.)
    arrow(1200, 2400, 575, 'acc1', 4.92, 5.26, 14);
    arrow(2980, 3960, 470, 'acc2', 16.60, 16.94, 14);

    // ================= ZONE A — the hook (frame 0) =========================
    txt('TWO NUMBERS.', 120, 296, 92, 'title', 'ink', 0.00, 1.02, -0.014);
    ln([[116, 328], [1080, 322]], 'acc1', 8, 0.36, 0.86);
    ln([[132, 346], [1062, 342]], 'acc1', 7, 0.80, 1.24);
    txt('both true.', 120, 470, 62, 'label', 'acc1', 1.30, 2.10, -0.02);
    txt('same government, same year.', 120, 556, 46, 'label', 'ink', 2.80, 5.00, -0.008);

    // ================= ZONE B — number one (1647..3153) ====================
    // A big circled numeral is the first thing on this part of the board, so the
    // glass has ink the instant the pan lands (measured dip was at t=6.0).
    ln(ell(2860, 300, 92, 92, -2.2, 4.5), 'acc2', 7, 5.18, 5.72);
    txt('1', 2822, 372, 150, 'num', 'acc2', 5.30, 5.86, 0);
    txt('NUMBER ONE', 1800, 250, 58, 'label', 'acc2', 5.44, 6.20, -0.012);
    txt('MAY 2026', 1800, 342, 78, 'title', 'ink', 6.30, 7.60, -0.01);
    ln([[1794, 366], [2290, 360]], 'acc1', 6, 7.00, 7.42);

    // SBP glyph: pediment + pillars, drawn while "Pakistan's Central Bank" is said
    const bankAt = (x, y, s, a) => {
      ln([[x - 42 * s, y - 8 * s], [x + 42 * s, y - 8 * s]], 'ink', 5.5, a, a + 0.12);
      ln([[x - 42 * s, y - 8 * s], [x, y - 30 * s], [x + 42 * s, y - 8 * s]], 'ink', 5.5, a + 0.1, a + 0.22);
      for (let i = -1; i <= 1; i++) ln([[x + i * 24 * s, y - 4 * s], [x + i * 24 * s, y + 26 * s]], 'ink', 4.5, a + 0.2 + (i + 1) * 0.04, a + 0.32 + (i + 1) * 0.04);
      ln([[x - 46 * s, y + 32 * s], [x + 46 * s, y + 32 * s]], 'ink', 5.5, a + 0.34, a + 0.46);
    };
    bankAt(2740, 300, 0.95, 8.00);
    txt('State Bank of Pakistan', 1800, 420, 46, 'label', 'acc1', 8.68, 9.90, 0);
    txt('reports the largest', 1800, 476, 42, 'label', 'ink', 9.38, 10.40, 0);

    // the bar chart: last bar is this month and the tallest — "largest month in history"
    ln([[2450, 610], [3060, 610]], 'ink', 5, 10.12, 10.44);
    ln([[2450, 610], [2450, 300]], 'ink', 5, 10.40, 10.70);
    { // five months, the current one rising above the rest
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = 2490 + i * 112, h = i === n - 1 ? 292 : 88 + (i % 3) * 26;
        ln([[x, 604], [x, 604 - h]], 'ink', 4.5, 10.80 + i * 0.22, 11.30 + i * 0.22);
        ln([[x, 604 - h], [x + 78, 604 - h]], 'ink', 4.5, 11.20 + i * 0.22, 11.46 + i * 0.22);
        ln([[x + 78, 604 - h], [x + 78, 604]], 'ink', 4.5, 11.40 + i * 0.22, 11.94 + i * 0.22);
      }
    }
    txt('remittance month in history', 1800, 532, 42, 'label', 'ink', 10.62, 12.60, 0);
    txt('months', 2450, 664, 40, 'label', 'acc1', 11.90, 12.60, 0);

    // the figure: "$4" counts up on "four billion", then the ".25" on "250 million"
    items.push({
      k: 'text', live: true, x: 1800, y: 742, size: 152, font: 'num', role: 'acc3',
      a: 12.86, b: 15.38,
      fn: (tt) => {
        const g12 = Math.floor(tt * 12) / 12;
        const u1 = win(g12, A.dollar4, A.billion + 0.15);
        const u2 = win(g12, A.mil250, A.million);
        return '$' + (4 * H.ease.out(u1) + 0.25 * H.ease.out(u2)).toFixed(2);
      },
    });
    txt('BILLION', 2200, 786, 60, 'label', 'ink', 13.16, 14.10, -0.02);

    // the banks the money came through, drawn across "through the banks"
    for (let i = 0; i < 3; i++) bankAt(2500 + i * 160, 772, 0.84, 15.24 + i * 0.34);
    txt('through the banks', 2450, 840, 44, 'label', 'acc1', 15.30, 16.60, 0);

    // ================= ZONE C — the tally (3997..5503) =====================
    // Timed so the page is already populated the instant the pan lands: each line
    // starts on (or just before) its own word, and the header rules go up early.
    // The board is one continuous surface, so this page's furniture is already
    // written up before the camera travels to it (the pen is off-screen then).
    // That keeps the glass populated the moment the pan lands — a bare board on
    // arrival was the defect measured at t=17.0.
    ln(ell(5270, 300, 92, 92, -2.2, 4.5), 'acc2', 7, 16.70, 17.24);
    txt('2', 5232, 372, 150, 'num', 'acc2', 16.82, 17.38, 0);
    txt('NUMBER TWO', 4130, 268, 58, 'label', 'acc2', 16.10, 16.74, -0.012);
    txt("the state's own", 4130, 336, 54, 'label', 'ink', 16.90, 17.66, 0);
    txt('CRACKDOWN TALLY', 4130, 418, 64, 'title', 'ink', 17.20, 18.30, -0.012);
    txt('SINCE JAN 2025', 4130, 494, 58, 'label', 'acc1', 19.80, 20.90, 0);

    // the tally table: a rule under the header and one per row, so the page fills
    ln([[4124, 530], [5340, 523]], 'ink', 5, 16.30, 17.30);
    ln([[4124, 524], [4124, 880]], 'ink', 4, 17.00, 17.70);
    // the first row's rule goes up with the furniture; the numbers land on their words
    ln([[4124, 632], [5340, 626]], 'ink', 3.5, 17.30, 18.00);
    ln([[4124, 734], [5340, 728]], 'ink', 3.5, 17.60, 18.30);
    ln([[4124, 806], [5340, 800]], 'ink', 4, 26.60, 27.20);

    const row = (n, label, y, numA, numB, labA, labB, size) => {
      items.push({ k: 'text', s: n, x: 4130, y, size, font: 'num', role: 'ink', a: numA, b: numB });
      txt(label, 4130 + size * 2.4, y - 8, 54, 'label', 'ink', labA, labB, 0);
    };
    row('551', 'raids', 610, 22.28, 23.40, 23.46, 24.20, 92);
    row('576', 'cases filed', 712, 24.36, 25.50, 25.54, 26.50, 92);

    items.push({
      k: 'text', live: true, x: 4130, y: 780, size: 104, font: 'num', role: 'acc2',
      a: 26.88, b: 27.94,
      fn: (tt) => String(Math.round(703 * win(Math.floor(tt * 12) / 12, 26.88, 27.94))),
    });
    txt('people arrested', 4130 + 104 * 2.4, 772, 54, 'label', 'acc2', 27.74, 29.20, 0);
    // the ring around the last, biggest number — lands on "arrested"
    ln(ell(4130 + 104 * 1.15, 742, 210, 74, -2.5, 4.3), 'acc2', 7.5, 28.14, 28.86);

    return items;
  }

  // ============ 5. sound ====================================================
  // codaAt collects sound cues that intentionally have no mark behind them.
  const codaAt = [];
  function scoreSound(k) {
    const sn = (t) => (Math.round(t * 48000) + 0.25) / 48000;
    const k0 = k;
    k = {
      play: (n, t, o) => k0.play(n, sn(t), o),
      noise: (t, o) => k0.noise(sn(t), o),
      tone: (t, o) => k0.tone(sn(t), o),
      bed: (n, a, b, o) => k0.bed(n, a, b, o),
    };
    const panic = (x) => H.clamp((x - 640) / 3200, -1, 1) * 0.6;

    // ---- a felt tip touching down, then the stroke itself
    const mk = (a, b, gain = 1, pan = 0, material = 'marker', minor = true) => {
      k.noise(a, { dur: 0.022, filter: 'bandpass', f: 1500, q: 1.4, gain: 0.22 * gain, a: 0.001, pan, minor });
      k.play('stroke', a, { material, dur: Math.max(0.03, b - a), gain, pan, minor });
    };
    // one stroke per word, laid on the same character-position mapping mText uses
    const write = (s, a, b, gain = 0.9, pan = 0) => {
      const n = s.length || 1, re = /\S+/g; let m;
      while ((m = re.exec(s))) mk(a + (b - a) * m.index / n, a + (b - a) * (m.index + m[0].length) / n, gain, pan);
    };
    // a cue with no mark behind it — the closing beat. Recorded so the sound
    // clock's check can tell a deliberate rest from a cue that drifted.
    const coda = (t) => { codaAt.push(t); k.play('click', t, { f: 1300, gain: 0.8, minor: true }); };

    // ---- 1 HOOK
    k.play('pop', 0.02, { f: 330, gain: 0.45, minor: true });      // cap off
    write('TWO NUMBERS.', A.two, A.numbers + 0.42, 0.95, panic(ZA[0]));
    mk(A.numbers + 0.42, A.numbers + 0.66, 1.15, panic(ZA[0]), 'marker', false);
    write('both true.', A.both1, A.true1 + 0.22, 0.8, panic(ZA[0]));
    write('same government, same year.', A.government, A.year + 0.3, 0.7, panic(ZA[0]));

    // ---- the two camera travels get the medium's own air movement
    k.play('whoosh', 4.9, { dur: 0.6, top: 2100, gain: 0.55, minor: true });
    k.play('whoosh', 16.6, { dur: 0.6, top: 2100, gain: 0.55, minor: true });

    // ---- 2 NUMBER ONE
    write('NUMBER ONE', A.numberOne, A.one + 0.3, 1.0, panic(ZB[0]));
    write('MAY 2026', A.may, A.y2026 + 0.22, 0.95, panic(ZB[0]));

    // ---- 3 the claim
    write('State Bank of Pakistan', A.sbp, A.reports + 0.34, 0.6, panic(ZB[0]));
    write('reports the largest', A.largest, A.month, 0.55, panic(ZB[0]));
    write('remittance month in its history', A.month, A.history + 0.3, 0.55, panic(ZB[0]));

    // ---- 4 the figure: a slot-machine scrawl, ticks on the 12 fps grid
    write('$4.25', A.dollar4, A.billion + 0.55, 1.25, panic(ZB[0]));
    {
      const wat = A.billion + 0.15; // the counter only runs once the "billion" is out
      let last = '';
      for (let f = Math.ceil(wat * 12); f < Math.ceil(A.million * 12); f++) {
        const u = Math.min(1, (f / 12 - wat) / (A.million - wat));
        const v = (4.25 * Math.pow(u, 0.7)).toFixed(u >= 1 ? 2 : 2);
        if (v !== last) { k.play('count', f / 12, { gain: 0.6, f: 3200 + u * 2400, pan: panic(ZB[0]), minor: true }); last = v; }
      }
    }
    k.play('impact', A.million, { gain: 0.85, pan: panic(ZB[0]) });     // "million" — the figure lands
    k.play('ding', A.million + 0.01, { f: 'E6', gain: 0.5, pan: panic(ZB[0]) });
    write('BILLION', A.billion, A.billion + 0.5, 1.0, panic(ZB[0]));
    for (let i = 0; i < 3; i++) mk(A.banks + i * 0.09, A.banks + i * 0.09 + 0.4, 0.8, panic(ZB[0] + i * 150));
    write('through the banks', A.through, A.banks + 0.24, 0.6, panic(ZB[0]));

    // ---- 5 NUMBER TWO
    // These three follow the PICTURE's windows, not the word times. Zone C's
    // furniture is drawn early on purpose so the page is populated the instant
    // the camera lands (see the picture block above) — the pen works off-screen
    // during the pan. Scoring them on the words instead put ~1.5 s of pen
    // scratch over a board that had stopped moving, which is the defect the
    // sound-clock gate measures. Same times as the ink, as rule 2 requires.
    write('NUMBER TWO', 16.10, 16.74, 1.0, panic(ZC[0]));
    write("the state's own", 16.90, 17.66, 0.7, panic(ZC[0]));
    write('CRACKDOWN TALLY', 17.20, 18.30, 0.95, panic(ZC[0]));

    // ---- 6 the window
    write('SINCE JAN 2025', 19.80, 20.90, 0.75, panic(ZC[0]));

    // ---- 7 the tally: each number scrawls, its name lands on the word
    write('551', A.n551, A.raids, 1.15, panic(ZC[0]));
    write('raids', A.raids, A.n576 - 0.12, 0.85, panic(ZC[0] + 200));
    write('576', A.n576, A.cases, 1.15, panic(ZC[0]));
    write('cases filed', A.cases, A.filed + 0.3, 0.85, panic(ZC[0] + 200));

    // ---- 8 the last, biggest number
    write('703', A.n703, A.people + 0.55, 1.3, panic(ZC[0]));
    k.play('impact', A.people, { gain: 0.9, pan: panic(ZC[0]) });
    write('people arrested', A.people, A.arrested + 0.4, 0.9, panic(ZC[0] + 200));
    mk(A.arrested, A.arrested + 0.34, 1.2, panic(ZC[0]), 'sharpie', false);   // the ring
    k.play('success', A.arrested + 0.2, { f: 'C6', gain: 0.55, pan: panic(ZC[0]) });

    // ---- settle
    // A closing sound with no mark of its own: the cap going back on as the piece
    // comes to rest. It is declared so the sound clock can tell an intentional
    // resting beat from a cue that drifted off the picture.
    coda(29.55);
  }

  // ============ the check's view of the timeline ============================
  // scripts/check.cjs measures three things the picture alone cannot tell you:
  // how LATE a mark is against the word it serves, how fast the pen is moving,
  // and whether more than one pen is ever down. All three need each mark's own
  // word time, so it is derived here rather than typed next to every mark:
  //
  //   a mark serves the nearest spoken beat to its start, and lag is signed:
  //   a - w is positive when the stroke starts after its word (the defect), and
  //   negative when it leads it (fine, that is what the 0.2 s lead is for).
  //
  // Nearest, not "latest started", because "latest started" is true of every
  // mark by construction and would make the check unfalsifiable. Nearest can
  // fail: a stroke that begins well away from any word is a stroke that is not
  // following the narration, which is the defect this file exists to prevent.
  function marks() {
    const beats = Object.values(A).filter((v) => typeof v === 'number').sort((x, y) => x - y);
    const wordAt = (a) => {
      let best = beats[0], bd = Infinity;
      for (const v of beats) {
        const d = Math.abs(v - a);
        if (d < bd) { bd = d; best = v; }
      }
      return best;
    };
    // Lettering is what a viewer reads against the voice, so the check holds it to
  // its own word. Rules carry no text; a bar chart cascading in is many lines
  // and one pen, which is not a defect.
  //
  // The glyph band is left to the check to measure on a real canvas — a guessed
  // 0.55 em advance put "$4.25" and "BILLION" on top of each other when they
  // are plainly stacked on separate baselines in the rendered frame.
  return story(0).map((m) => {
    const lettered = m.k === 'text';
    return {
      kind: m.live ? 'live' : m.k,
      s: lettered ? (m.live ? '(live counter)' : (m.s || '')) : '',
      a: m.a, b: m.b,
      chars: lettered ? (m.live ? 6 : (m.s || '').length) : 0,
      w: wordAt(m.a),
      // what the check needs to measure the drawn band itself. A live counter is
      // measured at its final value, which is its widest state by construction.
      text: lettered ? (m.live ? m.fn(m.b) : m.s) : null,
      x: m.x, y: m.y, size: m.size, font: m.font, rot: m.rot || 0,
    };
  });
  }

  // ============ the check's view of the sound ===============================
  // Rule 2 of the two sync rules is "sound is scheduled from the same times the
  // picture uses". A comment cannot enforce that, so this replays the score
  // against a recording kit and hands the check every time the audio fires.
  // The check then asks whether each one sits near a mark: if the sound list
  // ever grew its own hand-typed times, they drift away from the marks and the
  // gate fires.
  function scoreTimes() {
    const fired = [];
    const rec = {
      play: (n, t) => fired.push(t),
      noise: (t) => fired.push(t),
      tone: (t) => fired.push(t),
      bed: (n, a) => fired.push(a),
      music: (n, a) => fired.push(a),
      withMinor: (fn) => fn(),
      hz: (n) => 440,
      vo: true,
    };
    codaAt.length = 0;
    scoreSound(rec);
    return fired.slice().sort((x, y) => x - y);
  }

  // ============ export ======================================================
  // WB.frame takes the medium plus your camera and story; this wrapper is the
  // whole of the coupling between the two files.
  function frame(ctx, W, H, t) { WB.frame(ctx, W, H, t, { cam: CAM, story }); }

  window.explainer = frame;
  window.scoreSound = scoreSound;
  window.DURATION = DURATION;
  window.VO_AT = VO_AT;
  window.ANCHORS = A;
  window.ANCHOR_MISSES = MISSED;
  window.WORD_COUNT = WORDS.length;
  window.__story = story;
  window.__marks = marks();
  // Times the sound score reads, so the check can prove the audio is scheduled
  // from the picture's clock rather than from a second, hand-typed list.
  window.__scoreTimes = scoreTimes();
  window.__coda = codaAt.slice();
})();
