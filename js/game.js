'use strict';
/* ============================================================
   Game state, exploration, events, saving and loading.
   ============================================================ */
let G = null;
const SAVE = 'emberfall.save.';
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]], DIRN = ['North', 'East', 'South', 'West'];
const P = () => G ? G.party.map(id => G.roster.find(c => c.id === id)).filter(Boolean) : [];
const X = { def: null, cells: null, M: null, sprites: [], cam: { x: 0, y: 0, a: 0 }, busy: false, lock: false };
const LOCS = {
  inn: ['The Drowsy Lantern (inn)', () => innDialog()], armory: ['Ironhand Outfitters (arms and armor)', () => shopDialog('armory')],
  tavern: ['The Gilded Tankard (tavern)', () => tavernDialog()], apothecary: ['The Gilded Mortar (apothecary)', () => shopDialog('apothecary')],
  temple: ['Temple of the Dawn', () => templeDialog()], hall: ['Emberfall Town Hall', () => hallDialog()], training: ['Training Hall', () => trainingDialog()],
};

function newState() {
  const s = MAPS.town.start;
  return { v: 1, roster: makePregens(), party: [], gold: 60, map: 'town', x: s.x, y: s.y, dir: s.dir, time: 8 * 60, flags: {}, mods: {}, seen: {}, quests: {}, won: false };
}
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); }
function timeText() { const t = G.time % 1440; return 'Day ' + (Math.floor(G.time / 1440) + 1) + ', ' + String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }

/* ---------------- saving ---------------- */
function saveGame(slot) {
  G.meta = { leader: P()[0] ? P()[0].name : '—', where: MAPS[G.map].name, when: timeText(), saved: new Date().toLocaleString(), ts: Date.now() };
  try { localStorage.setItem(SAVE + slot, JSON.stringify(G)); return true; }
  catch (e) { log('Could not save the game: ' + e.message, 'bad'); return false; }
}
function saveMeta(slot) { try { const s = localStorage.getItem(SAVE + slot); return s ? JSON.parse(s).meta : null; } catch (e) { return null; } }
function loadGame(slot) {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE + slot)); } catch (e) { /* corrupt save */ }
  if (!data || !data.roster) return false;
  G = data;
  while (modals.length) closeModal();
  showScreen('game'); $('#log').replaceChildren();
  X.lock = false; X.busy = false;
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
  if (!G.seen[G.map]) G.seen[G.map] = new Array(X.M.w * X.M.h).fill(0);
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
}
function setMod(x, y, ch) {
  (G.mods[G.map] = G.mods[G.map] || {})[x + ',' + y] = ch;
  buildMap(); reveal(); draw();
}
function setCam() { X.cam.x = G.x + 0.5; X.cam.y = G.y + 0.5; X.cam.a = (G.dir - 1) * Math.PI / 2; }
function enterMap() {
  buildMap(); setCam(); reveal();
  $('#view3d').style.display = 'block'; $('#combatCanvas').style.display = 'none';
  exploreCmds(); draw(); refreshAll();
}
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
  View3D.minimap($('#minimap'), X.M, G.seen[G.map], G.x, G.y, G.dir);
}
function facingText() {
  const [dx, dy] = DIRS[G.dir], ch = cell(G.x + dx, G.y + dy);
  if (ch >= '1' && ch <= '9') return 'Ahead: ' + LOCS[X.def.locs[ch]][0];
  if (ch === 'D') return 'Ahead: a door';
  if (ch === 'L') return 'Ahead: a locked door';
  if (ch === 'G') return 'Ahead: the south gate';
  if (ch === '>') return 'Ahead: stairs leading down';
  if (ch === '<') return 'Ahead: stairs leading up';
  if (ch >= 'a' && ch <= 'z' && X.def.ev[ch] && X.def.ev[ch].type === 'chest' && !G.flags[G.map + ':' + ch]) return 'Ahead: a chest';
  return '';
}
function refreshAll() {
  if (!G || !X.M) return;
  UI.refreshParty();
  $('#hudLoc').textContent = X.def.name;
  $('#hudDir').textContent = 'Facing ' + DIRN[G.dir];
  $('#hudTime').textContent = timeText();
  $('#hudGold').textContent = G.gold + ' gp';
  $('#hudFace').textContent = facingText();
  View3D.minimap($('#minimap'), X.M, G.seen[G.map], G.x, G.y, G.dir);
}

