# Markerboard

**Whiteboard explainer videos where a marker draws the diagram while the camera
follows it across the board — and every stroke lands on its own spoken word.**

Give an agent a topic. It asks one question — whether you are supplying the voiceover
and timings or want them produced — writes the script for your approval, then
delivers a finished MP4.

![The first ten seconds: a marker draws TWO NUMBERS on a glossy board, then the camera travels to NUMBER ONE, MAY 2026, with a circled 1 and the State Bank glyph](demo/demo.gif)

*The first ten seconds of the reference piece, rendered from this code — no cuts, one
continuous board, one take of narration.*

**Works on macOS, Windows and Linux.** One `npm install`; the scripts find Chrome and
ffmpeg themselves.

---

## Contents

- [Using it with an agent](#using-it-with-an-agent)
- [What this is](#what-this-is)
- [How it works in one paragraph](#how-it-works-in-one-paragraph)
- [Install](#install)
  - [1. Node](#1-node)
  - [2. A Chromium browser](#2-a-chromium-browser)
  - [3. ffmpeg](#3-ffmpeg)
  - [4. The project](#4-the-project)
  - [5. Fonts](#5-fonts)
  - [6. Check the machine](#6-check-the-machine)
- [Quick start](#quick-start)
- [Make your own video](#make-your-own-video)
  - [a. Get a voiceover](#a-get-a-voiceover)
  - [b. Get word timestamps](#b-get-word-timestamps)
  - [c. Write the anchors](#c-write-the-anchors)
  - [d. Plan the camera](#d-plan-the-camera)
  - [e. Write the marks](#e-write-the-marks)
  - [f. Score the sound](#f-score-the-sound)
- [Commands](#commands)
- [Previewing without rendering](#previewing-without-rendering)
- [Tuning knobs](#tuning-knobs)
- [The eight checks](#the-eight-checks)
- [Audio](#audio)
- [Troubleshooting](#troubleshooting)
- [Repo layout](#repo-layout)
- [Licence](#licence)

---

## Using it with an agent

**This is how the repo is meant to be used.** You do not write code, draw diagrams or
edit a timeline. You give an agent a topic and answer one question.

Open the folder in [Claude Code](https://claude.com/claude-code) (or any agent that can
run commands) and say what you want:

```
Build me a whiteboard explainer about why Karachi's water tankers cost more than its pipes.
```

The agent reads [`SKILL.md`](SKILL.md), and this is what happens:

1. **It asks one question** — *"Are you giving me the voiceover, transcript and
   word-level timing yourself, or should I produce them for you?"* Your answer decides
   the whole workflow, so it asks before doing anything else.
2. **It writes the script and stops.** You get the narration numbered by beat, alongside
   what will be drawn for each one — the circled numerals, the chart, the caption that
   lands on a specific word. **Nothing is generated until you approve it.** A re-record
   invalidates every timing in the piece, which is why this gate exists.
3. **It makes the voiceover** if you asked it to — ElevenLabs with your key, an MCP
   voice tool, any service you name, or a local model — then transcribes it for
   word-level timing so the drawing can lock to the words.
4. **It builds and delivers one MP4.** Usually around 30 seconds; longer if the material
   needs it. It runs the eight checks, fixes what they catch, and hands you the file.

### Want a specific voice?

Say so — *"use my ElevenLabs clone, voice ID …"*, or *"connect to the ElevenLabs MCP and
use a British documentary voice."* The agent uses what you name rather than choosing,
and tells you which voice it used.

### Want to supply everything yourself?

Hand the agent two files and it skips straight to writing the script:

| You provide | Goes where |
|---|---|
| The narration audio | `vo.mp3` in the repo root |
| A word-timed transcript | `story/beatwords.json` (see [b. Get word timestamps](#b-get-word-timestamps)) |

### Installing the skill

`SKILL.md` is a standard agent skill. Installing it makes it available in **every**
project, not just this folder. Copy the whole checkout — the skill drives the scripts
beside it, so `SKILL.md` on its own is not enough:

```bash
git clone https://github.com/arifbuildsai/markerboard.git ~/.claude/skills/markerboard
cd ~/.claude/skills/markerboard && npm install
```

The agent will then pick it up whenever a whiteboard or hand-drawn explainer is
mentioned, from any project.

**The skill folder is read-only in use.** Each video gets its own working folder,
copied from the skill, so a project never overwrites the shipped example and the
next one does not inherit the last one's story:

```bash
cp -R ~/.claude/skills/markerboard/{index.html,src,scripts,story,package.json,package-lock.json} ~/Videos/my-explainer/
cd ~/Videos/my-explainer && npm install
```

The agent does this step for you when you start a new video — that is the point of
the skill.

To use it in one project only, clone it anywhere and open that folder:

```bash
git clone https://github.com/arifbuildsai/markerboard.git
cd markerboard && npm install
claude
```

---

## What this is

A complete, working whiteboard-explainer pipeline with no editor, no stock footage,
no animation software and no paid services:

- **The board** is drawn in code — glossy dry-erase surface, aluminium frame, tray
  with two markers and an eraser, ceiling-light sheen, and the faint ghost of the
  last lesson that was wiped off.
- **The ink** is a marker: streaky chisel strokes, pooled edges where the pen slowed,
  hand wobble on every line, and letters jittered per glyph so nothing looks typeset.
- **The camera** travels across one large board between ideas, dollying out and
  punching in — never a cut, never a fade to white.
- **The timing** comes from the transcript. Every stroke is anchored to a specific
  spoken word.
- **The sound** is synthesised in the browser: the marker on the board, the cap
  coming off, the whoosh of a camera move. Mixed under the voice automatically.

What it is **not**: a template you fill in a web form, a stock-footage assembler, or
a tool with a GUI. It is a small codebase you write one file in.

## How it works in one paragraph

`index.html` loads three libraries and your `story.js`, and asks the browser to draw
a picture at time `t`. That picture is a pure function of `t` — the same `t` always
gives the same pixels, because all randomness is seeded. So the renderer can step
through frames one at a time and pipe them straight into ffmpeg, and the same
`story.js` can also play live in the browser with sound, scrubbing included. Your
`story.js` says *what is drawn when*; `src/medium.js` says *what ink looks like*.
They meet in five lines.

The picture is **bit-reproducible**: rendering twice gives an identical
`build_video.mp4`. The synthesised effects WAV is reproducible to one LSB — a
handful of samples in 2.88 million differ by ±1 at around −85 dBFS, which is float
accumulation in the Web Audio graph and is inaudible.

---

## Install

Nothing here is paid, and nothing is macOS-only.

### 1. Node

**Node 18 or newer.** Check:

```bash
node --version
```

If it prints nothing, install from [nodejs.org](https://nodejs.org) (macOS and
Windows installers, or your package manager on Linux).

### 2. A Chromium browser

`puppeteer-core` deliberately does **not** download a browser — it drives one you
already have, so the canvas and font rasterisation you preview are exactly what gets
rendered.

- **macOS** — Google Chrome from `/Applications`, or set `CHROME_PATH`
- **Windows** — Google Chrome, and Microsoft Edge works too (it is Chromium)
- **Linux** — `google-chrome`, `chromium`, or `chromium-browser`

The scripts search all the usual install locations and report what they tried if
they cannot find one. To point at a specific binary:

```bash
# macOS / Linux
export CHROME_PATH="/path/to/chrome"

# Windows (cmd)
set CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe

# Windows (PowerShell, for this session)
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

### 3. ffmpeg

Needed for encoding and muxing. `ffmpeg` **and** `ffprobe` must be reachable.

```bash
# macOS
brew install ffmpeg

# Windows
winget install Gyan.FFmpeg

# Debian / Ubuntu
sudo apt install ffmpeg

# Fedora
sudo dnf install ffmpeg

# Arch
sudo pacman -S ffmpeg
```

Verify:

```bash
ffmpeg -version
ffprobe -version
```

If they are installed but not on your PATH, set `FFMPEG_PATH` and `FFPROBE_PATH` to
their full paths instead.

### 4. The project

```bash
git clone https://github.com/arifbuildsai/markerboard.git
cd markerboard
npm install
```

That installs one dependency, `puppeteer-core`.

### 5. Fonts

The medium uses two Google Fonts, loaded by `index.html` at run time:

| Font | Used for |
|---|---|
| `Permanent Marker` 400 | titles and big numerals |
| `Kalam` 700 | all labels |

They load from `fonts.googleapis.com`. **The renderer needs a network connection on
first run** (or the fonts cached in Chrome) — if the fonts fail to load, text falls
back to a system cursive face and the output will not match the demo. Open
`index.html` in Chrome once before your first render; `npm run doctor` reports
whether both fonts actually loaded.

### 6. Check the machine

```bash
npm run doctor
```

This reports node, the dependency, the Chrome it will launch, ffmpeg and ffprobe,
and whether the two fonts are available — each as a measured value, so a failure
tells you what to install:

```
markerboard doctor — linux x64, node v20.11.0
project: /home/you/markerboard

  ok   node v20.11.0
  ok   puppeteer-core 23.11.1
  ok   chrome: /usr/bin/google-chrome
  ok   chrome version: Google Chrome 157.0.8103.51
  ok   ffmpeg: /usr/bin/ffmpeg
  ok     ffmpeg version 9.0.2
  ok   ffprobe: /usr/bin/ffprobe
  ok   chrome launches headless
  ok   font loaded: Permanent Marker
  ok   font loaded: Kalam

Everything is in place. Next: read SKILL.md, or `npm run check`.
```

---

## Quick start

Render the included 30-second example end to end:

```bash
# 1. check the timeline and the picture (fast, no encode)
npm run check

# 2. frame-step 30 s of video + synthesise the marker effects
npm run render

# 3. bring in a voiceover and mux everything together
npm run mux -- vo.mp3 out.mp4
```

Step 3 needs a `vo.mp3` — use your own narration, or run steps 1–2 alone to see the
picture and effects without a voice.

Expected `npm run check` output on the included example:

```
 ok   transcript loaded            55 words
 ok   anchors resolved             all words found
 ok   nothing is late              lettering worst +0.18s "SINCE JAN 2025"@19.80 (rule worst +0.44s, not gated)
 ok   hand speed                   fastest 19.7 chars/s at 16.9s "the state's own"
 ok   one pen                      24 lettered marks, no overlapping lettering
 ok   sound on the picture clock   129 cues, 0 outside every mark (+1 declared coda)
 ok   board never blank            min ink 7.41% at 0.00s (floor 4%)
 ok   picture never freezes        longest still 0.38s at 7.63s (max 1.6s)

     82 marks over 30s · ink mean 13.5% range 7.4–18.2%

all checks pass
```

---


## Make your own video

You write **one file**: `story/story.js`. Everything else is shared machinery.

### a. Get a voiceover

Any voice, any tool — including the agent producing it for you. Two constraints:

- **One continuous take**, or a file you have already joined, exactly as long as the
  piece. The animation clock is the audio clock; gaps and drift show up as desync.
- **Put it at `vo.mp3`** in the repo root, or pass a path when you mux.

Aim for 25–40 seconds for a short piece; a few minutes works for a full explainer,
because the board is large and zones are reused.

Generate it however you like — ElevenLabs with `ELEVENLABS_API_KEY` exported, any
MCP voice tool your agent can reach, or a local model. The project never stores your
key; `scripts/transcribe.cjs` reads it from the environment and never logs it.

### b. Get word timestamps

You need a transcript with a timestamp **per word**. The contract is this file,
`story/beatwords.json`:

```json
[
  { "t": 0.16, "e": 0.28, "w": "Two" },
  { "t": 0.36, "e": 0.82, "w": "numbers," },
  { "t": 1.40, "e": 1.60, "w": "both" }
]
```

- `t` — start, seconds
- `e` — end, seconds
- `w` — the word as spoken, punctuation included

**The easy way** — one command, picks its own provider:

```bash
node scripts/transcribe.cjs vo.mp3
```

It uses **ElevenLabs Scribe** when `ELEVENLABS_API_KEY` is set, and falls back to a
local **whisper** CLI if not. It writes `story/beatwords.json` and tells you how many
words it found and when they end (which is your minimum `DURATION`).

```bash
# macOS / Linux
export ELEVENLABS_API_KEY="your key"

# Windows (cmd) — persists for new terminals
setx ELEVENLABS_API_KEY "your key"

# Windows (PowerShell, this session)
$env:ELEVENLABS_API_KEY = "your key"
```

**The manual way** — any word-timed transcript, mapped to three fields. For example
whisper's JSON:

```python
import json
src = json.load(open("vo.json"))
out = [{"t": w["start"], "e": w["end"], "w": w["word"].strip()}
       for seg in src["segments"] for w in seg.get("words", [])]
json.dump(out, open("story/beatwords.json", "w"), ensure_ascii=False, indent=0)
```

Any commercial transcription service with word-level timestamps works the same: map
its field names to `t`/`e`/`w`.

> **Re-transcribe whenever the audio changes.** A transcript from a different take
> is the single most common cause of "everything is in the wrong place".

### c. Write the anchors

Open `story/story.js`. Section 1 resolves your words into times, and **fails loudly**
if a word is not in the transcript:

```js
const A = {
  // 1 HOOK — "Two numbers. Both true. Both from the same government, in the same year."
  two:        at('Two', 0.16),
  numbers:    at('numbers', 0.36),
  government: at('government', 3.48),
  year:       at('year', 4.78),
};
```

`at(word, fallback)` lower-cases, strips punctuation and looks the word up. The
fallback is what the mark uses if the word is missing — but the missing word is also
**collected and reported**, and both `check` and `render` refuse to run while any
anchor is unresolved. For repeated words, pass the occurrence:

```js
numberOne: at('Number', 5.52),      // the first "Number"
numberTwo: at('Number', 17.26, 1),  // the second
```

Do not invent fallback times. Fix the anchor.

### d. Plan the camera

The board is a large world (~5600 × 920 units) and the camera looks at a window into
it. Define one centre per idea — a **zone** — and let the camera travel between them
during the pauses in the narration:

```js
const ZA = [640, 360];    // the hook
const ZB = [2400, 560];   // point one
const ZC = [4750, 560];   // point two

const CAM = [
  [0,     ZA[0], ZA[1], 0.86],   // hold
  [4.98,  ZA[0], ZA[1], 0.88],   // pause begins — start moving
  [5.16,  1520,  470,   0.72],   // dolly out: both zones in frame
  [5.34,  ZB[0], ZB[1], 0.85],   // land before the next sentence starts
];
```

Each key is `[time, centreX, centreY, zoom]`.

**Rules that keep the picture from flashing white:**

1. At zoom `k = 0.85` the visible window is **1506 × 847 world units**. Space zones
   further apart than that or two ideas share the frame; closer than that and you
   waste board.
2. **Land before the words, not during them.** The next zone should already have ink
   when the camera arrives.
3. **The camera crosses unwritten board.** Write something there — the example draws
   a double-traced connector arrow on the same clock as the pan.

Zoom is interpolated **geometrically**, matching a real dolly. Position is linear.
Do not change this to linear zoom; it is the difference between a camera and a
PowerPoint.

### e. Write the marks

`story(t)` returns the flat list of marks that exist at time `t`. Two helpers:

```js
// txt(text, x, y, size, font, role, startTime, endTime, rotation)
txt('MAY 2026', 1800, 342, 78, 'title', 'ink', A.may, A.y2026 + 0.22, -0.01);

// ln(points, role, strokeWidth, startTime, endTime)
ln([[1794, 366], [2290, 360]], 'acc1', 6, 7.00, 7.42);
```

- `font` is `'title'`, `'label'` or `'num'`
- `role` is `'ink'` (near-black), `'acc1'` (blue), `'acc2'` (red), `'acc3'` (green)
- A mark is drawn progressively between `startTime` and `endTime`, so **that window
  is your pacing**. Widen it for a considered line, narrow it for a quick one.

Shapes are built in code and passed to `ln()`:

```js
ell(cx, cy, rx, ry, startAngle, sweep, grow)   // circle, arc, ring
bez(p0, p1, p2, p3)                            // cubic curve
WB.wobble(pts, noise, seed, amplitude)         // hand tremor
WB.tracePath(ctx, pts)                         // path onto a context
```

For a counter that ticks up, push a `live` mark with an `fn`:

```js
items.push({
  k: 'text', live: true, x: 1800, y: 742, size: 152, font: 'num', role: 'acc3',
  a: 12.86, b: 15.38,
  fn: (tt) => '$' + (4 * win(Math.floor(tt * 12) / 12, A.dollar4, A.million)).toFixed(2),
});
```

The `12` is the frame grid — counting on a 12 fps grid reads as a hand scrawling
digits, not a smooth slide.

#### The rule that governs all of this

> **A mark may lead its word by up to 0.2 s. It must never lag it.**

Leading is invisible. Lagging reads as a broken player. If your strokes cannot fit
inside their words at a believable hand speed, **cut something** — do not stretch
the stroke past the sentence. `npm run check` measures this (gate 3).

### f. Score the sound

`scoreSound(k)` receives a kit and schedules the marker against the **same** `A`
table the picture uses:

```js
function scoreSound(k) {
  const mk = (a, b, gain, pan, material = 'marker', minor = true) => { ... };
  const write = (s, a, b, gain, pan) => { ... };

  write('MAY 2026', A.may, A.y2026 + 0.22, 0.95, panic(ZB[0]));
  k.play('whoosh', 4.9, { dur: 0.6, top: 2100, gain: 0.55, minor: true });
}
```

- `k.play(name, t, opts)` — a named sound (`stroke`, `pop`, `click`, `whoosh`,
  `ding`, `impact`, `paper`, `erase`, `stamp`, and more — see `src/sound.js`)
- `k.noise(t, opts)` / `k.tone(t, opts)` — raw synthesis
- `k.bed(name, t0, t1, opts)` — a continuous layer
- `{ minor: true }` — quieter in voiceover mode; everything is minor here, because
  the narration owns the mix

`panic(x)` maps a world x position to stereo pan, so a sound happens where the eye is.

---

## Commands

| Command | Does |
|---|---|
| `npm run doctor` | Proves this machine can render — Chrome, ffmpeg, fonts |
| `npm run check` | The eight measurements. **Exits 1** on a real defect, so it works in a pre-commit hook |
| `npm run render` | Frame-steps `build_video.mp4` and synthesises `build_fx.wav` |
| `npm run mux` | `node scripts/mux.cjs [vo.mp3] [out.mp4]` — joins picture, voice, effects with loudness normalisation |
| `npm run build` | check → render → mux, in order |

Individual tools:

```bash
node scripts/doctor.cjs                     # environment report
node scripts/transcribe.cjs vo.mp3          # audio -> story/beatwords.json
node scripts/render.cjs --stills 2,8,14     # PNGs to ./out/ — spot-check frames
node scripts/render.cjs --fps 60            # 60 fps instead of 30
node scripts/check.cjs                      # checks only
node scripts/mux.cjs myvoice.mp3 final.mp4  # explicit paths
```

Every one of these works unchanged on Windows, macOS and Linux. They find Chrome
and ffmpeg themselves; `CHROME_PATH`, `FFMPEG_PATH` and `FFPROBE_PATH` override the
search when you need them to.

## Previewing without rendering

Open `index.html` in Chrome. You get the piece playing in real time with sound:
play/pause, a scrub bar, loop, and a sound toggle. Drag any audio file onto the
window and it plays against that instead.

This is the fast loop. Render only when the preview looks right. Just open
`index.html` in Chrome — double-clicking it works:

```bash
# macOS
open index.html

# Windows
start index.html

# Linux
xdg-open index.html
```

> The page loads `story/beatwords.json` with a synchronous request. Chrome allows
> that for local files, but some configurations and other browsers block it. If the
> preview shows a blank board, serve the folder instead — on any platform:
> ```bash
> npx serve .          # or: python3 -m http.server 8080
> ```
> then open the URL it prints.

## Tuning knobs

All in `story/story.js` unless noted.

| Knob | Where | Effect |
|---|---|---|
| `DURATION` | top | Total length. Must cover the last mark plus a beat of hold |
| `VO_AT` | top | Where the voiceover starts on the timeline (usually `0`) |
| `ZA`, `ZB`, `ZC` | top | Zone centres — how far the camera travels |
| `CAM` | section 3 | Camera choreography |
| mark `a`, `b` | section 4 | **Stroke pacing.** Wider = slower, more deliberate |
| `size` | `txt()` | Text size in world units |
| role strings | `txt()` / `ln()` | Colour family: `ink`, `acc1`, `acc2`, `acc3` |
| `INK_FLOOR` | `scripts/check.cjs` | Minimum % of frame carrying ink |
| `STATIC_MAX` | `scripts/check.cjs` | Longest allowed still stretch, seconds |
| `SPEED_MAX` | `scripts/check.cjs` | Max lettering speed, chars/s |
| `LAG_MAX` | `scripts/check.cjs` | Max permitted lag behind a word, seconds |
| loudness targets | `scripts/mux.cjs` | `I`, `TP`, `LRA` — read the comments first |

## The eight checks

`npm run check` fails the build on a real defect and passes correct work. Two of the
gates are easy to implement in a way that lies in the comfortable direction:

| # | Gate | Measures |
|---|---|---|
| 1 | transcript loaded | `beatwords.json` produced words at all |
| 2 | anchors resolved | every `at()` found its word |
| 3 | nothing is late | **lettering** vs its own word (rules are exempt — a chart cascade legitimately outlives a word) |
| 4 | hand speed | chars/s per lettered mark |
| 5 | one pen | two sets of **letters in the same box** — geometry, not time overlap |
| 6 | sound on the picture clock | every sound cue lands inside a mark's window — rule 2, enforced |
| 7 | board never blank | ink coverage sampled at 8 fps |
| 8 | picture never freezes | longest run of near-identical frames |

Gates 3, 5 and 6 read exports from the bottom of `story.js`: `__marks` (each mark's
window, text and drawn band) and `__scoreTimes` (every time the sound score fires).
If you restructure the story, keep those exports — without them the gates report
"not measured" rather than passing falsely.

**One limit worth knowing.** Gate 3 measures how far a lettered mark sits from the
*nearest* spoken word. It cannot know which word you *intended* it to serve, so a
caption moved onto a different word will pass. It catches the defect that actually
ships — a stroke that trails its sentence into silence — not a mis-anchored one.
When you retime, retime through the `A` table so intent and time stay together.

## Audio

`scripts/mux.cjs` does the whole mix, in this order:

```
voice  → loudnorm I=-17 TP=-2 → split
                        ├─→ mix input
                        └─→ sidechain key
effects → loudnorm I=-26 → sidechain-ducked by the voice → mix
mix → loudnorm I=-15.2 TP=-2.2 LRA=11 → 48 kHz → AAC 160 kbps
```

The marker steps back whenever the narrator speaks and returns in the gaps — slow
attack and release, so the pen does not stutter in time with words.

**Two settings look wrong and are deliberate:**

- **`TP=-2.2`**, not −1.5. AAC adds roughly 1 dB of inter-sample overshoot on
  percussive material. Targeting −1.5 on the pre-encode pass delivers a file at
  about −0.7 dBTP — clipping. −2.2 lands it at −2.1 dBTP.
- **`aresample=48000` written out.** `loudnorm` runs internally at 192 kHz and
  leaks a 96 kHz stream into the AAC otherwise.

Delivered loudness on the reference: **−15.9 LUFS integrated, −2.1 dBTP**. That is
correct for platforms that normalise to −14; anything hotter gets turned back down.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Could not find Chrome or Chromium` | Run `npm run doctor`. Install Chrome, or set `CHROME_PATH` to any Chromium/Edge binary |
| `Could not find ffmpeg` | Install it, or set `FFMPEG_PATH` and `FFPROBE_PATH` to the full paths |
| `PLAYER_READY` never appears, render times out | An undefined symbol in `story.js` aborted the page's boot code. Open the preview in Chrome and read the console |
| `Cannot find module 'puppeteer-core'` | `npm install` in the repo root |
| `FATAL: unresolved anchors: ...` | A word in `at()` is not in `beatwords.json`. Fix the word or re-transcribe |
| `FATAL: transcript empty` | `story/beatwords.json` is missing or empty |
| Everything lands in the wrong place | The transcript is from a different take than the audio |
| Board flashes white mid-pan | The camera crosses unwritten board. Add travel ink on the pan's clock |
| Preview is blank but rendering works | Local-file XHR blocked; serve the folder (`npx serve .`) and open the URL |
| Text renders in a fallback font | Google Fonts did not load. Open the preview once with a connection, then render |
| Check gate 5 fires on a chart | You are on an older checker that counts time overlap; this version measures glyph boxes |
| Delivered file clips at the top | Do not raise `TP` toward −1.5. Read the mux.cjs comment |
| Mux warns the durations differ | `vo.mp3` and `beatwords.json` are from different takes — re-transcribe |

## Repo layout

```
markerboard/
├── index.html              the player and the preview
├── story/
│   ├── story.js            ← the only file you write per video
│   └── beatwords.json      ← word timestamps from your take
├── src/
│   ├── medium.js           ink, board, lighting, camera, marker in hand
│   ├── sound.js            the synthesiser
│   └── harness.js          seeded noise, easing, render loop, fonts
├── scripts/
│   ├── env.cjs             finds Chrome and ffmpeg on any platform
│   ├── doctor.cjs          proves this machine can render, and says what to fix
│   ├── transcribe.cjs      audio → word timings (ElevenLabs or whisper)
│   ├── check.cjs           eight measurements, exits 1 on a defect
│   ├── render.cjs          frames → mp4, effects → wav
│   └── mux.cjs             picture + voice + effects → delivery
├── demo/
│   └── demo.gif            the first 10 seconds, as the image above
├── SKILL.md                the method and the agent conversation
└── package.json
```

Rendered intermediates — `build_video.mp4`, `build_fx.wav`, `out/` — are generated
and git-ignored. To rebuild the demo from source, run `npm run render`.

## Licence

MIT. See [LICENSE](LICENSE).

The reference piece's narration is used as a worked example; the code and the medium
are yours to build on.
