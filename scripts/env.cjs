// env.cjs — find the tools this project needs, on any platform.
//
// Windows, macOS and Linux all ship with none of: Chrome at a predictable path,
// ffmpeg on PATH under the same name, or a shell you can assume. This module is
// the one place that knows any of that, so render/check/mux stay portable.
//
// Overrides, in order of precedence:
//   CHROME_PATH   absolute path to a Chrome or Chromium binary
//   FFMPEG_PATH   absolute path to ffmpeg
//   FFPROBE_PATH  absolute path to ffprobe
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

// ---- Chrome --------------------------------------------------------------
// Every candidate that ships a headless-capable browser, in the order a user is
// most likely to have it. Edge is last rather than absent: it is Chromium, it is
// installed on every Windows machine, and its canvas is close enough that a
// render made with it looks like the preview.
function chromeCandidates() {
  if (isMac) {
    const home = os.homedir();
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  if (isWin) {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] || '';
    // Windows paths are joined with the win32 rules explicitly: this module is
    // also run on macOS/Linux while testing, where `path` is the POSIX one and
    // would produce "C:\Program Files/Google\..." with mixed separators.
    const w = (...p) => path.win32.join(...p);
    return [
      w(pf, 'Google/Chrome/Application/chrome.exe'),
      w(pf86, 'Google/Chrome/Application/chrome.exe'),
      local && w(local, 'Google/Chrome/Application/chrome.exe'),
      w(pf, 'Microsoft/Edge/Application/msedge.exe'),
      w(pf86, 'Microsoft/Edge/Application/msedge.exe'),
    ].filter(Boolean);
  }
  // Linux and everything else: ask PATH, then look in the usual places.
  const onPath = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome']
    .map((n) => which(n)).filter(Boolean);
  return [
    ...onPath,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/opt/google/chrome/chrome',
  ];
}

function which(cmd) {
  const probe = isWin ? 'where' : 'which';
  const r = spawnSync(probe, [cmd], { encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  const first = r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
  return first || null;
}

function findChrome() {
  if (process.env.CHROME_PATH) {
    if (!fs.existsSync(process.env.CHROME_PATH)) {
      throw new Error(`CHROME_PATH is set to "${process.env.CHROME_PATH}" but that file does not exist.`);
    }
    return process.env.CHROME_PATH;
  }
  for (const c of chromeCandidates()) {
    if (c && fs.existsSync(c)) return c;
  }
  throw new Error(
    'Could not find Chrome or Chromium.\n'
    + 'Install Google Chrome, or point this project at any Chromium build:\n\n'
    + (isWin
      ? '  set CHROME_PATH=C:\\Path\\To\\chrome.exe\n'
      : '  export CHROME_PATH="/path/to/chrome"\n')
    + '\nTried:\n  ' + chromeCandidates().filter(Boolean).join('\n  '));
}

// ---- ffmpeg --------------------------------------------------------------
function findTool(envVar, name) {
  if (process.env[envVar]) {
    if (!fs.existsSync(process.env[envVar])) {
      throw new Error(`${envVar} is set to "${process.env[envVar]}" but that file does not exist.`);
    }
    return process.env[envVar];
  }
  const found = which(name);
  if (found) return found;
  // A plain name is fine if the tool is on PATH in a way `which` cannot see
  // (some Windows shells); let the spawn fail with ffmpeg's own error instead.
  const probe = spawnSync(name, ['-version'], { encoding: 'utf8' });
  if (probe.status === 0) return name;
  throw new Error(
    `Could not find ${name}.\n`
    + 'Install it and make sure it is on your PATH:\n\n'
    + '  macOS          brew install ffmpeg\n'
    + '  Windows        winget install Gyan.FFmpeg\n'
    + '  Debian/Ubuntu  sudo apt install ffmpeg\n'
    + '  Fedora         sudo dnf install ffmpeg\n\n'
    + (isWin ? `  or: set ${envVar}=C:\\Path\\To\\${name}.exe\n`
      : `  or: export ${envVar}=/path/to/${name}\n`));
}

module.exports = {
  isWin,
  isMac,
  findChrome,
  findFfmpeg: () => findTool('FFMPEG_PATH', 'ffmpeg'),
  findFfprobe: () => findTool('FFPROBE_PATH', 'ffprobe'),
  root: path.join(__dirname, '..'),
  // 'file://' + path is wrong twice: it breaks on Windows drive letters (C:\...)
  // and on any folder with a space in it. pathToFileURL gets both right.
  fileUrl: (p) => require('url').pathToFileURL(p).href,
};