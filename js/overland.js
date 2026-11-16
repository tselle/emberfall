'use strict';
/* ============================================================
   Overland travel. A painted top-down region map (drawn once
   into an offscreen bitmap, then blitted, so it is cheap to
   render), with travel time by terrain and movement rate,
   terrain-based random encounters, evasion and parley, and
   the sites of the Emberwild.
   ============================================================ */

/* cost multiplies travel time; enc is the chance of an encounter per hour of travel */
const TERRAIN = {
  '.': { name: 'Grassland', cost: 1, enc: 0.05, arena: 'plains', table: 'plains', col: '#6f8c48' },
  '=': { name: 'Road', cost: 0.5, enc: 0.035, arena: 'road', table: 'road', col: '#6f8c48' },
  '+': { name: 'Bridge', cost: 0.5, enc: 0.035, arena: 'road', table: 'road', col: '#6f8c48' },
  'T': { name: 'Forest', cost: 2, enc: 0.08, arena: 'forest', table: 'forest', col: '#3f5c31' },
  'n': { name: 'Hills', cost: 2, enc: 0.07, arena: 'hills', table: 'hills', col: '#8a8552' },
  '%': { name: 'Fen', cost: 3, enc: 0.09, arena: 'swamp', table: 'swamp', col: '#4f5b3b' },
  '^': { name: 'Mountains', block: true, col: '#77736a' },
  '~': { name: 'River', block: true, col: '#6f8c48' },
  site: { name: 'Grassland', cost: 1, enc: 0, arena: 'plains', table: 'plains', col: '#6f8c48' },
};

/* Wilderness encounter tables. w = weight; night/day restrict the entry. */
const WILD_ENC = {
  road: [
    { w: 3, mons: [['bandit', '1d4+2'], ['archer', '1d2']], parley: 'toll', text: 'Figures step out onto the road ahead, blades drawn. "Toll for the road, travelers. Everything you carry ought to cover it."' },
    { w: 2, mons: [['wolf', '1d3+1']], text: 'A wolf pack lopes out of the long grass and spreads to ring you in.' },
    { w: 2, friendly: 'merchant' },
    { w: 1, friendly: 'pilgrims', day: true },
    { w: 1, mons: [['orc', '1d4+2']], parley: 'pass', text: 'An orc patrol tramps along the road under a banner of a broken eye.' },
    { w: 2, night: true, mons: [['skeleton', '1d4+1']], text: 'Pale figures walk the road by moonlight, bones clicking with every step.' },
  ],
  plains: [
    { w: 3, mons: [['gnoll', '1d3+1'], ['hyena', '1d2']], parley: 'pass', text: 'High-pitched cackling carries over the grass. A Bloodmane hunting party has your scent!' },
    { w: 2, mons: [['wolf', '1d3+1']], text: 'Grey shapes rise from the grass. Wolves, and hungry ones.' },
    { w: 2, mons: [['goblin', '2d4'], ['slinger', '1d2']], parley: 'pass', text: 'A Redfang raiding band, laden with stolen chickens, runs straight into you.' },
    { w: 1, mons: [['orc', '1d4+2']], parley: 'pass', text: 'Orc scouts crest a rise and bellow at the sight of you.' },
    { w: 1, mons: [['bandit', '1d4+1'], ['archer', '1d2']], parley: 'toll', text: 'Riders without banners circle you at bow range. Bandits.' },
  ],
  forest: [
    { w: 3, mons: [['wolf', '1d4+1']], text: 'Eyes gleam between the trunks. The wolves have been pacing you for a while.' },
    { w: 2, mons: [['spider', '1d3+1']], text: 'Something drops from the canopy on a silken line. Then another!' },
    { w: 2, mons: [['bandit', '1d4+1'], ['archer', '1d3']], parley: 'toll', text: 'An arrow thunks into a tree beside you. "That was a warning," calls a voice from the brush.' },
    { w: 1, mons: [['goblin', '2d4'], ['slinger', '1d2']], parley: 'pass', text: 'Goblins squabbling over a snared deer look up as you push through the undergrowth.' },
    { w: 1, mons: [['ogre', 1], ['orc', '1d2']], text: 'Trees crack and sway. An ogre shoulders into the clearing, dragging a club the size of a man.' },
  ],
  hills: [
    { w: 3, mons: [['orc', '1d6+2']], parley: 'pass', text: 'Orcs boil out of a gully, drawn by the glint of your armor.' },
    { w: 2, mons: [['gnoll', '1d4+1']], parley: 'pass', text: 'Gnolls on a ridge line point and howl. They come loping down the slope.' },
    { w: 2, mons: [['hobgoblin', '1d4+2']], parley: 'pass', text: 'A disciplined file of hobgoblins blocks the pass between two hills.' },
    { w: 1, mons: [['ogre', 1]], text: 'A shape you took for a boulder stands up. It is an ogre, and it is grinning.' },
    { w: 1, mons: [['wolf', '1d3+1']], text: 'Wolves howl from the rocks above. The pack is hunting.' },
  ],
  swamp: [
    { w: 3, mons: [['zombie', '1d4+2']], text: 'Bloated dead rise out of the black water, weed hanging from their jaws.' },
    { w: 2, mons: [['ghoul', '1d2+1']], night: true, text: 'Hunched figures splash toward you through the reeds, mewling with hunger.' },
    { w: 2, mons: [['spider', '1d3']], text: 'The fen grass is thick with webs, and their makers are home.' },
    { w: 2, mons: [['cultist', '1d4+1'], ['adept', 1]], day: true, parley: 'pass', text: 'Grey-robed figures wade toward the drowned chapel. They see you and draw their maces.' },
    { w: 1, mons: [['skeleton', '1d4+2']], text: 'Skeletons in rotted mail stand up out of the mire.' },
  ],
};

