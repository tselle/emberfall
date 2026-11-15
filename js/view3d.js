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
  const HP = new Float32Array(4), HT = new Int32Array(4), HS = new Array(4), HD = new Uint8Array(4); // ray hits per column
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
    buildFacades();
  }

  /* ---------------- town facades ----------------
     Each shop gets its own materials, several facade variants, a door with a
     hanging sign, and an upper storey whose transparent top gives the building
     a roofline (gables, battlements, spires) against the sky. */
  const FAC = {};
  const box = (x, c, a, b, w, h) => { x.fillStyle = c; x.fillRect(a, b, w, h); };
  const line = (x, c, w, pts) => { x.strokeStyle = c; x.lineWidth = w; x.beginPath(); x.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]); x.stroke(); };
  function plaster(x, col, seed) {
    box(x, col, 0, 0, TS, TS); const r = lcg(seed); speckle(x, r, 380, 0.08);
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(90,70,40,.08)'; x.beginPath(); x.ellipse(r() * 64, r() * 64, 4 + r() * 8, 3 + r() * 5, 0, 0, 6.3); x.fill(); }
  }
  function frame(x, beam, kind) {
    box(x, beam, 0, 0, TS, 4); box(x, beam, 0, 60, TS, 4); box(x, beam, 0, 0, 4, TS); box(x, beam, 60, 0, 4, TS);
    x.lineCap = 'butt';
    if (kind === 'x') { line(x, beam, 4, [4, 4, 60, 60]); line(x, beam, 4, [60, 4, 4, 60]); }
    else if (kind === 'v') { line(x, beam, 4, [4, 60, 32, 32, 60, 60]); box(x, beam, 30, 4, 4, 28); }
    else if (kind === 'mid') box(x, beam, 0, 30, TS, 4);
  }
  function glass(x, a, b, w, h, lit) {
    const g = x.createLinearGradient(a, b, a + w, b + h);
    if (lit) { g.addColorStop(0, '#ffe9a0'); g.addColorStop(1, '#e0922e'); } else { g.addColorStop(0, '#5f7088'); g.addColorStop(1, '#1e2633'); }
    x.fillStyle = g; x.fillRect(a, b, w, h);
    if (!lit) box(x, 'rgba(255,255,255,.22)', a + 1, b + 1, w / 3, h / 3);
  }
  function win(x, a, b, w, h, o) {
    const fr = o.frame || '#3b2a1a';
    if (o.shutters) for (const sx of [a - 3 - w / 2, a + w + 3]) { box(x, o.shutters, sx, b - 2, w / 2, h + 4); for (let yy = b; yy < b + h; yy += 4) box(x, 'rgba(0,0,0,.25)', sx + 1, yy, w / 2 - 2, 1); }
    box(x, fr, a - 2, b - 2, w + 4, h + 4);
    glass(x, a, b, w, h, o.lit);
    if (o.round) { x.strokeStyle = 'rgba(80,50,20,.55)'; x.lineWidth = 1; for (let yy = b + 2; yy < b + h; yy += 5) for (let xx = a + 2; xx < a + w; xx += 5) { x.beginPath(); x.arc(xx + 0.5, yy + 0.5, 2, 0, 6.3); x.stroke(); } }
    else { box(x, fr, a + w / 2 - 1, b, 2, h); box(x, fr, a, b + h / 2 - 1, w, 2); }
    if (o.bars) for (let i = a + 2; i < a + w; i += 4) box(x, '#202024', i, b, 1.5, h);
    if (o.box) { box(x, '#5a3a1e', a - 3, b + h + 2, w + 6, 5); const r = lcg(a * 7 + b); for (let i = 0; i < 8; i++) { x.fillStyle = ['#d94a4a', '#f2c94c', '#e07ad0', '#4f8f3a'][i % 4]; x.beginPath(); x.arc(a - 1 + r() * (w + 2), b + h + 1 + r() * 2, 1.8, 0, 6.3); x.fill(); } }
    else box(x, 'rgba(0,0,0,.35)', a - 2, b + h + 2, w + 4, 2);
  }
  function arch(x, a, b, w, h, pointed) {
    x.beginPath(); x.moveTo(a, b + h);
    if (pointed) { x.lineTo(a, b + w * 0.6); x.quadraticCurveTo(a, b, a + w / 2, b - w * 0.15); x.quadraticCurveTo(a + w, b, a + w, b + w * 0.6); }
    else { x.lineTo(a, b + w / 2); x.arc(a + w / 2, b + w / 2, w / 2, Math.PI, 0); }
    x.lineTo(a + w, b + h); x.closePath();
  }
  function stained(x, a, b, w, h, seed, round) {
    x.fillStyle = '#efe8d6';
    if (round) { x.beginPath(); x.arc(a, b, w + 3, 0, 6.3); x.fill(); } else { arch(x, a - 3, b - 3, w + 6, h + 5, true); x.fill(); }
    x.save();
    if (round) { x.beginPath(); x.arc(a, b, w, 0, 6.3); } else arch(x, a, b, w, h, true);
    x.clip();
    const r = lcg(seed), cols = ['#b8242e', '#2f56b0', '#e2b23a', '#3e8f4e', '#7a3fa0', '#2f56b0'];
    const x0 = round ? a - w : a, y0 = round ? b - w : b - 6, ww = round ? w * 2 : w, hh = round ? w * 2 : h + 6;
    for (let yy = y0; yy < y0 + hh; yy += 4) for (let xx = x0; xx < x0 + ww; xx += 4) { x.fillStyle = cols[(r() * cols.length) | 0]; x.fillRect(xx, yy, 4, 4); }
    x.strokeStyle = 'rgba(20,15,10,.75)'; x.lineWidth = 1;
    if (round) for (let i = 0; i < 8; i++) line(x, 'rgba(20,15,10,.8)', 1, [a, b, a + Math.cos(i * 0.785) * w, b + Math.sin(i * 0.785) * w]);
    else { for (let yy = y0; yy < y0 + hh; yy += 8) line(x, 'rgba(20,15,10,.8)', 1, [x0, yy, x0 + ww, yy]); line(x, 'rgba(20,15,10,.8)', 1.5, [a + w / 2, b - 6, a + w / 2, b + h]); }
    x.restore();
  }
  function shingles(x, col, y0, y1) {
    const r = lcg(y0 * 13 + col.length);
    for (let yy = y0, row = 0; yy < y1; yy += 5, row++) {
      for (let xx = -8 + (row % 2) * 4; xx < TS; xx += 8) { x.fillStyle = shade(col, (r() - 0.5) * 0.25); x.fillRect(xx, yy, 7, 5); }
      box(x, 'rgba(0,0,0,.35)', 0, yy + 4, TS, 1);
    }
  }
  function eave(x, col, d) { shingles(x, col, 0, d); box(x, 'rgba(0,0,0,.45)', 0, d, TS, 3); }
  function gable(x, col, wallFn) {
    x.save(); x.beginPath(); x.moveTo(0, 64); x.lineTo(0, 38); x.lineTo(32, 7); x.lineTo(64, 38); x.lineTo(64, 64); x.closePath(); x.clip(); wallFn(); x.restore();
    x.lineCap = 'square'; line(x, col, 7, [-3, 41, 32, 6, 67, 41]); line(x, 'rgba(0,0,0,.4)', 1.5, [0, 45, 32, 12, 64, 45]);
  }
  function crenels(x) { x.clearRect(10, 0, 12, 10); x.clearRect(42, 0, 12, 10); box(x, 'rgba(0,0,0,.3)', 0, 10, TS, 2); }
  function jagged(x, seed) { const r = lcg(seed); let hh = 6; for (let xx = 0; xx < TS; xx += 4) { hh = clamp(hh + (r() - 0.5) * 16, 2, 30); x.clearRect(xx, 0, 4, hh | 0); } }
  function sign(x, kind) {
    box(x, '#2a2a2e', 14, 4, 36, 2); box(x, '#2a2a2e', 23, 5, 1, 3); box(x, '#2a2a2e', 40, 5, 1, 3);
    box(x, '#3e2814', 19, 8, 26, 14); box(x, '#7a5230', 20, 9, 24, 12);
    const c = (col, px, py, r) => { x.fillStyle = col; x.beginPath(); x.arc(px, py, r, 0, 6.3); x.fill(); };
    if (kind === 'lantern') { c('rgba(255,210,90,.6)', 32, 15, 6); box(x, '#2a2a2e', 29, 10, 6, 2); box(x, '#ffd56a', 29.5, 12, 5, 6); box(x, '#2a2a2e', 29, 18, 6, 1.5); }
    else if (kind === 'swords') { line(x, '#d7dbe0', 2, [24, 19, 39, 10]); line(x, '#d7dbe0', 2, [40, 19, 25, 10]); line(x, '#d4af37', 2, [25, 15, 28, 19]); line(x, '#d4af37', 2, [39, 15, 36, 19]); }
    else if (kind === 'tankard') { box(x, '#d4af37', 27, 12, 9, 8); box(x, '#f3efe2', 26, 10, 11, 3); x.strokeStyle = '#d4af37'; x.lineWidth = 2; x.beginPath(); x.arc(37, 16, 3, -1.4, 1.4); x.stroke(); }
    else if (kind === 'mortar') { x.fillStyle = '#3e8f4e'; x.beginPath(); x.moveTo(25, 13); x.lineTo(39, 13); x.lineTo(36, 20); x.lineTo(28, 20); x.closePath(); x.fill(); line(x, '#e8e0c8', 2.5, [30, 15, 37, 9]); }
    else if (kind === 'target') { c('#f3efe2', 32, 15, 5.5); c('#b8242e', 32, 15, 4); c('#f3efe2', 32, 15, 2.4); c('#b8242e', 32, 15, 1); }
  }
  function door(x, o) {
    const a = o.x == null ? 20 : o.x, w = o.w || 24, top = o.top || 26;
    x.fillStyle = o.surround || '#2b1d12';
    if (o.arch) { arch(x, a - 3, top - 3, w + 6, 64 - top + 3, o.arch === 'pointed'); x.fill(); } else box(x, o.surround || '#2b1d12', a - 3, top - 3, w + 6, 64 - top + 3);
    x.save();
    if (o.arch) { arch(x, a, top, w, 64 - top, o.arch === 'pointed'); x.clip(); }
    const r = lcg(a + top);
    for (let i = 0; i < w; i += 4) box(x, shade(o.wood || '#6f4a26', (r() - 0.5) * 0.25), a + i, top - 8, 3.6, 72 - top);
    if (o.double) box(x, 'rgba(0,0,0,.6)', a + w / 2 - 0.5, top - 8, 1.5, 72 - top);
    if (o.bands) for (const yy of [top + 6, top + 22, 58]) box(x, '#2b2b30', a, yy, w, 3);
    x.restore();
    if (o.fan) { x.fillStyle = '#2b1d12'; x.beginPath(); x.arc(a + w / 2, top - 3, w / 2 + 2, Math.PI, 0); x.fill(); glass(x, a + 2, top - 3 - w / 2 + 3, w - 4, w / 2 - 3, true); line(x, '#2b1d12', 1.5, [a + w / 2, top - 4, a + w / 2, top - w / 2]); }
    x.fillStyle = '#c9a227';
    if (o.double) { x.beginPath(); x.arc(a + w / 2 - 3, top + 22, 1.6, 0, 6.3); x.arc(a + w / 2 + 3, top + 22, 1.6, 0, 6.3); x.fill(); }
    else { x.beginPath(); x.arc(a + w - 5, top + 20, 1.8, 0, 6.3); x.fill(); }
    if (o.steps) { box(x, '#9a948a', a - 8, 60, w + 16, 4); box(x, '#b1aba0', a - 5, 57, w + 10, 3); }
  }
  function buildFacades() {
    const T = fn => mkTex(fn);
    // --- Drowsy Lantern (inn): cream plaster, dark timber, slate roof, lantern sign
    const innW = (x, k) => { plaster(x, '#e4d8b8', 101); frame(x, '#3b2a1a', k); };
    FAC.inn = {
      lower: [T(x => { innW(x); win(x, 21, 16, 22, 18, { lit: true, box: true }); }), T(x => innW(x, 'x')),
              T(x => { innW(x); win(x, 10, 20, 14, 14, { lit: true }); win(x, 40, 20, 14, 14, { lit: false }); })],
      upper: [T(x => { innW(x); eave(x, '#4b5263', 17); win(x, 24, 30, 16, 14, { lit: true }); }),
              T(x => gable(x, '#3b2a1a', () => { innW(x, 'v'); win(x, 26, 34, 12, 12, { lit: true }); }))],
      door: T(x => { innW(x); door(x, { arch: 'round', wood: '#7a4f28' }); sign(x, 'lantern'); }),
    };
    // --- Gilded Tankard (tavern): ochre plaster, bullseye glass, red tile gables, barrels
    const tavW = (x, k) => { plaster(x, '#c99a5c', 113); frame(x, '#2e1d12', k); };
    const barrel = (x, bx) => { box(x, '#6b4524', bx, 46, 14, 16); box(x, '#2b2b30', bx, 49, 14, 2); box(x, '#2b2b30', bx, 57, 14, 2); box(x, 'rgba(255,255,255,.12)', bx + 2, 46, 3, 16); };
    FAC.tavern = {
      lower: [T(x => { tavW(x); win(x, 17, 14, 30, 22, { lit: true, round: true }); }), T(x => tavW(x, 'v')),
              T(x => { tavW(x); win(x, 22, 10, 20, 14, { lit: true, round: true }); barrel(x, 12); barrel(x, 30); })],
      upper: [T(x => gable(x, '#8e3b26', () => { tavW(x, 'mid'); win(x, 26, 36, 12, 12, { lit: false }); })),
              T(x => { tavW(x); eave(x, '#8e3b26', 20); win(x, 22, 32, 20, 14, { lit: true, round: true }); })],
      door: T(x => { tavW(x); door(x, { wood: '#5e3b1e', bands: true }); sign(x, 'tankard'); }),
    };
    // --- Ironhand Outfitters (armory): rough dark stone, barred windows, battlements
    const armW = x => blocks(x, { base: '#6e6b66', mortar: '#2c2b2a', bw: 21, bh: 12, seed: 127, vary: 0.28 });
    FAC.armory = {
      lower: [T(x => { armW(x); win(x, 22, 16, 20, 22, { lit: true, bars: true, frame: '#2c2b2a' }); }),
              T(x => { armW(x); line(x, '#5a3a1e', 2.5, [14, 52, 50, 12]); line(x, '#5a3a1e', 2.5, [50, 52, 14, 12]); box(x, '#c0c6cf', 47, 9, 4, 6); box(x, '#c0c6cf', 13, 9, 4, 6);
                       x.fillStyle = '#7a2a22'; x.beginPath(); x.arc(32, 32, 12, 0, 6.3); x.fill(); x.strokeStyle = '#c9a227'; x.lineWidth = 2; x.stroke(); x.fillStyle = '#c0c6cf'; x.beginPath(); x.arc(32, 32, 3, 0, 6.3); x.fill(); }),
              T(x => armW(x))],
      upper: [T(x => { armW(x); crenels(x); box(x, '#16140f', 30, 24, 4, 20); box(x, '#16140f', 26, 32, 12, 3); }), T(x => { armW(x); crenels(x); })],
      door: T(x => { armW(x); door(x, { wood: '#4a3420', bands: true, surround: '#3a3936' }); sign(x, 'swords'); }),
    };
    // --- Gilded Mortar (apothecary): red brick, green shutters, herb boxes, stepped gables
    const apoW = x => blocks(x, { base: '#8f5a44', mortar: '#4f3a30', bw: 16, bh: 8, seed: 131, speck: 300 });
    const ivy = x => { const r = lcg(137); for (let i = 0; i < 70; i++) { const yy = 64 - r() * r() * 60; x.fillStyle = shade('#3e7a34', (r() - 0.5) * 0.4); x.beginPath(); x.arc(4 + r() * 22 + (64 - yy) * 0.2, yy, 2 + r() * 2, 0, 6.3); x.fill(); } };
    FAC.apothecary = {
      lower: [T(x => { apoW(x); win(x, 24, 16, 16, 20, { lit: true, shutters: '#2f6b3a', box: true }); }), T(x => { apoW(x); ivy(x); }),
              T(x => { apoW(x); x.fillStyle = '#4f3a30'; x.beginPath(); x.arc(32, 28, 11, 0, 6.3); x.fill(); x.save(); x.beginPath(); x.arc(32, 28, 9, 0, 6.3); x.clip(); glass(x, 23, 19, 18, 18, true); x.restore(); line(x, '#4f3a30', 1.5, [23, 28, 41, 28]); line(x, '#4f3a30', 1.5, [32, 19, 32, 37]); })],
      upper: [T(x => { apoW(x); for (const [a, b, h] of [[0, 8, 30], [8, 16, 21], [16, 24, 12], [40, 48, 12], [48, 56, 21], [56, 64, 30]]) x.clearRect(a, 0, b - a, h); box(x, '#6e4434', 24, 0, 16, 3); win(x, 26, 30, 12, 14, { lit: false, shutters: '#2f6b3a' }); }),
              T(x => { apoW(x); eave(x, '#3f4a3a', 15); win(x, 25, 28, 14, 16, { lit: true, shutters: '#2f6b3a' }); })],
      door: T(x => { apoW(x); door(x, { wood: '#2f6b3a' }); sign(x, 'mortar'); }),
    };
    // --- Temple of the Dawn: pale limestone, stained glass, rose window, spire
    const temW = x => blocks(x, { base: '#d8d0bb', mortar: '#a8a08c', bw: 32, bh: 16, seed: 139, vary: 0.08, speck: 200 });
    const cornice = x => { box(x, '#efe8d6', 0, 0, TS, 6); for (let i = 0; i < TS; i += 6) box(x, '#b5ad98', i, 6, 3, 3); box(x, 'rgba(0,0,0,.2)', 0, 9, TS, 2); };
    FAC.temple = {
      lower: [T(x => { temW(x); stained(x, 23, 14, 18, 44, 141); }),
              T(x => { temW(x); box(x, '#ebe4d1', 24, 0, 16, 64); box(x, 'rgba(0,0,0,.15)', 38, 0, 2, 64); box(x, '#f3eddc', 21, 0, 22, 5); box(x, '#f3eddc', 21, 58, 22, 6); })],
      upper: [T(x => { temW(x); cornice(x); stained(x, 32, 36, 13, 0, 149, true); }), T(x => { temW(x); cornice(x); stained(x, 26, 24, 12, 32, 151); })],
      door: T(x => { temW(x); door(x, { arch: 'pointed', double: true, x: 18, w: 28, top: 24, wood: '#7a5230', surround: '#efe8d6', steps: true });
                     x.fillStyle = '#e2b23a'; x.beginPath(); x.arc(32, 9, 4, 0, 6.3); x.fill(); for (let i = 0; i < 8; i++) line(x, '#e2b23a', 1.2, [32 + Math.cos(i * 0.785) * 5, 9 + Math.sin(i * 0.785) * 5, 32 + Math.cos(i * 0.785) * 8, 9 + Math.sin(i * 0.785) * 8]); }),
      crown: T(x => { x.fillStyle = '#d8d0bb'; x.fillRect(20, 40, 24, 24); box(x, '#1a1612', 27, 46, 10, 18); x.fillStyle = '#1a1612'; x.beginPath(); x.arc(32, 46, 5, Math.PI, 0); x.fill();
                      x.fillStyle = '#4b5263'; x.beginPath(); x.moveTo(17, 41); x.lineTo(32, 6); x.lineTo(47, 41); x.closePath(); x.fill(); x.fillStyle = 'rgba(0,0,0,.3)'; x.beginPath(); x.moveTo(32, 6); x.lineTo(47, 41); x.lineTo(32, 41); x.closePath(); x.fill();
                      x.fillStyle = '#e2b23a'; x.beginPath(); x.arc(32, 5, 3.5, 0, 6.3); x.fill(); box(x, '#e2b23a', 31, 0, 2, 3); }),
    };
    // --- Town Hall: dressed stone, tall shuttered windows, banners, clock tower
    const halW = x => blocks(x, { base: '#a9a296', mortar: '#6f6a61', bw: 32, bh: 16, seed: 157, vary: 0.1 });
    const banner = x => { box(x, '#2a2a2e', 18, 4, 28, 3); x.fillStyle = '#8a1f24'; x.beginPath(); x.moveTo(21, 7); x.lineTo(43, 7); x.lineTo(43, 50); x.lineTo(32, 43); x.lineTo(21, 50); x.closePath(); x.fill();
                          box(x, '#d4af37', 21, 9, 22, 2); x.fillStyle = '#d4af37'; x.beginPath(); x.moveTo(32, 16); x.lineTo(38, 24); x.lineTo(32, 32); x.lineTo(26, 24); x.closePath(); x.fill(); };
    FAC.hall = {
      lower: [T(x => { halW(x); win(x, 24, 10, 16, 34, { lit: false, shutters: '#6b2a22', frame: '#4f4a43' }); }), T(x => { halW(x); banner(x); }),
              T(x => { halW(x); box(x, '#c4beb1', 22, 0, 20, 64); for (let i = 25; i < 40; i += 4) box(x, 'rgba(0,0,0,.14)', i, 6, 1.5, 52); box(x, '#d6d0c3', 19, 0, 26, 6); box(x, '#d6d0c3', 19, 58, 26, 6); })],
      upper: [T(x => { halW(x); box(x, '#c4beb1', 0, 0, TS, 7); box(x, 'rgba(0,0,0,.25)', 0, 7, TS, 2); win(x, 14, 24, 12, 14, { lit: true, frame: '#4f4a43' }); win(x, 38, 24, 12, 14, { lit: false, frame: '#4f4a43' }); })],
      door: T(x => { halW(x); door(x, { double: true, x: 17, w: 30, top: 30, wood: '#5a3a20', fan: true, steps: true }); x.fillStyle = '#8a1f24'; x.beginPath(); x.moveTo(26, 3); x.lineTo(38, 3); x.lineTo(38, 9); x.lineTo(32, 13); x.lineTo(26, 9); x.closePath(); x.fill(); box(x, '#d4af37', 31, 4, 2, 7); }),
      crown: T(x => { const tw = (a, b, w, h, col) => box(x, col, a, b, w, h); tw(16, 22, 32, 42, '#a9a296'); for (let yy = 26; yy < 64; yy += 8) box(x, 'rgba(0,0,0,.18)', 16, yy, 32, 1);
                      x.fillStyle = '#f3efe2'; x.beginPath(); x.arc(32, 40, 9, 0, 6.3); x.fill(); x.strokeStyle = '#2a2a2e'; x.lineWidth = 1.5; x.stroke(); line(x, '#2a2a2e', 1.5, [32, 40, 32, 34]); line(x, '#2a2a2e', 1.5, [32, 40, 36, 42]);
                      x.fillStyle = '#4f6a5a'; x.beginPath(); x.moveTo(13, 23); x.lineTo(32, 3); x.lineTo(51, 23); x.closePath(); x.fill(); x.fillStyle = 'rgba(0,0,0,.25)'; x.beginPath(); x.moveTo(32, 3); x.lineTo(51, 23); x.lineTo(32, 23); x.closePath(); x.fill(); box(x, '#d4af37', 31, 0, 2, 5); }),
    };
    // --- Training Hall: a single-storey plank barn with a thatched eave
    const traW = x => { const r = lcg(163); for (let yy = 0; yy < TS; yy += 8) { box(x, shade('#8a6a44', (r() - 0.5) * 0.3), 0, yy, TS, 8); box(x, 'rgba(0,0,0,.35)', 0, yy + 7, TS, 1); } speckle(x, r, 250, 0.1); box(x, '#4a3420', 0, 0, 5, TS); box(x, '#4a3420', 59, 0, 5, TS); };
    const thatch = x => { const r = lcg(167); box(x, '#a88d4e', 0, 0, TS, 13); for (let i = 0; i < 160; i++) box(x, shade('#a88d4e', (r() - 0.5) * 0.5), r() * 64, r() * 13, 1, 3 + r() * 4); box(x, 'rgba(0,0,0,.45)', 0, 13, TS, 3); };
    FAC.training = {
      lower: [T(x => { traW(x); thatch(x); for (const [r0, col] of [[13, '#f3efe2'], [10, '#b8242e'], [7, '#f3efe2'], [4, '#b8242e']]) { x.fillStyle = col; x.beginPath(); x.arc(32, 39, r0, 0, 6.3); x.fill(); } line(x, '#5a3a1e', 1.5, [36, 37, 46, 30]); }),
              T(x => { traW(x); thatch(x); box(x, '#4a3420', 10, 26, 44, 3); box(x, '#4a3420', 10, 50, 44, 3); for (let i = 0; i < 5; i++) { line(x, '#c0c6cf', 2, [15 + i * 9, 54, 15 + i * 9, 22]); box(x, '#d4af37', 12 + i * 9, 44, 7, 2); } }),
              T(x => { traW(x); thatch(x); })],
      door: T(x => { traW(x); thatch(x); door(x, { x: 16, w: 32, top: 24, wood: '#7a5a38', double: true }); line(x, '#4a3420', 3, [17, 25, 47, 63]); line(x, '#4a3420', 3, [47, 25, 17, 63]); sign(x, 'target'); }),
      upper: [],
    };
    // --- The burned abbey: scorched stone with a broken, jagged top
    const abW = x => { blocks(x, { base: '#6d675e', mortar: '#2a2622', bw: 32, bh: 16, seed: 173, vary: 0.25 }); const g = x.createLinearGradient(0, 0, 0, TS); g.addColorStop(0, 'rgba(10,8,6,.65)'); g.addColorStop(1, 'rgba(10,8,6,0)'); x.fillStyle = g; x.fillRect(0, 0, TS, TS); };
    FAC.abbey = {
      lower: [T(x => { abW(x); x.fillStyle = '#0c0a08'; arch(x, 22, 12, 20, 44, true); x.fill(); }), T(x => { abW(x); line(x, '#1a1612', 1.5, [12, 0, 18, 20, 14, 34, 22, 64]); })],
      upper: [T(x => { abW(x); jagged(x, 179); }), T(x => { abW(x); jagged(x, 181); x.fillStyle = '#0c0a08'; arch(x, 24, 30, 16, 34, true); x.fill(); })],
    };
    // --- town walls and gatehouse: battlements with arrow slits
    const wallW = x => blocks(x, { base: '#7c7f86', mortar: '#3a3b40', bw: 32, bh: 16, seed: 3 });
    FAC.wall = { lower: [TEX.stone], upper: [T(x => { wallW(x); crenels(x); }), T(x => { wallW(x); crenels(x); box(x, '#101114', 30, 22, 4, 22); box(x, '#101114', 26, 31, 12, 3); })] };
    FAC.gate = { lower: [TEX.gate], upper: [T(x => { wallW(x); crenels(x); for (const bx of [8, 44]) { x.fillStyle = '#8a1f24'; x.beginPath(); x.moveTo(bx, 14); x.lineTo(bx + 12, 14); x.lineTo(bx + 12, 54); x.lineTo(bx + 6, 48); x.lineTo(bx, 54); x.closePath(); x.fill(); box(x, '#d4af37', bx + 4, 24, 4, 12); } })] };
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
    // per-cell wall stacks: [ground storey, upper storey, ...]; most maps are one storey
    M.tw = new Array(w * h).fill(null); M.maxH = 1;
    for (let i = 0; i < w * h; i++) if (M.wt[M.c[i]]) M.tw[i] = [M.wt[M.c[i]]];
    if (def.facades) facades(def, cells, M);
    return M;
  }
  /* Give each building in town its own look. Building squares are grouped into
     blocks; every square takes the style of the nearest shop door in its block. */
  function facades(def, cells, M) {
    const w = M.w, h = M.h, isB = ch => ch === 'H' || ch === 'B' || (ch >= '1' && ch <= '9');
    const hash = (x, y, k) => { let v = Math.imul(x * 73856093 ^ y * 19349663 ^ k * 83492791, 2654435761); return (v ^ (v >>> 15)) >>> 0; };
    const style = new Array(w * h).fill(null), dist = new Int32Array(w * h).fill(-1), q = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ch = cells[y][x]; if (ch >= '1' && ch <= '9' && FAC[def.locs[ch]]) { style[y * w + x] = def.locs[ch]; dist[y * w + x] = 0; q.push(y * w + x); } }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, j = ny * w + nx; if (nx >= 0 && ny >= 0 && nx < w && ny < h && dist[j] < 0 && isB(cells[ny][nx])) { dist[j] = dist[i] + 1; style[j] = style[i]; q.push(j); } }
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, ch = cells[y][x];
      let st = style[i];
      if (!st && isB(ch)) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((cells[y + dy] || [])[x + dx] === '>') st = 'abbey'; }
      if (!st && ch === '#') st = 'wall';
      if (!st && ch === 'G') st = 'gate';
      const F = FAC[st]; if (!F) continue;
      const stack = [ch >= '1' && ch <= '9' && F.door ? F.door : F.lower[hash(x, y, 1) % F.lower.length]];
      if (F.upper.length) stack.push(F.upper[hash(x, y, 2) % F.upper.length]);
      if (ch >= '1' && ch <= '9' && F.crown) stack.push(F.crown);
      M.tw[i] = stack; M.maxH = Math.max(M.maxH, stack.length);
    }
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
    // --- walls: walk each ray past low walls to find taller ones behind, then paint far to near ---
    const tw = M.tw, maxH = M.maxH;
    for (let x = 0; x < W; x++) {
      const camX = 2 * x / W - 1, rx = ca + plx * camX, ry = sa + ply * camX;
      let mx = Math.floor(px), my = Math.floor(py);
      const dx = Math.abs(1 / rx), dy = Math.abs(1 / ry);
      let stepX, stepY, sdx, sdy, side = 0, n = 0, best = 0;
      if (rx < 0) { stepX = -1; sdx = (px - mx) * dx; } else { stepX = 1; sdx = (mx + 1 - px) * dx; }
      if (ry < 0) { stepY = -1; sdy = (py - my) * dy; } else { stepY = 1; sdy = (my + 1 - py) * dy; }
      for (let i = 0; i < 64; i++) {
        if (sdx < sdy) { sdx += dx; mx += stepX; side = 0; } else { sdy += dy; my += stepY; side = 1; }
        if (mx < 0 || my < 0 || mx >= mw || my >= mh) break;
        const st = tw[my * mw + mx];
        if (!st || st.length <= best) continue;
        const perp = Math.max(0.02, side === 0 ? sdx - dx : sdy - dy);
        let wx = side === 0 ? py + perp * ry : px + perp * rx; wx -= Math.floor(wx);
        let tx = (wx * TS) | 0;
        if ((side === 0 && rx < 0) || (side === 1 && ry > 0)) tx = TS - 1 - tx;
        HP[n] = perp; HT[n] = tx; HS[n] = st; HD[n] = side; n++;
        best = st.length;
        if (best >= maxH || n >= 4) break;
      }
      if (!n) { zbuf[x] = 1e9; continue; }
      zbuf[x] = HP[0];
      for (let j = n - 1; j >= 0; j--) {
        const perp = HP[j], tx = HT[j], st = HS[j], ns = st.length;
        const lh = H / perp, bot = half + lh / 2, top = bot - ns * lh;
        const f0 = 1 / (1 + perp * perp * k), f = f0 * (HD[j] ? 0.72 : 1), fi = 1 - f0, fr = fogR * fi, fg = fogG * fi, fb = fogB * fi;
        const ys = Math.max(0, Math.ceil(top)), ye = Math.min(H, Math.floor(bot)), sc = TS / lh;
        for (let y = ys; y < ye; y++) {
          const up = bot - y;
          let u = (up / lh) | 0; if (u >= ns) u = ns - 1;
          let row = TS - (((up - u * lh) * sc) | 0); if (row > 63) row = 63; else if (row < 0) row = 0;
          const p = st[u][row * TS + tx];
          if ((p >>> 24) < 128) continue;
          buf[y * W + x] = 0xff000000 | (((p >> 16 & 255) * f + fb) << 16) | (((p >> 8 & 255) * f + fg) << 8) | ((p & 255) * f + fr);
        }
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
