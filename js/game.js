'use strict';
/* ============================================================
   Game state, exploration, events, saving and loading.
   ============================================================ */
let G = null;
const SAVE = 'emberfall.save.';
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]], DIRN = ['North', 'East', 'South', 'West'];
const P = () => G ? G.party.map(id => G.roster.find(c => c.id === id)).filter(Boolean) : [];
const X = { def: null, cells: null, M: null, sprites: [], cam: { x: 0, y: 0, a: 0 }, busy: false, lock: false, next: null, held: false, chain: false };
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
function timeText() { const t = G.time % 1440; return 'Day ' + (Math.floor(G.time / 1440) + 1) + ', ' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }

/* ---------------- saving ---------------- */
function saveGame(slot) {
  G.meta = { leader: P()[0] ? P()[0].name : '—', where: MAPS[G.map].name, when: timeText(), saved: new Date().toLocaleString(), ts: Date.now(), mod: mod().code + ' ' + mod().name, lvl: Math.round(partyLevel(P())) };
  try { localStorage.setItem(SAVE + slot, JSON.stringify(G)); return true; }
  catch (e) { log('Could not save the game: ' + e.message, 'bad'); return false; }
}
function saveMeta(slot) { try { const s = localStorage.getItem(SAVE + slot); return s ? JSON.parse(s).meta : null; } catch (e) { return null; } }
function loadGame(slot) {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE + slot)); } catch (e) { /* corrupt save */ }
  if (!data || !data.roster) return false;
  // saves from before campaigns existed belong to the Hollow Vaults
  if (!data.module) data.module = 'hollow';
  if (!data.done) data.done = data.won ? [data.module] : [];
  G = data;
  while (modals.length) closeModal();
  showScreen('game'); $('#log').replaceChildren();
  X.lock = false; X.busy = false; X.next = null;
  enterMap();
  log('Game loaded: ' + MAPS[G.map].name + ', ' + timeText() + '.', 'good');
  return true;
}
function latestSave() {
  let best = null;
  for (const s of ['auto', '1', '2', '3']) { const m = saveMeta(s); if (m && (!best || m.ts > best.ts)) best = Object.assign({ slot: s }, m); }
  return best;
}

/* ---------------- map handling ---------------- */
const cell = (x, y) => (X.cells[y] && X.cells[y][x]) || '#';
const isBlock = ch => '#HBGLSTF'.includes(ch) || (ch >= '1' && ch <= '9');
function buildMap() {
  X.def = MAPS[G.map];
  const mods = G.mods[G.map] || {};
  X.cells = X.def.grid.map((row, y) => row.split('').map((ch, x) => mods[x + ',' + y] || ch));
  X.M = View3D.prepare(X.def, X.cells);
  if (!G.seen[G.map]) { G.seen[G.map] = new Array(X.M.w * X.M.h).fill(0); if (!X.def.safe) jot('Entered ' + lowerThe(X.def.name) + '.', 'place'); }
  buildSprites();
}
function buildSprites() {
  X.sprites = [];
  X.cells.forEach((row, y) => row.forEach((ch, x) => {
    if (ch === 'T') X.sprites.push({ x, y, tex: 'tree' });
    else if (ch === 'F') X.sprites.push({ x, y, tex: 'fountain' });
    else if (ch === '<') X.sprites.push({ x, y, tex: 'stairsUp' });
    else if (ch === '>') X.sprites.push({ x, y, tex: 'stairsDown' });
    else if (ch >= 'a' && ch <= 'z') { const ev = X.def.ev[ch]; if (ev && ev.type === 'chest' && !G.flags[G.map + ':' + ch]) X.sprites.push({ x, y, tex: 'chest' }); }
  }));
  for (const p of lootSpots()) X.sprites.push({ x: p.x, y: p.y, tex: 'loot' });
}

/* ---------------- items on the ground ----------------
   Anything dropped stays on the square where the party stood, per map, and is saved with the game. */