const Over = (() => {
  const TS = 44, CW = 1040, CH = 650, Z = 1.5, VW = CW / Z, VH = CH / Z; // Z: zoom of the view
  const WZ = 2, SS = 2; // WZ: pixels per map unit the world is painted at. SS: canvas pixels per layout unit.
  let cv, c, def = null, W = 0, H = 0, world = null, mini = null, fog = null, vign = null, step = null;
  const cam = { x: 0, y: 0 }, vis = new Set();
  let face = 1, hover = null, anim = null;

  const hs = (x, y, k) => { let h = (x * 374761393 + y * 668265263 + (k || 0) * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '^' : def.grid[y][x];
  const terr = (x, y) => { const ch = at(x, y); return TERRAIN[ch] || TERRAIN.site; };
  const isRoad = ch => ch === '=' || ch === '+' || (def.sites[ch] && def.sites[ch].road);

  function init(canvas) {
    cv = canvas; cv.width = CW * SS; cv.height = CH * SS; c = cv.getContext('2d');
    cv.addEventListener('click', e => { const t = tileAt(e); if (t && step) step(Math.sign(t.x - G.x), Math.sign(t.y - G.y)); });
    cv.addEventListener('mousemove', e => { const t = tileAt(e); if (!t || !hover || t.x !== hover.x || t.y !== hover.y) { hover = t; if (!anim) draw(); } });
    cv.addEventListener('mouseleave', () => { hover = null; if (!anim) draw(); });
    vign = document.createElement('canvas'); vign.width = CW; vign.height = CH;
    const v = vign.getContext('2d'), g = v.createRadialGradient(CW / 2, CH / 2, CH * 0.45, CW / 2, CH / 2, CW * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)'); v.fillStyle = g; v.fillRect(0, 0, CW, CH);
  }
  function view() {
    const px = cam.x * TS + TS / 2, py = cam.y * TS + TS / 2;
    return [clamp(px - VW / 2, 0, W * TS - VW), clamp(py - VH / 2, 0, H * TS - VH)];
  }
  function tileAt(e) {
    if (!def) return null;
    const r = cv.getBoundingClientRect(), [vx, vy] = view();
    const x = Math.floor(((e.clientX - r.left) * VW / r.width + vx) / TS), y = Math.floor(((e.clientY - r.top) * VH / r.height + vy) / TS);
    return x >= 0 && y >= 0 && x < W && y < H ? { x, y } : null;
  }

  /* ---------------- world painting (once per map) ---------------- */
  function prepare(d) {
    if (def === d && world) return;
    def = d; H = d.grid.length; W = d.grid[0].length;
    world = document.createElement('canvas'); world.width = Math.ceil(W * TS * WZ); world.height = Math.ceil(H * TS * WZ);
    const g = world.getContext('2d');
    g.scale(WZ, WZ);
    // 1. soft biome colours: a one-pixel-per-tile image, upscaled with smoothing
    const lo = document.createElement('canvas'); lo.width = W; lo.height = H;
    const l = lo.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { l.fillStyle = terr(x, y).col; l.fillRect(x, y, 1, 1); }
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(lo, 0, 0, W * TS, H * TS);
    // 2. grain
    const nz = document.createElement('canvas'); nz.width = nz.height = 96;
    const n = nz.getContext('2d'), id = n.createImageData(96, 96);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = Math.random() * 22; }
    n.putImageData(id, 0, 0);
    g.fillStyle = g.createPattern(nz, 'repeat'); g.fillRect(0, 0, W * TS, H * TS);
    // 3. large mottling so grassland is not flat
    for (let i = 0; i < W * H / 3; i++) {
      const x = Math.random() * W * TS, y = Math.random() * H * TS, r = 20 + Math.random() * 50;
      const gr = g.createRadialGradient(x, y, 0, x, y, r), dark = Math.random() < 0.5;
      gr.addColorStop(0, dark ? 'rgba(20,30,10,.10)' : 'rgba(220,230,150,.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    paintNetwork(g, ch => ch === '~' || ch === '+', [['#b9a77a', TS * 1.05], ['#7c8d6a', TS * 0.9], ['#244d70', TS * 0.78], ['#2f6188', TS * 0.6]]);
    waterSparkle(g);
    paintNetwork(g, isRoad, [['rgba(70,55,35,.55)', 12], ['#b59c6c', 8], ['#c9b383', 4]]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === '+') bridge(g, x, y);
    // 4. raised features, painted back to front so they overlap correctly
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) feature(g, x, y);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = def.sites[at(x, y)]; if (s) site(g, s.icon, x * TS + TS / 2, y * TS + TS * 0.62); }
    // minimap source image
    mini = document.createElement('canvas'); mini.width = W; mini.height = H;
    const m = mini.getContext('2d');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ch = at(x, y);
      m.fillStyle = ch === '~' ? '#2f6188' : ch === '^' ? '#9a958b' : isRoad(ch) ? '#c9b383' : def.sites[ch] ? '#ffd27a' : terr(x, y).col;
      m.fillRect(x, y, 1, 1);
    }
    fog = document.createElement('canvas'); fog.width = W; fog.height = H;
  }
  // rivers and roads: round blobs joined by thick strokes to their neighbours
  function paintNetwork(g, test, layers) {
    const cells = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (test(at(x, y))) cells.push([x, y]);
    for (const [col, wd] of layers) {
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      for (const [x, y] of cells) {
        const cx = x * TS + TS / 2, cy = y * TS + TS / 2;
        let linked = false;
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
          const nx = x + dx, ny = y + dy, off = nx < 0 || ny < 0 || nx >= W || ny >= H;
          // join to a matching neighbour; at the map edge, run off the edge
          if (off || test(def.grid[ny][nx])) { g.moveTo(cx, cy); g.lineTo(cx + dx * TS / 2, cy + dy * TS / 2); linked = true; }
        }
        for (const [dx, dy] of [[1, 1], [-1, 1]]) if (test(at(x + dx, y + dy)) && !test(at(x + dx, y)) && !test(at(x, y + dy))) { g.moveTo(cx, cy); g.lineTo(cx + dx * TS, cy + dy * TS); linked = true; }
        if (!linked) { g.moveTo(cx + 0.1, cy); g.lineTo(cx, cy); }
      }
      g.stroke();
    }
  }
  function waterSparkle(g) {
    g.strokeStyle = 'rgba(190,225,255,.35)'; g.lineWidth = 1.2; g.lineCap = 'round';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === '~') for (let i = 0; i < 2; i++) {
      const px = x * TS + 10 + hs(x, y, i) * (TS - 20), py = y * TS + 10 + hs(x, y, i + 7) * (TS - 20);
      g.beginPath(); g.moveTo(px - 5, py); g.quadraticCurveTo(px, py - 3, px + 5, py); g.stroke();
    }
  }
  function bridge(g, x, y) {
    const cx = x * TS + TS / 2, cy = y * TS + TS / 2, horiz = isRoad(at(x - 1, y)) || isRoad(at(x + 1, y));
    g.save(); g.translate(cx, cy); if (!horiz) g.rotate(Math.PI / 2);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-TS * 0.62, -8, TS * 1.24, 20);
    g.fillStyle = '#8a6a44'; g.fillRect(-TS * 0.62, -10, TS * 1.24, 20);
    g.strokeStyle = '#5a4128'; g.lineWidth = 1;
    for (let i = -TS * 0.62; i < TS * 0.62; i += 5) { g.beginPath(); g.moveTo(i, -10); g.lineTo(i, 10); g.stroke(); }
    g.fillStyle = '#4e3822'; g.fillRect(-TS * 0.66, -12, TS * 1.32, 3); g.fillRect(-TS * 0.66, 9, TS * 1.32, 3);
    g.restore();
  }
  const shadow = (g, x, y, rx, ry) => { g.fillStyle = 'rgba(10,15,5,.28)'; g.beginPath(); g.ellipse(x + 3, y + 2, rx, ry, 0, 0, 6.3); g.fill(); };
  function tree(g, x, y, s, kind, k) {
    shadow(g, x + 2, y, 9 * s, 4 * s);
    if (kind) {
      g.fillStyle = '#4b3524'; g.fillRect(x - 1.5, y - 6 * s, 3, 6 * s);
      const cols = ['#1f3f26', '#2a5131', '#36633b'];
      for (let i = 0; i < 3; i++) { const w = (10 - i * 2.4) * s, t = y - (5 + i * 7) * s; g.fillStyle = shade(cols[i], (k - 0.5) * 0.2); g.beginPath(); g.moveTo(x - w, t); g.lineTo(x, t - 12 * s); g.lineTo(x + w, t); g.closePath(); g.fill(); }
    } else {
      g.fillStyle = '#4b3524'; g.fillRect(x - 1.5, y - 7 * s, 3, 7 * s);
      const v = (k - 0.5) * 0.3;
      for (const [dx, dy, r, d] of [[-4, -10, 6.5, -0.15], [4, -11, 6.5, -0.1], [0, -16, 7.5, 0.05]]) { g.fillStyle = shade('#3d6b35', v + d); g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 6.3); g.fill(); }
      g.fillStyle = 'rgba(220,240,160,.18)'; g.beginPath(); g.arc(x - 2 * s, y - 18 * s, 3.5 * s, 0, 6.3); g.fill();
    }
  }
  function feature(g, x, y) {
    const ch = at(x, y), ox = x * TS, oy = y * TS;
    if (ch === 'T') {
      const n = 4 + Math.floor(hs(x, y, 1) * 3), pts = [];
      for (let i = 0; i < n; i++) pts.push([ox + 6 + hs(x, y, i + 10) * (TS - 12), oy + 12 + hs(x, y, i + 20) * (TS - 10)]);
      pts.sort((a, b) => a[1] - b[1]);
      pts.forEach(([px, py], i) => tree(g, px, py, 0.95 + hs(x, y, i + 30) * 0.45, hs(x, y, i + 40) < 0.55, hs(x, y, i + 50)));
    } else if (ch === 'n') {
      const n = 1 + (hs(x, y, 2) < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const px = ox + TS * (0.3 + hs(x, y, i + 3) * 0.4), py = oy + TS * (0.55 + hs(x, y, i + 4) * 0.35), w = TS * (0.42 + hs(x, y, i + 5) * 0.2), ht = w * 0.75;
        shadow(g, px + 4, py, w, w * 0.32);
        const gr = g.createLinearGradient(px - w, py - ht, px + w * 0.6, py);
        gr.addColorStop(0, '#b7b07a'); gr.addColorStop(0.55, '#8c8551'); gr.addColorStop(1, '#5f5a35');
        g.fillStyle = gr; g.beginPath(); g.moveTo(px - w, py); g.bezierCurveTo(px - w * 0.6, py - ht * 1.2, px + w * 0.6, py - ht * 1.2, px + w, py); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(60,55,30,.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px - w * 0.2, py - ht * 0.55); g.quadraticCurveTo(px + w * 0.2, py - ht * 0.3, px + w * 0.45, py - ht * 0.05); g.stroke();
      }
    } else if (ch === '^') {
      const n = 1 + (hs(x, y, 2) < 0.6 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const px = ox + TS * (0.25 + hs(x, y, i + 3) * 0.5), py = oy + TS * (0.7 + hs(x, y, i + 4) * 0.3), w = TS * (0.5 + hs(x, y, i + 5) * 0.25), ht = TS * (0.95 + hs(x, y, i + 6) * 0.55);
        const pk = px + (hs(x, y, i + 7) - 0.5) * w * 0.4;
        shadow(g, px + 6, py, w * 1.05, w * 0.3);
        g.fillStyle = '#9d978c'; g.beginPath(); g.moveTo(px - w, py); g.lineTo(pk, py - ht); g.lineTo(pk + w * 0.1, py); g.closePath(); g.fill();
        g.fillStyle = '#625d55'; g.beginPath(); g.moveTo(pk, py - ht); g.lineTo(px + w, py); g.lineTo(pk + w * 0.1, py); g.closePath(); g.fill();
        g.fillStyle = '#eef1f4'; g.beginPath(); g.moveTo(pk, py - ht); g.lineTo(pk - ht * 0.22, py - ht * 0.68); g.lineTo(pk - ht * 0.08, py - ht * 0.74); g.lineTo(pk + ht * 0.02, py - ht * 0.64); g.lineTo(pk + ht * 0.2, py - ht * 0.72); g.closePath(); g.fill();
        g.fillStyle = 'rgba(150,170,200,.5)'; g.beginPath(); g.moveTo(pk, py - ht); g.lineTo(pk + ht * 0.2, py - ht * 0.72); g.lineTo(pk + ht * 0.02, py - ht * 0.64); g.closePath(); g.fill();
      }
    } else if (ch === '%') {
      for (let i = 0; i < 2; i++) {
        const px = ox + 8 + hs(x, y, i + 1) * (TS - 16), py = oy + 8 + hs(x, y, i + 2) * (TS - 16);
        g.fillStyle = 'rgba(28,45,44,.8)'; g.beginPath(); g.ellipse(px, py, 7 + hs(x, y, i + 3) * 8, 4 + hs(x, y, i + 4) * 3, 0, 0, 6.3); g.fill();
        g.strokeStyle = 'rgba(170,200,190,.2)'; g.lineWidth = 1; g.beginPath(); g.ellipse(px - 2, py - 1, 4, 1.5, 0, 3.4, 5.6); g.stroke();
      }
      g.strokeStyle = '#7c8547'; g.lineWidth = 1.2; g.beginPath();
      for (let i = 0; i < 6; i++) { const px = ox + hs(x, y, i + 9) * TS, py = oy + 6 + hs(x, y, i + 15) * (TS - 6); g.moveTo(px, py); g.lineTo(px - 1 + hs(x, y, i) * 2, py - 6 - hs(x, y, i + 21) * 4); }
      g.stroke();
      if (hs(x, y, 33) < 0.18) { const px = ox + TS / 2, py = oy + TS * 0.7; g.strokeStyle = '#4a3f33'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 18); g.moveTo(px, py - 10); g.lineTo(px - 6, py - 16); g.moveTo(px, py - 13); g.lineTo(px + 5, py - 19); g.stroke(); }
    } else if (ch === '.') {
      if (hs(x, y, 5) < 0.12) tree(g, ox + TS * hs(x, y, 6), oy + TS * (0.4 + hs(x, y, 7) * 0.5), 0.9, hs(x, y, 8) < 0.4, hs(x, y, 9));
      g.strokeStyle = 'rgba(40,60,20,.35)'; g.lineWidth = 1; g.beginPath();
      for (let i = 0; i < 4; i++) { const px = ox + hs(x, y, i + 60) * TS, py = oy + hs(x, y, i + 70) * TS; g.moveTo(px - 2, py); g.lineTo(px - 3, py - 4); g.moveTo(px, py); g.lineTo(px, py - 5); g.moveTo(px + 2, py); g.lineTo(px + 3, py - 4); }
      g.stroke();
      if (hs(x, y, 80) < 0.3) { g.fillStyle = hs(x, y, 81) < 0.5 ? '#e8d77a' : '#d9a6e0'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(ox + hs(x, y, i + 82) * TS, oy + hs(x, y, i + 85) * TS, 1.3, 0, 6.3); g.fill(); } }
    }
  }
  function house(g, x, y, w, roof, wall) {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - w / 2 + 3, y - 2, w, 5);
    g.fillStyle = wall || '#d8cbaa'; g.fillRect(x - w / 2, y - w * 0.55, w, w * 0.55);
    g.fillStyle = roof; g.beginPath(); g.moveTo(x - w / 2 - 2, y - w * 0.5); g.lineTo(x, y - w * 1.05); g.lineTo(x + w / 2 + 2, y - w * 0.5); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(x, y - w * 1.05); g.lineTo(x + w / 2 + 2, y - w * 0.5); g.lineTo(x, y - w * 0.5); g.closePath(); g.fill();
    g.fillStyle = '#4a3420'; g.fillRect(x - 1.5, y - 5, 3, 5);
  }
  function site(g, icon, x, y) {
    g.save(); g.lineJoin = 'round';
    const sc = icon === 'town' ? 1.45 : 1.2;   // landmarks are drawn larger than a square
    g.translate(x, y); g.scale(sc, sc); x = 0; y = 0;
    const glow = (r, col) => { const gr = g.createRadialGradient(x, y - 6, 0, x, y - 6, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - 6 - r, r * 2, r * 2); };
    if (icon === 'town') {
      glow(46, 'rgba(255,200,120,.25)');
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 4, y + 6, 32, 12, 0, 0, 6.3); g.fill();
      g.fillStyle = '#8f877a'; g.beginPath(); g.ellipse(x, y, 30, 14, 0, 0, 6.3); g.fill();
      g.fillStyle = '#6f8c48'; g.beginPath(); g.ellipse(x, y - 2, 25, 10, 0, 0, 6.3); g.fill();
      house(g, x - 13, y - 1, 11, '#a3452c'); house(g, x + 12, y - 2, 12, '#8e3b26'); house(g, x - 2, y + 5, 10, '#b4553a');
      g.fillStyle = '#cfc6b0'; g.fillRect(x - 3, y - 26, 8, 22); g.fillStyle = '#5c5c6e'; g.beginPath(); g.moveTo(x - 5, y - 26); g.lineTo(x + 1, y - 40); g.lineTo(x + 7, y - 26); g.closePath(); g.fill();
      for (const [tx, ty] of [[-30, 0], [30, 0], [-18, 10], [18, 10], [0, 13]]) { g.fillStyle = '#a49c8d'; g.fillRect(x + tx - 4, y + ty - 12, 8, 12); g.fillStyle = '#6b665c'; g.fillRect(x + tx - 4, y + ty - 14, 8, 3); }
    } else if (icon === 'village') {
      glow(34, 'rgba(255,200,120,.2)');
      house(g, x - 11, y + 2, 12, '#b89a52', '#cdbb93'); house(g, x + 9, y, 13, '#a88a48', '#cdbb93'); house(g, x - 1, y - 8, 10, '#b89a52', '#cdbb93');
      g.strokeStyle = '#5a4128'; g.lineWidth = 2; g.beginPath(); g.arc(x + 20, y + 2, 6, 0, 6.3); g.moveTo(x + 14, y + 2); g.lineTo(x + 26, y + 2); g.moveTo(x + 20, y - 4); g.lineTo(x + 20, y + 8); g.stroke();
    } else if (icon === 'tower') {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 5, y + 2, 16, 6, 0, 0, 6.3); g.fill();
      const gr = g.createLinearGradient(x - 11, 0, x + 11, 0); gr.addColorStop(0, '#a29a8a'); gr.addColorStop(1, '#5e594f');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x - 11, y); g.lineTo(x - 11, y - 34); g.lineTo(x - 6, y - 38); g.lineTo(x - 2, y - 33); g.lineTo(x + 3, y - 40); g.lineTo(x + 7, y - 31); g.lineTo(x + 11, y - 34); g.lineTo(x + 11, y); g.closePath(); g.fill();
      g.fillStyle = '#1b1612'; g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x - 4, y - 9); g.arc(x, y - 9, 4, Math.PI, 0); g.lineTo(x + 4, y); g.closePath(); g.fill();
      g.fillRect(x - 1, y - 24, 3, 6);
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 3, y - 40); g.lineTo(x + 3, y - 54); g.stroke();
      g.fillStyle = '#8a1f1f'; g.beginPath(); g.moveTo(x + 3, y - 54); g.lineTo(x + 15, y - 50); g.lineTo(x + 3, y - 46); g.closePath(); g.fill();
      for (let i = 0; i < 4; i++) { g.fillStyle = '#7d766a'; g.fillRect(x - 18 + i * 9 + hs(i, 3, 1) * 4, y + 2 - hs(i, 4, 1) * 3, 4, 3); }
    } else if (icon === 'camp') {
      glow(28, 'rgba(255,140,50,.35)');
      for (const [tx, ty, col] of [[-12, -2, '#8a7a5a'], [10, -4, '#7a6a4c'], [-1, 8, '#93835f']]) {
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + tx - 7, y + ty - 1, 16, 4);
        g.fillStyle = col; g.beginPath(); g.moveTo(x + tx - 9, y + ty); g.lineTo(x + tx, y + ty - 14); g.lineTo(x + tx + 9, y + ty); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.moveTo(x + tx, y + ty - 14); g.lineTo(x + tx + 9, y + ty); g.lineTo(x + tx + 2, y + ty); g.closePath(); g.fill();
      }
      g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(x - 3, y + 1); g.lineTo(x, y - 7); g.lineTo(x + 3, y + 1); g.closePath(); g.fill();
    } else if (icon === 'hut') {
      house(g, x, y, 16, '#6b5a3a', '#9a8460');
      g.fillStyle = 'rgba(200,200,200,.35)'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + 5 + i * 2, y - 20 - i * 6, 2.5 + i, 0, 6.3); g.fill(); }
    } else if (icon === 'stones') {
      glow(30, 'rgba(255,240,170,.28)');
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2, sx = x + Math.cos(a) * 15, sy = y + Math.sin(a) * 7;
        g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(sx, sy - 1, 6, 3);
        g.fillStyle = i % 2 ? '#b8b4a8' : '#a19c90'; g.fillRect(sx - 2.5, sy - 12, 5, 12); g.fillStyle = '#d6d2c6'; g.fillRect(sx - 2.5, sy - 12, 2, 12);
      }
    } else if (icon === 'cave') {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 4, y + 2, 20, 7, 0, 0, 6.3); g.fill();
      g.fillStyle = '#7a756a'; g.beginPath(); g.moveTo(x - 20, y); g.quadraticCurveTo(x - 14, y - 24, x, y - 24); g.quadraticCurveTo(x + 16, y - 24, x + 20, y); g.closePath(); g.fill();
      g.fillStyle = '#100c0a'; g.beginPath(); g.moveTo(x - 8, y); g.quadraticCurveTo(x, y - 18, x + 8, y); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(235,235,235,.55)'; g.lineWidth = 0.8; g.beginPath();
      for (let i = 0; i < 5; i++) { g.moveTo(x - 9, y - 1); g.lineTo(x - 9 + i * 4.5, y - 15 + Math.abs(i - 2) * 3); } g.stroke();
    } else if (icon === 'farm') {
      g.strokeStyle = 'rgba(120,90,40,.6)'; g.lineWidth = 2;
      for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(x - 22, y + 4 + i * 3); g.lineTo(x - 4, y + 4 + i * 3); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - 2, y - 2, 22, 5);
      g.fillStyle = '#2b241f'; g.fillRect(x, y - 12, 18, 12); g.fillStyle = '#4a3a2c'; g.beginPath(); g.moveTo(x - 1, y - 12); g.lineTo(x + 6, y - 19); g.lineTo(x + 10, y - 13); g.lineTo(x + 19, y - 12); g.closePath(); g.fill();
      g.fillStyle = 'rgba(90,90,90,.45)'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + 10 + i * 3, y - 22 - i * 6, 2.5 + i, 0, 6.3); g.fill(); }
    } else if (icon === 'chapel') {
      g.fillStyle = 'rgba(28,45,44,.85)'; g.beginPath(); g.ellipse(x, y, 22, 9, 0, 0, 6.3); g.fill();
      g.save(); g.translate(x, y); g.rotate(-0.12);
      g.fillStyle = '#8a8a80'; g.fillRect(-11, -14, 22, 14); g.fillStyle = '#55524c'; g.beginPath(); g.moveTo(-13, -13); g.lineTo(0, -22); g.lineTo(13, -13); g.closePath(); g.fill();
      g.fillStyle = '#9a9a90'; g.fillRect(-4, -34, 8, 14); g.fillStyle = '#55524c'; g.beginPath(); g.moveTo(-6, -34); g.lineTo(0, -44); g.lineTo(6, -34); g.closePath(); g.fill();
      g.fillStyle = '#161412'; g.fillRect(-3, -9, 6, 9);
      g.restore();
      g.fillStyle = 'rgba(140,255,170,.55)'; g.beginPath(); g.arc(x - 16, y - 10, 2, 0, 6.3); g.arc(x + 17, y - 6, 1.6, 0, 6.3); g.fill();
    } else if (icon === 'pass') {
      for (let i = 0; i < 6; i++) { const bx = x - 14 + hs(i, 1, 9) * 28, by = y + 4 - hs(i, 2, 9) * 14, r = 4 + hs(i, 3, 9) * 5; g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(bx + 2, by + 2, r, 0, 6.3); g.fill(); g.fillStyle = i % 2 ? '#8e897e' : '#a8a296'; g.beginPath(); g.arc(bx, by, r, 0, 6.3); g.fill(); }
    }
    g.restore();
  }

  /* ---------------- per-frame drawing ---------------- */
  function sight() { const n = night(); const t = at(G.x, G.y); return (n ? 2.2 : 4.2) + (t === 'n' ? 2 : 0) - (t === 'T' || t === '%' ? 1.2 : 0); }
  function reveal() {
    const seen = G.seen[G.map], r = sight();
    vis.clear();
    for (let y = Math.floor(G.y - r - 1); y <= G.y + r + 1; y++) for (let x = Math.floor(G.x - r - 1); x <= G.x + r + 1; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || Math.hypot(x - G.x, y - G.y) > r + 0.35) continue;
      seen[y * W + x] = 1; vis.add(y * W + x);
    }
    // the walls and spire of a town can be seen from far off
    for (const k in def.sites) if (k === 'E') { const p = find(k); if (Math.hypot(p.x - G.x, p.y - G.y) < 9) seen[p.y * W + p.x] = 1; }
    const f = fog.getContext('2d'), id = f.createImageData(W, H);
    for (let i = 0; i < W * H; i++) { id.data[i * 4] = 9; id.data[i * 4 + 1] = 10; id.data[i * 4 + 2] = 15; id.data[i * 4 + 3] = vis.has(i) ? 0 : seen[i] ? 70 : 255; }
    f.putImageData(id, 0, 0);
  }
  function find(k) { for (let y = 0; y < H; y++) { const x = def.grid[y].indexOf(k); if (x >= 0) return { x, y }; } return null; }
  function hour() { return (G.time % 1440) / 60; }
  function night() { const h = hour(); return h < 5.5 || h >= 20; }
  function draw() {
    if (!def || !c) return;
    const [vx, vy] = view();
    c.setTransform(SS, 0, 0, SS, 0, 0);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(world, vx * WZ, vy * WZ, VW * WZ, VH * WZ, 0, 0, CW, CH);
    c.save(); c.scale(Z, Z);
    // labels of discovered sites
    const seen = G.seen[G.map];
    c.font = '600 10px Georgia, serif'; c.textAlign = 'center'; c.lineJoin = 'round';
    for (const k in def.sites) {
      const p = find(k); if (!p || !seen[p.y * W + p.x]) continue;
      const sx = p.x * TS + TS / 2 - vx, sy = p.y * TS + TS + 12 - vy;
      if (sx < -80 || sx > VW + 80 || sy < -20 || sy > VH + 40) continue;
      c.lineWidth = 3; c.strokeStyle = 'rgba(10,8,6,.85)'; c.strokeText(def.sites[k].name, sx, sy); c.fillStyle = '#f3e3b5'; c.fillText(def.sites[k].name, sx, sy);
    }
    // dropped gear
    for (const p of lootSpots()) {
      if (!seen[p.y * W + p.x]) continue;
      const lx = p.x * TS + TS * 0.5 - vx, ly = p.y * TS + TS * 0.8 - vy;
      c.save(); c.translate(lx, ly); c.scale(2, 2);
      c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(1, 2, 6, 2.2, 0, 0, 6.3); c.fill();
      c.fillStyle = '#7d6440'; c.strokeStyle = '#2a1d10'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-4, 1); c.quadraticCurveTo(-6, -6, -1.5, -7); c.lineTo(1.5, -7); c.quadraticCurveTo(6, -6, 4, 1); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#d4af37'; c.fillRect(-1.5, -9, 3, 2); c.beginPath(); c.ellipse(5.5, 1.5, 1.6, 0.9, 0, 0, 6.3); c.fill();
      c.restore();
    }
    // party token
    const onSite = !anim && def.sites[at(G.x, G.y)], px = cam.x * TS + TS / 2 - vx + (onSite ? 13 : 0), py = cam.y * TS + TS * 0.7 - vy + (onSite ? 10 : 0), lead = P().find(ch => !ch.dead && ch.hp > 0) || P()[0];
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(px + 2, py + 2, 16, 7, 0, 0, 6.3); c.fill();
    c.strokeStyle = '#ffd36b'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(px, py, 15, 6.5, 0, 0, 6.3); c.stroke();
    if (lead) drawFig(c, figForChar(lead), px, py, performance.now(), { scale: 0.62, flip: face < 0, noShadow: true });
    // fog of war (smoothly upscaled from one pixel per tile)
    c.drawImage(fog, -vx, -vy, W * TS, H * TS);
    // time of day
    const h = hour();
    if (night()) {
      const r = sight() * TS, gr = c.createRadialGradient(px, py, r * 0.35, px, py, r * 1.6);
      gr.addColorStop(0, 'rgba(8,14,40,.18)'); gr.addColorStop(1, 'rgba(6,10,30,.62)');
      c.fillStyle = gr; c.fillRect(0, 0, VW, VH);
    } else if (h < 7.5 || h >= 17.5) {
      const k = h < 7.5 ? (7.5 - h) / 2 : (h - 17.5) / 2.5;
      c.fillStyle = 'rgba(255,120,40,' + (0.16 * k).toFixed(3) + ')'; c.fillRect(0, 0, VW, VH);
    }
    const hv = hover && seen[hover.y * W + hover.x];
    if (hv) { c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1; c.strokeRect(hover.x * TS - vx + 1, hover.y * TS - vy + 1, TS - 2, TS - 2); }
    c.restore();
    c.drawImage(vign, 0, 0, CW, CH);
    // hovered square
    if (hv) {
      const t = terr(hover.x, hover.y), s = def.sites[at(hover.x, hover.y)];
      const txt = s ? s.name : t.name + (t.block ? ' (impassable)' : ' · travel ×' + t.cost);
      c.font = '13px Georgia, serif'; c.textAlign = 'left'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.8)'; c.strokeText(txt, 14, CH - 14); c.fillStyle = '#e8dcc0'; c.fillText(txt, 14, CH - 14);
    }
    // compass
    c.save(); c.translate(CW - 40, 42); c.fillStyle = 'rgba(10,10,14,.55)'; c.beginPath(); c.arc(0, 0, 24, 0, 6.3); c.fill();
    c.fillStyle = '#e3b54a'; c.beginPath(); c.moveTo(0, -18); c.lineTo(5, 0); c.lineTo(-5, 0); c.closePath(); c.fill();
    c.fillStyle = '#9a9484'; c.beginPath(); c.moveTo(0, 18); c.lineTo(5, 0); c.lineTo(-5, 0); c.closePath(); c.fill();
    c.font = 'bold 10px Verdana, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText('N', 0, -20 + 1); c.restore();
  }
  function place(x, y) { cam.x = x; cam.y = y; anim = null; }
  function travel(x, y, ms) {
    return new Promise(res => {
      const fx = cam.x, fy = cam.y, t0 = performance.now();
      if (x !== fx) face = x > fx ? 1 : -1;
      let done = false;
      const end = () => { if (done) return; done = true; anim = null; cam.x = x; cam.y = y; draw(); res(); };
      anim = true;
      const f = now => {
        if (done) return;
        const k = Math.min(1, (now - t0) / ms), e = k * (2 - k);
        cam.x = fx + (x - fx) * e; cam.y = fy + (y - fy) * e; draw();
        if (k < 1) requestAnimationFrame(f); else end();
      };
      requestAnimationFrame(f);
      setTimeout(end, ms + 250);
    });
  }
  /* The whole country on one canvas: the painted world scaled to fit, hidden where unexplored, with
     places, dropped gear and the party marked. Small for the corner minimap, large (with names) for the map page. */
  function mapTo(canvas, big) {
    const g = canvas.getContext('2d'), cw = canvas.width, ch = canvas.height, pad = big ? 24 : 0;
    const k = Math.min((cw - pad * 2) / W, (ch - pad * 2) / H), ox = (cw - W * k) / 2, oy = (ch - H * k) / 2, seen = G.seen[G.map];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#0b0c11'; g.fillRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(world, ox, oy, W * k, H * k);
    g.drawImage(fog, ox, oy, W * k, H * k);
    g.strokeStyle = '#343849'; g.lineWidth = big ? 2 : 1; g.strokeRect(ox + 0.5, oy + 0.5, W * k - 1, H * k - 1);
    const mid = (x, y) => [ox + (x + 0.5) * k, oy + (y + 0.5) * k];
    // places
    const names = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const st = def.sites[at(x, y)]; if (!st || !seen[y * W + x]) continue;
      const [mx, my] = mid(x, y), r = big ? 7 : 3.2;
      g.fillStyle = '#1a1206'; g.beginPath(); g.moveTo(mx, my - r - 2); g.lineTo(mx + r + 2, my); g.lineTo(mx, my + r + 2); g.lineTo(mx - r - 2, my); g.closePath(); g.fill();
      g.fillStyle = '#ffd27a'; g.beginPath(); g.moveTo(mx, my - r); g.lineTo(mx + r, my); g.lineTo(mx, my + r); g.lineTo(mx - r, my); g.closePath(); g.fill();
      if (big) names.push([st.name, mx, my + k * 0.5 + 24]);
    }
    if (big) {
      g.font = '600 22px Georgia, serif'; g.textAlign = 'center'; g.lineJoin = 'round';
      for (const [t, x, y] of names) { g.lineWidth = 5; g.strokeStyle = 'rgba(10,8,6,.9)'; g.strokeText(t, x, y); g.fillStyle = '#f3e3b5'; g.fillText(t, x, y); }
    }
    for (const p of lootSpots()) {
      if (!seen[p.y * W + p.x]) continue;
      const [mx, my] = mid(p.x, p.y), r = big ? 6.5 : 3;
      g.fillStyle = '#3a1030'; g.beginPath(); g.arc(mx, my, r + 1.5, 0, 6.3); g.fill();
      g.fillStyle = View3D.MAPCOL.loot; g.beginPath(); g.arc(mx, my, r, 0, 6.3); g.fill();
    }
    const [px, py] = mid(G.x, G.y), pr = big ? 9 : Math.max(3, k * 0.7);
    if (big) { g.strokeStyle = 'rgba(255,210,74,.5)'; g.lineWidth = 3; g.beginPath(); g.arc(px, py, pr + 9, 0, 6.3); g.stroke(); }
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = big ? 3 : 1.5;
    g.beginPath(); g.arc(px, py, pr, 0, 6.3); g.fill(); g.stroke();
    return (canvas._geo = { ox, oy, cs: k, w: W, h: H });
  }
  const minimap = canvas => mapTo(canvas, false);
  const fullMap = canvas => mapTo(canvas, true);
  /* the party sets out knowing the roads and the country around Emberfall */
  function knownLand() {
    const seen = G.seen[G.map], e = find('E');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (Math.hypot(x - e.x, y - e.y) <= 5.5) seen[y * W + x] = 1;
      if (isRoad(at(x, y))) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H) seen[(y + dy) * W + x + dx] = 1;
    }
  }
  function revealAround(k, r) {
    const p = find(k), seen = G.seen.wild; if (!p || !seen) return;
    for (let y = p.y - r; y <= p.y + r; y++) for (let x = p.x - r; x <= p.x + r; x++) if (x >= 0 && y >= 0 && x < W && y < H) seen[y * W + x] = 1;
  }
  return { init, prepare, draw, reveal, place, travel, minimap, fullMap, at, terr, find, night, revealAround, knownLand, onStep(fn) { step = fn; }, get size() { return [W, H]; } };
})();

