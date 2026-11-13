---
name: markerboard
description: Build a dry-erase whiteboard explainer from a topic — a marker draws diagrams on a glossy board while the camera travels across it, with every stroke timed to its own spoken word. Use when someone wants a hand-drawn explainer, whiteboard animation, scribe video, or a chart drawn on camera. Takes a topic, optionally produces the voiceover and transcript, and delivers a finished MP4.
---

# Markerboard

A marker on a whiteboard, drawn by hand, with the voiceover carrying the timeline.
Not a slideshow that fades between ideas: one big board, a camera that walks across
it, and ink that lands on the exact word it belongs to.

You are the agent. The user gives you a topic; you deliver a finished video. This
file is the conversation and the build, in order.

---

## Where things are

The skill lives at a fixed path and is **read-only in use**. Every video is built in
its own working folder, which is a copy of the skill. Do not edit `story/story.js`
inside the skill directory itself — that overwrites the shipped example and leaves
the next project starting from your last one.

Set the skill root once, then copy it per project:

```bash
SKILL="$HOME/.claude/skills/markerboard"        # or wherever this SKILL.md lives
PROJ="$HOME/Videos/my-explainer"                # one folder per video

mkdir -p "$PROJ"
cp -R "$SKILL"/{index.html,src,scripts,story,package.json,package-lock.json} "$PROJ"/
cd "$PROJ" && npm install
```

Windows PowerShell equivalent:

```powershell
$Skill = "$HOME\.claude\skills\markerboard"
$Proj  = "$HOME\Videos\my-explainer"
New-Item -ItemType Directory -Force $Proj | Out-Null
Copy-Item "$Skill\index.html","$Skill\src","$Skill\scripts","$Skill\story","$Skill\package.json","$Skill\package-lock.json" -Destination $Proj -Recurse
cd $Proj; npm install
```

From then on every command runs from `$PROJ`. Confirm with `pwd` before building.

In the project folder you write exactly **one** file — `story/story.js` — and replace
`story/beatwords.json` with the transcript of your own take. Everything under `src/`
is the medium and must not be edited. If a render or a check ever needs a change to
`src/`, stop: that is a bug in the skill, not something to patch per project.

## Part 1 — The conversation

Work through this in order. Do not skip to building.

### 1. Get the topic

If the user has not stated one, ask what the video is about — one short question,
not a questionnaire.

### 2. Ask the one question that decides the shape of the job

Ask it plainly, and wait:

> **"Are you giving me the voiceover, transcript and word-level timing yourself —
> or should I produce them for you?"**

This is not a formality. It determines what you do next, and it is the only
question that changes the workflow.

- **They provide everything** → ask for two files: the audio (`vo.mp3`) and the
  word-timed transcript (`story/beatwords.json`). Then skip to step 4.
- **You produce them** → step 3.
- **They want a specific voice** — ElevenLabs, another MCP, a service they name —
  follow their instruction, connect to it, and generate the narration there. Never
  pick a voice for them without saying which one you used.

### 3. Produce the voiceover and the transcript

Write the script first (step 4), because the narration is read from it.

Then produce the audio, then the timings:

```bash
# ElevenLabs key exported in the shell, or an MCP voice tool, or any TTS they name
node scripts/transcribe.cjs vo.mp3          # -> story/beatwords.json
```

`transcribe.cjs` uses ElevenLabs Scribe if `ELEVENLABS_API_KEY` is set and a local
`whisper` otherwise. If neither is available, tell the user which one to install —
do not hand-write timings and pretend they are measured.

**Never invent word timings.** Every time in the piece comes from this file.
Fabricated timings produce a video that looks broken and is hard to diagnose.

### 4. Write the script, and stop for approval

Write the narration as plain spoken sentences — 25 to 40 seconds of speech is the
usual length, and one idea per sentence. Show it to the user exactly as it will be
read, numbered by beat:

```
1. Two numbers. Both true. Both from the same government, in the same year.
2. Number one: May 2026.
3. Pakistan's Central Bank reports the largest remittance month in history.
```

**Wait for approval before generating audio or building.** Say what you intend to
put on screen for each beat at the same time, so they approve the picture too:

> 1 — "TWO NUMBERS." underlined twice, then "both true." underneath
> 2 — circled numeral 1, "NUMBER ONE", "MAY 2026"
> 3 — State Bank glyph, a bar chart where the last bar is tallest