function groundAt(x = G.x, y = G.y, map = G.map) { const g = G.ground && G.ground[map]; return (g && g[x + ',' + y]) || []; }
function lootSpots(map = G.map) {
  const g = (G.ground && G.ground[map]) || {};
  return Object.keys(g).filter(k => g[k].length).map(k => { const [x, y] = k.split(',').map(Number); return { x, y }; });
}
function setGround(list, x = G.x, y = G.y, map = G.map) {
  G.ground = G.ground || {};
  const g = G.ground[map] = G.ground[map] || {}, k = x + ',' + y;
  if (list.length) g[k] = list; else { delete g[k]; if (!Object.keys(g).length) delete G.ground[map]; }
  if (X.def && G.map === map && !isWild()) { buildSprites(); if (!Combat.active) draw(); }
  if (X.def && G.map === map && isWild() && !Combat.active) Over.draw();
}
function dropItem(ch, idx) {
  const id = ch.inv[idx];
  if (id == null || item(id).t === 'q') return null;
  ch.inv.splice(idx, 1);
  setGround(groundAt().concat(id));
  log(ch.name + ' drops ' + item(id).name + '.', 'dim');
  refreshAll();
  return id;
}
function takeFromGround(ch, i) {
  const list = groundAt().slice(), id = list.splice(i, 1)[0];
  if (id == null) return null;
  ch.inv.push(id); setGround(list);
  refreshAll();
  return id;
}
async function lootHere() {
  const list = groundAt();
  if (!list.length) return;
  const taker = P().find(c => c.hp > 0 && !c.dead);
  if (!taker) return;
  X.lock = true;
  try {
    const names = list.map(id => item(id).name).join(', ');
    const i = await choice('On the Ground', 'Lying here: ' + names + '.',
      [{ label: 'Take everything', cls: 'primary' }, { label: 'Leave it' }]);
    if (i !== 0) return;
    list.forEach(id => taker.inv.push(id)); setGround([]);
    log(taker.name + ' picks up ' + names + '.', 'good');
    refreshAll();
  } finally { X.lock = false; }
}
function setMod(x, y, ch) {
  (G.mods[G.map] = G.mods[G.map] || {})[x + ',' + y] = ch;
  buildMap(); reveal(); draw();
}
function setCam() { X.cam.x = G.x + 0.5; X.cam.y = G.y + 0.5; X.cam.a = (G.dir - 1) * Math.PI / 2; }
const isWild = () => !!(X.def && X.def.overland);
const exploreCanvas = () => isWild() ? $('#overCanvas') : $('#view3d');
function enterMap() {
  $('#combatCanvas').style.display = 'none';
  if (MAPS[G.map].overland) {
    X.def = MAPS[G.map]; X.M = null; X.sprites = [];
    Over.prepare(X.def); wildEnsureSeen(); Over.place(G.x, G.y); Over.reveal();
    $('#view3d').style.display = 'none'; $('#overCanvas').style.display = 'block';
    wildCmds(); Over.draw(); refreshAll();
    return;
  }
  buildMap(); setCam(); reveal();
  $('#overCanvas').style.display = 'none'; $('#view3d').style.display = 'block';
  exploreCmds(); draw(); refreshAll();
}
function redrawMap() { if (isWild()) { wildCmds(); Over.draw(); } else { exploreCmds(); draw(); } }
function reveal() {
  const seen = G.seen[G.map], w = X.M.w;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = G.x + dx, y = G.y + dy; if (x >= 0 && y >= 0 && x < w && y < X.M.h) seen[y * w + x] = 1; }
  const [dx, dy] = DIRS[G.dir];
  for (let i = 1, x = G.x + dx, y = G.y + dy; i < 8 && x >= 0 && y >= 0 && x < w && y < X.M.h; i++, x += dx, y += dy) {
    seen[y * w + x] = 1;
    if (X.M.wt[X.M.c[y * w + x]]) break;
    for (const s of [-1, 1]) { const sx = x + dy * s, sy = y + dx * s; if (sx >= 0 && sy >= 0 && sx < w && sy < X.M.h) seen[sy * w + sx] = 1; }
  }
}
function draw() {
  View3D.render(X.cam, X.M, X.sprites);
  View3D.minimap($('#minimap'), X.M, G.seen[G.map], G.x, G.y, G.dir, mapOpts());
}
function facingText() {
  const [dx, dy] = DIRS[G.dir], ch = cell(G.x + dx, G.y + dy);
  if (ch >= '1' && ch <= '9') { const id = X.def.locs[ch]; return 'Ahead: ' + locName(id) + ' (' + SERVICES[id].kind + ')'; }
  if (ch === 'D') return 'Ahead: a door';
  if (ch === 'L') return 'Ahead: a locked door';
  if (ch === 'G') return X.def.exit ? 'Ahead: ' + (X.def.exit.title || 'the gate').replace(/^The /, 'the ') : 'Ahead: the gate (barred)';
  if (ch === '>') return 'Ahead: stairs leading down';
  if (ch === '<') return 'Ahead: stairs leading up';
  if (ch >= 'a' && ch <= 'z' && X.def.ev[ch] && X.def.ev[ch].type === 'chest' && !G.flags[G.map + ':' + ch]) return 'Ahead: a chest';
  if (groundAt(G.x + dx, G.y + dy).length) return 'Ahead: something on the ground';
  const here = groundAt().length;
  if (here) return 'Here: ' + (here === 1 ? '1 item' : here + ' items') + ' on the ground';
  return '';
}
function refreshAll() {
  if (!G || !X.def) return;
  Nav.refresh();
  UI.refreshParty();
  $('#hudLoc').textContent = X.def.name;
  if (isWild()) {
    const t = Over.terr(G.x, G.y), site = X.def.sites[Over.at(G.x, G.y)];
    $('#hudDir').textContent = site ? site.name : t.name;
    $('#hudTime').textContent = timeText() + (Over.night() ? ' · night' : '');
    $('#hudGold').textContent = G.gold + ' gp';
    $('#hudFace').textContent = 'MV ' + partyMV() + ' · ' + (G.march >= 600 ? 'weary' : Math.floor((G.march || 0) / 60) + 'h on the march');
    Over.minimap($('#minimap'));
    return;
  }
  if (!X.M) return;
  $('#hudDir').textContent = 'Facing ' + DIRN[G.dir];
  $('#hudTime').textContent = timeText();
  $('#hudGold').textContent = G.gold + ' gp';
  $('#hudFace').textContent = facingText();
  View3D.minimap($('#minimap'), X.M, G.seen[G.map], G.x, G.y, G.dir, mapOpts());
}

