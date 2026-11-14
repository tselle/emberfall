'use strict';
/* ============================================================
   First-person view: textured raycaster with floor/ceiling
   casting, distance fog, billboards and procedural textures.
   Renders only on demand, so it costs nothing while idle.
   ============================================================ */
const View3D = (() => {
  const W = 640, H = 400, FOV = 0.66, TS = 64;
  let cv, ctx, img, buf;
  const zbuf = new Float32Array(W);
  const TEX = {};

  function lcg(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }
  function mkTex(fn) {
    const c = document.createElement('canvas'); c.width = c.height = TS;
    const x = c.getContext('2d', { willReadFrequently: true }); fn(x);
    return new Uint32Array(x.getImageData(0, 0, TS, TS).data.buffer.slice(0));
  }
  function speckle(x, r, n, a) {
    for (let i = 0; i < n; i++) { x.fillStyle = (r() < 0.5 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (r() * a).toFixed(3) + ')'; x.fillRect(r() * TS | 0, r() * TS | 0, 1 + r() * 2 | 0, 1 + r() * 2 | 0); }
  }
  function blocks(x, o) {
    const r = lcg(o.seed || 7);
    x.fillStyle = o.mortar; x.fillRect(0, 0, TS, TS);
    for (let row = 0; row * o.bh < TS; row++) {
      const off = (row % 2) * o.bw / 2;
      for (let col = -1; col * o.bw < TS; col++) {
        x.fillStyle = shade(o.base, (r() - 0.5) * (o.vary || 0.22));
        x.fillRect(col * o.bw + off + 1, row * o.bh + 1, o.bw - 2, o.bh - 2);
        x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(col * o.bw + off + 1, row * o.bh + 1, o.bw - 2, 1);
        x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(col * o.bw + off + 1, row * o.bh + o.bh - 2, o.bw - 2, 1);
      }
    }
    speckle(x, r, o.speck || 500, 0.14);
  }
  function doorOn(x, locked) {
    x.fillStyle = '#17120d'; x.fillRect(9, 5, 46, 59);
    const r = lcg(31);
    for (let i = 0; i < 6; i++) { x.fillStyle = shade('#6f4a26', (r() - 0.5) * 0.25); x.fillRect(11 + i * 7, 7, 6.4, 57); }
    x.fillStyle = '#2b2b30'; x.fillRect(11, 17, 42, 4); x.fillRect(11, 47, 42, 4);
    x.fillStyle = '#8d8f96'; for (let i = 0; i < 6; i++) { x.fillRect(13 + i * 7.4, 18, 2, 2); x.fillRect(13 + i * 7.4, 48, 2, 2); }
    if (locked) {
      x.fillStyle = '#2b2b30'; x.fillRect(11, 31, 42, 5); x.fillRect(29, 7, 5, 57);
      x.fillStyle = '#c9a227'; x.fillRect(26, 28, 11, 11); x.fillStyle = '#17120d'; x.fillRect(30, 31, 3, 5);
    } else { x.strokeStyle = '#c9a227'; x.lineWidth = 2; x.beginPath(); x.arc(46, 36, 3.2, 0, 6.3); x.stroke(); }
  }
  function buildTextures() {
    TEX.stone = mkTex(x => blocks(x, { base: '#7c7f86', mortar: '#3a3b40', bw: 32, bh: 16, seed: 3 }));
    TEX.dungeon = mkTex(x => { blocks(x, { base: '#756a58', mortar: '#2a251e', bw: 32, bh: 16, seed: 11 }); const r = lcg(5); for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(70,95,50,' + (0.15 + r() * 0.2) + ')'; x.fillRect(r() * 64 | 0, 44 + r() * 20 | 0, 3, 2); } });
    TEX.crypt = mkTex(x => { blocks(x, { base: '#4d5466', mortar: '#171a22', bw: 32, bh: 32, seed: 23, vary: 0.15 });
      x.fillStyle = '#12141a'; x.beginPath(); x.arc(16, 18, 7, Math.PI, 0); x.lineTo(23, 28); x.lineTo(9, 28); x.closePath(); x.fill();
      x.fillStyle = '#c9c3ae'; x.beginPath(); x.arc(16, 21, 4, 0, 6.3); x.fill(); x.fillRect(14, 23, 4, 4);
      x.fillStyle = '#12141a'; x.fillRect(14, 20, 1.6, 1.6); x.fillRect(17, 20, 1.6, 1.6); });
    TEX.brick = mkTex(x => blocks(x, { base: '#8a4a3a', mortar: '#4a3a34', bw: 16, bh: 8, seed: 9, speck: 300 }));
    TEX.timber = mkTex(x => { const r = lcg(17); x.fillStyle = '#cdbf9f'; x.fillRect(0, 0, TS, TS); speckle(x, r, 500, 0.1);
      x.fillStyle = '#3b2a1a'; x.fillRect(0, 0, TS, 5); x.fillRect(0, 59, TS, 5); x.fillRect(0, 0, 4, TS); x.fillRect(60, 0, 4, TS);
      x.fillRect(19, 14, 26, 30); x.fillStyle = '#e8b65a'; x.fillRect(22, 17, 20, 24); x.fillStyle = '#3b2a1a'; x.fillRect(31, 17, 2, 24); x.fillRect(22, 28, 20, 2);
      x.fillStyle = 'rgba(255,240,180,.25)'; x.fillRect(22, 17, 9, 11); });
    TEX.door = mkTex(x => { blocks(x, { base: '#7c7f86', mortar: '#3a3b40', bw: 32, bh: 16, seed: 3 }); doorOn(x, false); });
    TEX.lock = mkTex(x => { blocks(x, { base: '#756a58', mortar: '#2a251e', bw: 32, bh: 16, seed: 11 }); doorOn(x, true); });
    TEX.gate = mkTex(x => { blocks(x, { base: '#7c7f86', mortar: '#3a3b40', bw: 32, bh: 16, seed: 3 }); x.fillStyle = '#0d0e12'; x.fillRect(8, 6, 48, 58);
      x.fillStyle = '#4a4d55'; for (let i = 0; i < 6; i++) x.fillRect(11 + i * 8.4, 6, 3, 58); for (let j = 0; j < 5; j++) x.fillRect(8, 12 + j * 11, 48, 3); });
    TEX.cobble = mkTex(x => { const r = lcg(41); x.fillStyle = '#34322f'; x.fillRect(0, 0, TS, TS);
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { x.fillStyle = shade('#77736b', (r() - 0.5) * 0.3); x.beginPath(); x.ellipse(i * 8 + 4 + (j % 2) * 4, j * 8 + 4, 3.6, 3.3, 0, 0, 6.3); x.fill(); x.beginPath(); x.ellipse(i * 8 + 4 + (j % 2) * 4 - 64, j * 8 + 4, 3.6, 3.3, 0, 0, 6.3); x.fill(); }
      speckle(x, r, 200, 0.12); });
    TEX.grass = mkTex(x => { const r = lcg(53); x.fillStyle = '#3d5a2f'; x.fillRect(0, 0, TS, TS);
      for (let i = 0; i < 900; i++) { x.fillStyle = shade('#3d5a2f', (r() - 0.5) * 0.45); x.fillRect(r() * 64 | 0, r() * 64 | 0, 1, 2 + r() * 2 | 0); } });
    TEX.flag = mkTex(x => blocks(x, { base: '#6a6358', mortar: '#26221c', bw: 32, bh: 32, seed: 61, vary: 0.18 }));
    TEX.cryptfloor = mkTex(x => { blocks(x, { base: '#434957', mortar: '#14161c', bw: 32, bh: 32, seed: 67, vary: 0.2 }); x.strokeStyle = 'rgba(0,0,0,.5)'; x.beginPath(); x.moveTo(5, 8); x.lineTo(14, 17); x.lineTo(11, 27); x.moveTo(40, 38); x.lineTo(52, 47); x.lineTo(58, 44); x.stroke(); });
    TEX.vault = mkTex(x => blocks(x, { base: '#3f3a33', mortar: '#15120e', bw: 32, bh: 16, seed: 71, vary: 0.15 }));
    // billboards (transparent background)
    TEX.tree = mkTex(x => { x.fillStyle = '#4a3320'; x.fillRect(28, 34, 8, 30); x.fillStyle = '#3a2718'; x.fillRect(33, 34, 3, 30);
      const r = lcg(81); for (let i = 0; i < 26; i++) { x.fillStyle = shade('#2f6b34', (r() - 0.5) * 0.5); x.beginPath(); x.arc(14 + r() * 36, 8 + r() * 30, 6 + r() * 5, 0, 6.3); x.fill(); } });
    TEX.fountain = mkTex(x => { x.fillStyle = '#8b8f97'; x.beginPath(); x.ellipse(32, 54, 26, 8, 0, 0, 6.3); x.fill(); x.fillStyle = '#3f7fbf'; x.beginPath(); x.ellipse(32, 52, 22, 5.5, 0, 0, 6.3); x.fill();
      x.fillStyle = '#9a9ea6'; x.fillRect(29, 26, 6, 27); x.beginPath(); x.ellipse(32, 27, 11, 3.5, 0, 0, 6.3); x.fill();
      x.strokeStyle = '#9fd0ff'; x.lineWidth = 1.6; for (const d of [-1, 1]) { x.beginPath(); x.moveTo(32, 24); x.quadraticCurveTo(32 + d * 12, 14, 32 + d * 15, 50); x.stroke(); } });
    TEX.chest = mkTex(x => { x.fillStyle = '#1a120b'; x.fillRect(15, 39, 34, 23); x.fillStyle = '#7a4f28'; x.fillRect(16, 46, 32, 15);
      x.beginPath(); x.moveTo(16, 46); x.quadraticCurveTo(32, 32, 48, 46); x.closePath(); x.fill();
      x.fillStyle = '#d4af37'; x.fillRect(16, 45, 32, 2); x.fillRect(21, 40, 3, 21); x.fillRect(40, 40, 3, 21); x.fillRect(30, 46, 4, 6); });
    const stair = up => x => { x.fillStyle = '#5c5f66'; x.beginPath(); x.moveTo(10, 64); x.lineTo(10, 26); x.arc(32, 26, 22, Math.PI, 0); x.lineTo(54, 64); x.closePath(); x.fill();
      x.fillStyle = up ? '#2a3550' : '#07070a'; x.beginPath(); x.moveTo(15, 64); x.lineTo(15, 27); x.arc(32, 27, 17, Math.PI, 0); x.lineTo(49, 64); x.closePath(); x.fill();
      for (let i = 0; i < 5; i++) { x.fillStyle = up ? shade('#8a8d94', -i * 0.1) : shade('#55585f', -i * 0.17); if (up) x.fillRect(15 + i * 2.5, 58 - i * 7, 34 - i * 5, 6); else x.fillRect(15 + i * 3, 58 - i * 5, 34 - i * 6, 4); }
      if (up) { x.fillStyle = 'rgba(255,230,160,.35)'; x.beginPath(); x.arc(32, 22, 9, 0, 6.3); x.fill(); } };
    TEX.stairsUp = mkTex(stair(true)); TEX.stairsDown = mkTex(stair(false));
  }

  function init(canvas) {
    cv = canvas; cv.width = W; cv.height = H;
    ctx = cv.getContext('2d');
    img = ctx.createImageData(W, H);
    buf = new Uint32Array(img.data.buffer);
    buildTextures();
  }

  /* Prepare a map for rendering: cell codes, wall textures, floor variants */
  function prepare(def, cells) {
    const h = cells.length, w = cells[0].length;
    const M = { w, h, c: new Uint8Array(w * h), fl: new Uint8Array(w * h), outdoor: !!def.outdoor, floor: TEX[def.floor], ceil: TEX[def.ceil || 'vault'], wt: new Array(128).fill(null) };
    const wall = TEX[def.wall];
    M.wt[35] = wall; M.wt[83] = wall; M.wt[72] = TEX.timber; M.wt[66] = TEX.brick; M.wt[71] = TEX.gate; M.wt[68] = TEX.door; M.wt[76] = TEX.lock;
    for (let d = 49; d <= 57; d++) M.wt[d] = TEX.door;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = cells[y][x]; M.c[y * w + x] = ch.charCodeAt(0);
      if (ch === ',' || ch === 'T') M.fl[y * w + x] = 1;
    }
    return M;
  }

  const SKY = new Uint32Array(H / 2);
  (function () {
    for (let y = 0; y < H / 2; y++) {
      const t = y / (H / 2), e = t * t;
      const r = 14 + e * 215, g = 20 + e * 110 + t * 20, b = 52 + t * 60 - e * 30;
      SKY[y] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
  })();

  function render(cam, M, sprites) {
    const ca = Math.cos(cam.a), sa = Math.sin(cam.a), px = cam.x, py = cam.y, plx = -sa * FOV, ply = ca * FOV;
    const half = H >> 1, mw = M.w, mh = M.h, out = M.outdoor;
    const fogR = out ? 70 : 4, fogG = out ? 62 : 3, fogB = out ? 78 : 6, k = out ? 0.014 : 0.075;
    const ftex = M.floor, gtex = TEX.grass, ctex = M.ceil, fl = M.fl;

    // --- sky ---
    if (out) {
      for (let y = 0; y < half; y++) buf.fill(SKY[y], y * W, y * W + W);
      for (let x = 0; x < W; x++) {
        const a = cam.a + Math.atan((2 * x / W - 1) * FOV);
        const hgt = 20 + 13 * Math.sin(a * 3) + 8 * Math.sin(a * 7 + 1) + 4 * Math.sin(a * 13 + 2);
        for (let y = half - (hgt | 0); y < half; y++) if (y >= 0) buf[y * W + x] = 0xff3a2a22;
      }
    }
    // --- floor and ceiling ---
    for (let y = half; y < H; y++) {
      const rowD = half / (y - half + 0.5);
      const f = 1 / (1 + rowD * rowD * k), fi = 1 - f, fr = fogR * fi, fg = fogG * fi, fb = fogB * fi;
      const stepX = rowD * 2 * plx / W, stepY = rowD * 2 * ply / W;
      let fx = px + rowD * (ca - plx), fy = py + rowD * (sa - ply);
      const o = y * W, o2 = (H - 1 - y) * W, fc = f * 0.8;
      for (let x = 0; x < W; x++, fx += stepX, fy += stepY) {
        const cx = Math.floor(fx), cy = Math.floor(fy);
        const ti = (((fy - cy) * TS) & 63) * TS + (((fx - cx) * TS) & 63);
        let tex = ftex;
        if (cx >= 0 && cy >= 0 && cx < mw && cy < mh && fl[cy * mw + cx]) tex = gtex;
        let p = tex[ti];
        buf[o + x] = 0xff000000 | (((p >> 16 & 255) * f + fb) << 16) | (((p >> 8 & 255) * f + fg) << 8) | ((p & 255) * f + fr);
        if (!out) { p = ctex[ti]; buf[o2 + x] = 0xff000000 | (((p >> 16 & 255) * fc + fb) << 16) | (((p >> 8 & 255) * fc + fg) << 8) | ((p & 255) * fc + fr); }
      }
    }
    // --- walls ---
    for (let x = 0; x < W; x++) {
      const camX = 2 * x / W - 1, rx = ca + plx * camX, ry = sa + ply * camX;
      let mx = Math.floor(px), my = Math.floor(py);
      const dx = Math.abs(1 / rx), dy = Math.abs(1 / ry);
      let stepX, stepY, sdx, sdy, side = 0, tex = null;
      if (rx < 0) { stepX = -1; sdx = (px - mx) * dx; } else { stepX = 1; sdx = (mx + 1 - px) * dx; }
      if (ry < 0) { stepY = -1; sdy = (py - my) * dy; } else { stepY = 1; sdy = (my + 1 - py) * dy; }
      for (let i = 0; i < 64; i++) {
        if (sdx < sdy) { sdx += dx; mx += stepX; side = 0; } else { sdy += dy; my += stepY; side = 1; }
        if (mx < 0 || my < 0 || mx >= mw || my >= mh) break;
        tex = M.wt[M.c[my * mw + mx]];
        if (tex) break;
      }
      if (!tex) { zbuf[x] = 1e9; continue; }
      const perp = Math.max(0.02, side === 0 ? sdx - dx : sdy - dy);
      zbuf[x] = perp;
      const lh = H / perp, ds = half - lh / 2;
      let wx = side === 0 ? py + perp * ry : px + perp * rx; wx -= Math.floor(wx);
      let tx = (wx * TS) | 0;
      if ((side === 0 && rx < 0) || (side === 1 && ry > 0)) tx = TS - 1 - tx;
      const f0 = 1 / (1 + perp * perp * k), f = f0 * (side ? 0.72 : 1), fi = 1 - f0, fr = fogR * fi, fg = fogG * fi, fb = fogB * fi;
      const ys = Math.max(0, Math.ceil(ds)), ye = Math.min(H, Math.floor(ds + lh)), st = TS / lh;
      let tp = (ys - ds) * st;
      for (let y = ys; y < ye; y++, tp += st) {
        const p = tex[((tp | 0) & 63) * TS + tx];
        buf[y * W + x] = 0xff000000 | (((p >> 16 & 255) * f + fb) << 16) | (((p >> 8 & 255) * f + fg) << 8) | ((p & 255) * f + fr);
      }
    }
    // --- billboards ---
    if (sprites && sprites.length) {
      const inv = 1 / (plx * sa - ca * ply);
      const list = [];
      for (const s of sprites) {
        const sx = s.x + 0.5 - px, sy = s.y + 0.5 - py;
        const tY = inv * (-ply * sx + plx * sy);
        if (tY > 0.25) list.push({ tX: inv * (sa * sx - ca * sy), tY, tex: TEX[s.tex] });
      }
      list.sort((a, b) => b.tY - a.tY);
      for (const s of list) {
        const scr = (W / 2) * (1 + s.tX / s.tY), size = H / s.tY, x0 = scr - size / 2, y0 = half - size / 2;
        const f = 1 / (1 + s.tY * s.tY * k), fi = 1 - f, fr = fogR * fi, fg = fogG * fi, fb = fogB * fi;
        const xs = Math.max(0, Math.ceil(x0)), xe = Math.min(W, Math.floor(x0 + size));
        const ys = Math.max(0, Math.ceil(y0)), ye = Math.min(H, Math.floor(y0 + size)), st = TS / size;
        for (let x = xs; x < xe; x++) {
          if (zbuf[x] < s.tY) continue;
          const tx = ((x - x0) * st) & 63;
          for (let y = ys; y < ye; y++) {
            const p = s.tex[(((y - y0) * st) & 63) * TS + tx];
            if ((p >>> 24) < 128) continue;
            buf[y * W + x] = 0xff000000 | (((p >> 16 & 255) * f + fb) << 16) | (((p >> 8 & 255) * f + fg) << 8) | ((p & 255) * f + fr);
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function minimap(canvas, M, explored, px, py, dir) {
    const c = canvas.getContext('2d'), cs = Math.floor(Math.min(canvas.width / M.w, canvas.height / M.h));
    const ox = (canvas.width - cs * M.w) >> 1, oy = (canvas.height - cs * M.h) >> 1;
    c.fillStyle = '#0b0c11'; c.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
      if (!explored[y * M.w + x]) continue;
      const code = M.c[y * M.w + x], ch = String.fromCharCode(code);
      let col = '#8d8474';
      if (M.wt[code]) col = (ch === 'D' || (ch >= '1' && ch <= '9')) ? '#c8923c' : ch === 'L' ? '#c0392b' : ch === 'G' ? '#555' : ch === 'S' ? '#454a58' : '#454a58';
      else if (ch === ',') col = '#3f5a3a'; else if (ch === 'T') col = '#27502a'; else if (ch === 'F') col = '#3f7fbf';
      else if (ch === '<' || ch === '>') col = '#58c4dd';
      c.fillStyle = col; c.fillRect(ox + x * cs, oy + y * cs, cs, cs);
    }
    const cx = ox + (px + 0.5) * cs, cy = oy + (py + 0.5) * cs, a = (dir - 1) * Math.PI / 2;
    c.save(); c.translate(cx, cy); c.rotate(a); c.fillStyle = '#ffd24a'; c.strokeStyle = '#000'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(cs * 0.75, 0); c.lineTo(-cs * 0.55, -cs * 0.55); c.lineTo(-cs * 0.2, 0); c.lineTo(-cs * 0.55, cs * 0.55); c.closePath(); c.fill(); c.stroke(); c.restore();
  }
  return { init, prepare, render, minimap, W, H };
})();