/* ============================================================
   Travel rules
   ============================================================ */
const alivePC = () => P().filter(c => !c.dead && c.hp > 0);
/* 2e overland movement: a party moves at the rate of its slowest member;
   movement rate 12 covers about 24 miles in a ten-hour marching day (one square = one mile). */
function partyMV() { const a = alivePC(); return a.length ? Math.min(...a.map(moveRate)) : 12; }
function stepMinutes(dx, dy, t) {
  const perMile = 600 / (partyMV() * 2);
  return Math.round(perMile * t.cost * (dx && dy ? 1.4 : 1) * (G.march >= 600 ? 1.5 : 1));
}
function wildEnsureSeen() {
  const [w, h] = Over.size;
  if (!G.seen[G.map] || G.seen[G.map].length !== w * h) G.seen[G.map] = new Array(w * h).fill(0);
  if (!G.flags.wildKnown) { G.flags.wildKnown = 1; Over.knownLand(); }
}
function wildCmds() {
  const go = (dx, dy) => () => wildMove(dx, dy);
  UI.cmds([
    { label: '↖', key: 'Q', on: go(-1, -1) }, { label: 'North', key: 'W', on: go(0, -1) }, { label: '↗', key: 'E', on: go(1, -1) },
    { label: 'West', key: 'A', on: go(-1, 0) }, { label: 'South', key: 'S', on: go(0, 1) }, { label: 'East', key: 'D', on: go(1, 0) },
    { label: '↙', key: 'Z', on: go(-1, 1) }, { label: '↘', key: 'C', on: go(1, 1) },
    { label: 'Visit', key: 'Enter', on: () => { const k = Over.at(G.x, G.y); if (X.def.sites[k]) visitSite(k); else if (groundAt().length) lootHere(); else log('There is nothing here but ' + Over.terr(G.x, G.y).name.toLowerCase() + '.', 'dim'); } },
    { label: 'Camp', key: 'R', on: wildCamp }, { label: 'Menu', key: 'Esc', on: menuDialog },
  ], 'Click the map to walk toward a point. M opens the full map, J the journal, B the bestiary. Travel time depends on terrain and your slowest member\'s movement rate.');
}
function revealSite(k) { if (!G.seen.wild) { const g = MAPS.wild.grid; G.seen.wild = new Array(g.length * g[0].length).fill(0); } Over.prepare(MAPS.wild); Over.revealAround(k, 1); }