/* ---------------- movement ---------------- */
const busy = () => X.busy || X.lock || modals.length > 0 || Combat.active;
/* A step or turn asked for while the last one is still playing is kept and played straight after it, so that
   walking does not stall between squares. One that came from holding a key or button down (X.held) is dropped
   again when that is let go, so the company does not walk on. */
function later(fn) { if (X.busy) X.next = { fn, held: X.held }; }
function dropHeld() { if (X.next && X.next.held) X.next = null; }
/* Once the company stands still, redraw the view sharp if the last frame of the movement was a coarse one. */
let sharpTimer = 0;
function sharpen() {
  clearTimeout(sharpTimer);
  if (View3D.coarse) sharpTimer = setTimeout(() => { if (View3D.coarse && !X.busy && X.M && !isWild()) View3D.render(X.cam, X.M, X.sprites); }, 180);
}
function animate(to, d, done) {
  const from = { x: X.cam.x, y: X.cam.y, a: X.cam.a }, t0 = performance.now(), even = X.chain; // a movement that follows straight on from another keeps an even pace
  X.busy = true;
  clearTimeout(sharpTimer);
  let finished = false, shown = false;
  const end = () => {
    if (finished) return;
    finished = true; X.cam.x = to.x; X.cam.y = to.y; X.cam.a = to.a; X.busy = false;
    if (!shown) View3D.render(X.cam, X.M, X.sprites, true);
    if (done) done();
    const next = X.next; X.next = null;
    if (next && !busy()) { X.chain = true; try { next.fn(); } finally { X.chain = false; } }
    if (!X.busy) sharpen();
  };
  const f = now => {
    if (finished) return;
    const k = Math.min(1, (now - t0) / d), e = even ? k : k * (2 - k);
    X.cam.x = from.x + (to.x - from.x) * e; X.cam.y = from.y + (to.y - from.y) * e; X.cam.a = from.a + (to.a - from.a) * e;
    View3D.render(X.cam, X.M, X.sprites, true); shown = k >= 1;
    if (k < 1) requestAnimationFrame(f); else end();
  };
  requestAnimationFrame(f);
  setTimeout(end, d + 250); // safety net if the tab is not painting
}
function turn(d) {
  if (busy()) { later(() => turn(d)); return; }
  G.dir = (G.dir + d + 4) % 4;
  animate({ x: X.cam.x, y: X.cam.y, a: X.cam.a + d * Math.PI / 2 }, 140, () => { setCam(); reveal(); refreshAll(); });
}
function move(fwd, side) {
  if (busy()) { later(() => move(fwd, side)); return; }
  const [fx, fy] = DIRS[G.dir], [sx, sy] = DIRS[(G.dir + 1) % 4];
  const nx = G.x + fx * fwd + sx * side, ny = G.y + fy * fwd + sy * side, ch = cell(nx, ny);
  if (isBlock(ch)) { if (fwd > 0) bump(nx, ny, ch); return; }
  const px = G.x, py = G.y;
  G.x = nx; G.y = ny;
  animate({ x: nx + 0.5, y: ny + 0.5, a: X.cam.a }, 170, () => { arrive(px, py); });
}
function bump(nx, ny, ch) {
  if (ch >= '1' && ch <= '9') { const id = X.def.locs[ch]; log('You enter ' + locName(id) + '.', 'dim'); SERVICES[id].open(); }
  else if (ch === 'L') lockedDoor(nx, ny);
  else if (ch === 'G' && X.def.exit) leaveTown();
}
async function leaveTown() {
  X.lock = true;
  const e = X.def.exit;
  const i = await choice(e.title || 'The South Gate', e.text || 'Beyond the gate the river road runs out into the Emberwild: farms, forest, fen and hills, and whatever hunts in them.',
    [{ label: e.go || 'Travel into the wilds', cls: 'primary' }, { label: 'Stay', cls: 'dim' }]);
  X.lock = false;
  if (i === 0) goTo(e.map, e.x, e.y, e.dir || 0);
}
function harm(ch, dmg) {
  ch.hp -= dmg;
  if (ch.hp <= -10) { ch.dead = true; ch.hp = -10; } else if (ch.hp < 0) ch.hp = 0;
}
const partyDown = () => !P().some(c => c.hp > 0 && !c.dead);
function tickEffects() {
  for (const ch of P()) {
    if (ch.fx.strength && G.time >= ch.fx.strength.until) delete ch.fx.strength;
    if (ch.poison && !ch.dead && G.time >= ch.poison.at) {
      const d = ch.poison.dmg; ch.poison = null; ch.hp -= d;
      if (ch.hp <= 0) { ch.dead = true; ch.hp = -10; log('The spider venom reaches ' + ch.name + '\'s heart. ' + ch.name + ' dies!', 'bad'); }
      else log(ch.name + ' convulses as the venom takes hold: ' + d + ' damage!', 'bad');
    }
  }
  if (partyDown() && $('#game').classList.contains('active') && !Combat.active) gameOver();
}
async function arrive(px, py) {
  G.time += 1; tickEffects(); reveal(); refreshAll();
  if (partyDown()) return;
  const ch = cell(G.x, G.y), def = X.def;
  // elves may notice secret doors merely by passing them
  for (const [dx, dy] of DIRS) if (cell(G.x + dx, G.y + dy) === 'S' && P().some(c => c.hp > 0 && !c.dead && (c.race === 'elf' || c.race === 'halfelf') && rnd(6) === 1)) {
    setMod(G.x + dx, G.y + dy, 'D'); log('Keen elven eyes notice the outline of a secret door!', 'good');
  }
  if (def.stairs && def.stairs[ch]) {
    const s = def.stairs[ch];
    log(ch === '>' ? 'You descend the stairs.' : 'You climb the stairs.', 'dim');
    G.map = s.map; G.x = s.x; G.y = s.y; G.dir = s.dir || 0;
    enterMap(); log('— ' + X.def.name + ' —', 'round'); saveGame('auto');
    return;
  }
  if (groundAt().length) await lootHere();
  if (ch >= 'a' && ch <= 'z' && def.ev[ch]) return runEvent(ch, def.ev[ch], px, py);
  if (def.wander && Math.random() < def.wander.chance) {
    const [id, n] = pick(def.wander.table);
    await fight({ mons: [[id, n]], text: 'Shapes move in the darkness ahead. Wandering monsters!' }, px, py);
  }
}