/* ---------------- movement ---------------- */
const busy = () => X.busy || X.lock || modals.length > 0 || Combat.active;
function animate(to, d, done) {
  const from = { x: X.cam.x, y: X.cam.y, a: X.cam.a }, t0 = performance.now();
  X.busy = true;
  let finished = false;
  const end = () => { if (finished) return; finished = true; X.cam.x = to.x; X.cam.y = to.y; X.cam.a = to.a; X.busy = false; if (done) done(); };
  const f = now => {
    if (finished) return;
    const k = Math.min(1, (now - t0) / d), e = k * (2 - k);
    X.cam.x = from.x + (to.x - from.x) * e; X.cam.y = from.y + (to.y - from.y) * e; X.cam.a = from.a + (to.a - from.a) * e;
    View3D.render(X.cam, X.M, X.sprites);
    if (k < 1) requestAnimationFrame(f); else end();
  };
  requestAnimationFrame(f);
  setTimeout(end, d + 250); // safety net if the tab is not painting
}
function turn(d) {
  if (busy()) return;
  G.dir = (G.dir + d + 4) % 4;
  animate({ x: X.cam.x, y: X.cam.y, a: X.cam.a + d * Math.PI / 2 }, 140, () => { setCam(); reveal(); draw(); refreshAll(); });
}
function move(fwd, side) {
  if (busy()) return;
  const [fx, fy] = DIRS[G.dir], [sx, sy] = DIRS[(G.dir + 1) % 4];
  const nx = G.x + fx * fwd + sx * side, ny = G.y + fy * fwd + sy * side, ch = cell(nx, ny);
  if (isBlock(ch)) { if (fwd > 0) bump(nx, ny, ch); return; }
  const px = G.x, py = G.y;
  G.x = nx; G.y = ny;
  animate({ x: nx + 0.5, y: ny + 0.5, a: X.cam.a }, 170, () => { arrive(px, py); });
}
function bump(nx, ny, ch) {
  if (ch >= '1' && ch <= '9') { const id = X.def.locs[ch]; log('You enter ' + LOCS[id][0].replace(/ \(.*/, '') + '.', 'dim'); LOCS[id][1](); }
  else if (ch === 'L') lockedDoor(nx, ny);
  else if (ch === 'G') log('The south gate is barred by order of the Reeve until the abbey is made safe.', 'dim');
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
    G.map = s.map; G.x = s.x; G.y = s.y; G.dir = s.dir;
    enterMap(); log('— ' + X.def.name + ' —', 'round'); saveGame('auto');
    return;
  }
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
  if (spec.text) await msgBox('Encounter!', spec.text + '\n' + mons.map(([id, n]) => n + ' × ' + MONSTERS[id].name).join(', '), 'To arms!');
  $('#view3d').style.display = 'none';
  const res = await Combat.start({ mons, arena: spec.arena || X.def.arena || 'street', party: P() });
  $('#view3d').style.display = 'block';
  X.lock = false;
  if (res.result === 'lose') { refreshAll(); gameOver(); return 'lose'; }
  if (res.result === 'fled') {
    res.left.forEach(c => { c.dead = true; c.hp = -10; });
    G.x = px; G.y = py; setCam(); reveal();
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
      (ready.length ? '\n' + ready.join(', ') + ' can now train for a new level in Emberfall.' : ''));
  }
  exploreCmds(); draw(); refreshAll();
  return res.result;
}
async function runEvent(ch, ev, px, py) {
  const key = G.map + ':' + ch;
  if (G.flags[key]) return;
  if (ev.type === 'text') { G.flags[key] = 1; await msgBox(X.def.name, ev.text); }
  else if (ev.type === 'enc') {
    const r = await fight(ev, px, py);
    if (r === 'win') {
      G.flags[key] = 1;
      if (ev.quest) { G.flags['q:' + ev.quest] = 1; log('A deed worth reporting at the Town Hall.', 'good'); }
      saveGame('auto');
    }
  } else if (ev.type === 'chest') {
    X.lock = true;
    try { await openChest(key, ev); } finally { X.lock = false; }
  }
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
  if (ev.quest) G.flags['q:' + ev.quest] = 1;
  const live = P().filter(c => !c.dead), carrier = P().find(c => c.hp > 0 && !c.dead) || live[0], share = Math.floor(ev.gold / Math.max(1, live.length));
  G.gold += ev.gold; live.forEach(c => awardXP(c, share));
  (ev.items || []).forEach(id => carrier.inv.push(id));
  log('Treasure: ' + ev.gold + ' gp' + (ev.items && ev.items.length ? ', ' + ev.items.map(i => item(i).name).join(', ') : '') + '.', 'good');
  buildSprites(); draw(); refreshAll();
  await msgBox('Treasure', 'You find ' + ev.gold + ' gold pieces (' + share + ' experience each).' + (ev.items && ev.items.length ? '\nAlso: ' + ev.items.map(i => item(i).name).join(', ') + ' (carried by ' + carrier.name + ').' : ''));
  saveGame('auto');
}
async function lockedDoor(nx, ny) {
  X.lock = true;
  try {
    const up = P().filter(c => c.hp > 0 && !c.dead);
    const holder = P().find(c => c.inv.includes('ironKey'));
    const thief = up.filter(c => c.cls === 'T').sort((a, b) => b.lvl - a.lvl)[0];
    const mage = up.find(c => c.cls === 'M' && c.mem.knock > 0);
    const strong = up.slice().sort((a, b) => strMods(b).open - strMods(a).open)[0];
    const pk = thief ? 'pick:' + G.map + ':' + nx + ',' + ny + ':' + thief.id + ':' + thief.lvl : '';
    const opts = [];
    if (holder) opts.push({ label: 'Use the Iron Vault Key', cls: 'primary', id: 'key' });
    if (thief) opts.push({ label: thief.name.split(' ')[0] + ': pick the lock (' + thiefSkills(thief).ol + '%)', id: 'pick', disabled: !!G.flags[pk], title: G.flags[pk] ? 'Already tried. A thief may try again after gaining a level.' : '' });
    if (strong) opts.push({ label: strong.name.split(' ')[0] + ': force it (' + strMods(strong).open + ' in 20)', id: 'bash' });
    if (mage) opts.push({ label: mage.name.split(' ')[0] + ': cast Knock', id: 'knock' });
    opts.push({ label: 'Leave', cls: 'dim', id: 'leave' });
    const o = opts[await choice('Locked Door', X.def.lockText || 'The door is locked.', opts)];
    let open = false;
    if (o.id === 'key') { open = true; log('The iron key turns with a heavy clunk.', 'good'); }
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
  if (X.def.safe) return log('The watch frowns on camping in the street. Take a room at the Drowsy Lantern.', 'dim');
  if (await choice('Make Camp', 'Rest here for eight hours? Spells will be memorized and each character recovers 1 hit point, but something may find you in the dark.', [{ label: 'Rest', cls: 'primary' }, { label: 'Cancel', cls: 'dim' }])) return;
  if (X.def.wander && Math.random() < 0.35) {
    const [id, n] = pick(X.def.wander.table);
    return fight({ mons: [[id, n]], text: 'Your rest is cut short. Something has found your camp!' }, G.x, G.y);
  }
  G.time += 480;
  for (const ch of P()) if (!ch.dead) { if (ch.hp < ch.maxhp) ch.hp = Math.max(0, ch.hp) + 1; memorizeAll(ch); ch.layUsed = false; }
  tickEffects();
  log('You rest undisturbed for eight hours. Spells are memorized.', 'good');
  refreshAll();
}
function exploreCmds() {
  UI.cmds([
    { label: '↶ Turn', key: 'A', on: () => turn(-1) }, { label: 'Forward', key: 'W', on: () => move(1, 0) }, { label: 'Turn ↷', key: 'D', on: () => turn(1) },
    { label: 'Back', key: 'S', on: () => move(-1, 0) }, { label: 'Search', key: 'F', on: search }, { label: 'Camp', key: 'R', on: camp }, { label: 'Menu', key: 'Esc', on: menuDialog },
  ], 'Click a party member for equipment and spells.');
}
function gameOver() {
  if (X.over) return; X.over = true;
  const has = !!latestSave();
  modal({ title: 'The Party Has Fallen', closable: false, body: 'Your company lies still in the dark, and the Ashen Circle will have new servants by morning.\nEmberfall must look for other heroes.',
    buttons: [{ label: 'Load Game', cls: 'primary', disabled: !has, on: () => { X.over = false; saveDialog(false); modals[modals.length - 1].onclose = () => { if (G && partyDown() && $('#game').classList.contains('active')) gameOver(); }; } }, { label: 'Return to Title', on: () => { X.over = false; showTitle(); } }] });
}

/* ---------------- title and party assembly ---------------- */
function showTitle() {
  while (modals.length) closeModal();
  showScreen('title');
  const last = latestSave();
  $('#titleBtns').replaceChildren(
    h('button', { class: 'btn big primary', text: 'New Game', onclick: () => { G = newState(); showAssembly(); } }),
    h('button', { class: 'btn big', text: last ? 'Continue — ' + last.where + ', ' + last.when : 'Continue', disabled: !last, onclick: () => loadGame(last.slot) }),
    h('button', { class: 'btn big', text: 'Load Game', disabled: !last, onclick: () => saveDialog(false) }),
    h('button', { class: 'btn big', text: 'How to Play', onclick: helpDialog }));
}
function showAssembly() {
  showScreen('assembly');
  const begin = h('button', { class: 'btn big primary', text: 'Begin the Adventure', onclick: beginAdventure });
  const rv = rosterView(() => { begin.disabled = !G.party.length; $('#assemblyGold').textContent = 'Party funds: ' + G.gold + ' gp'; });
  $('#assemblyBody').replaceChildren(rv);
  $('#assemblyBtns').replaceChildren(h('button', { class: 'btn big', text: 'Back', onclick: showTitle }), begin);
  begin.disabled = !G.party.length;
  $('#assemblyGold').textContent = 'Party funds: ' + G.gold + ' gp';
}
function beginAdventure() {
  if (!G.party.length) return;
  showScreen('game'); $('#log').replaceChildren();
  X.over = false; X.lock = false;
  enterMap();
  log('— Emberfall —', 'round');
  log('Visit the Town Hall for work, the outfitters for gear, and the abbey steps at the north end of town when you are ready.', 'dim');
  saveGame('auto');
  msgBox('Emberfall', 'The river-town of Emberfall has prospered for a century in the shadow of the Abbey of the Dawn. Then, one winter night, the abbey burned.\nNow goblins nest in its undercroft, the dead are restless in the vaults below, and travelers speak of grey-robed strangers on the roads.\nYour company arrives at the south gate with ' + G.gold + ' gold pieces, sharp steel, and a notice torn from a signpost: "ADVENTURERS WANTED. Apply to Reeve Halda, Town Hall."');
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
  if (Combat.active) { if (Combat.onKey(e)) e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  let used = true;
  if (k === 'w' || k === 'arrowup') move(1, 0);
  else if (k === 's' || k === 'arrowdown') move(-1, 0);
  else if (k === 'a' || k === 'arrowleft') turn(-1);
  else if (k === 'd' || k === 'arrowright') turn(1);
  else if (k === 'q') move(0, -1);
  else if (k === 'e') move(0, 1);
  else if (k === 'f') search();
  else if (k === 'r') camp();
  else if (k === 'escape') { if (!busy()) menuDialog(); }
  else if (k >= '1' && k <= '6') { const ch = P()[+k - 1]; if (ch && !busy()) showSheet(ch); }
  else used = false;
  if (used) e.preventDefault();
});
window.addEventListener('DOMContentLoaded', () => {
  View3D.init($('#view3d'));
  showTitle();
});