async function wildMove(dx, dy) {
  if (busy() || (!dx && !dy)) return;
  const nx = G.x + dx, ny = G.y + dy, t = Over.terr(nx, ny);
  if (t.block) { log(t.name === 'River' ? 'The river runs deep and fast here. Find a bridge.' : 'The mountains are impassable.', 'dim'); return; }
  const mins = stepMinutes(dx, dy, t);
  X.busy = true;
  await Over.travel(nx, ny, 190);
  X.busy = false;
  G.x = nx; G.y = ny;
  const before = G.march || 0;
  G.time += mins; G.march = before + mins;
  if (before < 600 && G.march >= 600) log('The party has been on the march for ten hours. Everyone is footsore; travel will be slower until you make camp.', 'bad');
  tickEffects(); Over.reveal(); Over.draw(); refreshAll();
  if (partyDown()) return;
  if (groundAt().length) await lootHere();
  const ch = Over.at(nx, ny);
  if (X.def.sites[ch]) return visitSite(ch);
  const chance = 1 - Math.pow(1 - t.enc * (Over.night() ? 1.5 : 1), mins / 60);
  if (Math.random() < chance) await wildEncounter(t, G.x - dx, G.y - dy);
}

function rollEncounter(t) {
  const n = Over.night(), list = WILD_ENC[t.table].filter(e => !(e.night && !n) && !(e.day && n));
  let r = Math.random() * list.reduce((s, e) => s + e.w, 0);
  for (const e of list) if ((r -= e.w) < 0) return e;
  return list[0];
}
async function wildEncounter(t, px, py, forced) {
  const e = forced || rollEncounter(t);
  if (e.friendly) return friendlyEncounter(e.friendly);
  X.lock = true;
  try {
    const mons = e.mons.map(([id, n]) => [id, typeof n === 'number' ? n : Math.max(1, rollDice(n))]);
    const desc = mons.map(([id, n]) => n + ' × ' + MONSTERS[id].name).join(', ');
    const up = alivePC(), ranger = up.some(c => c.cls === 'R');
    // surprise: each side is surprised on 1-3 on d10; a ranger in the wilds imposes -2 on the enemy's roll
    const ps = rnd(10) <= 3, ms = rnd(10) <= (ranger && t.table !== 'road' ? 5 : 3);
    const dist = (t.table === 'forest' || t.table === 'swamp' ? dice(2, 6) : dice(6, 4)) * 10;
    const night = Over.night(), spec = { mons, arena: t.arena, night, party: P() };
    if (ps && !ms) {
      return await fight(Object.assign(spec, { surprise: 'party', text: e.text + '\nThey are upon you before you can react!' }), px, py);
    }
    const opts = [{ label: 'Fight', cls: 'primary', id: 'fight' }];
    const slowest = partyMV(), theirs = Math.min(...mons.map(([id]) => MONSTERS[id].mv));
    let evade = clamp(50 + (slowest - theirs) * 6 + (t.table === 'forest' || t.table === 'hills' ? 10 : 0) + (ranger ? 10 : 0), 5, 95);
    if (ms) { opts[0] = { label: 'Ambush them', cls: 'primary', id: 'ambush' }; evade = 100; }
    opts.push({ label: ms ? 'Slip away unseen' : 'Evade (' + evade + '%)', id: 'evade' });
    const lead = up.slice().sort((a, b) => b.cha - a.cha)[0];
    if (e.parley && !ms) opts.push({ label: 'Parley (' + lead.name.split(' ')[0] + ')', id: 'parley' });
    const head = ms ? 'You spot them first, ' + dist + ' yards off. They have not noticed you.' : 'They are ' + dist + ' yards off.';
    const o = opts[await choice('Encounter!', encounterBody(e.text + '\n' + head, mons), opts)];
    if (o.id === 'evade') {
      if (rnd(100) <= evade) { log(ms ? 'You let them pass and go on your way.' : 'You lose them in the ' + (t.table === 'road' ? 'hedgerows' : t.name.toLowerCase()) + '.', 'dim'); G.time += 30; refreshAll(); return; }
      log('They are faster than you. There is no escape!', 'bad');
      return await fight(spec, px, py);
    }
    if (o.id === 'parley') {
      // reaction roll: 2d10 adjusted by the speaker's Charisma reaction adjustment (higher is friendlier here)
      const adj = chaReaction(lead.cha), roll = dice(2, 10) + adj;
      if (e.parley === 'toll' && roll >= 9) {
        const toll = Math.min(G.gold, 5 * mons.reduce((s, [, n]) => s + n, 0) + rnd(20));
        if (!await choice('Parley', lead.name + ' talks the bandits down from "everything" to ' + toll + ' gold pieces.', [{ label: 'Pay ' + toll + ' gp', cls: 'primary' }, { label: 'Refuse and fight' }])) {
          G.gold -= toll; log('You pay the bandits ' + toll + ' gp and they melt back into the trees.', 'dim'); refreshAll(); return;
        }
        return await fight(spec, px, py);
      }
      if (e.parley === 'pass' && roll >= 13) { await msgBox('Parley', lead.name + ' keeps a steady voice and a hand off the sword. After a tense exchange they decide you are not worth the trouble, and move on. (Reaction ' + roll + ')'); return; }
      return await fight(Object.assign(spec, { text: 'Words fail. ' + lead.name + '\'s overture is met with jeers, and they attack! (Reaction ' + roll + ')' }), px, py);
    }
    return await fight(Object.assign(spec, o.id === 'ambush' ? { surprise: 'enemy' } : {}), px, py);
  } finally { X.lock = false; }
}
function chaReaction(cha) { return cha <= 3 ? -5 : cha <= 4 ? -4 : cha <= 5 ? -3 : cha <= 6 ? -2 : cha <= 7 ? -1 : cha <= 12 ? 0 : cha <= 13 ? 1 : cha <= 14 ? 2 : cha <= 15 ? 3 : cha <= 16 ? 5 : cha <= 17 ? 6 : 7; }
async function friendlyEncounter(kind) {
  if (kind === 'merchant') {
    const i = await choice('On the Road', 'A peddler\'s cart creaks toward you, pulled by a patient mule. "Fair day! Potions, bandages, a good knife? Prices fair as the weather."', [{ label: 'Trade', cls: 'primary' }, { label: 'Wave and pass' }]);
    if (i === 0) shopDialog('village');
  } else {
    await msgBox('On the Road', 'A band of pilgrims bound for the Abbey of the Dawn shares bread and news with you.\n' + pick(WILD_RUMORS));
  }
}