/* ---------------- encounters and events ---------------- */
async function fight(spec, px, py) {
  X.lock = true;
  const mons = spec.mons.map(([id, n]) => [id, typeof n === 'number' ? n : Math.max(1, rollDice(n))]);
  if (spec.text) await msgBox('Encounter!', encounterBody(spec.text, mons), 'To arms!');
  const ex = exploreCanvas();
  ex.style.display = 'none';
  const res = await Combat.start({ mons, arena: spec.arena || X.def.arena || 'street', party: P(), surprise: spec.surprise, night: spec.night });
  ex.style.display = 'block';
  X.lock = false;
  if (res.result === 'lose') { refreshAll(); gameOver(); return 'lose'; }
  if (res.result === 'fled') {
    res.left.forEach(c => { c.dead = true; c.hp = -10; });
    G.x = px; G.y = py;
    if (isWild()) { Over.place(px, py); Over.reveal(); } else { setCam(); reveal(); }
    log('You escape the battle' + (res.left.length ? ', but ' + res.left.map(c => c.name).join(' and ') + ' had to be left behind.' : '.'), 'bad');
  } else {
    for (const c of P()) if (!c.dead && c.hp <= 0) c.hp = 0;
    let gold = spec.gold || 0;
    for (const [id, n] of mons) for (let i = 0; i < n; i++) gold += rollDice(MONSTERS[id].gold);
    const live = P().filter(c => !c.dead), share = Math.floor((res.xp + gold) / Math.max(1, live.length));
    live.forEach(c => awardXP(c, share));
    G.gold += gold;
    const items = spec.items || [], carrier = P().find(c => c.hp > 0 && !c.dead) || live[0];
    items.forEach(id => carrier.inv.push(id));
    log('Victory! ' + share + ' XP each, ' + gold + ' gp.', 'good');
    const ready = live.filter(canLevel).map(c => c.name);
    await msgBox('Victory', 'The enemy is defeated.\nEach survivor gains ' + share + ' experience (' + res.xp + ' for the foes' + (gold ? ', ' + gold + ' for treasure' : '') + ').' +
      (gold ? '\nYou gather ' + gold + ' gold pieces.' : '') + (items.length ? '\nFound: ' + items.map(i => item(i).name).join(', ') + ' (carried by ' + carrier.name + ').' : '') +
      (ready.length ? '\n' + ready.join(', ') + ' can now train for a new level in ' + mod().names.town + '.' : ''));
  }
  redrawMap(); refreshAll();
  return res.result;
}
async function runEvent(ch, ev, px, py) {
  const key = G.map + ':' + ch;
  if (G.flags[key]) return;
  if (ev.type === 'text') {
    G.flags[key] = 1;
    const carrier = (ev.items || []).length ? P().find(c => c.hp > 0 && !c.dead) : null;
    if (carrier) ev.items.forEach(id => carrier.inv.push(id));
    if (ev.quest) questDeed(ev.quest);
    await msgBox(X.def.name, ev.text + (carrier ? '\n(' + ev.items.map(i => item(i).name).join(', ') + ' carried by ' + carrier.name + '.)' : ''));
    if (ev.quest) saveGame('auto');
  }
  else if (ev.type === 'enc') {
    const r = await fight(ev, px, py);
    if (r === 'win') {
      G.flags[key] = 1;
      if (ev.quest) { questDeed(ev.quest); log('A deed worth reporting at ' + theName(locName('hall')) + '.', 'good'); }
      saveGame('auto');
    }
  } else if (ev.type === 'chest') {
    X.lock = true;
    try { await openChest(key, ev); } finally { X.lock = false; }
  }
}
/* a commission's task is accomplished in the field; it is paid when reported at the hall */
function questDeed(id) {
  G.flags['q:' + id] = 1;
  const q = QUESTS[id];
  if (q) jot('Done: ' + q.name + '. ' + (G.quests[id] ? 'Report to ' + mod().names.giver + ' at ' + theName(locName('hall')) + '.' : 'Someone at ' + theName(locName('hall')) + ' might want to hear of it.'), 'deed');
}
async function openChest(key, ev) {
  if (await choice('Treasure', ev.text, [{ label: 'Open it', cls: 'primary' }, { label: 'Leave it' }])) return;
  if (ev.trap) {
    const thief = P().filter(c => c.cls === 'T' && c.hp > 0 && !c.dead).sort((a, b) => b.lvl - a.lvl)[0];
    let sprung = true;
    if (thief) {
      const ft = thiefSkills(thief).ft;
      if (rnd(100) <= ft) {
        if (rnd(100) <= ft) { sprung = false; await msgBox('Trap!', thief.name + ' spots a trap on the lock and deftly disarms it. (Find/Remove Traps ' + ft + '%)'); }
        else await msgBox('Trap!', thief.name + ' finds a trap but fumbles the mechanism. ' + ev.trap.text);
      }
    }
    if (sprung) {
      const v = thief || P().find(c => c.hp > 0 && !c.dead), dmg = rollDice(ev.trap.dmg);
      harm(v, dmg);
      await msgBox('Trap!', ev.trap.text + ' ' + v.name + ' takes ' + dmg + ' damage' + (v.dead ? ' and dies!' : v.hp <= 0 ? ' and collapses!' : '.'));
      refreshAll();
      if (partyDown()) return gameOver();
    }
  }
  G.flags[key] = 1;
  if (ev.quest) questDeed(ev.quest);
  const live = P().filter(c => !c.dead), carrier = P().find(c => c.hp > 0 && !c.dead) || live[0], share = Math.floor(ev.gold / Math.max(1, live.length));
  G.gold += ev.gold; live.forEach(c => awardXP(c, share));
  (ev.items || []).forEach(id => carrier.inv.push(id));
  log('Treasure: ' + ev.gold + ' gp' + (ev.items && ev.items.length ? ', ' + ev.items.map(i => item(i).name).join(', ') : '') + '.', 'good');
  if (!isWild()) { buildSprites(); draw(); }
  refreshAll();
  await msgBox('Treasure', 'You find ' + ev.gold + ' gold pieces (' + share + ' experience each).' + (ev.items && ev.items.length ? '\nAlso: ' + ev.items.map(i => item(i).name).join(', ') + ' (carried by ' + carrier.name + ').' : ''));
  saveGame('auto');
}
async function lockedDoor(nx, ny) {
  X.lock = true;
  try {
    const up = P().filter(c => c.hp > 0 && !c.dead);
    const keyId = X.def.keyItem || 'ironKey', holder = P().find(c => c.inv.includes(keyId));
    const thief = up.filter(c => c.cls === 'T').sort((a, b) => b.lvl - a.lvl)[0];
    const mage = up.find(c => c.cls === 'M' && c.mem.knock > 0);
    const strong = up.slice().sort((a, b) => strMods(b).open - strMods(a).open)[0];
    const pk = thief ? 'pick:' + G.map + ':' + nx + ',' + ny + ':' + thief.id + ':' + thief.lvl : '';
    const opts = [];
    if (holder) opts.push({ label: 'Use the ' + item(keyId).name, cls: 'primary', id: 'key' });
    if (thief) opts.push({ label: thief.name.split(' ')[0] + ': pick the lock (' + thiefSkills(thief).ol + '%)', id: 'pick', disabled: !!G.flags[pk], title: G.flags[pk] ? 'Already tried. A thief may try again after gaining a level.' : '' });
    if (strong) opts.push({ label: strong.name.split(' ')[0] + ': force it (' + strMods(strong).open + ' in 20)', id: 'bash' });
    if (mage) opts.push({ label: mage.name.split(' ')[0] + ': cast Knock', id: 'knock' });
    opts.push({ label: 'Leave', cls: 'dim', id: 'leave' });
    const o = opts[await choice('Locked Door', X.def.lockText || 'The door is locked.', opts)];
    let open = false;
    if (o.id === 'key') { open = true; log('The ' + item(keyId).name.toLowerCase() + ' turns with a heavy clunk.', 'good'); }
    else if (o.id === 'pick') { G.flags[pk] = 1; G.time += 10; if (rnd(100) <= thiefSkills(thief).ol) { open = true; log(thief.name + ' teases the tumblers aside. The lock opens.', 'good'); } else log(thief.name + ' cannot defeat the lock.', 'bad'); }
    else if (o.id === 'knock') { mage.mem.knock--; open = true; log(mage.name + ' casts Knock. The lock springs open.', 'spell'); }
    else if (o.id === 'bash') {
      G.time += 10;
      if (rnd(20) <= strMods(strong).open) { open = true; log(strong.name + ' bursts the door from its frame!', 'good'); }
      else {
        log(strong.name + ' slams into the door. It holds, and the noise echoes.', 'bad');
        if (X.def.wander && Math.random() < 0.25) { X.lock = false; const [id, n] = pick(X.def.wander.table); await fight({ mons: [[id, n]], text: 'The racket has drawn attention!' }, G.x, G.y); }
      }
    }
    if (open) setMod(nx, ny, 'D');
    tickEffects(); refreshAll();
  } finally { X.lock = false; }
}
function search() {
  if (busy()) return;
  G.time += 10; tickEffects();
  let found = false;
  for (const [dx, dy] of DIRS) {
    const x = G.x + dx, y = G.y + dy;
    if (cell(x, y) === 'S' && P().some(c => c.hp > 0 && !c.dead && rnd(6) <= ((c.race === 'elf' || c.race === 'halfelf') ? 2 : 1))) { setMod(x, y, 'D'); found = true; log('Your search reveals a secret door!', 'good'); }
  }
  if (!found) log('You search for ten minutes and find nothing.', 'dim');
  refreshAll();
}
async function camp() {
  if (busy()) return;
  if (isWild()) return wildCamp();
  if (X.def.safe) return log('The watch frowns on camping in the street. Take a room at ' + locName('inn') + '.', 'dim');
  if (await choice('Make Camp', 'Rest here for eight hours? Spells will be memorized and each character recovers 1 hit point, but something may find you in the dark.', [{ label: 'Rest', cls: 'primary' }, { label: 'Cancel', cls: 'dim' }])) return;
  if (X.def.wander && Math.random() < 0.35) {
    const [id, n] = pick(X.def.wander.table);
    return fight({ mons: [[id, n]], text: 'Your rest is cut short. Something has found your camp!' }, G.x, G.y);
  }
  G.time += 480; G.march = 0;
  for (const ch of P()) if (!ch.dead) { if (ch.hp < ch.maxhp) ch.hp = Math.max(0, ch.hp) + 1; memorizeAll(ch); ch.layUsed = false; }
  tickEffects();
  log('You rest undisturbed for eight hours. Spells are memorized.', 'good');
  refreshAll();
}
/* the icons common to town, dungeon and wilderness */
function sharedCmds() {
  const open = fn => () => { if (!busy()) fn(); };
  return [{ icon: 'map', label: 'Map', key: 'M', on: open(mapDialog) }, { icon: 'journal', label: 'Journal', key: 'J', on: open(journalDialog) },
    { icon: 'beast', label: 'Bestiary', key: 'B', on: open(bestiaryDialog) }, { icon: 'menu', label: 'Menu', key: 'Esc', on: menuDialog }];
}
function exploreCmds() {
  UI.cmds([
    { icon: 'turnL', label: 'Turn left', cap: 'Turn', key: 'A', on: () => turn(-1) }, { icon: 'fwd', label: 'Forward', key: 'W', on: () => move(1, 0) }, { icon: 'turnR', label: 'Turn right', cap: 'Turn', key: 'D', on: () => turn(1) },
    { icon: 'fwd', rot: 180, label: 'Back', key: 'S', on: () => move(-1, 0) }, { icon: 'search', label: 'Search', key: 'F', on: search }, { icon: 'camp', label: 'Camp', key: 'R', on: camp },
    ...sharedCmds(),
  ], 'P shows the party. Open a member for equipment and spells.');
}
function gameOver() {
  if (X.over) return; X.over = true;
  const has = !!latestSave();
  modal({ title: 'The Party Has Fallen', closable: false, body: mod().lose + '\n' + mod().names.town + ' must look for other heroes.',
    buttons: [{ label: 'Load Game', cls: 'primary', disabled: !has, on: () => { X.over = false; saveDialog(false); modals[modals.length - 1].onclose = () => { if (G && partyDown() && $('#game').classList.contains('active')) gameOver(); }; } }, { label: 'Return to Title', on: () => { X.over = false; showTitle(); } }] });
}

