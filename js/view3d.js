'use strict';
/* ============================================================
   First-person view: textured raycaster with floor/ceiling
   casting, distance fog, billboards and procedural textures.
   Renders only on demand, so it costs nothing while idle.
   ============================================================ */
const View3D = (() => {
  // W x H: render size (W follows the shape of the view on the page; the vertical field of view stays the same). TS: the 64-unit grid textures are designed on. TR: the resolution they are painted at.
  const H = 800, W0 = 1280, FOV = 0.66, TS = 64, TR = 256, MIPS = 4;
  let cv, ctx, img, buf;
  let W = W0, FV = FOV, zbuf = new Float32Array(W), SKYU = new Int32Array(W), FT = new Int32Array(W); // FT: the row where the floor comes out from under the nearest wall, per column
  const HP = new Float32Array(4), HW = new Float32Array(4), HS = new Array(4), HD = new Uint8Array(4); // ray hits per column
  const TEX = {};

  function lcg(seed) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; }
  /* Paint a texture with vector drawing on a 64-unit grid, at TR pixels a side, add fine grain, and
     build a chain of smaller copies (mipmaps) so distant surfaces do not shimmer. */
  let grainSeed = 1;
  function mkTex(fn) {
    const c = document.createElement('canvas'); c.width = c.height = TR;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.scale(TR / TS, TR / TS); fn(x); x.setTransform(1, 0, 0, 1, 0, 0);
    const id = x.getImageData(0, 0, TR, TR), d = id.data, r = lcg(7919 * grainSeed++);
    let opaque = true;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 255) opaque = false;
      if (!d[i + 3]) continue;
      const k = 0.955 + r() * 0.09;
      d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
    }
    x.putImageData(id, 0, 0);
    const mip = [new Uint32Array(d.buffer.slice(0))];
    let src = c;
    for (let l = 1, sz = TR >> 1; l < MIPS; l++, sz >>= 1) {
      const m = document.createElement('canvas'); m.width = m.height = sz;
      const g = m.getContext('2d', { willReadFrequently: true });
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, sz, sz);
      mip.push(new Uint32Array(g.getImageData(0, 0, sz, sz).data.buffer.slice(0)));
      src = m;
    }
    const t = mip[0]; t.mip = mip; t.opaque = opaque; // opaque: nothing shows through it
    return t;
  }
  function speckle(x, r, n, a) {
    for (let i = 0; i < n * 3; i++) { x.fillStyle = (r() < 0.5 ? 'rgba(0,0,0,' : 'rgba(255,255,255,') + (r() * a).toFixed(3) + ')'; const sz = 0.3 + r() * 1.2; x.fillRect(r() * TS, r() * TS, sz, sz * (0.6 + r() * 0.8)); }
  }
  function blocks(x, o) {
    const r = lcg(o.seed || 7);
    x.fillStyle = o.mortar; x.fillRect(0, 0, TS, TS);
    for (let row = 0; row * o.bh < TS; row++) {
      const off = (row % 2) * o.bw / 2;
      for (let col = -1; col * o.bw < TS; col++) {
        const bx = col * o.bw + off + 1, by = row * o.bh + 1, bw = o.bw - 2, bh = o.bh - 2;
        x.fillStyle = shade(o.base, (r() - 0.5) * (o.vary || 0.22));
        x.fillRect(bx, by, bw, bh);
        // each block is lit from above: a soft highlight along the top edge, shade gathering toward the bottom
        const g = x.createLinearGradient(0, by, 0, by + bh);
        g.addColorStop(0, 'rgba(255,255,255,.13)'); g.addColorStop(0.22, 'rgba(255,255,255,0)'); g.addColorStop(0.65, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.26)');
        x.fillStyle = g; x.fillRect(bx, by, bw, bh);
        x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(bx, by, 0.6, bh);
        x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(bx + bw - 0.6, by, 0.6, bh);
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
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const col = shade('#77736b', (r() - 0.5) * 0.3), rx = 3.3 + r() * 0.5, ry = 3 + r() * 0.5;
        for (const wrap of [0, -64]) { const cx = i * 8 + 4 + (j % 2) * 4 + wrap, cy = j * 8 + 4;
          x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(cx + 0.4, cy + 0.6, rx, ry, 0, 0, 6.3); x.fill();
          x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, 6.3); x.fill();
          x.fillStyle = 'rgba(255,255,255,.10)'; x.beginPath(); x.ellipse(cx - 0.8, cy - 0.9, rx * 0.55, ry * 0.45, 0, 0, 6.3); x.fill(); } }
      speckle(x, r, 200, 0.12); });
    TEX.grass = mkTex(x => { const r = lcg(53); x.fillStyle = '#3d5a2f'; x.fillRect(0, 0, TS, TS);
      for (let i = 0; i < 40; i++) { x.fillStyle = shade('#3d5a2f', (r() - 0.5) * 0.22); x.beginPath(); x.ellipse(r() * 64, r() * 64, 5 + r() * 9, 4 + r() * 6, 0, 0, 6.3); x.fill(); }
      for (let i = 0; i < 2600; i++) { x.fillStyle = shade('#3d5a2f', (r() - 0.5) * 0.5); x.fillRect(r() * 64, r() * 64, 0.4, 1.2 + r() * 2.2); }
      for (let i = 0; i < 26; i++) { x.fillStyle = ['#e8e2b0', '#d9c8e8', '#e6d06a'][i % 3]; x.fillRect(r() * 64, r() * 64, 0.7, 0.7); } });
    TEX.flag = mkTex(x => blocks(x, { base: '#6a6358', mortar: '#26221c', bw: 32, bh: 32, seed: 61, vary: 0.18 }));
    TEX.cryptfloor = mkTex(x => { blocks(x, { base: '#434957', mortar: '#14161c', bw: 32, bh: 32, seed: 67, vary: 0.2 }); x.strokeStyle = 'rgba(0,0,0,.5)'; x.beginPath(); x.moveTo(5, 8); x.lineTo(14, 17); x.lineTo(11, 27); x.moveTo(40, 38); x.lineTo(52, 47); x.lineTo(58, 44); x.stroke(); });
    TEX.vault = mkTex(x => blocks(x, { base: '#3f3a33', mortar: '#15120e', bw: 32, bh: 16, seed: 71, vary: 0.15 }));
    // natural rock: overlapping blotches and cracks rather than masonry
    const rock = (x, base, seed, n) => { const r = lcg(seed); x.fillStyle = base; x.fillRect(0, 0, TS, TS);
      for (let i = 0; i < n; i++) { x.fillStyle = shade(base, (r() - 0.5) * 0.45); x.beginPath(); const cx = r() * 64, cy = r() * 64, rr = 5 + r() * 12; x.moveTo(cx + rr, cy); for (let a = 1; a < 7; a++) x.lineTo(cx + Math.cos(a) * rr * (0.6 + r() * 0.5), cy + Math.sin(a) * rr * (0.6 + r() * 0.5)); x.closePath(); x.fill(); }
      x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 1; for (let i = 0; i < 5; i++) { x.beginPath(); let px = r() * 64, py = r() * 64; x.moveTo(px, py); for (let j = 0; j < 3; j++) { px += (r() - 0.5) * 18; py += r() * 14; x.lineTo(px, py); } x.stroke(); }
      speckle(x, r, 600, 0.16); };
    TEX.cave = mkTex(x => rock(x, '#5e564c', 211, 34));
    TEX.mine = mkTex(x => { rock(x, '#5a5249', 223, 30); box(x, '#4a3422', 4, 0, 7, 64); box(x, '#4a3422', 53, 0, 7, 64); box(x, '#5a4029', 0, 2, 64, 7); box(x, 'rgba(0,0,0,.35)', 0, 9, 64, 2); box(x, 'rgba(255,255,255,.08)', 5, 0, 2, 64); });
    TEX.cavefloor = mkTex(x => rock(x, '#3e3934', 227, 40));
    TEX.barrow = mkTex(x => { blocks(x, { base: '#6f6656', mortar: '#2b2620', bw: 13, bh: 6, seed: 229, vary: 0.35, speck: 300 }); const r = lcg(233); for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(40,30,20,' + (0.2 + r() * 0.3) + ')'; x.fillRect(r() * 64 | 0, r() * 64 | 0, 2 + r() * 5 | 0, 2); } });
    TEX.keep = mkTex(x => { blocks(x, { base: '#4a5054', mortar: '#1b1e20', bw: 32, bh: 21, seed: 239, vary: 0.12 }); const r = lcg(241); for (let i = 0; i < 9; i++) { const sx = r() * 64; const g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(20,40,40,0)'); g.addColorStop(1, 'rgba(30,60,55,.45)'); x.fillStyle = g; x.fillRect(sx, r() * 30, 2 + r() * 3, 64); } });
    TEX.keepfloor = mkTex(x => { blocks(x, { base: '#3b4144', mortar: '#151819', bw: 32, bh: 32, seed: 251, vary: 0.15 }); const r = lcg(257); for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(80,110,120,.22)'; x.beginPath(); x.ellipse(r() * 64, r() * 64, 6 + r() * 9, 3 + r() * 4, 0, 0, 6.3); x.fill(); } });
    TEX.dirt = mkTex(x => { const r = lcg(263); x.fillStyle = '#4e4232'; x.fillRect(0, 0, TS, TS); for (let i = 0; i < 2200; i++) { x.fillStyle = shade('#4e4232', (r() - 0.5) * 0.5); const sz = 0.4 + r() * 1.6; x.fillRect(r() * 64, r() * 64, sz, sz); } for (let i = 0; i < 25; i++) { x.fillStyle = shade('#77705f', (r() - 0.5) * 0.3); x.beginPath(); x.ellipse(r() * 64, r() * 64, 1.5 + r() * 2, 1 + r(), 0, 0, 6.3); x.fill(); } });
    TEX.ruin = mkTex(x => { blocks(x, { base: '#6b6a62', mortar: '#2f302c', bw: 24, bh: 14, seed: 269, vary: 0.3 }); const r = lcg(271); for (let i = 0; i < 90; i++) { const yy = 64 - r() * r() * 50; x.fillStyle = shade('#4a6a34', (r() - 0.5) * 0.4); x.beginPath(); x.arc(r() * 64, yy, 1.5 + r() * 2.5, 0, 6.3); x.fill(); } line(x, '#1e1d1a', 1.5, [40, 0, 36, 18, 44, 30, 39, 64]); });
    // billboards (transparent background)
    TEX.tree = mkTex(x => {
      x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(32, 62, 17, 2.2, 0, 0, 6.3); x.fill();
      const tg = x.createLinearGradient(26, 0, 38, 0); tg.addColorStop(0, '#5d4229'); tg.addColorStop(0.45, '#4a3320'); tg.addColorStop(1, '#2c1d12');
      x.fillStyle = tg; x.beginPath(); x.moveTo(26, 63); x.quadraticCurveTo(29.5, 50, 28.5, 32); x.lineTo(35.5, 32); x.quadraticCurveTo(34.5, 50, 38.5, 63); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 0.5; for (const bx of [30, 32.5, 34.5]) { x.beginPath(); x.moveTo(bx, 34); x.lineTo(bx + 0.6, 60); x.stroke(); }
      x.strokeStyle = '#4a3320'; x.lineWidth = 2.2; x.lineCap = 'round'; x.beginPath(); x.moveTo(31, 38); x.lineTo(22, 28); x.moveTo(33, 37); x.lineTo(43, 27); x.stroke();
      // foliage: dark clumps underneath and behind, lighter ones toward the upper left where the light falls
      const r = lcg(81);
      for (let i = 0; i < 90; i++) {
        const a = r() * 6.3, d = Math.sqrt(r()), cx = 32 + Math.cos(a) * d * 19, cy = 22 + Math.sin(a) * d * 15, lit = (32 - cx) * 0.012 + (22 - cy) * 0.022 + (i / 90) * 0.3 - 0.25;
        x.fillStyle = shade('#2f6b34', lit + (r() - 0.5) * 0.22); x.beginPath(); x.arc(cx, cy, 2.6 + r() * 3.6, 0, 6.3); x.fill();
      }
      for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(190,230,140,' + (0.1 + r() * 0.2).toFixed(2) + ')'; x.beginPath(); x.arc(15 + r() * 28, 7 + r() * 20, 0.5 + r() * 0.8, 0, 6.3); x.fill(); } });
    TEX.fountain = mkTex(x => { x.fillStyle = '#8b8f97'; x.beginPath(); x.ellipse(32, 54, 26, 8, 0, 0, 6.3); x.fill(); x.fillStyle = '#3f7fbf'; x.beginPath(); x.ellipse(32, 52, 22, 5.5, 0, 0, 6.3); x.fill();
      x.fillStyle = '#9a9ea6'; x.fillRect(29, 26, 6, 27); x.beginPath(); x.ellipse(32, 27, 11, 3.5, 0, 0, 6.3); x.fill();
      x.strokeStyle = '#9fd0ff'; x.lineWidth = 1.6; for (const d of [-1, 1]) { x.beginPath(); x.moveTo(32, 24); x.quadraticCurveTo(32 + d * 12, 14, 32 + d * 15, 50); x.stroke(); } });
    TEX.chest = mkTex(x => {
      x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.ellipse(32, 61.5, 21, 2.6, 0, 0, 6.3); x.fill();
      // body: planks with a dark outline
      x.fillStyle = '#1a120b'; x.fillRect(14.5, 45, 35, 17);
      const r = lcg(97);
      for (let i = 0; i < 4; i++) { x.fillStyle = shade('#7a4f28', (r() - 0.5) * 0.16); x.fillRect(15.5, 46 + i * 3.75, 33, 3.4); }
      const sg = x.createLinearGradient(15, 0, 49, 0); sg.addColorStop(0, 'rgba(255,255,255,.10)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.32)'); x.fillStyle = sg; x.fillRect(15.5, 46, 33, 15);
      // domed lid
      x.fillStyle = '#1a120b'; x.beginPath(); x.moveTo(14.5, 46); x.quadraticCurveTo(32, 29, 49.5, 46); x.closePath(); x.fill();
      const lg = x.createLinearGradient(0, 33, 0, 46); lg.addColorStop(0, '#9a6a3a'); lg.addColorStop(1, '#6a4322'); x.fillStyle = lg;
      x.beginPath(); x.moveTo(16, 45.5); x.quadraticCurveTo(32, 31, 48, 45.5); x.closePath(); x.fill();
      // brass bands, rivets and lock plate
      const brass = x.createLinearGradient(0, 36, 0, 61); brass.addColorStop(0, '#f0d266'); brass.addColorStop(1, '#a8842a'); x.fillStyle = brass;
      x.fillRect(15.5, 44.6, 33, 1.8); x.fillRect(20.5, 39.5, 3, 21.5); x.fillRect(40.5, 39.5, 3, 21.5);
      x.fillStyle = '#6e5518'; for (const bx of [22, 42]) for (const by of [42, 50, 58]) { x.beginPath(); x.arc(bx, by, 0.6, 0, 6.3); x.fill(); }
      x.fillStyle = brass; x.fillRect(29.5, 45, 5, 6.5); x.fillStyle = '#1a120b'; x.beginPath(); x.arc(32, 47.6, 0.9, 0, 6.3); x.fill(); x.fillRect(31.6, 47.6, 0.8, 2.2); });
    // dropped gear: a tied sack, a blade and a few coins lying on the floor
    TEX.loot = mkTex(x => {
      x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.ellipse(32, 60, 20, 3.5, 0, 0, 6.3); x.fill();
      x.strokeStyle = '#b9c0c8'; x.lineWidth = 2; x.beginPath(); x.moveTo(12, 59); x.lineTo(40, 55); x.stroke();
      x.strokeStyle = '#6b4a22'; x.lineWidth = 3; x.beginPath(); x.moveTo(40, 55); x.lineTo(47, 54); x.stroke();
      x.fillStyle = '#7d6440'; x.beginPath(); x.moveTo(24, 59); x.quadraticCurveTo(18, 46, 28, 43); x.lineTo(36, 43); x.quadraticCurveTo(46, 46, 40, 59); x.closePath(); x.fill();
      x.fillStyle = '#5e4a2e'; x.fillRect(27, 41, 10, 3); x.fillStyle = '#93784e'; x.fillRect(29, 37, 6, 4);
      x.fillStyle = '#d4af37'; for (const [cx, cy] of [[44, 59], [48, 58], [20, 60]]) { x.beginPath(); x.ellipse(cx, cy, 2.5, 1.3, 0, 0, 6.3); x.fill(); } });
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
    // --- general store: whitewashed planks, striped awning, crates and sacks out front
    const stoW = x => { const r = lcg(281); for (let yy = 0; yy < TS; yy += 7) { box(x, shade('#d9d2c0', (r() - 0.5) * 0.12), 0, yy, TS, 7); box(x, 'rgba(0,0,0,.18)', 0, yy + 6, TS, 1); } speckle(x, r, 200, 0.08); box(x, '#5a4630', 0, 0, 4, TS); box(x, '#5a4630', 60, 0, 4, TS); };
    const awning = (x, y) => { for (let i = 0; i < 8; i++) box(x, i % 2 ? '#f0ece0' : '#2f7a4a', i * 8, y, 8, 9); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f0ece0' : '#2f7a4a'; x.beginPath(); x.arc(i * 8 + 4, y + 9, 4, 0, Math.PI); x.fill(); } box(x, 'rgba(0,0,0,.25)', 0, y + 13, TS, 3); };
    const crates = x => { box(x, '#8a6a3c', 8, 46, 16, 16); line(x, '#5a4428', 1.5, [8, 46, 24, 62]); line(x, '#5a4428', 1.5, [24, 46, 8, 62]); x.fillStyle = '#b89a6a'; x.beginPath(); x.ellipse(42, 56, 9, 7, 0, 0, 6.3); x.fill(); x.fillStyle = '#9a7e52'; x.beginPath(); x.ellipse(42, 49, 4, 2.5, 0, 0, 6.3); x.fill(); };
    FAC.store = {
      lower: [T(x => { stoW(x); awning(x, 6); win(x, 18, 24, 28, 16, { lit: true }); crates(x); }), T(x => { stoW(x); awning(x, 6); crates(x); }), T(x => stoW(x))],
      upper: [T(x => gable(x, '#6b5a3a', () => { stoW(x); win(x, 26, 34, 12, 12, { lit: false, shutters: '#2f7a4a' }); }))],
      door: T(x => { stoW(x); awning(x, 2); door(x, { wood: '#2f7a4a' }); }),
    };
    FAC.gate = { lower: [TEX.gate], upper: [T(x => { wallW(x); crenels(x); for (const bx of [8, 44]) { x.fillStyle = '#8a1f24'; x.beginPath(); x.moveTo(bx, 14); x.lineTo(bx + 12, 14); x.lineTo(bx + 12, 54); x.lineTo(bx + 6, 48); x.lineTo(bx, 54); x.closePath(); x.fill(); box(x, '#d4af37', bx + 4, 24, 4, 12); } })] };
  }

  function init(canvas) {
    cv = canvas; cv.width = W; cv.height = H;
    ctx = cv.getContext('2d');
    img = ctx.createImageData(W, H);
    buf = new Uint32Array(img.data.buffer);
    buildTextures();
  }
  /* match the picture's width to the box it is shown in */
  function fit() {
    const w = fitWidth(cv, H, W0);
    if (!w || w === W) return;
    W = w; FV = FOV * W / W0; cv.width = W;
    img = ctx.createImageData(W, H); buf = new Uint32Array(img.data.buffer);
    zbuf = new Float32Array(W); SKYU = new Int32Array(W); FT = new Int32Array(W);
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
    // which sides of each open square touch a wall (1 north, 2 east, 4 south, 8 west), for contact shadows
    M.ao = new Uint8Array(w * h);
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && M.tw[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!M.tw[y * w + x]) M.ao[y * w + x] = (solid(x, y - 1) ? 1 : 0) | (solid(x + 1, y) ? 2 : 0) | (solid(x, y + 1) ? 4 : 0) | (solid(x - 1, y) ? 8 : 0);
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

  /* The outdoor sky is painted once as a full-circle panorama (dusk gradient, stars, lit clouds,
     two ranges of hills) and scrolled by the view angle. */
  const PW = 4096, HALF = H >> 1;
  let PAN = null;
  function buildSky() {
    const c = document.createElement('canvas'); c.width = PW; c.height = HALF;
    const g = c.getContext('2d', { willReadFrequently: true });
    const gr = g.createLinearGradient(0, 0, 0, HALF);
    gr.addColorStop(0, '#0c1230'); gr.addColorStop(0.4, '#262a5e'); gr.addColorStop(0.66, '#6b4470'); gr.addColorStop(0.84, '#c8744e'); gr.addColorStop(1, '#f2b068');
    g.fillStyle = gr; g.fillRect(0, 0, PW, HALF);
    const r = lcg(911);
    for (let i = 0; i < 700; i++) { const y = r() * r() * HALF * 0.62, a = (1 - y / (HALF * 0.62)) * (0.25 + r() * 0.75), sz = 0.8 + r() * 1.6; g.fillStyle = 'rgba(255,' + (235 + r() * 20 | 0) + ',' + (200 + r() * 55 | 0) + ',' + a.toFixed(2) + ')'; g.fillRect(r() * PW, y, sz, sz); }
    // the last light of the sun, low in the west
    const sunX = PW * 0.62;
    for (const dx of [-PW, 0, PW]) {
      const sg = g.createRadialGradient(sunX + dx, HALF + 10, 10, sunX + dx, HALF + 10, 620);
      sg.addColorStop(0, 'rgba(255,236,170,.85)'); sg.addColorStop(0.18, 'rgba(255,190,110,.45)'); sg.addColorStop(1, 'rgba(255,150,90,0)');
      g.fillStyle = sg; g.fillRect(sunX + dx - 640, 0, 1280, HALF);
    }
    // long flat clouds, dark above and lit from below
    for (let i = 0; i < 54; i++) {
      const cx = r() * PW, cy = HALF * (0.3 + r() * 0.52), rx = 70 + r() * 230, ry = 5 + r() * 13, near = 1 - Math.min(1, Math.abs(((cx - sunX + PW * 1.5) % PW) - PW / 2) / (PW / 2));
      for (const dx of [-PW, 0, PW]) for (let j = 0; j < 5; j++) {
        const ox = (j - 2) * rx * 0.3, oy = (j % 2) * ry * 0.5 - ry * 0.25, sx = rx * (0.5 + (j % 3) * 0.2);
        g.fillStyle = 'rgba(255,' + (150 + near * 50 | 0) + ',' + (100 + near * 30 | 0) + ',' + (0.10 + near * 0.16).toFixed(2) + ')'; g.beginPath(); g.ellipse(cx + dx + ox, cy + oy + ry * 0.45, sx, ry * 0.8, 0, 0, 6.3); g.fill();
        g.fillStyle = 'rgba(52,40,84,.26)'; g.beginPath(); g.ellipse(cx + dx + ox, cy + oy, sx, ry, 0, 0, 6.3); g.fill();
      }
    }
    // far range, hazy; then the near hills in silhouette
    const ridge = (col, fn) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, HALF); for (let x = 0; x <= PW; x += 2) g.lineTo(x, HALF - fn(x / PW * Math.PI * 2)); g.lineTo(PW, HALF); g.closePath(); g.fill(); };
    ridge('#5a4468', a => 62 + 30 * Math.sin(a * 2 + 0.5) + 20 * Math.sin(a * 5 + 2) + 11 * Math.sin(a * 11) + 5 * Math.sin(a * 23 + 1) + 3 * Math.sin(a * 47));
    const hz = g.createLinearGradient(0, HALF - 70, 0, HALF); hz.addColorStop(0, 'rgba(255,170,120,0)'); hz.addColorStop(1, 'rgba(255,170,120,.30)'); g.fillStyle = hz; g.fillRect(0, HALF - 70, PW, 70);
    ridge('#33262c', a => 40 + 26 * Math.sin(a * 3) + 16 * Math.sin(a * 7 + 1) + 8 * Math.sin(a * 13 + 2) + 3 * Math.sin(a * 29 + 0.7));
    PAN = new Uint32Array(g.getImageData(0, 0, PW, HALF).data.buffer.slice(0));
  }

  const mipFor = tpp => tpp < 1.5 ? 0 : tpp < 3 ? 1 : tpp < 6 ? 2 : 3; // texels per screen pixel -> mip level
  const AOR = 0.3; // reach of the contact shadow where floor meets wall, in squares

  /* Draw the view. `moving` marks a frame of a step or turn. On a device too slow to draw those sharp in time
     they are drawn at a half, a third or a quarter of the size and scaled up, so that movement stays smooth;
     the caller draws a sharp frame once the company stands still (see `coarse`). The size is chosen when a
     movement starts and kept until the next still frame. */
  const BUDGET = 24; // ms a moving frame may take
  let cost = 0, scale = 1, latched = false, coarse = false; // cost: ms a full-size frame takes on this device
  const LOW = {}; // the small pictures coarse frames are drawn on, by scale
  function surface(s) {
    const w = Math.max(2, (W / s) | 0), hh = ((H / s) | 0) & ~1;
    let L = LOW[s];
    if (!L || L.w !== w) {
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      const x = c.getContext('2d'), im = x.createImageData(w, hh);
      L = LOW[s] = { cv: c, ctx: x, img: im, buf: new Uint32Array(im.data.buffer), w, h: hh };
    }
    return L;
  }
  function render(cam, M, sprites, moving) {
    fit();
    if (!moving) { scale = 1; latched = false; }
    else if (!latched) { latched = true; scale = cost <= BUDGET ? 1 : cost <= BUDGET * 4 ? 2 : cost <= BUDGET * 9 ? 3 : 4; }
    let t0 = 0;
    if (scale === 1) {
      if (!cost) paint(cam, M, sprites, W, H, buf); // the very first frame is slow on any device, so it is painted twice and the second one timed
      t0 = performance.now();
      paint(cam, M, sprites, W, H, buf); ctx.putImageData(img, 0, 0);
    } else {
      const L = surface(scale);
      paint(cam, M, sprites, L.w, L.h, L.buf); L.ctx.putImageData(L.img, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(L.cv, 0, 0, W, H);
    }
    coarse = scale > 1;
    if (!coarse) { // only full-size frames are timed; a quick one counts for more, so one slow frame does not blur the next walk
      const t = performance.now() - t0;
      cost = !cost ? t : t < cost ? cost * 0.3 + t * 0.7 : cost * 0.75 + t * 0.25;
    }
  }
  /* Walk one ray across the map, past low walls to find the taller ones behind.
     Fills HP, HW, HS and HD, nearest wall first, and returns how many were found. */
  function cast(M, px, py, rx, ry) {
    const mw = M.w, mh = M.h, tw = M.tw, maxH = M.maxH;
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
      if ((side === 0 && rx < 0) || (side === 1 && ry > 0)) wx = 1 - wx;
      HP[n] = perp; HW[n] = wx; HS[n] = st; HD[n] = side; n++;
      best = st.length;
      if (best >= maxH || n >= 4) break;
    }
    return n;
  }
  /* paint one frame, W x H pixels, into buf */
  function paint(cam, M, sprites, W, H, buf) {
    const ca = Math.cos(cam.a), sa = Math.sin(cam.a), px = cam.x, py = cam.y, plx = -sa * FV, ply = ca * FV;
    const half = H >> 1, mw = M.w, mh = M.h, out = M.outdoor;
    const fogR = out ? 70 : 4, fogG = out ? 62 : 3, fogB = out ? 78 : 6, k = out ? 0.014 : 0.075;
    const ftex = M.floor, gtex = TEX.grass, ctex = M.ceil, fl = M.fl, ao = M.ao, aoK = out ? 0.36 : 0.5;

    // --- sky ---
    if (out) {
      if (!PAN) buildSky();
      const tau = Math.PI * 2;
      for (let x = 0; x < W; x++) { let u = (cam.a + Math.atan((2 * x / W - 1) * FV)) / tau; u -= Math.floor(u); SKYU[x] = (u * PW) | 0; }
      for (let y = 0; y < half; y++) { const o = y * W, po = ((y * HALF / half) | 0) * PW; for (let x = 0; x < W; x++) buf[o + x] = PAN[po + SKYU[x]]; }
    }
    // --- where each column's nearest wall stands: the floor and ceiling behind a solid wall need no drawing ---
    let fy0 = H;
    for (let x = 0; x < W; x++) {
      const camX = 2 * x / W - 1, n = cast(M, px, py, ca + plx * camX, sa + ply * camX);
      let ft = half;
      if (!n) zbuf[x] = 1e9;
      else {
        zbuf[x] = HP[0];
        const st = HS[0];
        let solid = st[0].opaque;
        if (!out) for (let i = 1; i < st.length; i++) solid = solid && st[i].opaque;
        if (solid) ft = Math.min(H, Math.floor(half + H / HP[0] / 2));
      }
      FT[x] = ft; if (ft < fy0) fy0 = ft;
    }
    // --- floor and ceiling ---
    for (let y = fy0; y < H; y++) {
      const rowD = half / (y - half + 0.5);
      const f = 1 / (1 + rowD * rowD * k), fi = 1 - f, fr = fogR * fi, fg = fogG * fi, fb = fogB * fi;
      const stepX = rowD * 2 * plx / W, stepY = rowD * 2 * ply / W;
      let fx = px + rowD * (ca - plx), fy = py + rowD * (sa - ply);
      const lv = mipFor(rowD * 2 * FV / W * TR), ts = TR >> lv, tm = ts - 1;
      const fT = ftex.mip[lv], gT = gtex.mip[lv], cT = ctex.mip[lv];
      const o = y * W, o2 = (H - 1 - y) * W;
      for (let x = 0; x < W; x++, fx += stepX, fy += stepY) {
        if (y < FT[x]) continue;
        const cx = Math.floor(fx), cy = Math.floor(fy), u = fx - cx, v = fy - cy;
        const ti = (((v * ts) & tm) * ts) + ((u * ts) & tm);
        let tex = fT, sh = f;
        if (cx >= 0 && cy >= 0 && cx < mw && cy < mh) {
          const ci = cy * mw + cx, m = ao[ci];
          if (fl[ci]) tex = gT;
          if (m) { // darken the floor (and ceiling) close to a wall
            let d = 1;
            if ((m & 1) && v < d) d = v;
            if ((m & 2) && 1 - u < d) d = 1 - u;
            if ((m & 4) && 1 - v < d) d = 1 - v;
            if ((m & 8) && u < d) d = u;
            if (d < AOR) { d = 1 - d / AOR; sh = f * (1 - aoK * d * d); }
          }
        }
        let p = tex[ti];
        buf[o + x] = 0xff000000 | (((p >> 16 & 255) * sh + fb) << 16) | (((p >> 8 & 255) * sh + fg) << 8) | ((p & 255) * sh + fr);
        if (!out) { p = cT[ti]; const fc = sh * 0.8; buf[o2 + x] = 0xff000000 | (((p >> 16 & 255) * fc + fb) << 16) | (((p >> 8 & 255) * fc + fg) << 8) | ((p & 255) * fc + fr); }
      }
    }
    // --- walls, painted far to near ---
    for (let x = 0; x < W; x++) {
      const camX = 2 * x / W - 1, n = cast(M, px, py, ca + plx * camX, sa + ply * camX);
      for (let j = n - 1; j >= 0; j--) {
        const perp = HP[j], st = HS[j], ns = st.length;
        const lh = H / perp, bot = half + lh / 2, top = bot - ns * lh;
        const lv = mipFor(TR / lh), ts = TR >> lv, tm = ts - 1;
        let tx = (HW[j] * ts) | 0; if (tx > tm) tx = tm;
        const t0 = st[0].mip[lv], t1 = ns > 1 ? st[1].mip[lv] : t0, t2 = ns > 2 ? st[2].mip[lv] : t1;
        // light falls off with distance; walls facing east/west are a little darker
        const f0 = 1 / (1 + perp * perp * k), f = f0 * (HD[j] ? 0.72 : 1), fi = 1 - f0, fr = fogR * fi, fg = fogG * fi, fb = fogB * fi;
        const ys = Math.max(0, Math.ceil(top)), ye = Math.min(H, Math.floor(bot)), sc = ts / lh, il = 1 / lh;
        for (let y = ys; y < ye; y++) {
          const up = bot - y;
          let u = (up * il) | 0; if (u >= ns) u = ns - 1;
          const vf = up * il - u; // 0 at the foot of this storey, 1 at its top
          let row = tm - ((vf * ts) | 0); if (row > tm) row = tm; else if (row < 0) row = 0;
          const p = (u === 0 ? t0 : u === 1 ? t1 : t2)[row * ts + tx];
          if ((p >>> 24) < 128) continue;
          let sh = f;
          if (u === 0 && vf < 0.16) { const d = 1 - vf / 0.16; sh = f * (1 - 0.42 * d * d); }
          else if (!out && vf > 0.86) { const d = (vf - 0.86) / 0.14; sh = f * (1 - 0.34 * d * d); }
          buf[y * W + x] = 0xff000000 | (((p >> 16 & 255) * sh + fb) << 16) | (((p >> 8 & 255) * sh + fg) << 8) | ((p & 255) * sh + fr);
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
        const ys = Math.max(0, Math.ceil(y0)), ye = Math.min(H, Math.floor(y0 + size));
        const lv = mipFor(TR / size), ts = TR >> lv, tm = ts - 1, st = ts / size, tex = s.tex.mip[lv];
        for (let x = xs; x < xe; x++) {
          if (zbuf[x] < s.tY) continue;
          let tx = ((x - x0) * st) | 0; if (tx > tm) tx = tm;
          for (let y = ys; y < ye; y++) {
            let ty = ((y - y0) * st) | 0; if (ty > tm) ty = tm;
            const p = tex[ty * ts + tx], a = p >>> 24;
            if (a < 10) continue;
            let r = (p & 255) * f + fr, g = (p >> 8 & 255) * f + fg, b = (p >> 16 & 255) * f + fb;
            if (a < 246) { // soft edges and shadows blend with what is behind
              const q = buf[y * W + x], aa = a / 255, ia = 1 - aa;
              r = r * aa + (q & 255) * ia; g = g * aa + (q >> 8 & 255) * ia; b = b * aa + (q >> 16 & 255) * ia;
            }
            buf[y * W + x] = 0xff000000 | (b << 16) | (g << 8) | r;
          }
        }
      }
    }
  }
  /* Draw the explored part of a map: the corner minimap, and (with o.big) the full-page map.
     o.marks: [{x, y, kind: 'loot' | 'chest'}], o.locCol: colours for building doors by map character.
     Returns the layout so callers can add labels or turn a mouse position back into a square. */
  const MAPCOL = { wall: '#454a58', floor: '#8d8474', door: '#c8923c', lock: '#c0392b', gate: '#7b808c', grass: '#3f5a3a', tree: '#27502a', water: '#3f7fbf', stairs: '#58c4dd', loot: '#ff9cf0', chest: '#e3b54a', you: '#ffd24a' };
  function minimap(canvas, M, explored, px, py, dir, o) {
    o = o || {};
    const c = canvas.getContext('2d'), pad = o.pad || 0;
    const cs = Math.max(2, Math.floor(Math.min((canvas.width - pad * 2) / M.w, (canvas.height - pad * 2) / M.h)));
    const ox = (canvas.width - cs * M.w) >> 1, oy = (canvas.height - cs * M.h) >> 1, big = !!o.big;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#0b0c11'; c.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
      if (!explored[y * M.w + x]) continue;
      const code = M.c[y * M.w + x], ch = String.fromCharCode(code), X0 = ox + x * cs, Y0 = oy + y * cs;
      let col = MAPCOL.floor;
      if (ch >= '1' && ch <= '9') col = (o.locCol && o.locCol[ch]) || MAPCOL.door;
      else if (M.wt[code]) col = ch === 'D' ? MAPCOL.door : ch === 'L' ? MAPCOL.lock : ch === 'G' ? MAPCOL.gate : MAPCOL.wall;
      else if (ch === ',') col = MAPCOL.grass; else if (ch === 'T') col = MAPCOL.tree; else if (ch === 'F') col = MAPCOL.water;
      else if (ch === '<' || ch === '>') col = MAPCOL.stairs;
      c.fillStyle = col; c.fillRect(X0, Y0, cs, cs);
      if (!big) continue;
      // on the large map, give squares a little depth and draw what stands on them
      c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(X0, Y0, cs, 2); c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(X0, Y0 + cs - 2, cs, 2); c.fillRect(X0 + cs - 1, Y0, 1, cs);
      const mx = X0 + cs / 2, my = Y0 + cs / 2;
      if (ch === 'T') { c.fillStyle = '#3c7a40'; c.beginPath(); c.arc(mx, my, cs * 0.34, 0, 6.3); c.fill(); c.fillStyle = 'rgba(190,230,140,.25)'; c.beginPath(); c.arc(mx - cs * 0.1, my - cs * 0.1, cs * 0.16, 0, 6.3); c.fill(); }
      else if (ch === 'F') { c.fillStyle = '#9fd0ff'; c.beginPath(); c.arc(mx, my, cs * 0.2, 0, 6.3); c.fill(); }
      else if (ch === '<' || ch === '>') { c.fillStyle = '#0b2530'; c.beginPath(); const s = cs * 0.26, d = ch === '<' ? -1 : 1; c.moveTo(mx - s, my - s * 0.7 * d); c.lineTo(mx + s, my - s * 0.7 * d); c.lineTo(mx, my + s * 0.9 * d); c.closePath(); c.fill(); }
      else if (ch === 'D' || ch === 'L' || (ch >= '1' && ch <= '9')) { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(mx - cs * 0.16, my - cs * 0.24, cs * 0.32, cs * 0.5); c.fillStyle = ch === 'L' ? '#ffd24a' : 'rgba(255,255,255,.75)'; c.beginPath(); c.arc(mx + cs * 0.07, my + cs * 0.02, Math.max(1.5, cs * 0.045), 0, 6.3); c.fill(); }
    }
    for (const m of o.marks || []) {
      if (!explored[m.y * M.w + m.x]) continue;
      const mx = ox + (m.x + 0.5) * cs, my = oy + (m.y + 0.5) * cs;
      if (m.kind === 'chest') {
        const s = big ? cs * 0.3 : Math.max(2, cs * 0.34);
        c.fillStyle = '#2a1a0c'; c.fillRect(mx - s - 1, my - s * 0.75 - 1, s * 2 + 2, s * 1.5 + 2);
        c.fillStyle = '#8a5a2c'; c.fillRect(mx - s, my - s * 0.75, s * 2, s * 1.5);
        c.fillStyle = MAPCOL.chest; c.fillRect(mx - s, my - s * 0.2, s * 2, Math.max(1, s * 0.3)); c.fillRect(mx - s * 0.2, my - s * 0.2, s * 0.4, s * 0.6);
      } else {
        const s = big ? cs * 0.2 : Math.max(2, cs * 0.3);
        c.fillStyle = '#3a1030'; c.beginPath(); c.arc(mx, my, s + 1.5, 0, 6.3); c.fill();
        c.fillStyle = MAPCOL.loot; c.beginPath(); c.arc(mx, my, s, 0, 6.3); c.fill();
      }
    }
    const cx = ox + (px + 0.5) * cs, cy = oy + (py + 0.5) * cs, a = (dir - 1) * Math.PI / 2, k = big ? 0.62 : 1;
    c.save(); c.translate(cx, cy); c.rotate(a); c.fillStyle = MAPCOL.you; c.strokeStyle = '#000'; c.lineWidth = big ? 2.5 : 1.5; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(cs * 0.75 * k, 0); c.lineTo(-cs * 0.55 * k, -cs * 0.55 * k); c.lineTo(-cs * 0.2 * k, 0); c.lineTo(-cs * 0.55 * k, cs * 0.55 * k); c.closePath(); c.fill(); c.stroke(); c.restore();
    return (canvas._geo = { ox, oy, cs, w: M.w, h: M.h });
  }
  return { init, prepare, render, minimap, MAPCOL, get W() { return W; }, H, get coarse() { return coarse; }, get cost() { return cost; } };
})();
