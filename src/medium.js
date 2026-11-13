// ---------------------------------------------------------------------------
// medium.js — the DRY-ERASE WHITEBOARD medium.
//
// One marker on one glossy board, shot by a camera that travels across it.
// This file is the *medium*. It knows how ink behaves, how the board is lit,
// how the ghost of the last erased lesson survives a wipe, and how the piece is
// framed. It knows nothing about your topic.
//
// Your topic lives in story.js, which supplies three things:
//   cam       keys [[t, cx, cy, k], ...] — camera centre and zoom over time
//   story     story(t) -> [{k:'text'|'line'|'live', ..., a, b}] — marks on the VO clock
//   scoreSound(k) — marker sounds scheduled against those same times
//
// Determinism: every drawing call is a pure function of t. All randomness comes
// from seeds, never Math.random, so frame 412 is identical on any machine and on
// any run. That is what makes frame-stepped rendering possible at all.
// ---------------------------------------------------------------------------
(function () {
  'use strict';

  const W = 1280, Hh = 720;   // logical frame; the canvas may be any pixel size

  // ============ marker kit (verbatim from anim2.txt) =========================
  const seg = (pts, step = 2.5) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let j = 0; j < n; j++) out.push([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  };
  const normals = (P) => P.map((p, i) => {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    return [-dy / d, dx / d];
  });
  const wobble = (pts, nz, seed, amp = 1.6, freq = 0.011) => {
    const N = normals(pts); let L = 0;
    return pts.map((p, i) => {
      if (i) L += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const o = nz.n2(L * freq + seed * 1.37, seed * 0.71) * amp + nz.n2(L * freq * 6 + seed, seed + 3.3) * amp * 0.25;
      return [p[0] + N[i][0] * o, p[1] + N[i][1] * o];
    });
  };
  const ell = (cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2, grow = 0) => {
    const n = Math.max(10, Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) / 2.5)), out = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = a0 + (a1 - a0) * u, g = 1 + grow * u;
      out.push([cx + Math.cos(a) * rx * g, cy + Math.sin(a) * ry * g]);
    }
    return out;
  };
  const bez = (p0, p1, p2, p3) => {
    const out = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, m = 1 - t;
      out.push([m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0],
        m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1]]);
    }
    return out;
  };
  const tracePath = (ctx, P) => { ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };

  const BOARD = [236, 240, 239];
  const MN = H.makeNoise(4242);
  let TIP = null; // world-space marker tip while something is drawing

  const marker = (ctx, pts, col, w, seed, prog = 1) => {
    if (prog <= 0) return;
    if (prog < 1) { const q = pts[Math.max(1, Math.ceil(pts.length * prog)) - 1]; TIP = [q[0], q[1], col]; }
    const P = prog < 1 ? pts.slice(0, Math.max(2, Math.ceil(pts.length * prog))) : pts;
    const r = H.rng(seed), rgb = H.hex(col), N = normals(P);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = H.rgba(rgb, 0.3); ctx.lineWidth = w; tracePath(ctx, P); ctx.stroke();
    ctx.lineCap = 'butt';
    const CH = 10;
    for (let i = 0; i < P.length - 1; i += CH) {
      const a = 0.16 + 0.22 * (0.5 + 0.5 * MN.n2(i * 0.03 + seed * 3.1, seed * 0.37));
      ctx.strokeStyle = H.rgba(rgb, a); ctx.lineWidth = w * 0.96;
      ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]);
      for (let j = i + 1; j <= Math.min(P.length - 1, i + CH); j++) ctx.lineTo(P[j][0], P[j][1]);
      ctx.stroke();
    }
    const n = 7;
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1) - 0.5, edge = Math.abs(u) * 2;
      const a = (0.08 + 0.5 * Math.pow(edge, 2.2)) * (0.65 + r() * 0.7);
      ctx.strokeStyle = H.rgba(rgb, a); ctx.lineWidth = (w / n) * 1.5;
      const off = u * w * 0.84;
      ctx.beginPath();
      P.forEach((p, i) => { const x = p[0] + N[i][0] * off, y = p[1] + N[i][1] * off; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    for (let k = 0; k < 4; k++) {
      const off = (r() - 0.5) * w * 0.6;
      ctx.strokeStyle = H.rgba(BOARD, 0.14 + r() * 0.2); ctx.lineWidth = 0.6 + r() * 0.6;
      const s = Math.floor(r() * P.length * 0.4), e = Math.min(P.length, s + Math.floor(P.length * (0.3 + r() * 0.6)));
      ctx.beginPath();
      for (let i = s; i < e; i++) { const x = P[i][0] + N[i][0] * off, y = P[i][1] + N[i][1] * off; i > s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    [P[0], prog >= 1 ? P[P.length - 1] : null].forEach((p, j) => {
      if (!p) return;
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], w * 0.62);
      g.addColorStop(0, H.rgba(rgb, j ? 0.25 : 0.42)); g.addColorStop(1, H.rgba(rgb, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], w * 0.62, 0, 7); ctx.fill();
    });
    ctx.restore();
  };

  const mText = (ctx, str, x, y, font, col, seed, prog = 1, rot = 0) => {
    if (prog <= 0) return;
    const r = H.rng(seed), rgb = H.hex(col);
    ctx.save(); ctx.font = font; ctx.textBaseline = 'alphabetic';
    ctx.translate(x, y); ctx.rotate(rot);
    const nChars = Math.ceil(str.length * prog);
    if (prog < 1) {
      const wsofar = ctx.measureText(str.slice(0, nChars)).width;
      TIP = [x + Math.cos(rot) * wsofar, y + Math.sin(rot) * wsofar - 10, col];
    }
    let cx = 0;
    for (let i = 0; i < nChars; i++) {
      const ch = str[i], wch = ctx.measureText(ch).width;
      ctx.save(); ctx.translate(cx + wch / 2, (r() - 0.5) * 3); ctx.rotate((r() - 0.5) * 0.07);
      ctx.fillStyle = H.rgba(rgb, 0.8 + r() * 0.1); ctx.fillText(ch, -wch / 2, 0);
      ctx.strokeStyle = H.rgba(rgb, 0.7); ctx.lineWidth = 1.3; ctx.strokeText(ch, -wch / 2, 0);
      ctx.restore();
      cx += wch + (r() - 0.5) * 1.5;
    }
    ctx.restore();
  };

  // ============ board geometry ===============================================
  // The glass sits inset from an aluminium frame; the tray and pens live below.
  const BX0 = 26, BY0 = 26, BX1 = W - 26, BY1 = 650;

  // ============ palette, type, camera =======================================
  const COLS = { ink: '#1d1f26', acc1: '#1f4fc2', acc2: '#d4262f', acc3: '#16884a' };
  const FONT = { title: '"Permanent Marker"', label: '"Kalam"', num: '"Permanent Marker"' };
  const FW = { title: 400, label: 700, num: 400 };

  const win = (t, a, b) => H.clamp((t - a) / Math.max(1e-6, b - a));
  const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  // Camera keys -> {cx, cy, k}. Position interpolates linearly, zoom interpolates
  // geometrically (exp of the log): a real dolly covers equal ratios in equal
  // time, so doubling and halving the distance take the same duration each way.
  const camAt = (keys, t) => {
    if (t <= keys[0][0]) return keys[0].slice(1);
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t <= b[0]) {
        const u = eio((t - a[0]) / Math.max(1e-6, b[0] - a[0]));
        return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u, Math.exp(Math.log(a[3]) + (Math.log(b[3]) - Math.log(a[3])) * u)];
      }
    }
    return keys[keys.length - 1].slice(1);
  };

  // ============ ghost of the last erased lesson =============================
  const XC = {};
  function ghostBoard() {
    if (XC.ghost) return XC.ghost;
    const x0 = -260, y0 = -160, w = 4400, h = 1080, s = 0.5;
    const nz = H.makeNoise(23);
    const g = H.layer(w * s, h * s), gc = g.getContext('2d');
    gc.scale(s, s); gc.translate(-x0, -y0);
    gc.strokeStyle = '#30343c'; gc.fillStyle = '#30343c'; gc.lineCap = 'round'; gc.lineJoin = 'round'; gc.lineWidth = 7;
    const wl = (pts, sd, amp = 1.8) => { tracePath(gc, wobble(seg(pts), nz, sd, amp)); gc.stroke(); };
    // Deliberately non-factual residue: this is set dressing (what was rubbed off
    // the board before this lesson), not a claim about hawala.
    gc.font = '400 52px "Permanent Marker"'; gc.fillText('STEP 1', 250, 150);
    gc.font = '700 34px "Kalam"';
    ['- add up', '- cross off', '- ?'].forEach((t2, i) => gc.fillText(t2, 268, 214 + i * 44));
    wl([[248, 172], [400, 168], [520, 165]], 1);
    gc.beginPath(); gc.arc(300, 640, 66, 0, 7); gc.stroke();
    gc.beginPath(); gc.moveTo(300, 640); gc.lineTo(300, 574); gc.moveTo(300, 640); gc.lineTo(356, 674); gc.stroke();
    wl([[400, 700], [470, 650], [540, 682], [640, 600]], 2);
    gc.font = '700 30px "Kalam"'; gc.fillText('per month', 430, 736);
    gc.font = '400 40px "Permanent Marker"'; gc.fillText('x = a + b', 1720, 660);
    wl([[1712, 682], [1850, 678], [1960, 684]], 3, 1.4);
    gc.beginPath(); gc.rect(3050, 210, 140, 74); gc.stroke();
    gc.font = '700 30px "Kalam"'; gc.fillText('step 2', 3072, 258);
    wl([[2990, 248], [3042, 248]], 4, 0.8);
    gc.font = '400 44px "Permanent Marker"'; gc.fillText('TOTAL ?', 3260, 560);
    // eraser-wipe mask: the residue survives only in streaky swipe bands
    const m = H.layer(w * s, h * s), mc = m.getContext('2d'), rm = H.rng(77);
    mc.scale(s, s); mc.translate(-x0, -y0); mc.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const y = rm.range(0, 980), x = rm.range(-200, 4100), len = rm.range(150, 420);
      mc.strokeStyle = `rgba(0,0,0,${rm.range(0.15, 0.8)})`; mc.lineWidth = rm.range(4, 26);
      mc.beginPath(); mc.moveTo(x, y); mc.quadraticCurveTo(x + len / 2, y + rm.range(-30, 30), x + len, y + rm.range(-18, 18)); mc.stroke();
    }
    gc.setTransform(1, 0, 0, 1, 0, 0); gc.globalCompositeOperation = 'destination-in'; gc.drawImage(m, 0, 0);
    const cv = H.layer(w * s, h * s), c = cv.getContext('2d');
    c.filter = 'blur(0.5px)'; c.globalAlpha = 0.12; c.drawImage(g, 0, 0); c.globalAlpha = 1;
    const rh = H.rng(78);
    c.scale(s, s); c.translate(-x0, -y0); c.lineCap = 'round'; c.filter = 'blur(3px)';
    [[380, 190, 220, 80], [430, 660, 210, 90], [1800, 650, 160, 30], [3110, 246, 90, 40], [3320, 545, 200, 30]].forEach(([cx, cy, rx, ry]) => {
      for (let i = 0; i < 4; i++) {
        const x = cx + rh.range(-rx, rx) * 0.6, y = cy + rh.range(-ry, ry);
        c.strokeStyle = `rgba(120,128,135,${rh.range(0.014, 0.03)})`; c.lineWidth = rh.range(30, 60);
        c.beginPath(); c.moveTo(x - 120, y); c.quadraticCurveTo(x, y + rh.range(-25, 25), x + 120, y + rh.range(-10, 10)); c.stroke();
      }
    });
    const out = { cv, x0, y0, w, h };
    let ready = true;
    try { ready = document.fonts.check('400 52px "Permanent Marker"') && document.fonts.check('700 34px "Kalam"'); } catch (e) { /* assume ready */ }
    if (ready) XC.ghost = out;
    return out;
  }
  // ============ the frame ===================================================
  function frame(ctx, W, H_, t, S) {
    const nz = H.makeNoise(11);
    const BX0 = 26, BY0 = 26, BX1 = W - 26, BY1 = 650;

    // ---------- board surface ----------
    const bg = ctx.createLinearGradient(0, 0, W, H_);
    bg.addColorStop(0, '#f6f8f7'); bg.addColorStop(0.55, '#ecefee'); bg.addColorStop(1, '#dfe4e3');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H_);

    const cam = camAt(S.cam, t);
    window.__cam = cam;
    const apply = (c) => { c.translate(W / 2, H_ / 2); c.scale(cam[2], cam[2]); c.translate(-cam[0], -cam[1]); };
    const toS = (p) => [(p[0] - cam[0]) * cam[2] + W / 2, (p[1] - cam[1]) * cam[2] + H_ / 2];

    ctx.save(); apply(ctx);
    { // faint residue blotches fixed to the board
      const rb = H.rng(5);
      for (let i = 0; i < 46; i++) {
        const x = rb.range(-200, 4400), y = rb.range(-200, 1100), rr = rb.range(80, 260);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(150,160,165,${rb.range(0.02, 0.045)})`); g.addColorStop(1, 'rgba(150,160,165,0)');
        ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
    }
    { const G = ghostBoard(); ctx.drawImage(G.cv, G.x0, G.y0, G.w, G.h); }
    ctx.restore();

    // ---------- the live diagram ----------
    const items = S.story(t);
    const measure = (it, p) => {
      ctx.save(); ctx.font = `${FW[it.font]} ${it.size}px ${FONT[it.font]}`;
      const w = ctx.measureText(it.s).width, x0 = it.x;
      const w2 = ctx.measureText(it.s.slice(0, Math.ceil(it.s.length * p))).width; ctx.restore();
      return [x0 + w2, it.y - it.size * 0.35];
    };
    const drawItem = (c, it, tt) => {
      const p = it.fn ? win(tt, it.a, it.b) : win(t, it.a, it.b);
      if (p <= 0) return;
      const col = COLS[it.role];
      if (it.k === 'line') {
        const seed = ((it.pts[0][0] * 13 + it.pts[0][1] * 7) | 0) + 17;
        const P = wobble(seg(it.pts, 2.5), nz, seed % 97, 1.4);
        marker(c, P, col, it.w * 1.25, seed, p);
      } else if (it.k === 'dot') {
        c.fillStyle = H.rgba(col, 0.85); c.beginPath(); c.arc(it.x, it.y, it.r, 0, 7); c.fill();
      } else {
        const s = it.fn ? it.fn(tt) : it.s;
        const font = `${FW[it.font]} ${it.size}px ${FONT[it.font]}`;
        mText(c, s, it.x, it.y, font, col, (s.length * 31 + (it.y | 0)) % 991, it.fn ? 1 : p, it.rot);
      }
    };

    TIP = null;
    ctx.save(); apply(ctx);
    for (const it of items) drawItem(ctx, it, t);
    ctx.restore();

    // ---------- gloss ----------
    const sh = ctx.createLinearGradient(220 - cam[0] * 0.15, -60, 760 - cam[0] * 0.15, 760);
    sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); sh.addColorStop(0.46, 'rgba(255,255,255,0.22)');
    sh.addColorStop(0.5, 'rgba(255,255,255,0.1)'); sh.addColorStop(0.53, 'rgba(255,255,255,0.24)'); sh.addColorStop(0.6, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H_);
    {
      const off = -(cam[0] - 640) * 0.15;
      for (let i = 0; i < 6; i++) {
        const x = 380 + i * 550 + off, rx = i % 2 ? 230 : 260, ry = i % 2 ? 22 : 26, y = i % 2 ? 66 : 70;
        if (x + rx < 0 || x - rx > W) continue;
        ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 7); ctx.fill(); ctx.restore();
      }
      const fo = ctx.createLinearGradient(0, H_ - 240, 0, H_);
      fo.addColorStop(0, 'rgba(60,70,80,0)'); fo.addColorStop(1, 'rgba(60,70,80,0.08)');
      ctx.fillStyle = fo; ctx.fillRect(0, H_ - 240, W, 240);
    }

    // ---------- the marker in hand while drawing ----------
    if (TIP) {
      const [tx, ty] = toS(TIP);
      let col = TIP[2];
      const ang = 0.95, len = 230;
      ctx.save();
      ctx.save(); ctx.filter = 'blur(8px)'; ctx.fillStyle = 'rgba(40,50,60,0.25)';
      ctx.translate(tx + 14, ty + 18); ctx.rotate(ang); ctx.beginPath(); ctx.roundRect(8, -14, len, 28, 12); ctx.fill(); ctx.restore();
      ctx.translate(tx, ty); ctx.rotate(ang);
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-2, -3); ctx.lineTo(16, -6); ctx.lineTo(16, 6); ctx.lineTo(-2, 2); ctx.closePath(); ctx.fill();
      const g = ctx.createLinearGradient(0, -14, 0, 14);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#e4e6e8'); g.addColorStop(1, '#9ea3a8');
      ctx.fillStyle = '#c9ccd0'; ctx.beginPath(); ctx.roundRect(14, -9, 20, 18, 4); ctx.fill();
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(32, -14, len - 32, 28, 10); ctx.fill();
      ctx.fillStyle = col; ctx.fillRect(len - 52, -14, 40, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(40, -9, len - 100, 4);
      ctx.fillStyle = H.rgba(col, 0.85); ctx.fillRect(70, -2, 60, 5);
      ctx.restore();
    }

    // ---------- aluminium frame + tray ----------
    ctx.save();
    const inner = (x, y, w, h, dir) => {
      const g = dir === 'v' ? ctx.createLinearGradient(x, y, x, y + h) : ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, 'rgba(40,45,55,0.16)'); g.addColorStop(1, 'rgba(40,45,55,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    };
    inner(BX0, BY0, BX1 - BX0, 10, 'v'); inner(BX0, BY0, 8, BY1 - BY0, 'h');
    const metal = (g) => {
      g.addColorStop(0, '#f4f5f6'); g.addColorStop(0.35, '#c6cace'); g.addColorStop(0.55, '#e7e9eb'); g.addColorStop(0.8, '#a3a8ae'); g.addColorStop(1, '#7c8187');
      return g;
    };
    ctx.fillStyle = metal(ctx.createLinearGradient(0, 0, 0, BY0)); ctx.fillRect(0, 0, W, BY0);
    ctx.fillStyle = metal(ctx.createLinearGradient(0, 0, BX0, 0)); ctx.fillRect(0, 0, BX0, BY1);
    ctx.fillStyle = metal(ctx.createLinearGradient(W, 0, BX1, 0)); ctx.fillRect(BX1, 0, W - BX1, BY1);
    ctx.strokeStyle = 'rgba(70,75,82,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(BX0 - 0.5, BY0 - 0.5, BX1 - BX0 + 1, BY1 - BY0 + 1);
    [[0, 1], [W, -1]].forEach(([x, sx]) => {
      ctx.save(); ctx.translate(x, 0); ctx.scale(sx, 1);
      const g = ctx.createLinearGradient(0, 0, 40, 40); g.addColorStop(0, '#6b6f75'); g.addColorStop(1, '#3d4045');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(42, 0); ctx.lineTo(42, 14); ctx.quadraticCurveTo(42, 42, 14, 42); ctx.lineTo(0, 42); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
    const tg = ctx.createLinearGradient(0, BY1, 0, 694);
    tg.addColorStop(0, '#6f747b'); tg.addColorStop(0.4, '#9ca1a7'); tg.addColorStop(1, '#c3c7cb');
    ctx.fillStyle = tg; ctx.fillRect(0, BY1, W, 694 - BY1);
    const mk = (x, len, body, cap, rot) => {
      ctx.save(); ctx.translate(x, 674); ctx.rotate(rot);
      const shg = ctx.createRadialGradient(len / 2, 12, 2, len / 2, 12, len / 2);
      shg.addColorStop(0, 'rgba(0,0,0,0.35)'); shg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shg; ctx.fillRect(-10, 0, len + 20, 22);
      const bg2 = ctx.createLinearGradient(0, -11, 0, 11);
      bg2.addColorStop(0, H.rgba(H.mix(body, '#ffffff', 0.35))); bg2.addColorStop(0.35, body); bg2.addColorStop(1, H.rgba(H.mix(body, '#000000', 0.5)));
      ctx.fillStyle = bg2; ctx.beginPath(); ctx.roundRect(0, -11, len * 0.72, 22, 8); ctx.fill();
      const cg = ctx.createLinearGradient(0, -12, 0, 12);
      cg.addColorStop(0, H.rgba(H.mix(cap, '#ffffff', 0.4))); cg.addColorStop(0.35, cap); cg.addColorStop(1, H.rgba(H.mix(cap, '#000000', 0.5)));
      ctx.fillStyle = cg; ctx.beginPath(); ctx.roundRect(len * 0.7, -12, len * 0.3, 24, 9); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillRect(len * 0.18, -5, len * 0.3, 7);
      ctx.fillStyle = cap; ctx.fillRect(len * 0.21, -3, len * 0.12, 3);
      ctx.restore();
    };
    mk(860, 150, '#e9eaec', '#1f4fc2', -0.02);
    mk(1040, 150, '#e9eaec', '#d4262f', 0.015);
    ctx.save(); ctx.translate(180, 668);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(4, 10, 150, 18);
    const eg = ctx.createLinearGradient(0, -14, 0, 14); eg.addColorStop(0, '#5b6470'); eg.addColorStop(1, '#2c323a');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.roundRect(0, -14, 150, 26, 5); ctx.fill();
    ctx.fillStyle = '#3e3e3e'; ctx.fillRect(4, 10, 142, 6);
    ctx.restore();
    const lg = ctx.createLinearGradient(0, 692, 0, H_);
    lg.addColorStop(0, '#f0f2f3'); lg.addColorStop(0.3, '#cfd3d7'); lg.addColorStop(0.75, '#a2a7ad'); lg.addColorStop(1, '#73787e');
    ctx.fillStyle = lg; ctx.fillRect(0, 692, W, H_ - 692);
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(0, 692, W, 1.5);
    ctx.restore();

    H.grain(ctx, W, H_, 0.018, 9 + (Math.floor(t * 12) % 5));
  }

  // ============ export ======================================================
  // Story code calls WB.frame(ctx, W, H, t, { cam, story }).
  window.WB = {
    W, H: Hh,
    COLS, FONT, FW,
    BX0, BY0, BX1, BY1,
    seg, wobble, ell, bez, tracePath, marker, mText,
    camAt, win,
    // stroke length in world units — use it to price a stroke against the clock
    plen: (pts) => { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; },
    frame,
  };
})();