/* ---------------- title and party assembly ---------------- */
function showTitle() {
  while (modals.length) closeModal();
  showScreen('title');
  const last = latestSave();
  $('#titleBtns').replaceChildren(
    h('button', { class: 'btn big primary', text: 'New Game', onclick: () => { G = null; showCampaign(); } }),
    h('button', { class: 'btn big', text: last ? 'Continue — ' + (last.mod ? last.mod.split(' ')[0] + ' ' : '') + last.where + ', ' + last.when : 'Continue', disabled: !last, onclick: () => loadGame(last.slot) }),
    h('button', { class: 'btn big', text: 'Load Game', disabled: !last, onclick: () => saveDialog(false) }),
    h('button', { class: 'btn big', text: 'How to Play', onclick: helpDialog }));
}
function showAssembly() {
  showScreen('assembly');
  const M = mod();
  const begin = h('button', { class: 'btn big primary', text: 'Begin the Adventure', onclick: beginAdventure });
  const status = () => {
    begin.disabled = !G.party.length;
    const pl = partyLevel(P());
    $('#assemblyGold').textContent = M.code + ': ' + M.name + ' · levels ' + M.levels[0] + '–' + M.levels[1] + ' · ' + DIFFICULTY[M.diff] + ' · party funds ' + G.gold + ' gp' +
      (pl > M.levels[1] + 1 ? ' · this company is well past the challenge' : '');
  };
  const rv = rosterView(status);
  $('#assemblyBody').replaceChildren(rv);
  $('#assemblyBtns').replaceChildren(h('button', { class: 'btn big', text: 'Back', onclick: showCampaign }), begin);
  status();
}
function beginAdventure() {
  if (!G.party.length) return;
  const M = mod();
  showScreen('game'); $('#log').replaceChildren();
  X.over = false; X.lock = false;
  enterMap();
  log('— ' + M.code + ': ' + M.name + ' —', 'round');
  log(M.hint, 'dim');
  jot('Arrived in ' + M.names.town + ' to begin ' + M.code + ': ' + M.name + '. ' + M.hint, 'place');
  saveGame('auto');
  msgBox(M.names.town, M.intro + '\nYour company has ' + G.gold + ' gold pieces.');
}

