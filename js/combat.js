'use strict';
/* ============================================================
   Tactical combat: turn-based, 2.5D isometric battlefield.
   AD&D 2e resolution: individual initiative (d10 + speed),
   THAC0 attack rolls, saving throws, morale, surprise,
   attacks of opportunity, spells, turning undead, backstab.
   ============================================================ */
const Combat = (() => {
  const CW0 = 1040, CH0 = 650, HW = 36, HH = 18, US = 1.22, SS = 2; // US: unit draw scale. SS: pixels drawn per layout unit, for a sharp picture on large screens
  let S = null, cv, c, raf = 0;
  const THEMES = {
    dungeon: { a: '#5f574b', edge: '#2b2620', block: '#7a6f5d', bg0: '#1b1814', bg1: '#070605' },
    crypt:   { a: '#474d5c', edge: '#1c1f28', block: '#666d80', bg0: '#141722', bg1: '#040508' },
    street:  { a: '#6b6860', edge: '#2e2c28', block: '#7a5a38', bg0: '#232a3d', bg1: '#0a0c14' },
    sanctum: { a: '#4b3f5e', edge: '#1d1728', block: '#6d5c8a', bg0: '#1d1530', bg1: '#06040b' },
    cave:    { a: '#55504a', edge: '#26221f', block: '#6e665c', bg0: '#1a1714', bg1: '#050404' },
    barrow:  { a: '#5a5546', edge: '#24211a', block: '#77705c', bg0: '#171a1c', bg1: '#040506' },
    keep:    { a: '#3f4447', edge: '#1a1d1f', block: '#5a6166', bg0: '#141b20', bg1: '#030506' },
    pit:     { a: '#5a3c34', edge: '#261713', block: '#7a5246', bg0: '#2a0f0a', bg1: '#070202' },
    plains:  { a: '#6a7f45', edge: '#4c5e31', block: '#8a8576', bg0: '#3d5a78', bg1: '#141c26', out: true, obs: ['rock', 'bush', 'bush'], n: [2, 4], tuft: '#88a358' },
    road:    { a: '#6a7f45', edge: '#4c5e31', block: '#8a8576', bg0: '#3d5a78', bg1: '#141c26', out: true, obs: ['rock', 'bush'], n: [1, 3], tuft: '#88a358', path: true },
    forest:  { a: '#4d6b39', edge: '#344b26', block: '#7a7468', bg0: '#1f3524', bg1: '#070d08', out: true, obs: ['tree', 'tree', 'tree', 'bush'], n: [6, 10], tuft: '#6c8f45', spread: true },
    hills:   { a: '#7c7a4e', edge: '#5a5836', block: '#8e8a7c', bg0: '#4a5a6e', bg1: '#161a20', out: true, obs: ['rock', 'rock', 'bush'], n: [4, 7], tuft: '#98965c', spread: true },
    swamp:   { a: '#4e5a3c', edge: '#36402a', block: '#6b6a5c', bg0: '#2a3326', bg1: '#080a07', out: true, obs: ['reed', 'reed', 'tree'], n: [4, 7], tuft: '#5f7040', pools: true, spread: true },
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const edist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const key = (x, y) => y * S.w + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < S.w && y < S.h;
  const alive = u => !u.gone && u.hp > 0;
  const helpless = u => !!((u.eff.hold && !(u.pc && wornHas(u.ch, 'free'))) || u.eff.sleep); // free action shrugs off holding and stunning
  const resists = (u, el) => !!el && u.pc && (wornHas(u.ch, 'resist', el) || (el === 'fire' && u.eff.resFire > 0));
  const SPELL_EL = { fireball: 'fire', burningHands: 'fire', delayedBlast: 'fire', incendiaryCloud: 'fire', meteorSwarm: 'fire', flameStrike: 'fire', coneOfCold: 'cold', iceStorm: 'cold' };
  const canAct = u => alive(u) && !helpless(u) && !u.eff.nausea;
  const foesOf = u => S.units.filter(e => e.side !== u.side && alive(e));
  const hdOf = u => u.pc ? u.ch.lvl : u.m.hd;
  const lvlOf = u => u.pc ? u.ch.lvl : (u.m.clvl || 1);
  const isUndead = u => !u.pc && !!u.m.undead;
  const isPerson = u => u.pc || u.m.tags.includes('person');
  const sgn = n => (n >= 0 ? '+' : '') + n;
  const blocks = u => !u.gone && (u.hp > 0 || (u.pc && !u.ch.dead));
  const unitAt = (x, y) => S.units.find(u => blocks(u) && u.x === x && u.y === y);

  /* ---------------- setup ---------------- */
  function mkPC(ch, x, y) {
    const u = { pc: true, ch, name: ch.name, x, y, side: 0, eff: {}, fig: figForChar(ch), face: 1, images: 0 };
    if (wornHas(ch, 'speed')) u.eff.haste = 999;  // boots of speed
    if (wornHas(ch, 'invis')) u.hidden = true;    // ring of invisibility
    Object.defineProperty(u, 'hp', { get() { return ch.hp; }, set(v) { ch.hp = Math.max(-10, v); } });
    Object.defineProperty(u, 'maxhp', { get() { return ch.maxhp; } });
    return u;
  }
  function mkMon(id, x, y, n) {
    const m = MONSTERS[id], hp = Math.max(1, rollDice(m.hp));
    return { pc: false, m, id, name: m.name + (n ? ' ' + n : ''), x, y, side: 1, hp, maxhp: hp, eff: {}, face: -1, images: 0,
             fig: Object.assign({ ph: Math.random() * 6 }, m.fig), spells: m.spells ? m.spells.slice() : null };
  }
  function setup(spec) {
    S = { w: 14, h: 10, units: [], fx: [], corpses: [], round: 0, cur: null, mode: null, busy: false, auto: false, xp: 0, prayer: {},
          theme: THEMES[spec.arena] || THEMES.dungeon, hover: null, reach: null, order: [], done: false, surprise: spec.surprise || null, night: !!spec.night };
    S.grid = new Uint8Array(S.w * S.h); S.obs = {};
    const th = S.theme;
    if (th.out) {
      // outdoor cover: trees, rocks, brush or reeds scattered across the field
      const n = th.n[0] + Math.floor(Math.random() * (th.n[1] - th.n[0] + 1));
      for (let i = 0, tries = 0; i < n && tries < 200; tries++) {
        const x = th.spread ? 4 + Math.floor(Math.random() * 6) + (Math.random() < 0.3 ? (Math.random() < 0.5 ? -3 : 3) : 0) : 5 + Math.floor(Math.random() * 4), y = Math.floor(Math.random() * S.h);
        if (!inb(x, y) || S.grid[key(x, y)] || x <= 3 || x >= 10) continue;
        S.grid[key(x, y)] = 1; S.obs[key(x, y)] = { kind: pick(th.obs), ph: Math.random() * 6, s: 0.85 + Math.random() * 0.3 }; i++;
      }
    } else for (let i = 0, n = 3 + rnd(4); i < n; i++) S.grid[key(5 + Math.floor(Math.random() * 4), Math.floor(Math.random() * S.h))] = 1 + Math.floor(Math.random() * 3);
    const pslots = [[3, 4], [3, 5], [3, 3], [1, 4], [1, 5], [1, 3]];
    spec.party.filter(ch => ch.hp > 0 && !ch.dead).forEach((ch, i) => S.units.push(mkPC(ch, pslots[i][0], pslots[i][1])));
    const list = [];
    for (const [id, n] of spec.mons) { const cnt = typeof n === 'number' ? n : Math.max(1, rollDice(n)); for (let i = 0; i < cnt; i++) list.push({ id, n: cnt > 1 ? i + 1 : 0 }); }
    list.sort((a, b) => back(a.id) - back(b.id));
    const ys = [4, 5, 3, 6, 2, 7, 1, 8];
    list.forEach((e, i) => S.units.push(mkMon(e.id, 10 + Math.floor(i / 8) + (i % 8 > 3 ? 1 : 0), ys[i % 8], e.n)));
    S.monCount = list.length;
    buildFloor();
  }
  function back(id) { const m = MONSTERS[id]; return (m.spells ? 2 : 0) + (m.ranged ? 1 : 0); }

  /* ---------------- geometry / rendering ---------------- */
  let CW = CW0, CH = CH0;
  /* The drawing area takes the shape of the box it is shown in, and is no bigger than the field needs,
     so a small field is drawn large (which matters on a phone). */
  function fit() {
    const w = cv.clientWidth, hh = cv.clientHeight;
    if (!w || !hh || !S) return;
    const a = clamp(w / hh, 1.6, 2.8), n = S.w + S.h;
    const ch = Math.round(clamp(Math.max(n * HH + 170, (n * HW + 50) / a), 380, CH0)), cw = Math.round(ch * a / 2) * 2;
    if (cw === CW && ch === CH) return;
    CW = cw; CH = ch; cv.width = CW * SS; cv.height = CH * SS; buildFloor();
  }
  const OX = () => CW / 2 - (S.w - S.h) * HW / 2, OY = () => (CH - (S.w + S.h) * HH) / 2 + 24;
  const scr = (x, y) => [OX() + (x - y) * HW, OY() + (x + y) * HH + HH];   // tile centre
  function diamond(g, x, y, inset) {
    const [sx, sy] = scr(x, y), i = inset || 0;
    g.beginPath(); g.moveTo(sx, sy - HH + i / 2); g.lineTo(sx + HW - i, sy); g.lineTo(sx, sy + HH - i / 2); g.lineTo(sx - HW + i, sy); g.closePath();
  }
  function buildFloor() {
    const f = document.createElement('canvas'); f.width = CW * SS; f.height = CH * SS;
    const g = f.getContext('2d'), th = S.theme;
    g.scale(SS, SS);
    const bg = g.createRadialGradient(CW / 2, CH / 2, 60, CW / 2, CH / 2, CW * 0.62);
    bg.addColorStop(0, th.bg0); bg.addColorStop(1, th.bg1);
    g.fillStyle = bg; g.fillRect(0, 0, CW, CH);
    // slab sides
    const T = 16;
    for (let x = 0; x < S.w; x++) { const [sx, sy] = scr(x, S.h - 1); g.fillStyle = shade(th.a, -0.55); g.beginPath(); g.moveTo(sx - HW, sy); g.lineTo(sx, sy + HH); g.lineTo(sx, sy + HH + T); g.lineTo(sx - HW, sy + T); g.closePath(); g.fill(); }
    for (let y = 0; y < S.h; y++) { const [sx, sy] = scr(S.w - 1, y); g.fillStyle = shade(th.a, -0.7); g.beginPath(); g.moveTo(sx + HW, sy); g.lineTo(sx, sy + HH); g.lineTo(sx, sy + HH + T); g.lineTo(sx + HW, sy + T); g.closePath(); g.fill(); }
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      diamond(g, x, y); g.fillStyle = shade(th.a, (Math.random() - 0.5) * 0.14 + ((x + y) % 2 ? -0.03 : 0.03)); g.fill();
      g.strokeStyle = th.edge; g.lineWidth = 1; g.stroke();
    }
    if (th.out) outdoorFloor(g, th);
    // soft light pool
    const lg = g.createRadialGradient(CW / 2, CH / 2 + 10, 40, CW / 2, CH / 2 + 10, 480);
    lg.addColorStop(0, 'rgba(255,220,160,.10)'); lg.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = lg; g.fillRect(0, 0, CW, CH);
    if (S.night) { g.fillStyle = 'rgba(10,18,48,.42)'; g.fillRect(0, 0, CW, CH); }
    S.floor = f;
  }
  function outdoorFloor(g, th) {
    // worn path across the field, puddles, grass tufts and pebbles (drawn once into the floor bitmap)
    if (th.path) for (let x = 0; x < S.w; x++) for (const y of [4, 5]) { diamond(g, x, y, 4); g.fillStyle = 'rgba(150,125,85,' + (0.45 + Math.random() * 0.2) + ')'; g.fill(); }
    if (th.pools) for (let i = 0; i < 6; i++) {
      const x = 2 + Math.floor(Math.random() * 10), y = Math.floor(Math.random() * S.h);
      if (S.grid[key(x, y)]) continue;
      const [sx, sy] = scr(x, y);
      g.fillStyle = 'rgba(30,48,52,.75)'; g.beginPath(); g.ellipse(sx, sy, HW * 0.7, HH * 0.6, 0, 0, 6.3); g.fill();
      g.strokeStyle = 'rgba(160,190,180,.25)'; g.lineWidth = 1; g.beginPath(); g.ellipse(sx - 4, sy - 2, HW * 0.4, HH * 0.3, 0, 3.4, 5.4); g.stroke();
    }
    for (let i = 0; i < 520; i++) {
      const x = Math.random() * S.w, y = Math.random() * S.h, [sx, sy] = scr(x - 0.5, y - 0.5);
      if (Math.random() < 0.82) {
        g.strokeStyle = shade(th.tuft, (Math.random() - 0.5) * 0.4); g.lineWidth = 1.2;
        g.beginPath(); for (let k = -1; k <= 1; k++) { g.moveTo(sx + k * 2, sy); g.lineTo(sx + k * 3.5 + (Math.random() - 0.5) * 2, sy - 4 - Math.random() * 4); } g.stroke();
      } else { g.fillStyle = Math.random() < 0.5 ? 'rgba(200,190,170,.5)' : (Math.random() < 0.5 ? '#e8d77a' : '#c9a6e0'); g.beginPath(); g.arc(sx, sy, 1.4, 0, 6.3); g.fill(); }
    }
  }
  function drawObstacle(x, y, o) {
    const [sx, sy] = scr(x, y), s = o.s;
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(sx + 5, sy + 3, HW * 0.75 * s, HH * 0.75 * s, 0, 0, 6.3); c.fill();
    c.strokeStyle = 'rgba(10,12,8,.6)'; c.lineWidth = 1;
    if (o.kind === 'tree') {
      c.fillStyle = '#5a4030'; c.fillRect(sx - 3, sy - 26 * s, 6, 26 * s);
      const cols = S.theme.pools ? ['#3e4b2c', '#4f5d37', '#5f6e43'] : ['#24452a', '#2f5a34', '#3c6e3f'];
      for (let i = 0; i < 3; i++) { const w = (24 - i * 6) * s, top = sy - (26 + i * 15) * s; c.fillStyle = cols[i]; c.beginPath(); c.moveTo(sx - w, top + 6); c.lineTo(sx, top - 24 * s); c.lineTo(sx + w, top + 6); c.closePath(); c.fill(); c.stroke(); }
    } else if (o.kind === 'rock') {
      const col = S.theme.block;
      c.fillStyle = shade(col, -0.3); c.beginPath(); c.moveTo(sx - 24 * s, sy + 2); c.lineTo(sx - 18 * s, sy - 16 * s); c.lineTo(sx - 2, sy - 24 * s); c.lineTo(sx + 2, sy + 9 * s); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = shade(col, -0.05); c.beginPath(); c.moveTo(sx - 2, sy - 24 * s); c.lineTo(sx + 14 * s, sy - 19 * s); c.lineTo(sx + 24 * s, sy - 2); c.lineTo(sx + 2, sy + 9 * s); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = 'rgba(120,150,80,.45)'; c.beginPath(); c.ellipse(sx + 4, sy - 19 * s, 8 * s, 3 * s, 0.2, 0, 6.3); c.fill();
    } else if (o.kind === 'bush') {
      for (const [dx, dy, r, k] of [[-10, -6, 11, -0.15], [9, -7, 10, -0.05], [0, -14, 12, 0.08]]) { c.fillStyle = shade('#4f7a3a', k); c.beginPath(); c.arc(sx + dx * s, sy + dy * s, r * s, 0, 6.3); c.fill(); c.stroke(); }
      c.fillStyle = '#c94a4a'; for (const [dx, dy] of [[-6, -12], [5, -16], [10, -6]]) { c.beginPath(); c.arc(sx + dx * s, sy + dy * s, 1.6, 0, 6.3); c.fill(); }
    } else {
      c.strokeStyle = '#7d8a4a'; c.lineWidth = 2; c.beginPath();
      for (let i = -4; i <= 4; i++) { const bx = sx + i * 4 * s, lean = Math.sin(o.ph + i) * 5; c.moveTo(bx, sy + 4); c.quadraticCurveTo(bx + lean * 0.5, sy - 14 * s, bx + lean, sy - (24 + (i % 3) * 5) * s); }
      c.stroke();
      c.fillStyle = '#5b3d22'; for (let i = -2; i <= 2; i += 2) { c.beginPath(); c.ellipse(sx + i * 5 * s + Math.sin(o.ph + i) * 4, sy - (27 + i) * s, 2, 5, 0, 0, 6.3); c.fill(); }
    }
  }
  function drawBlock(x, y, kind) {
    const [sx, sy] = scr(x, y), hgt = 20 + kind * 9, col = S.theme.block, w = HW - 6, hh = HH - 3;
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(sx + 4, sy + 4, HW * 0.8, HH * 0.8, 0, 0, 6.3); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1;
    c.fillStyle = shade(col, -0.25); c.beginPath(); c.moveTo(sx - w, sy); c.lineTo(sx, sy + hh); c.lineTo(sx, sy + hh - hgt); c.lineTo(sx - w, sy - hgt); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = shade(col, -0.5); c.beginPath(); c.moveTo(sx + w, sy); c.lineTo(sx, sy + hh); c.lineTo(sx, sy + hh - hgt); c.lineTo(sx + w, sy - hgt); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = shade(col, 0.1); c.beginPath(); c.moveTo(sx, sy - hh - hgt); c.lineTo(sx + w, sy - hgt); c.lineTo(sx, sy + hh - hgt); c.lineTo(sx - w, sy - hgt); c.closePath(); c.fill(); c.stroke();
  }
  function upos(u, now) {
    let x = u.x, y = u.y;
    if (u.anim) { const k = Math.min(1, (now - u.anim.t0) / u.anim.d); x = u.anim.fx + (u.x - u.anim.fx) * k; y = u.anim.fy + (u.y - u.anim.fy) * k; if (k >= 1) u.anim = null; }
    if (u.lunge) { const k = (now - u.lunge.t0) / 220; if (k >= 1) u.lunge = null; else { const a = Math.sin(k * Math.PI) * 0.38; x += u.lunge.dx * a; y += u.lunge.dy * a; } }
    return [x, y];
  }
  function areaCells(cx, cy, r) { const out = []; for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (Math.hypot(x - cx, y - cy) <= r) out.push([x, y]); return out; }
  function lineCells(u, t, len) {
    const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy); const out = [];
    if (!d) return out;
    let last = -1;
    for (let s = 0.5; s <= len; s += 0.25) {
      const x = Math.round(u.x + dx / d * s), y = Math.round(u.y + dy / d * s);
      if (!inb(x, y) || S.grid[key(x, y)]) break;
      if (x === u.x && y === u.y) continue;
      if (key(x, y) !== last) { out.push([x, y]); last = key(x, y); }
    }
    return out;
  }
  function coneCells(u, t, len) {
    const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, out = [];
    if (len > 1) { // a long cone: every open square within reach, inside the spread, that the caster can see
      for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
        const ex = x - u.x, ey = y - u.y, e = Math.hypot(ex, ey);
        if (e && e <= len + 0.5 && (ex * dx + ey * dy) / (e * d) >= 0.86 && !S.grid[key(x, y)] && los(u, { x, y })) out.push([x, y]);
      }
      return out;
    }
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      if (!i && !j) continue;
      if ((i * dx + j * dy) / (Math.hypot(i, j) * d) >= 0.7 && inb(u.x + i, u.y + j)) out.push([u.x + i, u.y + j]);
    }
    return out;
  }
  function los(a, b) {
    let x0 = a.x, y0 = a.y; const x1 = b.x, y1 = b.y, dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
      if ((x0 !== x1 || y0 !== y1) && S.grid[key(x0, y0)]) return false;
    }
  }

  function draw(now) {
    fit();
    c.setTransform(SS, 0, 0, SS, 0, 0);
    c.drawImage(S.floor, 0, 0, CW, CH);
    const u = S.cur, m = S.mode;
    // highlights
    if (u && u.pc && S.endTurn && !S.busy) {
      if (m && m.t === 'move' && S.reach && !u.attacked) {
        c.fillStyle = 'rgba(90,170,255,.20)';
        for (let k = 0; k < S.reach.dist.length; k++) if (S.reach.dist[k] <= u.mp && S.reach.dist[k] > 0) { diamond(c, k % S.w, (k / S.w) | 0, 3); c.fill(); }
      }
      if (m && m.t === 'target') {
        c.fillStyle = 'rgba(255,200,80,.10)';
        for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (validTarget(u, m, x, y)) { diamond(c, x, y, 3); c.fill(); }
        if (S.hover && validTarget(u, m, S.hover.x, S.hover.y)) {
          c.fillStyle = 'rgba(255,120,40,.38)';
          for (const [x, y] of previewCells(u, m, S.hover)) { diamond(c, x, y, 2); c.fill(); }
        }
      }
    }
    if (u && alive(u)) { diamond(c, u.x, u.y, 2); c.strokeStyle = 'rgba(255,214,90,' + (0.6 + 0.4 * Math.sin(now / 180)) + ')'; c.lineWidth = 2.5; c.stroke(); }
    if (S.hover && inb(S.hover.x, S.hover.y)) { diamond(c, S.hover.x, S.hover.y, 1); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.5; c.stroke(); }
    // depth-sorted entities
    const list = [];
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (S.grid[key(x, y)]) list.push({ d: x + y, b: [x, y, S.grid[key(x, y)]] });
    for (const co of S.corpses) list.push({ d: co.x + co.y - 0.2, co });
    for (const un of S.units) { if (un.gone) continue; const [x, y] = upos(un, now); list.push({ d: x + y + (un.hp > 0 ? 0.1 : -0.1), un, x, y }); }
    list.sort((a, b) => a.d - b.d);
    for (const e of list) {
      if (e.b) { const o = S.obs[key(e.b[0], e.b[1])]; if (o) drawObstacle(e.b[0], e.b[1], o); else drawBlock(e.b[0], e.b[1], e.b[2]); }
      else if (e.co) { const k = (now - e.co.t0) / 900; if (k < 1) { const [sx, sy] = scr(e.co.x, e.co.y); drawFig(c, e.co.fig, sx, sy, 0, { down: true, alpha: 1 - k, flip: e.co.flip, scale: US }); } }
      else drawUnit(e.un, e.x, e.y, now);
    }
    S.corpses = S.corpses.filter(co => now - co.t0 < 900);
    // effects
    S.fx = S.fx.filter(f => now - f.t0 < f.d);
    for (const f of S.fx) f.draw(Math.max(0, (now - f.t0) / f.d));
    // header
    c.font = '600 15px Georgia, serif'; c.textAlign = 'left'; c.fillStyle = '#e8d9b0';
    c.fillText('Round ' + Math.max(1, S.round), 18, 28);
    if (u) { c.fillStyle = u.side ? '#ff9c8a' : '#9fd4ff'; c.fillText(u.name + (u.pc && S.endTurn ? '  ·  moves ' + Math.floor(u.mp / 2) : ''), 18, 50); }
    const hv = S.hover && unitAt(S.hover.x, S.hover.y);
    if (hv) {
      c.textAlign = 'right'; c.fillStyle = '#e8d9b0'; c.fillText(hv.name, CW - 18, 28);
      c.font = '13px Georgia, serif'; c.fillStyle = '#b9b1a0';
      c.fillText(hv.pc ? 'AC ' + acOf(hv) + '  HP ' + hv.hp + '/' + hv.maxhp : 'AC ' + acOf(hv) + '  ' + health(hv), CW - 18, 47);
      const st = Object.keys(hv.eff).map(k => EFF[k] || k).concat(hv.images ? [hv.images + ' images'] : []).join(', ');
      if (st) c.fillText(st, CW - 18, 64);
    }
  }
  const EFF = { hold: 'Held', sleep: 'Asleep', nausea: 'Nauseated', bless: 'Blessed', protEvil: 'Protected', shield: 'Shield', haste: 'Hasted', silence: 'Silenced', aid: 'Aid' };
  function health(u) { const k = u.hp / u.maxhp; return k >= 1 ? 'Unharmed' : k > 0.66 ? 'Lightly wounded' : k > 0.33 ? 'Wounded' : 'Badly wounded'; }
  function drawUnit(u, x, y, now) {
    const [sx, sy] = scr(x, y), s = (u.fig.s || 1) * US, down = u.hp <= 0;
    if (!down) {
      c.beginPath(); c.ellipse(sx, sy, 20, 9, 0, 0, 6.3);
      c.strokeStyle = u.side ? 'rgba(235,80,60,.9)' : 'rgba(80,180,255,.9)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = u.side ? 'rgba(235,80,60,.16)' : 'rgba(80,180,255,.16)'; c.fill();
    }
    let jx = 0;
    const hit = u.flash && now - u.flash < 200;
    if (hit) jx = Math.sin(now / 12) * 3;
    if (u.images) for (let i = 0; i < Math.min(3, u.images); i++) drawFig(c, u.fig, sx + (i - 1) * 16 + Math.sin(now / 300 + i * 2) * 4, sy - 2, now, { alpha: 0.35, flip: u.face < 0, noShadow: true, scale: US });
    drawFig(c, u.fig, sx + jx, sy, now, { down, flip: u.face < 0, alpha: u.hidden ? 0.45 : 1, scale: US });
    if (hit) { c.fillStyle = 'rgba(255,60,40,.35)'; c.beginPath(); c.ellipse(sx, sy - 24 * s, 16 * s, 28 * s, 0, 0, 6.3); c.fill(); }
    if (down) return;
    const top = sy - (u.fig.type ? 30 * US : 58 * s) - 6, k = clamp(u.hp / u.maxhp, 0, 1);
    c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(sx - 17, top, 34, 5);
    c.fillStyle = k > 0.5 ? '#5fce6a' : k > 0.25 ? '#e3b23c' : '#e2493b'; c.fillRect(sx - 16, top + 1, 32 * k, 3);
    let tag = u.eff.sleep ? 'Zzz' : u.eff.hold ? 'HELD' : u.eff.nausea ? 'SICK' : u.eff.blind ? 'BLIND' : u.fleeing ? 'FLEE' : u.eff.haste ? 'HASTE' : '';
    if (tag) { c.font = 'bold 11px Verdana, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(tag, sx, top - 4); c.fillStyle = '#ffe9a8'; c.fillText(tag, sx, top - 4); }
  }
  function frame(now) { if (!S) return; draw(now); raf = requestAnimationFrame(frame); }

  /* ---------------- effects ---------------- */
  function fx(d, drawFn) { S.fx.push({ t0: performance.now(), d, draw: drawFn }); return sleep(d); }
  function float(u, text, col) {
    const [sx, sy] = scr(u.x, u.y), h = u.fig ? (u.fig.type ? 30 : 56 * (u.fig.s || 1)) * US : 20;
    S.fx.push({ t0: performance.now(), d: 950, draw: k => {
      c.font = 'bold 17px Verdana, sans-serif'; c.textAlign = 'center'; c.globalAlpha = 1 - k * k;
      c.lineWidth = 4; c.strokeStyle = '#000'; c.strokeText(text, sx, sy - h - 10 - k * 30); c.fillStyle = col; c.fillText(text, sx, sy - h - 10 - k * 30); c.globalAlpha = 1;
    } });
  }
  function shot(a, t, col, arrow) {
    const [x0, y0] = scr(a.x, a.y), [x1, y1] = scr(t.x, t.y), d = 110 + Math.hypot(x1 - x0, y1 - y0) * 0.45;
    return fx(d, k => {
      const x = x0 + (x1 - x0) * k, y = y0 - 30 + (y1 - y0) * k - Math.sin(k * Math.PI) * (arrow ? 18 : 6);
      if (arrow) { const ang = Math.atan2(y1 - y0, x1 - x0); c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(x - Math.cos(ang) * 12, y - Math.sin(ang) * 12); c.lineTo(x, y); c.stroke(); }
      else { const g = c.createRadialGradient(x, y, 0, x, y, 12); g.addColorStop(0, '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, 12, 0, 6.3); c.fill(); }
    });
  }
  function burst(x, y, r, col, d) {
    const [sx, sy] = scr(x, y);
    return fx(d || 450, k => {
      c.save(); c.translate(sx, sy); c.scale(1, 0.5); c.globalAlpha = (1 - k) * 0.8;
      const R = (r + 0.5) * HW * 1.4 * (0.3 + 0.7 * k), g = c.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
      g.addColorStop(0, '#fff'); g.addColorStop(0.4, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, 6.3); c.fill(); c.restore();
      c.globalAlpha = (1 - k) * 0.6; c.fillStyle = col; c.beginPath(); c.arc(sx, sy - 20 - k * 30, (r + 0.5) * 16 * (1 - k * 0.5), 0, 6.3); c.fill(); c.globalAlpha = 1;
    });
  }
  function bolt(cells, col) {
    const pts = cells.map(([x, y]) => scr(x, y));
    return fx(380, k => {
      c.strokeStyle = col; c.lineWidth = 4 * (1 - k) + 1; c.shadowColor = '#fff'; c.shadowBlur = 12; c.beginPath();
      pts.forEach(([x, y], i) => { const jx = (Math.random() - 0.5) * 10, jy = (Math.random() - 0.5) * 10 - 24; if (i) c.lineTo(x + jx, y + jy); else c.moveTo(x + jx, y + jy); });
      c.stroke(); c.shadowBlur = 0;
    });
  }
  function faceTo(a, t) { const d = (t.x - t.y) - (a.x - a.y); if (d) a.face = d > 0 ? 1 : -1; }

  /* ---------------- rules ---------------- */
  function acOf(u, ranged) {
    let ac = u.pc ? charAC(u.ch) : u.m.ac;
    if (u.eff.shield) { const s = ranged ? 2 : 4; if (s < ac) ac = s; }
    if (u.armorSpell && ac > 6) ac = 6;
    if (u.eff.blind) ac += 4; // the blinded are easy to hit
    if (u.eff.invuln) ac -= 2;
    return ac;
  }
  const thac0Of = u => u.pc ? charThac0(u.ch) : u.m.thac0;
  function saveNeed(u, type, opt) {
    let t = u.pc ? charSave(u.ch, type, opt) : saveBase('warrior', Math.floor(u.m.hd))[type];
    if (u.eff.protEvil) t -= 2;
    if (u.eff.invuln) t -= 2;
    if (u.eff.aid) t -= 1;
    if (S.prayer[u.side]) t -= 1;
    if (S.prayer[1 - u.side]) t += 1;
    return t - ((opt && opt.mod) || 0);
  }
  function save(u, type, opt) {
    if (!u.pc && u.m.mr && !(opt && opt.natural) && rnd(100) <= u.m.mr) return true; // magic resistance: the magic slides off as if it had saved
    const r = rnd(20); return r === 20 || (r !== 1 && r >= saveNeed(u, type, opt));
  }
  function moveSq(u) { const mv = u.pc ? moveRate(u.ch) : u.m.mv; return Math.ceil(mv / 2) * (u.eff.haste ? 2 : 1); }
  function hasRanged(u) { return u.pc ? !!rwpn(u.ch) : !!u.m.ranged; }
  function maxRange(u) { return (u.pc ? rwpn(u.ch).range : u.m.ranged.range)[2] * 3; }
  function nAttacks(u, ranged) {
    let n;
    if (u.pc) { const h = atkHalves(u.ch, ranged); n = Math.floor(h / 2) + ((h % 2) && S.round % 2 === 0 ? 1 : 0); }
    else n = ranged ? u.m.ranged.rof : u.m.atk.length;
    return n * (u.eff.haste ? 2 : 1);
  }
  function flanked(a, t) { const o = unitAt(2 * t.x - a.x, 2 * t.y - a.y); return !!o && o.side === a.side && o !== a && canAct(o); }

  /* evil creatures within one square of a paladin who is on their feet fight at -1 to hit */
  function inAura(a) { return S.units.some(p => p.pc && p.side !== a.side && p.ch.cls === 'P' && canAct(p) && cheb(p, a) <= 1); }
  /* a ranger fighting with two weapons follows the first melee attack of each round with an off-hand strike */
  async function offhand(u, t) {
    if (!u.pc || !twoWeapon(u.ch) || u.offRound === S.round || !alive(t) || !canAct(u) || cheb(u, t) !== 1) return;
    u.offRound = S.round;
    await strike(u, t, { off: true });
  }
  async function strike(a, t, o) {
    o = o || {};
    faceTo(a, t);
    let hitB = 0, dmgB = 0, dmgSpec, dt, w = null;
    if (a.pc) {
      const ch = a.ch, sm = strMods(ch);
      if (o.ranged) {
        w = rwpn(ch); hitB = dexMods(ch).missile + (w.bonus || 0); dmgB = w.bonus || 0;
        if (w.thrown) { hitB += sm.hit; dmgB += sm.dmg; }
        if (ch.race === 'elf' && w.bow) hitB++;
        if (ch.race === 'halfling' && !w.bow && baseId(ch.eq.ranged) !== 'crossbow') hitB++;
      } else if (o.off) { w = OFFHAND; hitB = sm.hit; dmgB = sm.dmg; }
      else {
        w = wpn(ch); hitB = sm.hit + (w.bonus || 0); dmgB = sm.dmg + (w.bonus || 0);
        if (isSpecialized(ch, ch.eq.weapon)) { hitB += 1; dmgB += 2; }
        if (ch.race === 'elf' && ['longsword', 'shortsword'].includes(baseId(ch.eq.weapon))) hitB++;
      }
      if (!o.ranged && !t.pc) dmgB += foeDmg(ch, t.m.tags);
      if (!o.off && !t.pc) { // what the weapon itself adds against this foe
        const tg = t.m.tags; let ex = 0;
        for (const k in w.vs || {}) if (tg.includes(k)) ex = Math.max(ex, w.vs[k]);
        if (w.vsRegen && t.m.regen) ex = Math.max(ex, w.vsRegen);
        hitB += ex; dmgB += ex;
        if (w.pal && ch.cls === 'P') { hitB += w.pal.bonus - w.bonus; dmgB += w.pal.bonus - w.bonus + (tg.includes('evil') ? w.pal.evilDmg : 0); }
        if (w.dwarf && ch.race === 'dwarf') { hitB += w.dwarf.bonus - w.bonus; dmgB += w.dwarf.bonus - w.bonus; }
      }
      dmgSpec = (!t.pc && 'LHG'.includes(t.m.size)) ? w.dmgL : w.dmg; dt = w.dt;
    } else if (o.ranged) { dmgSpec = a.m.ranged.dmg; dt = 'B'; }
    else { dmgSpec = a.m.atk[o.i || 0]; dt = a.m.dt || 'S'; }
    let mods = hitB;
    if (a.eff.bless) mods++;
    if (a.eff.aid) mods++;
    if (a.eff.blind) mods -= 4;
    if (S.prayer[a.side]) mods++;
    if (S.prayer[1 - a.side]) mods--;
    if (t.eff.protEvil && !a.pc && a.m.tags.includes('evil')) mods -= 2;
    if (!a.pc && S.ward && S.ward[t.side] && a.m.tags.some(k => S.ward[t.side].includes(k))) mods -= 4; // a scroll of protection
    if (!a.pc && a.m.tags.includes('evil') && inAura(a)) mods -= 1; // a paladin's aura of protection
    if (o.ranged) {
      const rg = (a.pc ? w.range : a.m.ranged.range), d = edist(a, t);
      mods += d <= rg[0] * 3 ? 0 : d <= rg[1] * 3 ? -2 : -5;
    }
    if (o.free) mods += 2; // striking a foe who turns to flee
    if (a.pc && !t.pc) {
      const r = a.ch.race, tg = t.m.tags;
      if (r === 'dwarf' && (tg.includes('orc') || tg.includes('goblin'))) mods++;
      if (r === 'gnome' && (tg.includes('kobold') || tg.includes('goblin'))) mods++;
      if (a.ch.cls === 'R' && a.ch.foe && tg.includes(a.ch.foe)) mods += 4;
    }
    if (!a.pc && t.pc) {
      const r = t.ch.race, tg = a.m.tags;
      if ((r === 'dwarf' && tg.includes('bigfolk')) || (r === 'gnome' && tg.includes('giantkin'))) mods -= 4;
    }
    const bs = a.pc && a.ch.cls === 'T' && !o.ranged && !o.free && (a.hidden || flanked(a, t));
    if (bs) mods += 4;
    a.hidden = false;
    const roll = rnd(20), need = thac0Of(a) - acOf(t, o.ranged), auto = helpless(t);
    const hit = auto || roll === 20 || (roll !== 1 && roll + mods >= need);
    if (o.ranged) await shot(a, t, a.pc && w.bow ? '#e8d9b0' : '#cfcfcf', true);
    else { a.lunge = { dx: t.x - a.x, dy: t.y - a.y, t0: performance.now() }; await sleep(110); }
    const how = o.free ? ' strikes at the fleeing ' : o.ranged ? ' shoots at ' : o.off ? ' strikes off-hand at ' : bs ? ' backstabs ' : ' attacks ';
    const detail = auto ? 'helpless target' : 'd20 ' + roll + (mods ? sgn(mods) : '') + ' vs ' + need;
    if (!auto && t.images > 0 && Math.random() < t.images / (t.images + 1)) {
      t.images--; log(a.name + how + t.name + ' but only shatters a mirror image.'); float(t, 'image', '#c9a8ff'); await sleep(240); return;
    }
    if (!hit) { log(a.name + how + t.name + ': miss (' + detail + ').', 'dim'); float(t, 'miss', '#c9c9c9'); await sleep(240); return; }
    // some creatures are harmed only by magic (or silver) weapons
    const hw = o.off ? wpn(a.ch) : w; // the off-hand blade harms what the main weapon can
    if (a.pc && !t.pc && t.m.hitBy && !(hw && (hw.bonus > 0 || (t.m.hitBy === 'silver' && hw.silver)))) {
      log(a.name + how + t.name + ', but the blow has no effect! (' + (t.m.hitBy === 'silver' ? 'silver or magic' : 'magic') + ' weapons are needed)', 'bad');
      float(t, 'no effect', '#c9c9c9'); await sleep(260); return;
    }
    if (t.stoneskin > 0) {
      t.stoneskin--; log(a.name + how + t.name + ', but the blow glances from skin of stone' + (t.stoneskin ? '' : '; the spell is spent') + '.', 'dim');
      float(t, 'stoneskin', '#c9c9c9'); await sleep(240); return;
    }
    let dmg = rollDice(dmgSpec);
    if (bs) dmg *= backstabMult(a.ch);
    dmg += dmgB + (S.prayer[a.side] ? 1 : 0);
    dmg = Math.max(1, dmg);
    if (!t.pc && t.m.halfEdged && dt !== 'B') dmg = Math.max(1, dmg >> 1);
    if (a.pc && w && !o.off && !t.pc && !auto) { // enchanted weapons with powers of their own
      const tg = t.m.tags, shapeless = tg.includes('ooze') || tg.includes('elemental');
      let mult = 1;
      for (const k in w.mult || {}) if (tg.includes(k)) mult = Math.max(mult, w.mult[k]);
      if (w.dwarf && a.ch.race === 'dwarf') for (const k in w.dwarf.mult || {}) if (tg.includes(k)) mult = Math.max(mult, w.dwarf.mult[k]);
      if (w.critOn && roll >= w.critOn) mult = Math.max(mult, w.critMult || 2);
      dmg *= mult;
      if (w.extra) dmg += rollDice(w.extra);
      let dead = null;
      if (w.slayOn && roll >= w.slayOn && !shapeless) dead = '\'s head leaps from its shoulders';
      else if (w.slaySave && roll >= w.slaySave && !isUndead(t) && !save(t, 4)) dead = '\'s life is drunk by the blade';
      else if (w.venom && roll === 20 && !isUndead(t) && !tg.includes('construct') && !save(t, 0, { poison: true })) dead = ' stiffens as the venom reaches its heart';
      else if (w.disrupt && isUndead(t)) { if (save(t, 4, { natural: true })) dmg *= 2; else dead = ' is blasted to dust by the mace'; }
      if (dead) { log(a.name + how + t.name + ': HIT (' + detail + '). ' + t.name + dead + '!', 'good'); await slay(t); return; }
      if (w.crit20 && roll === 20) { const n = rollDice(w.crit20); dmg += n; if (w.drainHeal) heal(a, n); }
    }
    log(a.name + how + t.name + ': HIT for ' + dmg + (bs ? ' (x' + backstabMult(a.ch) + ' backstab)' : '') + ' (' + detail + ').', a.pc ? 'good' : 'bad');
    await hurt(t, dmg);
    if (alive(t) && !a.pc && t.pc) {
      // ghoul paralysis spares elves; ghasts and carrion crawlers do not
      if (a.m.paralyze && (a.m.paralyze === 'all' || t.ch.race !== 'elf') && !t.eff.hold && !save(t, 0)) { t.eff.hold = rollDice('1d6+2'); t.paralyzed = true; log(t.name + ' is paralyzed by the ' + a.m.name.toLowerCase() + '\'s touch!', 'bad'); float(t, 'paralyzed', '#d7b3ff'); }
      if (a.m.petrify && !t.ch.dead && !save(t, 2)) { log(t.name + ' stiffens, greys, and is turned to stone!', 'bad'); float(t, 'stone', '#c9c9c9'); await slay(t, '#c9c9c9'); return; }
      if (a.m.rust) {
        const metal = id => id && /chain|splint|banded|plate|scale|ring|shield/.test(baseId(id)) && !(item(id).bonus > 0), slot = metal(t.ch.eq.shield) ? 'shield' : metal(t.ch.eq.armor) ? 'armor' : null;
        if (slot) { log(t.name + '\'s ' + item(t.ch.eq[slot]).name.toLowerCase() + ' crumbles into flakes of rust!', 'bad'); t.ch.eq[slot] = null; float(t, 'rust', '#c96a3a'); }
      }
      if (a.m.drain && wornHas(t.ch, 'noDrain')) log(t.name + '\'s amulet flares; the draining touch finds no hold.', 'good');
      else for (let n = a.m.drain === true ? 1 : (a.m.drain || 0); n > 0 && !t.ch.dead; n--) {
        const lived = drainLevel(t.ch);
        if (lived) { log('The touch of ' + a.name + ' drains a life level from ' + t.name + '! (now level ' + t.ch.lvl + ')', 'bad'); float(t, '-1 level', '#9fd4ff'); }
        else { log(t.name + ' is drained of the last spark of life!', 'bad'); t.eff = {}; float(t, 'drained', '#9fd4ff'); }
        UI.refreshParty();
      }
      if (a.m.poison && !t.ch.poison && !wornHas(t.ch, 'noPoison') && !save(t, 0, { poison: true, mod: a.m.poison.mod })) { t.ch.poison = { dmg: a.m.poison.dmg, at: G.time + 15 + rnd(15) }; log(t.name + ' is poisoned! The venom will strike within the half hour.', 'bad'); float(t, 'poisoned', '#9be36a'); }
    }
  }
  /* kill outright: a monster is slain, a character is beyond bandaging */
  async function slay(t, col) { await hurt(t, (t.pc ? t.hp + 10 : t.hp), col); }
  async function hurt(t, dmg, col) {
    if (S.el && resists(t, S.el)) { dmg = Math.max(1, dmg >> 1); log(t.name + ' is warded against ' + S.el + ' and takes only ' + dmg + '.', 'dim'); }
    if (t.pc && t.ch.fx.armor > 0) { t.ch.fx.armor -= dmg; if (t.ch.fx.armor <= 0) { delete t.ch.fx.armor; log(t.name + '\'s Armor spell is exhausted.', 'dim'); } }
    t.hp -= dmg; t.hitRound = S.round; t.flash = performance.now();
    float(t, '-' + dmg, col || '#ff6b5e');
    if (t.eff.sleep) { delete t.eff.sleep; if (alive(t)) log(t.name + ' is jolted awake!', 'dim'); }
    if (t.hp <= 0) {
      if (t.pc) {
        if (t.hp <= -10) { t.ch.dead = true; log(t.name + ' is slain!', 'bad'); } else log(t.name + ' falls, gravely wounded!', 'bad');
        t.eff = {}; t.images = 0; t.stoneskin = 0; t.hidden = false; t.stable = false;
      } else {
        t.gone = true; t.dead = true; S.xp += t.m.xp; bestiarySlay(t.m.id);
        S.corpses.push({ x: t.x, y: t.y, fig: t.fig, t0: performance.now(), flip: t.face < 0 });
        log(t.name + ' is slain.', 'good'); morale(t);
      }
    }
    UI.refreshParty();
    await sleep(200);
  }
  function heal(t, n) {
    if (t.pc && t.ch.dead) return;
    t.hp = Math.min(t.maxhp, Math.max(0, t.hp) + n); t.stable = true;
    float(t, '+' + n, '#7dff8a'); UI.refreshParty();
  }
  function morale(dead) {
    const live = S.units.filter(u => !u.pc && alive(u));
    if (!live.length) return;
    let trig = false;
    if (dead.m.leader && !S.mlLeader) { S.mlLeader = true; trig = true; }
    if (!S.mlHalf && live.length <= S.monCount / 2) { S.mlHalf = true; trig = true; }
    if (!trig) return;
    for (const u of live) {
      if (u.m.ml >= 20 || u.fleeing) continue;
      if (dice(2, 10) > u.m.ml) { u.fleeing = true; log(u.name + ' fails a morale check and breaks!', 'good'); }
    }
  }

  /* ---------------- movement ---------------- */
  function flood(u) {
    const n = S.w * S.h, dist = new Float32Array(n).fill(1e9), prev = new Int16Array(n).fill(-1), occ = new Uint8Array(n);
    for (const o of S.units) if (o !== u && blocks(o)) occ[key(o.x, o.y)] = 1;
    const q = [key(u.x, u.y)]; dist[q[0]] = 0;
    while (q.length) {
      const k = q.shift(), x = k % S.w, y = (k / S.w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny)) continue;
        const nk = key(nx, ny);
        if (S.grid[nk] || occ[nk]) continue;
        if (dx && dy && (S.grid[key(x + dx, y)] || S.grid[key(x, y + dy)])) continue;
        const cst = dist[k] + (dx && dy ? 3 : 2);
        if (cst < dist[nk]) { dist[nk] = cst; prev[nk] = k; q.push(nk); }
      }
    }
    return { dist, prev };
  }
  function pathTo(f, k) { const p = []; while (f.prev[k] >= 0) { p.push(k); k = f.prev[k]; } return p.reverse(); }
  async function walk(u, path) {
    for (const k of path) {
      const nx = k % S.w, ny = (k / S.w) | 0, cost = (nx !== u.x && ny !== u.y) ? 3 : 2;
      if (cost > u.mp || unitAt(nx, ny)) break;
      // leaving a threatened square provokes a free attack
      for (const e of foesOf(u)) {
        if (cheb(e, u) === 1 && cheb(e, { x: nx, y: ny }) > 1 && canAct(e) && !e.fleeing && !u.aoo.has(e) && !u.hidden) {
          u.aoo.add(e); await strike(e, u, { free: true });
          if (!canAct(u)) return;
        }
      }
      faceTo(u, { x: nx, y: ny });
      u.anim = { fx: u.x, fy: u.y, t0: performance.now(), d: 100 };
      u.x = nx; u.y = ny; u.mp -= cost;
      await sleep(100);
    }
  }

  /* ---------------- spells ---------------- */
  function unitsIn(cells) { const set = new Set(cells.map(([x, y]) => key(x, y))); return S.units.filter(u => alive(u) && set.has(key(u.x, u.y))); }
  /* via: cast from a scroll or a device, at that item's level, with no chance of a priest's prayer failing */
  async function cast(u, id, t, via) {
    S.el = SPELL_EL[id] || null;
    try { await castSpell(u, id, t, via); } finally { S.el = null; }
  }
  async function castSpell(u, id, t, via) {
    const sp = SPELLS[id], L = via ? via.lvl : u.pc ? casterLevel(u.ch) : lvlOf(u);
    log(u.name + ' casts ' + sp.name + '!', 'spell');
    if (t && t !== u) faceTo(u, t);
    await burst(u.x, u.y, 0.2, '#9fd4ff', 300);
    if (u.pc && !via && u.ch.cls === 'C') { const f = clericFailure(u.ch.wis); if (f && rnd(100) <= f) { log('The prayer falters; the spell is lost.', 'bad'); return; } }
    const allies = S.units.filter(a => a.side === u.side && alive(a));
    switch (id) {
      case 'magicMissile': {
        const n = Math.min(5, Math.floor((L + 1) / 2));
        for (let i = 0; i < n && alive(t); i++) {
          await shot(u, t, '#c8a2ff');
          if (t.eff.shield) { log('The missile bursts harmlessly against ' + t.name + '\'s Shield.', 'dim'); continue; }
          if (t.images > 0) { /* magic missile is unerring but an image may still be chosen */ }
          await hurt(t, rnd(4) + 1, '#c8a2ff');
        }
        break;
      }
      case 'sleep': {
        let pool = dice(2, 4), n = 0;
        await burst(t.x, t.y, sp.r, '#8fd3ff', 500);
        const vs = unitsIn(areaCells(t.x, t.y, sp.r)).filter(v => !v.eff.sleep).sort((a, b) => hdOf(a) - hdOf(b));
        for (const v of vs) {
          const hd = Math.max(0.5, hdOf(v));
          if (hd > 4.4 || isUndead(v)) continue;
          if (hd > pool) break;
          pool -= hd;
          if (v.pc && ((v.ch.race === 'elf' && rnd(100) <= 90) || (v.ch.race === 'halfelf' && rnd(100) <= 30))) { log(v.name + ' resists the enchantment.', 'dim'); continue; }
          v.eff.sleep = 5 * L; n++; float(v, 'Zzz', '#8fd3ff'); log(v.name + ' falls asleep.', v.side === u.side ? 'bad' : 'good');
        }
        if (!n) log('No one succumbs.', 'dim');
        break;
      }
      case 'burningHands': {
        const dmg = Math.min(rnd(3) + 2 * L, 23), cells = coneCells(u, t);
        await Promise.all(cells.map(([x, y]) => burst(x, y, 0.3, '#ff8a3c', 380)));
        for (const v of unitsIn(cells)) { const sv = save(v, 4); log(v.name + (sv ? ' saves and' : '') + ' is burned for ' + (sv ? dmg >> 1 : dmg) + '.'); await hurt(v, Math.max(1, sv ? dmg >> 1 : dmg), '#ff8a3c'); }
        break;
      }
      case 'stinkingCloud': {
        await burst(t.x, t.y, sp.r, '#9bc34a', 600);
        for (const v of unitsIn(areaCells(t.x, t.y, sp.r))) {
          if (isUndead(v)) continue;
          if (save(v, 0, { poison: true })) log(v.name + ' holds their breath and saves.', 'dim');
          else { v.eff.nausea = rnd(4) + 1; float(v, 'sick', '#9bc34a'); log(v.name + ' retches helplessly in the vapors.', v.side === u.side ? 'bad' : 'good'); }
        }
        break;
      }
      case 'fireball': {
        await shot(u, t, '#ff7a2a');
        const dmg = dice(Math.min(L, 10), 6);
        await burst(t.x, t.y, sp.r, '#ff5a1a', 650);
        for (const v of unitsIn(areaCells(t.x, t.y, sp.r))) { const sv = save(v, 4), d = Math.max(1, sv ? dmg >> 1 : dmg); log(v.name + (sv ? ' saves and' : '') + ' is scorched for ' + d + '.'); await hurt(v, d, '#ff7a2a'); }
        break;
      }
      case 'lightningBolt': {
        const cells = lineCells(u, t, sp.range), dmg = dice(Math.min(L, 10), 6);
        if (cells.length) await bolt([[u.x, u.y]].concat(cells), '#bfe6ff');
        for (const v of unitsIn(cells)) { const sv = save(v, 4), d = Math.max(1, sv ? dmg >> 1 : dmg); log(v.name + (sv ? ' saves and' : '') + ' is blasted for ' + d + '.'); await hurt(v, d, '#bfe6ff'); }
        break;
      }
      case 'haste':
        allies.sort((a, b) => edist(a, u) - edist(b, u)).slice(0, L).forEach(a => { a.eff.haste = 3 + L; float(a, 'haste', '#ffe37a'); });
        log('The party blurs with unnatural speed.', 'good'); break;
      case 'holdPerson': case 'holdPersonC': case 'holdMonster': {
        const max = id === 'holdPersonC' ? 3 : rnd(4), any = id === 'holdMonster';
        const vs = [t].concat(foesOf(u).filter(v => v !== t && edist(v, t) <= 2.3).sort((a, b) => edist(a, t) - edist(b, t))).slice(0, max);
        const mod = vs.length === 1 ? -2 : (vs.length === 2 && id === 'holdPersonC') ? -1 : 0;
        for (const v of vs) {
          await burst(v.x, v.y, 0.2, '#d7b3ff', 250);
          if ((!any && !isPerson(v)) || isUndead(v)) { log(v.name + ' is unaffected.', 'dim'); continue; }
          if (save(v, 4, { mental: true, mod })) { log(v.name + ' resists the spell.', 'dim'); continue; }
          v.eff.hold = any ? L : 2 * L; float(v, 'held', '#d7b3ff'); log(v.name + ' is held rigid!', v.pc ? 'bad' : 'good');
        }
        break;
      }
      case 'cureLight': case 'cureSerious': case 'cureCritical': case 'heal': {
        const n = healAmount(id, t); heal(t, n); log(t.name + ' is healed for ' + n + '.', 'good');
        if (id === 'heal') { if (t.pc) t.ch.poison = null; for (const k of ['hold', 'nausea', 'blind']) delete t.eff[k]; t.paralyzed = false; }
        break;
      }
      case 'neutralizePoison': if (t.pc) t.ch.poison = null; delete t.eff.nausea; float(t, 'cleansed', '#9be36a'); log('The poison in ' + t.name + ' is destroyed.', 'good'); break;
      case 'protEvil10': allies.forEach(a => { a.eff.protEvil = 3 * L; float(a, 'warded', '#ffe37a'); }); log('The whole company is warded against evil.', 'good'); break;
      case 'flameStrike': case 'bladeBarrier': case 'iceStorm': case 'delayedBlast': case 'incendiaryCloud': {
        const K = { flameStrike: ['#ffd27a', 'is seared', 4], bladeBarrier: ['#d8dde6', 'is slashed', 4], iceStorm: ['#bfe6ff', 'is battered', -1], delayedBlast: ['#ff5a1a', 'is scorched', 4], incendiaryCloud: ['#ff7a2a', 'is burned', 4] }[id];
        const dmg = id === 'flameStrike' ? dice(6, 8) : id === 'bladeBarrier' ? dice(8, 8) : id === 'iceStorm' ? dice(3, 10) : id === 'delayedBlast' ? dice(Math.min(L, 20), 6) + Math.min(L, 20) : dice(Math.min(2 * L, 40), 4);
        if (id === 'delayedBlast' || id === 'incendiaryCloud') await shot(u, t, K[0]);
        await burst(t.x, t.y, sp.r, K[0], 650);
        for (const v of unitsIn(areaCells(t.x, t.y, sp.r))) { const sv = K[2] >= 0 && save(v, K[2]), d = Math.max(1, sv ? dmg >> 1 : dmg); log(v.name + (sv ? ' saves and' : '') + ' ' + K[1] + ' for ' + d + '.'); await hurt(v, d, K[0]); }
        break;
      }
      case 'meteorSwarm': {
        for (let i = 0; i < 4; i++) { await shot(u, { x: t.x + (i % 2 ? 1 : -1), y: t.y + (i > 1 ? 1 : -1) }, '#ff7a2a'); }
        await burst(t.x, t.y, sp.r, '#ff5a1a', 800);
        for (const v of unitsIn(areaCells(t.x, t.y, sp.r))) {
          let d = 0; for (let i = 0; i < 4; i++) { const m = dice(10, 4); d += save(v, 4) ? m >> 1 : m; }
          log(v.name + ' is blasted by the meteors for ' + d + '.'); await hurt(v, d, '#ff7a2a');
        }
        break;
      }
      case 'coneOfCold': {
        const dmg = dice(L, 4) + L, cells = coneCells(u, t, sp.len);
        await Promise.all(cells.map(([x, y]) => burst(x, y, 0.3, '#bfe6ff', 420)));
        for (const v of unitsIn(cells)) { const sv = save(v, 4), d = Math.max(1, sv ? dmg >> 1 : dmg); log(v.name + (sv ? ' saves and' : '') + ' is frozen for ' + d + '.'); await hurt(v, d, '#bfe6ff'); }
        break;
      }
      case 'cloudkill': {
        await burst(t.x, t.y, sp.r, '#8fae3a', 700);
        for (const v of unitsIn(areaCells(t.x, t.y, sp.r))) {
          if (isUndead(v)) continue;
          const hd = hdOf(v);
          if (hd < 5 || (hd < 7 && !save(v, 0, { poison: true, mod: -4 }))) { log(v.name + ' chokes and dies in the yellow-green vapors.', v.side === u.side ? 'bad' : 'good'); await slay(v, '#8fae3a'); }
          else { const d = rnd(10); log(v.name + ' is seared by the vapors for ' + d + '.'); await hurt(v, d, '#8fae3a'); }
        }
        break;
      }
      case 'chainLightning': {
        let n = Math.min(L, 12), from = u, v = t; const struck = new Set();
        while (v && n > 0) {
          await bolt([[from.x, from.y], [v.x, v.y]], '#bfe6ff');
          const dmg = dice(n, 6), sv = save(v, 4), d = Math.max(1, sv ? dmg >> 1 : dmg);
          log(v.name + (sv ? ' saves and' : '') + ' is struck by the lightning for ' + d + '.'); await hurt(v, d, '#bfe6ff');
          struck.add(v); from = v; n--;
          const at = from; v = foesOf(u).filter(e => !struck.has(e) && edist(e, at) <= 6).sort((a, b) => edist(a, at) - edist(b, at))[0];
        }
        break;
      }
      case 'disintegrate':
        await bolt([[u.x, u.y], [t.x, t.y]], '#7dff8a');
        if (save(t, 4)) log(t.name + ' twists aside from the green ray.', 'dim');
        else { log(t.name + ' crumbles into fine dust!', t.pc ? 'bad' : 'good'); await slay(t, '#7dff8a'); }
        break;
      case 'fingerOfDeath':
        await shot(u, t, '#b48cff');
        if (isUndead(t)) { log(t.name + ' is already dead; the spell finds nothing to take.', 'dim'); break; }
        if (save(t, 0)) { const d = dice(2, 8) + 1; log(t.name + ' resists death itself but is wracked for ' + d + '.'); await hurt(t, d, '#b48cff'); }
        else { log(t.name + '\'s heart stops at a word.', t.pc ? 'bad' : 'good'); await slay(t, '#b48cff'); }
        break;
      case 'powerWordKill':
        await burst(t.x, t.y, 0.4, '#b48cff', 400);
        if (t.hp > 60 || isUndead(t)) log(t.name + ' is too strong for the word to slay.', 'dim');
        else { log(t.name + ' falls dead at a single word.', t.pc ? 'bad' : 'good'); await slay(t, '#b48cff'); }
        break;
      case 'powerWordStun': {
        await burst(t.x, t.y, 0.4, '#d7b3ff', 400);
        const r = t.hp <= 30 ? dice(4, 4) : t.hp <= 60 ? dice(2, 4) : t.hp <= 90 ? rnd(4) : 0;
        if (!r) log(t.name + ' is too strong for the word to stun.', 'dim');
        else { t.eff.hold = Math.max(t.eff.hold || 0, r); float(t, 'stunned', '#d7b3ff'); log(t.name + ' reels, stunned for ' + r + ' rounds.', t.pc ? 'bad' : 'good'); }
        break;
      }
      case 'powerWordBlind': {
        await burst(t.x, t.y, sp.r, '#ffffff', 450);
        let pool = 100, n = 0;
        for (const v of unitsIn(areaCells(t.x, t.y, sp.r)).filter(v => v.side !== u.side).sort((a, b) => a.hp - b.hp)) {
          if (v.hp > pool) break;
          pool -= v.hp; v.eff.blind = rnd(4) + 1; n++; float(v, 'blinded', '#fff'); log(v.name + ' is struck blind.', 'good');
        }
        if (!n) log('The word finds no one it can blind.', 'dim');
        break;
      }
      case 'stoneskin': t.stoneskin = rnd(4) + Math.floor(L / 2); float(t, 'stoneskin', '#c9c9c9'); log(t.name + '\'s skin turns hard as granite (' + t.stoneskin + ' blows).', 'good'); break;
      case 'holyWord': {
        await burst(u.x, u.y, 3, '#fff3b0', 700);
        let n = 0;
        for (const v of foesOf(u).filter(v => edist(v, u) <= 3.5 && (v.pc || v.m.tags.includes('evil')))) {
          const hd = hdOf(v); n++;
          if (hd < 4) { log(v.name + ' is struck dead by the holy word.', 'good'); await slay(v, '#fff3b0'); }
          else if (hd < 8) { v.eff.hold = Math.max(v.eff.hold || 0, dice(2, 4)); float(v, 'held', '#fff3b0'); log(v.name + ' is frozen where it stands.', 'good'); }
          else if (hd < 12) { v.eff.hold = Math.max(v.eff.hold || 0, rnd(4)); float(v, 'stunned', '#fff3b0'); log(v.name + ' is stunned.', 'good'); }
          else log(v.name + ' is shaken but stands.', 'dim');
        }
        if (!n) log('No evil stands near enough to hear.', 'dim');
        break;
      }
      case 'bless': allies.forEach(a => { a.eff.bless = 6; }); log('The party is blessed (+1 to hit).', 'good'); break;
      case 'protEvil': t.eff.protEvil = 3 * L; float(t, 'warded', '#ffe37a'); log(t.name + ' is warded against evil.', 'good'); break;
      case 'aid': { t.eff.aid = 1 + L; const n = rnd(8); t.hp = t.hp + n; float(t, '+' + n, '#7dff8a'); log(t.name + ' is bolstered (+1 to hit, +' + n + ' hp).', 'good'); UI.refreshParty(); break; }
      case 'slowPoison': if (t.pc && !t.ch.poison) log(t.name + ' is not poisoned; the spell is wasted.', 'dim'); else if (t.pc) { t.ch.poison = null; log('The venom in ' + t.name + '\'s blood is stilled.', 'good'); } break;
      case 'silence': {
        await burst(t.x, t.y, sp.r, '#cfd6de', 450);
        for (const v of unitsIn(areaCells(t.x, t.y, sp.r))) {
          if (v.side === u.side || !(v.spells || (v.pc && isCaster(v.ch)))) continue;
          if (save(v, 4)) { log(v.name + ' resists the silence.', 'dim'); continue; }
          v.eff.silence = 2 * L; float(v, 'silenced', '#cfd6de'); log(v.name + ' is silenced.', 'good');
        }
        break;
      }
      case 'prayer': S.prayer[u.side] = L; log('A prayer strengthens the party and saps their foes.', 'good'); break;
      case 'dispelMagic': {
        await burst(t.x, t.y, sp.r, '#ffffff', 450);
        for (const v of unitsIn(areaCells(t.x, t.y, sp.r))) {
          const ks = v.side === u.side ? ['hold', 'sleep', 'nausea', 'silence', 'blind'] : ['bless', 'shield', 'haste', 'protEvil', 'aid'];
          let any = false;
          for (const k of ks) if (v.eff[k] && !(k === 'hold' && v.paralyzed)) { delete v.eff[k]; any = true; }
          if (v.side !== u.side && (v.images || v.armorSpell || v.stoneskin)) { v.images = 0; v.armorSpell = false; v.stoneskin = 0; any = true; }
          if (any) { float(v, 'dispelled', '#fff'); log('Magic unravels around ' + v.name + '.', 'good'); }
        }
        break;
      }
      case 'removeParalysis': {
        let n = rnd(4);
        for (const v of unitsIn(areaCells(t.x, t.y, sp.r))) if (v.side === u.side && v.eff.hold && n-- > 0) { delete v.eff.hold; v.paralyzed = false; float(v, 'freed', '#7dff8a'); log(v.name + ' can move again!', 'good'); }
        break;
      }
      case 'armor': if (t.pc) t.ch.fx.armor = 8 + L; else t.armorSpell = true; float(t, 'armor', '#9fd4ff'); log(t.name + ' is sheathed in a field of force (AC 6).', 'good'); break;
      case 'shield': u.eff.shield = 5 * L; float(u, 'shield', '#9fd4ff'); break;
      case 'mirrorImage': u.images = Math.min(8, rnd(4) + Math.floor(L / 3)); log(u.name + ' splits into ' + (u.images + 1) + ' identical figures.', u.pc ? 'good' : 'bad'); break;
      case 'strength': if (t.pc) { applyStrength(t.ch, L); float(t, 'strength', '#ffe37a'); log(t.name + '\'s Strength rises to ' + strText(t.ch) + '.', 'good'); } break;
    }
    UI.refreshParty();
    await sleep(150);
  }

  async function turnUndead(u) {
    const L = turnLevel(u.ch), roll = rnd(20);
    u.turned = true;
    log(u.name + ' presents a holy symbol and commands the dead to flee! (d20 ' + roll + ')', 'spell');
    await burst(u.x, u.y, 2, '#fff3b0', 600);
    let count = dice(2, 6), any = false;
    const vs = foesOf(u).filter(isUndead).sort((a, b) => TURN_ORDER.indexOf(a.m.undead) - TURN_ORDER.indexOf(b.m.undead));
    for (const v of vs) {
      if (count <= 0) break;
      const e = TURN[v.m.undead][turnCol(L)];
      if (e == null || v.fleeing) continue;
      if (e === 'D') { count--; any = true; log(v.name + ' crumbles to dust!', 'good'); v.hp = 0; v.gone = true; v.dead = true; S.xp += v.m.xp; bestiarySlay(v.m.id); S.corpses.push({ x: v.x, y: v.y, fig: v.fig, t0: performance.now() }); }
      else if (e === 'T' || roll >= e) { count--; any = true; v.fleeing = true; float(v, 'turned', '#fff3b0'); log(v.name + ' recoils and flees.', 'good'); }
    }
    if (!any) log('The dead are unmoved.', 'bad');
    await sleep(250);
  }

  /* ---------------- AI ---------------- */
  function aiSpell(u, foes) {
    if (!u.spells || !u.spells.length || u.eff.silence || u.hitRound === S.round) return null;
    for (const id of u.spells) {
      if (id === 'mirrorImage') { if (!u.images) return { id, t: u }; }
      else if (id === 'stinkingCloud') {
        let best = null, bn = 1;
        for (const f of foes) { const vs = unitsIn(areaCells(f.x, f.y, 1.5)); const n = vs.filter(v => v.side !== u.side && canAct(v)).length - vs.filter(v => v.side === u.side && !isUndead(v)).length * 2; if (n > bn && edist(u, f) <= 6) { bn = n; best = f; } }
        if (best) return { id, t: { x: best.x, y: best.y } };
      } else if (id === 'magicMissile') {
        const t = foes.filter(f => los(u, f) && !f.eff.shield).sort((a, b) => a.hp - b.hp)[0];
        if (t) return { id, t };
      } else if (id === 'holdPerson' || id === 'holdPersonC') {
        const ts = foes.filter(f => canAct(f) && los(u, f));
        if (ts.length) return { id, t: pick(ts) };
      } else if (id === 'burningHands') {
        const t = foes.find(f => cheb(f, u) === 1);
        if (t) return { id, t };
      } else if (id === 'fireball') {
        // pick the blast centre that catches the most foes and the fewest friends
        let best = null, bn = 1.5;
        for (const f of foes) {
          if (edist(u, f) > SPELLS.fireball.range || !los(u, f)) continue;
          const vs = unitsIn(areaCells(f.x, f.y, SPELLS.fireball.r));
          if (vs.includes(u)) continue;
          const n = vs.filter(v => v.side !== u.side).length - vs.filter(v => v.side === u.side).length * 1.5;
          if (n > bn) { bn = n; best = f; }
        }
        if (best) return { id, t: { x: best.x, y: best.y } };
      } else if (id === 'lightningBolt') {
        let best = null, bn = 1.5;
        for (const f of foes) {
          const vs = unitsIn(lineCells(u, f, SPELLS.lightningBolt.range));
          const n = vs.filter(v => v.side !== u.side).length - vs.filter(v => v.side === u.side).length * 1.5;
          if (n > bn) { bn = n; best = f; }
        }
        if (best) return { id, t: best };
      } else if (id === 'haste') {
        const allies = S.units.filter(a => a.side === u.side && canAct(a) && !a.eff.haste);
        if (allies.length >= 2 && S.round <= 3) return { id, t: u };
      } else if (id === 'stoneskin') { if (!u.stoneskin) return { id, t: u }; }
      else if (id === 'coneOfCold') {
        let best = null, bn = 0.5;
        for (const f of foes) { if (edist(u, f) > SPELLS[id].len + 0.5) continue; const p = { x: u.x + Math.sign(f.x - u.x), y: u.y + Math.sign(f.y - u.y) }, vs = unitsIn(coneCells(u, p, SPELLS[id].len)); const n = vs.filter(v => v.side !== u.side).length - vs.filter(v => v.side === u.side).length * 1.5; if (n > bn) { bn = n; best = p; } }
        if (best) return { id, t: best };
      } else if (SPELLS[id] && SPELLS[id].tgt === 'area') {
        // any other area spell: the centre that catches the most foes and the fewest friends
        const sp = SPELLS[id]; let best = null, bn = 0.5;
        for (const f of foes) {
          if (edist(u, f) > sp.range || !los(u, f)) continue;
          const vs = unitsIn(areaCells(f.x, f.y, sp.r));
          if (vs.includes(u)) continue;
          const n = vs.filter(v => v.side !== u.side).length - vs.filter(v => v.side === u.side).length * 1.5;
          if (n > bn) { bn = n; best = f; }
        }
        if (best) return { id, t: { x: best.x, y: best.y } };
      } else if (SPELLS[id] && SPELLS[id].tgt === 'enemy') {
        const sp = SPELLS[id], ts = foes.filter(f => canAct(f) && edist(u, f) <= sp.range && los(u, f) && !(id === 'powerWordKill' && f.hp > 60) && !(id === 'powerWordStun' && f.hp > 90));
        if (ts.length) return { id, t: ts.sort((a, b) => b.hp - a.hp)[0] };
      } else if (SPELLS[id] && SPELLS[id].tgt === 'party' && id !== 'holyWord') { if (S.round <= 2) return { id, t: u }; }
    }
    return null;
  }
  async function aiTurn(u) {
    if (u.fleeing) {
      const f = flood(u); let best = -1, bd = 1e9;
      for (let k = 0; k < f.dist.length; k++) { const x = k % S.w, y = (k / S.w) | 0; if ((x === 0 || y === 0 || x === S.w - 1 || y === S.h - 1) && f.dist[k] < bd && (u.pc || x >= S.w / 2 || y === 0 || y === S.h - 1)) { bd = f.dist[k]; best = k; } }
      if (best >= 0 && bd > 0) await walk(u, pathTo(f, best));
      return;
    }
    let foes = foesOf(u).filter(e => !e.hidden);
    if (!foes.length) return;
    const sp = aiSpell(u, foes);
    if (sp) { u.spells.splice(u.spells.indexOf(sp.id), 1); await cast(u, sp.id, sp.t); return; }
    // a gaze works on one foe who can see the creature, every round, besides whatever else it does
    const gz = !u.pc && u.m.gaze;
    if (gz && !u.eff.blind) {
      const t = pick(foes.filter(e => canAct(e) && !e.eff.blind && edist(e, u) <= (gz.range || 6) + 0.5 && los(u, e)));
      if (t) {
        faceTo(u, t); log(u.name + ' ' + (gz.text || 'meets the eyes of') + ' ' + t.name + '.', 'bad');
        await burst(t.x, t.y, 0.3, gz.color || '#b48cff', 300);
        if (save(t, gz.save == null ? 2 : gz.save, { mental: gz.eff === 'hold' || gz.eff === 'nausea' })) log(t.name + ' looks away in time.', 'dim');
        else if (gz.eff === 'stone') { log(t.name + ' is turned to stone!', 'bad'); float(t, 'stone', '#c9c9c9'); await slay(t, '#c9c9c9'); }
        else if (gz.eff === 'death') { log(t.name + ' falls dead where they stand!', 'bad'); await slay(t, '#b48cff'); }
        else { const r = rollDice(gz.rounds || '1d4+1'); t.eff[gz.eff] = Math.max(t.eff[gz.eff] || 0, r); float(t, gz.word || 'dazed', '#d7b3ff'); log(t.name + ' ' + (gz.fail || 'is overcome') + ' for ' + r + ' rounds.', 'bad'); }
        foes = foesOf(u).filter(e => !e.hidden);
        if (!foes.length || !canAct(u)) return;
      }
    }
    // breath weapons: used instead of attacking, then the creature must recover
    const br = !u.pc && u.m.breath;
    if (br && !(u.breathWait > 0) && !(br.uses && u.breaths >= br.uses)) {
      const t = foes.filter(e => edist(e, u) <= br.range + 0.5 && los(u, e)).sort((a, b) => br.r ? unitsIn(areaCells(b.x, b.y, br.r)).filter(v => v.side !== u.side).length - unitsIn(areaCells(a.x, a.y, br.r)).filter(v => v.side !== u.side).length : a.hp - b.hp)[0];
      if (t) {
        u.breathWait = br.every || 3; u.breaths = (u.breaths || 0) + 1; faceTo(u, t);
        S.el = br.el || (/fire|flame/.test(br.text || '') ? 'fire' : /frost|freez|cold/.test(br.text || '') ? 'cold' : null);
        log(u.name + ' ' + (br.text || 'breathes fire') + ' at ' + t.name + '!', 'bad');
        await shot(u, t, br.color || '#ff7a2a');
        await burst(t.x, t.y, br.r || 0.45, br.color || '#ff7a2a', 420);
        // a wide breath catches everyone near the target, but not the creature's own side
        const vs = br.r ? unitsIn(areaCells(t.x, t.y, br.r)).filter(v => v.side !== u.side) : [t], dmg = br.dmg ? rollDice(br.dmg) : 0;
        for (const v of vs) {
          const sv = save(v, br.save == null ? 3 : br.save);
          if (br.death) { if (sv) log(v.name + ' endures the sound.', 'dim'); else { log(v.name + ' falls dead!', 'bad'); await slay(v, br.color || '#cfe6f2'); } continue; }
          if (br.stone) { if (sv) log(v.name + ' turns away from the vapor in time.', 'dim'); else { log(v.name + ' is turned to stone!', 'bad'); float(v, 'stone', '#c9c9c9'); await slay(v, '#c9c9c9'); } continue; }
          if (br.eff) { if (sv) log(v.name + ' resists.', 'dim'); else { const r = rollDice(br.rounds || '1d4+1'); v.eff[br.eff] = Math.max(v.eff[br.eff] || 0, r); float(v, br.word || 'overcome', '#d7b3ff'); log(v.name + ' ' + (br.fail || 'is overcome') + ' for ' + r + ' rounds.', 'bad'); } continue; }
          const d = Math.max(1, sv ? dmg >> 1 : dmg);
          log(v.name + (sv ? ' dodges partly aside and' : '') + ' takes ' + d + '.', 'bad');
          await hurt(v, d, br.color || '#ff7a2a');
        }
        S.el = null;
        return;
      }
    }
    if (u.breathWait > 0) u.breathWait--;
    let adj = foes.filter(e => cheb(e, u) === 1);
    if (!adj.length && hasRanged(u)) {
      const t = foes.filter(e => edist(e, u) <= maxRange(u) && los(u, e)).sort((a, b) => edist(a, u) - edist(b, u))[0];
      if (t) { for (let i = nAttacks(u, true); i > 0 && alive(t) && canAct(u); i--) await strike(u, t, { ranged: true }); return; }
    }
    if (!adj.length) {
      const f = flood(u); let best = -1, bd = 1e9;
      for (const e of foes) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = e.x + dx, y = e.y + dy; if (!inb(x, y)) continue;
        const d = f.dist[key(x, y)] + (helpless(e) ? 0 : 0.5); if (d < bd) { bd = d; best = key(x, y); }
      }
      if (best < 0) { // no route: shuffle closer
        let bs = 1e9; const near = p => Math.min(...foes.map(e => edist(e, p)));
        bs = near(u);
        for (let k = 0; k < f.dist.length; k++) if (f.dist[k] <= u.mp) { const d = near({ x: k % S.w, y: (k / S.w) | 0 }); if (d < bs - 0.01) { bs = d; best = k; } }
      }
      if (best >= 0) await walk(u, pathTo(f, best));
      if (!canAct(u)) return;
      foes = foesOf(u).filter(e => !e.hidden); adj = foes.filter(e => cheb(e, u) === 1);
    }
    if (adj.length) {
      const n = nAttacks(u, false);
      for (let i = 0; i < n && canAct(u); i++) {
        adj = foesOf(u).filter(e => cheb(e, u) === 1 && !e.hidden);
        if (!adj.length) break;
        const t = adj.sort((a, b) => (helpless(b) - helpless(a)) || (a.hp - b.hp))[0];
        await strike(u, t, { i: u.pc ? 0 : i % u.m.atk.length });
        await offhand(u, t);
      }
    }
  }

  /* ---------------- player control ---------------- */
  function previewCells(u, m, p) {
    const sp = m.spell && SPELLS[m.spell];
    if (!sp) return [[p.x, p.y]];
    if (sp.tgt === 'area') return areaCells(p.x, p.y, sp.r);
    if (sp.tgt === 'cone') return coneCells(u, p, sp.len);
    if (sp.tgt === 'line') return lineCells(u, p, sp.range);
    return [[p.x, p.y]];
  }
  function validTarget(u, m, x, y) {
    if (!inb(x, y)) return false;
    const p = { x, y }, t = unitAt(x, y), d = cheb(u, p);
    if (m.kind === 'touch') return !!t && t.side === u.side && d <= 1 && !(t.pc && t.ch.dead);
    const sp = SPELLS[m.spell];
    switch (sp.tgt) {
      case 'enemy': return !!t && t.side !== u.side && alive(t) && edist(u, p) <= sp.range && los(u, p);
      case 'ally': return !!t && t.side === u.side && d <= sp.range && !(t.pc && t.ch.dead);
      case 'area': return !S.grid[key(x, y)] && edist(u, p) <= sp.range && los(u, p);
      case 'cone': return d === 1;
      case 'line': return d >= 1;
    }
    return false;
  }
  function pcSpells(u) { return Object.keys(u.ch.mem).filter(id => u.ch.mem[id] > 0 && SPELLS[id] && !SPELLS[id].explore); }
  function showCmds() {
    const u = S.cur;
    if (S.done) return UI.cmds([]);
    if (!u || !u.pc || !S.endTurn || S.busy) {
      return UI.cmds([{ icon: S.auto ? 'pause' : 'auto', label: S.auto ? 'Stop Auto-Battle' : 'Auto-Battle', cap: S.auto ? 'Stop auto' : 'Auto', on: () => { S.auto = !S.auto; showCmds(); }, cls: S.auto ? 'warn' : '' }, { label: u && !u.pc ? u.name + ' acts…' : '…', disabled: true }]);
    }
    const ch = u.ch, m = S.mode, list = [];
    if (m && m.t === 'spells') {
      for (const id of pcSpells(u)) list.push({ label: SPELLS[id].name + ' ×' + ch.mem[id], title: SPELLS[id].desc, on: () => chooseSpell(u, id) });
      list.push({ label: 'Cancel', on: cancelMode, cls: 'dim' });
      return UI.cmds(list, 'Choose a spell:');
    }
    if (m && m.t === 'items') {
      const seen = new Set();
      ch.inv.forEach(id => {
        const it = item(id); if (seen.has(id) || !usable(ch, it)) return; seen.add(id);
        if (it.t === 'p') list.push({ label: it.name, title: itemDesc(it), on: () => { S.mode = { t: 'target', kind: 'touch', item: id }; showCmds(); } });
        else if (it.ward) list.push({ label: it.name, title: itemDesc(it), on: () => act(async () => {
          consume(u, id); S.ward = S.ward || { 0: [], 1: [] }; S.ward[u.side].push(it.ward);
          log(u.name + ' reads the ' + it.name + '. A circle of pale light springs up around the company.', 'spell'); await burst(u.x, u.y, 3, '#fff3b0', 600); u.acted = true; }) });
        else if (it.t === 'x') list.push({ label: it.name, title: SPELLS[it.spell].desc, on: () => castVia(u, it.spell, id, Math.max(casterLevel(ch), SPELLS[it.spell].l * 2 - 1)) });
        else if (it.wonder) list.push({ label: it.name, title: itemDesc(it), on: () => castVia(u, pick(it.spells), id, it.lvl) });
        else if (it.spells.length === 1) list.push({ label: it.name, title: SPELLS[it.spells[0]].desc, on: () => castVia(u, it.spells[0], id, it.lvl) });
        else list.push({ label: it.name, title: itemDesc(it), on: () => { S.mode = { t: 'device', item: id }; showCmds(); } });
      });
      list.push({ label: 'Cancel', on: cancelMode, cls: 'dim' });
      return UI.cmds(list, 'Use which item?');
    }
    if (m && m.t === 'device') {
      const it = item(m.item);
      for (const s of it.spells.filter(s => !SPELLS[s].explore)) list.push({ label: SPELLS[s].name, title: SPELLS[s].desc, on: () => castVia(u, s, m.item, it.lvl) });
      list.push({ label: 'Cancel', on: cancelMode, cls: 'dim' });
      return UI.cmds(list, itemBaseName(m.item) + ': which power?');
    }
    if (m && m.t === 'target') {
      return UI.cmds([{ label: 'Cancel', key: 'Esc', on: cancelMode, cls: 'dim' }], m.kind === 'touch' ? 'Choose an adjacent ally (or yourself).' : 'Choose a target for ' + SPELLS[m.spell].name + '.');
    }
    const adjFoe = foesOf(u).some(e => cheb(e, u) === 1), fresh = !u.attacked;
    if (isCaster(ch)) {
      const why = u.eff.silence ? 'Silenced' : u.hitRound === S.round ? 'Concentration broken: you were hit this round' : !pcSpells(u).length ? 'No spells memorized' : '';
      list.push({ icon: 'cast', label: 'Cast', key: 'C', disabled: !!why || !fresh, title: why, on: () => { S.mode = { t: 'spells' }; showCmds(); } });
    }
    if (turnLevel(ch) > 0 && foesOf(u).some(isUndead)) list.push({ icon: 'sun', label: 'Turn Undead', cap: 'Turn', key: 'T', disabled: u.turned || !fresh, title: u.turned ? 'Only one attempt per battle' : '', on: () => act(async () => { await turnUndead(u); u.acted = true; }) });
    if (ch.cls === 'P') list.push({ icon: 'heart', label: 'Lay on Hands', cap: 'Lay hands', disabled: ch.layUsed || !fresh, title: 'Heal ' + ch.lvl * 2 + ' hp once per day', on: () => { S.mode = { t: 'target', kind: 'touch', lay: true }; showCmds(); } });
    if (ch.cls === 'T') list.push({ icon: 'hide', label: u.hidden ? 'Hidden' : 'Hide', key: 'H', disabled: u.hidden || adjFoe || !fresh, title: 'Hide in Shadows ' + thiefSkills(ch).hs + '%: your next melee attack is a backstab', on: () => act(async () => {
      if (rnd(100) <= thiefSkills(ch).hs) { u.hidden = true; log(u.name + ' melts into the shadows.', 'good'); } else log(u.name + ' fails to find cover.', 'dim');
      u.acted = true;
    }) });
    if (ch.inv.some(id => usable(ch, item(id)))) list.push({ icon: 'flask', label: 'Use Item', cap: 'Item', key: 'U', disabled: !fresh, on: () => { S.mode = { t: 'items' }; showCmds(); } });
    const hurtAlly = S.units.find(a => a.pc && a !== u && !a.gone && a.hp <= 0 && !a.ch.dead && !a.stable && cheb(a, u) === 1);
    if (hurtAlly) list.push({ icon: 'plus', label: 'Bandage ' + hurtAlly.name.split(' ')[0], cap: 'Bandage', disabled: !fresh, on: () => act(async () => { hurtAlly.stable = true; log(u.name + ' binds ' + hurtAlly.name + '\'s wounds.', 'good'); u.acted = true; }) });
    if (u.x === 0 || u.y === 0 || u.x === S.w - 1 || u.y === S.h - 1) list.push({ icon: 'flee', label: 'Flee Battle', cap: 'Flee', cls: 'warn', on: () => act(async () => { u.gone = true; u.fledPC = true; log(u.name + ' flees the battle.', 'bad'); u.acted = true; }) });
    list.push({ icon: 'hourglass', label: 'End Turn', cap: 'End turn', key: 'Space', on: () => { if (!S.busy && S.endTurn) S.endTurn(); } });
    list.push({ icon: 'auto', label: 'Auto-Battle', cap: 'Auto', key: 'Q', title: 'Let the computer fight for the party', on: () => { S.auto = true; act(async () => { await aiTurn(u); u.acted = true; }); } });
    const hint = u.attacked ? 'Attacks remaining — click an enemy, or end the turn.' : 'Click a blue square to move, an enemy to attack' + (rwpn(ch) ? ' (missile fire needs a clear line and no adjacent foe).' : '.');
    UI.cmds(list, hint);
  }
  function cancelMode() { S.mode = { t: 'move' }; showCmds(); }
  /* what a character can use from the pack in battle: potions, scrolls their class can read, wands and the like */
  function usable(ch, it) {
    if (!it) return false;
    if (it.t === 'p') return true;
    if (it.t === 'x') return it.ward ? true : SPELLS[it.spell].explore ? false : SPELLS[it.spell].c === 'M' ? ch.cls === 'M' : spellClass(ch) === 'C' || ch.cls === 'P';
    if (it.t === 'd') return (!it.cls || it.cls.includes(ch.cls)) && it.spells.some(s => !SPELLS[s].explore);
    return false;
  }
  /* use up a potion or scroll, or one charge of a device */
  function consume(u, id) {
    const inv = u.ch.inv, i = inv.indexOf(id), it = item(id);
    if (i < 0) return;
    if (it.t === 'd' && it.left > 1) inv[i] = itemBase(id) + '#' + (it.left - 1);
    else { inv.splice(i, 1); if (it.t === 'd') log('The ' + itemBaseName(id) + ' is spent and crumbles to dust.', 'dim'); }
  }
  /* cast a spell out of a scroll or a device */
  function castVia(u, spell, id, lvl) {
    const sp = SPELLS[spell];
    if (sp.tgt === 'self' || sp.tgt === 'party') return act(async () => { consume(u, id); await cast(u, spell, u, { lvl }); u.acted = true; });
    S.mode = { t: 'target', spell, viaItem: id, lvl }; showCmds();
  }
  /* what a potion does to whoever drinks it */
  function drink(t, it) {
    if (it.heal) { const n = rollDice(it.heal); heal(t, n); log(t.name + ' drinks a ' + it.name + ' and recovers ' + n + '.', 'good'); }
    else log(t.name + ' drinks a ' + it.name + '.', 'good');
    if (it.cure === 'poison' && t.pc) { t.ch.poison = null; log('The poison in ' + t.name + '\'s blood is purged.', 'good'); }
    if (it.cureAll) for (const k of ['blind', 'nausea']) delete t.eff[k];
    for (const k in it.buff || {}) t.eff[k] = Math.max(t.eff[k] || 0, rollDice(it.buff[k]));
    if (it.temp) { const n = rollDice(it.temp); t.hp = t.hp + n; float(t, '+' + n, '#7dff8a'); }
    if (it.hide) { t.hidden = true; float(t, 'unseen', '#cfd6de'); }
    if (it.giant && t.pc) { t.ch.fx.strength = { s: it.giant, x: 0, until: G.time + 60 }; float(t, 'strength', '#ffe37a'); }
    if (it.buff) float(t, Object.keys(it.buff)[0] === 'haste' ? 'haste' : 'bolstered', '#ffe37a');
    UI.refreshParty();
  }
  function chooseSpell(u, id) {
    const sp = SPELLS[id];
    if (sp.tgt === 'self' || sp.tgt === 'party') return act(async () => { u.ch.mem[id]--; await cast(u, id, u); u.acted = true; });
    S.mode = { t: 'target', spell: id }; showCmds();
  }
  async function act(fn) {
    if (S.busy || !S.endTurn) return;
    S.busy = true; showCmds();
    try { await fn(); } catch (e) { console.error(e); }
    S.busy = false;
    const u = S.cur;
    if (!S.endTurn) return;
    const more = u.attacked && u.atk < 0.999 && (foesOf(u).some(e => cheb(e, u) === 1) || (u.lastRanged && foesOf(u).some(e => los(u, e))));
    if (result() || !canAct(u) || u.gone || u.acted || (u.attacked && !more)) return S.endTurn();
    S.mode = { t: 'move' }; S.reach = flood(u); showCmds();
  }
  function playerTurn(u) {
    return new Promise(res => {
      S.endTurn = () => { S.endTurn = null; S.mode = null; S.reach = null; res(); };
      S.mode = { t: 'move' }; S.reach = flood(u); showCmds();
    });
  }
  function cellFromEvent(e) {
    const r = cv.getBoundingClientRect(), mx = (e.clientX - r.left) * CW / r.width, my = (e.clientY - r.top) * CH / r.height;
    const a = (mx - OX()) / HW, b = (my - OY()) / HH;
    return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
  }
  function tryAttack(u, t) {
    if (u.atk >= 0.999) return log('No attacks remaining this round.', 'dim');
    if (cheb(u, t) === 1) return act(async () => { u.attacked = true; u.lastRanged = false; u.atk += 1 / nAttacks(u, false); u.mp = 0; await strike(u, t); await offhand(u, t); });
    if (!rwpn(u.ch)) return log('Too far away. Move adjacent to attack.', 'dim');
    if (foesOf(u).some(e => cheb(e, u) === 1)) return log('You cannot use a missile weapon with an enemy adjacent.', 'dim');
    if (edist(u, t) > maxRange(u)) return log('Out of range.', 'dim');
    if (!los(u, t)) return log('No clear line of fire.', 'dim');
    act(async () => { u.attacked = true; u.lastRanged = true; u.atk += 1 / nAttacks(u, true); u.mp = 0; await strike(u, t, { ranged: true }); });
  }
  function click(e) {
    if (!S || S.busy || !S.endTurn) return;
    const u = S.cur, p = cellFromEvent(e), m = S.mode;
    if (!inb(p.x, p.y) || !m) return;
    const t = unitAt(p.x, p.y);
    if (m.t === 'target') {
      if (!validTarget(u, m, p.x, p.y)) return;
      if (m.kind === 'touch') {
        return act(async () => {
          if (m.lay) { u.ch.layUsed = true; heal(t, u.ch.lvl * 2); log(u.name + ' lays hands on ' + t.name + ', healing ' + u.ch.lvl * 2 + '.', 'good'); }
          else { const it = item(m.item); u.ch.inv.splice(u.ch.inv.indexOf(m.item), 1); drink(t, it); }
          u.acted = true; await sleep(250);
        });
      }
      const id = m.spell, sp = SPELLS[id];
      return act(async () => { if (m.viaItem) consume(u, m.viaItem); else u.ch.mem[id]--; await cast(u, id, (sp.tgt === 'enemy' || sp.tgt === 'ally') ? t : p, m.viaItem ? { lvl: m.lvl } : null); u.acted = true; });
    }
    if (m.t !== 'move') return;
    if (t && t.side !== u.side && alive(t)) return tryAttack(u, t);
    if (t || u.attacked) return;
    const k = key(p.x, p.y);
    if (S.reach.dist[k] <= u.mp && S.reach.dist[k] > 0) act(async () => { await walk(u, pathTo(S.reach, k)); });
  }
  function onKey(e) {
    if (!S || S.busy || !S.endTurn) return false;
    const u = S.cur, k = e.key;
    if (k === 'Escape') { if (S.mode && S.mode.t !== 'move') cancelMode(); return true; }
    if (k === ' ' || k === 'Enter') { S.endTurn(); return true; }
    if (!S.mode || S.mode.t !== 'move') return false;
    const d = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[k];
    if (d) {
      const nx = u.x + d[0], ny = u.y + d[1]; if (!inb(nx, ny)) return true;
      const t = unitAt(nx, ny);
      if (t && t.side !== u.side && alive(t)) tryAttack(u, t);
      else if (!t && !u.attacked && !S.grid[key(nx, ny)] && u.mp >= 2) act(async () => { await walk(u, [key(nx, ny)]); });
      return true;
    }
    const btn = UI.cmdKey(k);
    if (btn) { btn.click(); return true; }
    return false;
  }

  /* ---------------- battle loop ---------------- */
  function result() {
    const mons = S.units.some(u => !u.pc && alive(u));
    const up = S.units.some(u => u.pc && alive(u)), fled = S.units.some(u => u.pc && u.fledPC);
    if (!up) return fled ? 'fled' : 'lose';
    if (!mons) return 'win';
    if (S.round > 150) return 'fled';
    return null;
  }
  function rollInit() {
    for (const u of S.units) {
      if (!alive(u)) continue;
      if (!u.pc && u.m.slow) { u.init = 50 + Math.random(); continue; }
      const mod = u.pc ? (wpn(u.ch).sp || 0) : ({ T: 0, S: 3, M: 3, L: 6, H: 9, G: 12 }[u.m.size] || 3);
      u.init = rnd(10) + mod + (u.eff.haste ? -2 : 0) + Math.random() * 0.5;
    }
    S.order = S.units.filter(alive).sort((a, b) => a.init - b.init);
  }
  function endRound() {
    for (const u of S.units) {
      if (!alive(u)) continue;
      for (const k in u.eff) {
        if (typeof u.eff[k] !== 'number') continue;
        if (--u.eff[k] <= 0) { delete u.eff[k]; if (k === 'hold') { u.paralyzed = false; log(u.name + ' can move again.', 'dim'); } else if (k === 'sleep') log(u.name + ' wakes up.', 'dim'); else if (k === 'nausea') log(u.name + ' recovers from the vapors.', 'dim'); }
      }
    }
    for (const s of [0, 1]) if (S.prayer[s] && --S.prayer[s] <= 0) delete S.prayer[s];
    // trolls and their kind knit their wounds every round
    for (const u of S.units) if (u.pc && alive(u) && u.hp < u.maxhp && wornSum(u.ch, 'regen')) { u.hp = Math.min(u.maxhp, u.hp + wornSum(u.ch, 'regen')); float(u, '+' + wornSum(u.ch, 'regen'), '#7dff8a'); }
    for (const u of S.units) if (!u.pc && alive(u) && u.m.regen && u.hp < u.maxhp) { const n = Math.min(u.m.regen, u.maxhp - u.hp); u.hp += n; float(u, '+' + n, '#7dff8a'); }
  }
  async function turn(u) {
    u.mp = moveSq(u) * 2; u.aoo = new Set(); u.acted = false; u.attacked = false; u.atk = 0; u.lastRanged = false;
    if (u.fleeing && (u.x === 0 || u.y === 0 || u.x === S.w - 1 || u.y === S.h - 1)) { u.gone = true; log(u.name + ' flees the battle.', 'dim'); await sleep(200); return; }
    if (!canAct(u)) return;
    S.cur = u; showCmds();
    if (u.pc && !S.auto) await playerTurn(u);
    else { await sleep(170); await aiTurn(u); await sleep(80); }
    S.cur = null;
  }
  async function run() {
    await sleep(500);
    let ps = rnd(10) <= 3, ms = rnd(10) <= 3;
    if (S.surprise) { ps = S.surprise === 'party'; ms = S.surprise === 'enemy'; }   // already rolled on the overland map
    let skip = -1;
    if (ps && !ms) { skip = 0; log('The party is surprised! The enemy acts first.', 'bad'); }
    else if (ms && !ps) { skip = 1; log('The enemy is surprised! You have a free round.', 'good'); }
    let res = null;
    while (!res) {
      S.round++; rollInit();
      log('— Round ' + S.round + ' —', 'round');
      for (const u of S.units) if (u.pc && !u.gone && u.hp <= 0 && !u.ch.dead && !u.stable) { u.hp--; if (u.hp <= -10) { u.ch.dead = true; log(u.name + ' bleeds to death.', 'bad'); } UI.refreshParty(); }
      for (const u of S.order) {
        if ((res = result())) break;
        if (!alive(u) || (S.round === 1 && u.side === skip)) continue;
        await turn(u);
      }
      res = res || result();
      if (!res) endRound();
    }
    S.done = true; showCmds();
    await sleep(700);
    const out = { result: res, xp: S.xp, left: S.units.filter(u => u.pc && !u.fledPC && u.hp <= 0 && !u.ch.dead).map(u => u.ch) };
    for (const u of S.units) if (u.pc && u.hp > u.maxhp) u.hp = u.maxhp;
    cancelAnimationFrame(raf);
    const done = S.resolve; S = null;
    cv.style.display = 'none';
    done(out);
  }
  function start(spec) {
    return new Promise(resolve => {
      cv = document.getElementById('combatCanvas');
      if (!c) {
        cv.width = CW * SS; cv.height = CH * SS; c = cv.getContext('2d');
        cv.addEventListener('click', click);
        cv.addEventListener('mousemove', e => { if (S) S.hover = cellFromEvent(e); });
        cv.addEventListener('mouseleave', () => { if (S) S.hover = null; });
        cv.addEventListener('contextmenu', e => { e.preventDefault(); if (S && S.mode && S.mode.t !== 'move' && S.endTurn && !S.busy) cancelMode(); });
      }
      setup(spec); S.resolve = resolve;
      bestiaryFight(spec.mons);
      cv.style.display = 'block';
      raf = requestAnimationFrame(frame);
      run();
    });
  }
  return { start, onKey, get active() { return !!S; }, _state: () => S, _cast: cast };
})();

/* Strength spell: 1 hour per caster level */
function applyStrength(ch, L) {
  const g = CLASSES[ch.cls].group, pts = rnd(g === 'warrior' ? 8 : g === 'wizard' ? 4 : 6);
  let s = ch.str, x = ch.strx || 0;
  for (let i = 0; i < pts; i++) { if (s < 18) s++; else if (g === 'warrior') x = Math.min(100, x + 10); }
  ch.fx.strength = { s, x, until: G.time + 60 * L };
}