async function wildCamp() {
  if (busy()) return;
  const t = Over.terr(G.x, G.y), safe = Over.at(G.x, G.y) === 'S';
  if (await choice('Make Camp', 'Rest here for eight hours? Spells will be memorized, each character recovers 1 hit point, and the march fatigue passes.' + (safe ? '\nWithin the Dawnstones no evil will trouble your sleep.' : '\nA watch will be kept, but in the ' + t.name.toLowerCase() + ' something may find you.'), [{ label: 'Rest', cls: 'primary' }, { label: 'Cancel', cls: 'dim' }])) return;
  if (!safe) {
    const hourly = (t.enc || 0.04) * (Over.night() ? 1.2 : 0.8);
    for (let h = 0; h < 8; h++) if (Math.random() < hourly) {
      G.time += h * 60; refreshAll();
      log('Your camp is attacked in the night!', 'bad');
      const e = rollEncounter(t);
      if (e.friendly) continue;
      return wildEncounter(t, G.x, G.y, Object.assign({}, e, { parley: null, text: 'The watch cries out! ' + e.text }));
    }
  }
  G.time += 480; G.march = 0;
  for (const ch of P()) if (!ch.dead) { if (ch.hp < ch.maxhp) ch.hp = Math.max(0, ch.hp) + 1; memorizeAll(ch); ch.layUsed = false; }
  tickEffects(); Over.reveal(); Over.draw();
  log('You rest undisturbed for eight hours. Spells are memorized.', 'good');
  refreshAll(); saveGame('auto');
}