If they want changes, revise the script and ask again. Do not start rendering on an
unapproved script — a re-record invalidates every anchor in the piece.

### 5. Build, then deliver

Once the script and the beats are approved, build without further questions:

```bash
npm run doctor      # once per machine — chrome, ffmpeg, fonts
npm run check       # fails on a real sync defect
npm run render
npm run mux         # -> out.mp4
```

Deliver the file path, its duration, and the check output. If a gate fails, fix the
story — never silence the gate.

### 6. What "done" means

A single MP4, 16:9, around 30 seconds (longer is fine if the material wants it), with
the narration mixed over synthesised marker sounds, at roughly −15 LUFS, plus a
one-line note of what changed if you had to cut something to make the sync work.

---

## Part 2 — How the medium works

## The one idea that makes it work

**The voiceover is the master clock, and the transcript is the timeline.**

There is no animation timeline in the usual sense. Every stroke, caption, chart rule
and sound is placed by looking up a word in the transcript and reading its time:

```js
const A = {
  remittance: at('remittance', 10.82),
  month:      at('month', 11.30),
};
txt('remittance month in history', 1800, 532, 42, 'label', 'ink', A.month, A.history + 0.3);
```

Record a new take and the whole piece re-times itself, correctly, in one pass.
That is the entire reason this medium looks expensive and costs nothing.

### The two rules, both learned by shipping the defect

**1. A mark may LEAD its word by up to 0.2 s. It must NEVER LAG it.**

Audio ahead of picture reads as a broken player; the viewer's brain does not file it
under style. Early is invisible, late is fatal. If your strokes do not fit their
words at hand speed, **remove content** — never let the pen run past its sentence.

This rule has a corollary that is easy to get wrong: pacing that *feels* calmer is
not a win if the calm comes from strokes outliving their words. A build that was
beautifully smooth and up to 2.5 s behind its narration was rejected on sight.

**2. Sound is scheduled from the same times the picture uses.**

Not from a parallel list. In `story.js` the sound function reads the same `A` table:

```js
write('MAY 2026', A.may, A.y2026 + 0.22, 0.95);
```

Two independent time lists drift, and nothing in either one will show you where.
Gate 6 measures this, and it has already caught a real 1.9 s drift.

## The architecture, and why it is split this way

| File | Is | You touch it |
|---|---|---|
| `src/medium.js` | Ink, board, lighting, ghost of the last erased lesson, camera math, the marker-in-hand | **never** |
| `src/sound.js` | Synthesiser: named sounds, beds, offline render, live playback | rarely |
| `src/harness.js` | Seeded noise, easing, render loop, fonts | never |
| `story/story.js` | Your topic: anchors, camera, marks, sound score | **this is the only file you write** |
| `story/beatwords.json` | The transcript: `[{t, e, w}, ...]` | regenerate per take |

`medium.js` knows how ink behaves. It knows nothing about your topic. The coupling
between them is five lines at the bottom of `story.js`:

```js
function frame(ctx, W, H, t) { WB.frame(ctx, W, H, t, { cam: CAM, story }); }
```

### Determinism is not a nicety

Every drawing call is a pure function of `t`; all randomness comes from
`H.rng(seed)` / `H.makeNoise(seed)`, never `Math.random()`. This is what lets the
renderer ask the browser for frame 412 and get the same pixels as anyone else would.
If you introduce `Math.random()` anywhere in the drawing path, the render becomes
non-reproducible and the checks stop meaning anything.

Measured, so you know how far to trust it: the **video is bit-identical** between
runs (md5 `d769b076f3d8604b65785aeef14be83d` on the reference build). The
**effects WAV is not quite** — about 14 samples per render of 2.88 M differ by one
LSB, which is float accumulation in the Web Audio graph at −84.8 dBFS relative to
peak. Inaudible, and it does not compound; but say "the picture is deterministic"
and not "the file is", because the audio is only deterministic to one least
significant bit.

## What it looks like on a board

The medium's real vocabulary, straight from the reference build:

- **One continuous surface.** Zones are placed wide apart (1506 × 847 world units
  visible at k=0.85) and the camera travels between them in the *pauses*.
- **A circled numeral first** in each zone, so the glass has ink the instant the
  pan lands.
- **The next zone is already written up** before the camera goes there. A bare
  board on arrival is a white flash.
- **Travel ink.** The camera crosses board nothing is written on, so each travel
  gets a double-traced connector arrow drawn on the same clock as the pan.