/* ---------------- input ---------------- */
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
document.addEventListener('keydown', e => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT') return;
  if (modals.length) {
    const m = modals[modals.length - 1];
    if (e.key === 'Escape' && m.closable) closeModal(m);
    else if (e.key === 'Enter') { const b = m.box.querySelector('.mbar .btn.primary:not(:disabled)'); if (b) { e.preventDefault(); b.click(); } }
    return;
  }
  if (!G || !$('#game').classList.contains('active')) return;
  if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) { toggleParty(); e.preventDefault(); return; }
  if (Combat.active) { if (Combat.onKey(e)) e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  let used = true;
  if (isWild()) {
    const D = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0], q: [-1, -1], e: [1, -1], z: [-1, 1], c: [1, 1] };
    if (D[k]) wildMove(D[k][0], D[k][1]);
    else if (k === 'enter' || k === ' ') { const b = UI.cmdKey('enter'); if (b && !busy()) b.click(); }
    else if (k === 'r') camp();
    else if (k === 'escape') { if (!busy()) menuDialog(); }
    else if (k === 'j') { if (!busy()) journalDialog(); }
    else if (k === 'm') { if (!busy()) mapDialog(); }
    else if (k === 'b') { if (!busy()) bestiaryDialog(); }
    else if (k >= '1' && k <= '6') { const ch = P()[+k - 1]; if (ch && !busy()) showSheet(ch); }
    else used = false;
    if (used) e.preventDefault();
    return;
  }
  X.held = e.repeat;
  if (k === 'w' || k === 'arrowup') move(1, 0);
  else if (k === 's' || k === 'arrowdown') move(-1, 0);
  else if (k === 'a' || k === 'arrowleft') turn(-1);
  else if (k === 'd' || k === 'arrowright') turn(1);
  else if (k === 'q') move(0, -1);
  else if (k === 'e') move(0, 1);
  else if (k === 'f') search();
  else if (k === 'r') camp();
  else if (k === 'escape') { if (!busy()) menuDialog(); }
  else if (k === 'j') { if (!busy()) journalDialog(); }
  else if (k === 'm') { if (!busy()) mapDialog(); }
  else if (k === 'b') { if (!busy()) bestiaryDialog(); }
  else if (k >= '1' && k <= '6') { const ch = P()[+k - 1]; if (ch && !busy()) showSheet(ch); }
  else used = false;
  X.held = false;
  if (used) e.preventDefault();
});
document.addEventListener('keyup', dropHeld);
/* the pictures follow the shape of the window */
window.addEventListener('resize', () => {
  if (!G || !X.def || !$('#game').classList.contains('active') || Combat.active) return;
  if (isWild()) Over.draw(); else draw();
});
window.addEventListener('DOMContentLoaded', () => {
  View3D.init($('#view3d'));
  Over.init($('#overCanvas')); Over.onStep(wildMove);
  initMinimap(); initParty();
  Nav.init($('#navlayer'));
  showTitle();
});