/* ============================================================
   Sites of the Emberwild
   ============================================================ */
function goTo(map, x, y, dir) {
  G.map = map; G.x = x; G.y = y; G.dir = dir || 0;
  enterMap(); log('— ' + X.def.name + ' —', 'round'); saveGame('auto');
}
async function lootCache(key, ev) {
  X.lock = true;
  try { await openChest(key, ev); } finally { X.lock = false; }
}
async function visitSite(k) {
  if (busy()) return;
  const flag = 'wild:' + k, s = X.def.sites[k];
  if (k === 'E') {
    if (!await choice('Emberfall', 'The walls of Emberfall rise above the river, the burned spire of the abbey black against the sky. The gate wardens wave you through.', [{ label: 'Enter the town', cls: 'primary' }, { label: 'Stay outside', cls: 'dim' }])) goTo('town', 12, 19, 0);
  } else if (k === 'M') hamletDialog();
  else if (k === 'W') {
    const txt = G.flags[flag + ':seen'] ? 'The broken watchtower squats on its hill.' : 'An old border watchtower crowns the hill, its top broken like a rotten tooth. A banner of flayed hide flaps from the ramparts, and the wind carries the stink of hyenas.';
    G.flags[flag + ':seen'] = 1;
    if (!await choice(s.name, txt + (G.flags['q:gnolls'] ? '\nThe tower is silent now.' : ''), [{ label: 'Enter the tower', cls: 'primary' }, { label: 'Leave', cls: 'dim' }])) goTo('tower', 9, 13, 0);
  } else if (k === 'B') await brigandCamp(flag);
  else if (k === 'H') await hermit(flag);
  else if (k === 'S') {
    if (!G.flags[flag]) {
      G.flags[flag] = 1;
      const live = P().filter(c => !c.dead);
      live.forEach(c => awardXP(c, 100));
      const priest = live.find(c => c.cls === 'C' || c.cls === 'P');
      await msgBox(s.name, 'Seven grey stones stand in a ring on the hilltop, older than Emberfall, older than the abbey. The air within is still and warm, and the first light of every dawn falls exactly between the two tallest.' +
        (priest ? '\n' + priest.name + ' kneels, and for a moment sees the abbey as it was: whole, bright, and a figure in violet robes slipping through its catacombs with a lantern of grey fire.' : '') + '\nEach member of the party gains 100 experience. Here, at least, you may rest without fear.');
      refreshAll();
    } else await msgBox(s.name, 'The Dawnstones keep their quiet vigil. You may camp within the ring in safety.');
  } else if (k === 'C') {
    if (!G.flags[flag]) {
      const r = await fight({ mons: [['spider', 5]], arena: 'forest', night: Over.night(), text: 'Webs choke the mouth of a cave in a dark hollow. Husks hang in them: deer, a wolf, something that wore boots. The webs tremble. Large spiders pour out of the dark.' }, G.x, G.y);
      if (r === 'win') { G.flags[flag] = 1; await lootCache(flag + ':loot', { gold: 220, items: ['ringProt', 'antidote'], text: 'Deep in the cave, a cocooned adventurer still wears his purse, and a ring glints on one withered finger.' }); }
    } else await msgBox(s.name, 'The hollow is quiet. Torn webs flutter in the cave mouth.');
  } else if (k === 'R') {
    if (!G.flags[flag]) {
      await msgBox(s.name, 'The Hask farmstead is a ruin of charred beams and trampled fields. The livestock is gone. Around the well, the earth is churned by huge, dog-like feet.');
      const r = await fight({ mons: [['goblin', 4], ['slinger', 1]], arena: 'plains', night: Over.night(), text: 'Redfang goblins picking through the ashes for scraps drop their sacks and draw blades!' }, G.x, G.y);
      if (r === 'win') {
        G.flags[flag] = 1; revealSite('W');
        await msgBox(s.name, 'Among the goblins\' scavenged junk you find a child\'s carved horse. The gnoll tracks lead east, across the river, toward the hills where the old watchtower stands.\n(The Bloodmane Watchtower has been marked on your map.)');
        Over.draw(); refreshAll();
      }
    } else await msgBox(s.name, G.flags['q:gnolls'] ? 'Neighbors from Millbrook have begun clearing the ashes. Someone has planted a sapling by the well.' : 'Wind stirs the ashes of the Hask farmstead. The tracks still lead east.');
  } else if (k === 'X') {
    if (!G.flags[flag]) {
      const r = await fight({ mons: [['ghoul', 2], ['zombie', 3]], arena: 'swamp', night: Over.night(), text: 'The chapel has sunk to its windows in the black water. Green lights bob over the mire. As you wade to the door, the drowned congregation rises to greet you.' }, G.x, G.y);
      if (r === 'win') { G.flags[flag] = 1; await lootCache(flag + ':loot', { gold: 300, items: ['potExtra', 'scroll:fireball', 'mace1'], text: 'In the bell tower, above the waterline, the last priest sealed the chapel\'s treasures in a lead-lined chest.' }); }
    } else await msgBox(s.name, 'The drowned chapel is still. Frogs have returned to the reeds.');
  } else if (k === 'P') {
    await msgBox(s.name, 'The east road climbs into the mountains and ends at a wall of fallen rock. Greywater Pass is closed, and will stay closed until the thaw brings work crews from the far side.');
  }
}
async function brigandCamp(flag) {
  if (G.flags[flag]) return void msgBox('Brigand Camp', 'Cold ashes and slashed tents. Nobody has returned to the camp.');
  const up = alivePC(), thief = up.filter(c => c.cls === 'T').sort((a, b) => b.lvl - a.lvl)[0];
  const opts = [{ label: 'Attack the camp', cls: 'primary', id: 'atk' }];
  if (thief) opts.push({ label: thief.name.split(' ')[0] + ': scout ahead (Move Silently ' + thiefSkills(thief).ms + '%)', id: 'scout' });
  opts.push({ label: 'Withdraw', cls: 'dim', id: 'leave' });
  const o = opts[await choice('Brigand Camp', 'Smoke rises from a ring of tents hidden deep in the trees. A dozen voices, the clink of dice, a captain\'s bark. These are the cutthroats who prey on the east road.', opts)];
  if (o.id === 'leave') return;
  let surprise = null, text = 'You charge into the camp!';
  if (o.id === 'scout') {
    if (rnd(100) <= thiefSkills(thief).ms) { surprise = 'enemy'; text = thief.name + ' creeps among the tents unseen and signals the attack. The brigands are caught napping!'; }
    else { surprise = 'party'; text = 'A twig snaps under ' + thief.name + '\'s foot. "INTRUDERS!" The brigands are on you in moments!'; }
  }
  const r = await fight({ mons: [['captain', 1], ['bandit', 5], ['archer', 3]], arena: 'forest', night: Over.night(), surprise, text }, G.x, G.y);
  if (r === 'win') { G.flags[flag] = 1; await lootCache(flag + ':loot', { gold: 380, items: ['potHeal', 'potHeal', 'shield1'], text: 'The captain\'s strongbox sits under his cot, heavy with the takings of the east road.' }); }
}
async function hermit(flag) {
  const last = G.flags[flag], day = Math.floor(G.time / 1440);
  if (last != null && day - last < 7) return void msgBox('Hermit\'s Cottage', 'Old Wenna is out gathering herbs. A note pinned to the door reads, in a spidery hand: "Back in a few days. Don\'t touch the mushrooms."');
  G.flags[flag] = day;
  for (const ch of P()) if (!ch.dead) { ch.hp = ch.maxhp; ch.poison = null; }
  refreshAll();
  await msgBox('Hermit\'s Cottage', 'A tiny cottage, smothered in ivy, smoke curling from the chimney. Old Wenna squints at you over her spectacles. "Hurt, are you? Sit. Sit."\nShe binds your wounds with herbs and foul-smelling poultices, and draws out any venom. Every living member of the party is fully healed.\n"Come back in a week if you\'re still alive," she says. Then, as you leave: "' + pick(WILD_RUMORS) + '"');
}
function hamletDialog() {
  const body = h('div');
  let msg = 'A dozen cottages around a watermill on the stream. The miller\'s wife keeps rooms above the millhouse, and sells what the peddlers leave.' + (G.quests.gnolls === 'done' ? ' Children run to greet you: Tamsin Hask is among them.' : '');
  modal({ title: 'Millbrook', body, wide: true, buttons: [{ label: 'Leave', cls: 'primary' }], onclose: () => { Over.draw(); refreshAll(); } });
  const cost = () => Math.max(1, P().length);
  function render() {
    body.replaceChildren(h('div', { class: 'msg', text: msg }),
      h('div', { class: 'dimtxt', text: 'Party gold: ' + G.gold + ' gp. A night costs ' + cost() + ' gp.' }),
      h('div', { class: 'col' },
        h('button', { class: 'btn', text: 'Rest at the millhouse (' + cost() + ' gp)', disabled: G.gold < cost(), onclick: () => { G.gold -= cost(); restNight(); msg = 'The millwheel turns all night, a comfortable sound. Spells are memorized anew.'; saveGame('auto'); render(); } }),
        h('button', { class: 'btn', text: 'Trade with the miller\'s wife', onclick: () => shopDialog('village') }),
        h('button', { class: 'btn', text: 'Listen to the gossip', onclick: () => { G.wrumor = ((G.wrumor == null ? -1 : G.wrumor) + 1) % WILD_RUMORS.length; msg = WILD_RUMORS[G.wrumor]; render(); } }),
        h('button', { class: 'btn', text: 'Save game', onclick: () => saveDialog(true) })));
    refreshAll();
  }
  render();
}