- **Charts cascade.** A bar chart is 20 rules landing over ~3 s; that is one gesture,
  and it is supposed to overlap in time.
- **Rules under writing.** A rule following its caption by 0.4 s is correct.
- **A tally's numbers count up** on the 12 fps grid so it reads as scrawl, not slide.

## The build, step by step

Part 1 is the conversation. This is what you actually type once the script is
approved. Work on macOS, Windows and Linux — every script finds Chrome and ffmpeg
itself.

### 0. Prerequisites

```bash
npm install
node scripts/doctor.cjs      # reports node, chrome, ffmpeg, and the two fonts
```

`doctor.cjs` is the fastest way to find out a machine cannot render before you spend
time writing a story on it. Fix whatever it flags:

| Missing | Install |
|---|---|
| Chrome | Google Chrome, or any Chromium/Edge — set `CHROME_PATH` |
| ffmpeg | `brew install ffmpeg` · `winget install Gyan.FFmpeg` · `apt install ffmpeg` |
| Fonts | open `index.html` once with a network connection so Chrome caches them |

### 1. Get the transcript

`story/beatwords.json` is `[{ "t": 0.16, "e": 0.28, "w": "Two" }, ...]` — start,
end, word. `scripts/transcribe.cjs` produces it from your audio. Any word-level
timestamping produces the same shape; the vendor is not the contract, the shape is.

### 2. Write the anchors, then the beats

Anchors fail loud. A mistyped word throws at load instead of landing a mark in
silence. Repeats are handled by occurrence index:

```js
numberOne: at('Number', 5.52),        // first "Number"
numberTwo: at('Number', 17.26, 1),    // second "Number"
```

Then one `A` row per idea. **Every time used anywhere in the file comes from here.**

### 3. Place the camera in the pauses

```js
const CAM = [
  [0,     ZA[0], ZA[1], 0.86],   // hold on the hook
  [4.98,  ZA[0], ZA[1], 0.88],   // pause begins
  [5.16,  1520,  470,   0.72],   // dolly out, both lessons in frame
  [5.34,  ZB[0], ZB[1], 0.85],   // arrive before the next sentence
];
```

Position interpolates linearly, zoom **geometrically** (`exp(log a + u(log b − log a))`).
That is what a real dolly does, and linearly interpolating zoom looks like a zoom
in a 1990s presentation.

### 4. Write the marks, then the sound, from the same table

```js
txt('MAY 2026', 1800, 342, 78, 'title', 'ink', A.may, A.y2026 + 0.22, -0.01);
ln([[1794, 366], [2290, 360]], 'acc1', 6, 7.00, 7.42);
```

### 5. Gate it, then render it

```bash
npm run check     # eight measurements, exits 1 on a real defect
npm run render    # build_video.mp4 + build_fx.wav
npm run mux       # node scripts/mux.cjs vo.mp3 out.mp4
```

## The eight gates, and what each one is really protecting

`scripts/check.cjs` measures the picture and the timeline, because both fail in ways
you cannot see while you are writing them.

| # | Gate | The defect it catches |
|---|---|---|
| 1 | transcript loaded | every mark is timed to a guess |
| 2 | anchors resolved | one mistyped word, one mark in silence |
| 3 | nothing is late | **lettering** trailing its own word |
| 4 | hand speed | text written faster than a human reads |
| 5 | one pen | two sets of letters drawn on top of each other |
| 6 | sound on the picture clock | a sound cue with no mark behind it |
| 7 | board never blank | a camera move over empty board = white flash |
| 8 | picture never freezes | a long still stretch reads as a stall |

Three of these are subtler than they look, and getting them wrong makes the checker
lie in the comfortable direction:

**Gate 3 gates lettering, not rules.** A chart's rules legitimately trail their
word — they belong to a gesture that spans several words. Only letters are read
against the voice. On the reference build, lettering's worst lag is +0.18 s (pass)
while rules' worst is +0.44 s (correct picture, not gated).

**Gate 5 measures geometry, not timestamps.** Counting marks that overlap in *time*
fires on every bar chart — six rules, one pen — and misses the actual defect. The
medium has exactly one pen by construction (`TIP` in `medium.js` is a single global).
The defect a viewer sees is letters over letters, so the gate measures real glyph
boxes, taken from the page's own canvas with the page's own fonts:

```js
ctx.font = `${FW[m.font]} ${m.size}px ${FONT[m.font]}`;
const wpx = ctx.measureText(m.text).width;
```

Do not estimate glyph widths. A 0.55 em guess reported a collision between "$4.25"
and "BILLION" that does not exist in the rendered frame — they are stacked on
separate baselines and the picture is correct.

**Gate 6 is rule 2 made falsifiable.** "Sound is scheduled from the same times the
picture uses" is prose until something checks it. `story.js` replays the score
against a recording kit and hands the gate every time a cue fires; each must land
inside a mark's own window. This gate found a real defect in the reference piece:
zone C's furniture is drawn early *on purpose* so the board is populated when the
camera lands, but the score was playing those strokes on the word times ~1.9 s
later — about 1.5 s of pen scratch over a board that had stopped moving. Fixing it
moved +1.5 dB of stroke energy into the picture's window and removed −8.8 dB from
where it did not belong.

Sounds that legitimately have no mark behind them — the cap going back on at the
end — must be declared with `coda(t)`, or the gate will (correctly) flag them.

`story.js` supplies the boxes and the cue list. It also derives each mark's own word
time as the **nearest** beat to its start, deliberately not "the latest beat that
had begun" — that phrasing is true of every mark by construction and would make the
gate unfalsifiable.

**The limit of gate 3, stated plainly.** It measures distance to the nearest word,
not intent. A caption moved onto a *different* word passes. It catches the defect
that ships — strokes trailing their sentence into silence — not a mis-anchored one.
Retime through the `A` table so intent and time cannot separate.

## Sound

Fully synthesised — no sample files. `SOUND.renderOffline(fn, duration, 48000,
{voiceover: true})` returns interleaved stereo floats for the WAV;
`SOUND.live(fn, fromT, {voiceover: true})` plays it in the browser and returns
`stop()` for scrubbing.

Voiceover mode **drops beds and music entirely** and plays anything marked
`minor: true` at 0.6×. That is the intended state: the marker should be audible
enough to sell the hand, and nothing else should compete with the narration.

Scheduling idioms that matter:

```js
// one stroke per word, on the same character-position mapping the text uses
const write = (s, a, b, gain = 0.9, pan = 0) => { ... };

// a felt tip touching down, then the stroke itself
const mk = (a, b, gain, pan, material = 'marker', minor = true) => { ... };

// stereo follows the zone on screen, so the sound is where the eye is
const panic = (x) => H.clamp((x - 640) / 3200, -1, 1) * 0.6;
```

## Mux, and two numbers you should not "fix"

`scripts/mux.cjs` carries the whole graph and a comment on each stage. Two values
look wrong and are not:

- **`TP=-2.2` in the final loudnorm**, not −1.5. AAC adds ~1 dB of inter-sample
  overshoot on percussive material; targeting −1.5 pre-encode delivers a file at
  about −0.7 dBTP, i.e. clipping. −2.2 lands the delivered file at −2.1 dBTP.
- **`aresample=48000` written out.** loudnorm runs internally at 192 kHz and leaks
  a 96 kHz stream into the AAC otherwise.

The reference build delivers −15.9 LUFS integrated, −2.1 dBTP. Platforms lift
−15.9 to their −14 target; anything hotter gets turned back down.

## Common failures

| Symptom | Cause |
|---|---|
| `PLAYER_READY` never appears | a symbol is undefined in `story.js`; the boot IIFE aborted. Check the page console |
| every mark lands in the wrong place | `beatwords.json` is from a different take than the audio |
| board flashes white mid-pan | nothing is written on the stretch the camera crosses — add travel ink |
| the piece feels late but nothing is "wrong" | lettering may be fine while a long stroke runs past its word; look at gate 3's reported worst |
| `Cannot find module 'puppeteer-core'` | `npm install` in the repo root |
| `Could not find Chrome or Chromium` | run `npm run doctor`; install Chrome or set `CHROME_PATH` |
| `Could not find ffmpeg` | install it, or set `FFMPEG_PATH` / `FFPROBE_PATH` |
| text in a fallback cursive face | Google Fonts did not load — open `index.html` once online |
| check gate 5 fires on a bar chart | you are running an old checker that counts time overlap; measure boxes instead |

## What is deliberately not here

No lip-sync, no camera footage, no music bed, no multi-scene editing. One board,
one take, one voice. The restraint is the format — the moment the piece needs a
second medium, it stops being a whiteboard explainer and becomes something else,
and this method stops being the right tool.