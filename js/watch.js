'use strict';
/* ============================================================
   Monsters on the map. A set encounter is a band of creatures standing on its square. It is drawn in the
   view, it blocks the way, and it notices the party once it has a clear line of sight to them within
   SIGHT squares (walls and doors block sight). Who sees whom first decides surprise, and a band caught
   unawares can be attacked, crept up on by a thief, or left alone for now. A treasure within sight of a
   live band is guarded by it: reach for it and they attack. A thief listens at the doors the party
   passes and may hear what waits beyond.
   An encounter marked `hidden` is an ambush (things posing as statues, lurking in webs or heaps of
   bones): it is not seen until it springs, at arm's length, or when its treasure is touched.
   ============================================================ */
const SIGHT = 6.5, LURK = 1.5, GLIMPSE = 9.5;
const Watch = { def: null, g: null, list: [], calm: new Set(), unaware: new Set(), doors: new Set() };

/* the live encounters on this map, with their squares */
function encs() {
  if (!G || !X.def || isWild() || !X.def.ev) return [];
  if (Watch.def !== X.def || Watch.g !== G) {
    Watch.def = X.def; Watch.g = G; Watch.list = []; Watch.calm.clear(); Watch.unaware.clear(); Watch.doors.clear();
    X.def.grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) { const ev = X.def.ev[row[x]]; if (ev && ev.type === 'enc') Watch.list.push({ ch: row[x], x, y, ev, key: G.map + ':' + row[x] }); }
    });
  }
  return Watch.list.filter(e => !G.flags[e.key]);
}
const foeSeen = e => !!G.flags[e.key + ':seen'];
const foeAt = (x, y) => encs().find(e => e.x === x && e.y === y);
const upPC = () => P().filter(c => c.hp > 0 && !c.dead);
function leadOf(ev) { const l = ev.mons.find(([id]) => MONSTERS[id].leader) || ev.mons[0]; return l[0]; }
function bandName(ev) {
  const id = leadOf(ev), m = MONSTERS[id], n = ev.mons.reduce((s, [, k]) => s + (typeof k === 'number' ? k : 2), 0);
  return m.name + (n > 1 ? ' and others' : '');
}
function foeSprites() {
  return encs().filter(e => !e.ev.hidden || foeSeen(e)).map(e => { const id = leadOf(e.ev); return { x: e.x, y: e.y, tex: View3D.figTex('mon:' + id, MONSTERS[id].fig) }; });
}
function foeMarks() { return encs().filter(foeSeen).map(e => ({ x: e.x, y: e.y, kind: 'foe' })); }

/* Is the straight line between two squares clear of walls and doors? The end squares themselves do not
   count, so a party standing in a doorway sees into the room. A line may not squeeze between two walls
   that meet only at a corner. */
function clearLine(x0, y0, x1, y1) {
  const M = X.M, opaque = (x, y) => !!M.wt[M.c[y * M.w + x]], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 4);
  let lx = x0, ly = y0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = Math.floor(x0 + 0.5 + (x1 - x0) * t), y = Math.floor(y0 + 0.5 + (y1 - y0) * t);
    if (x === lx && y === ly) continue;
    if (x !== lx && y !== ly && opaque(x, ly) && opaque(lx, y)) return false;
    lx = x; ly = y;
    if ((x === x0 && y === y0) || (x === x1 && y === y1)) continue;
    if (opaque(x, y)) return false;
  }
  return true;
}
const dist = (e, x = G.x, y = G.y) => Math.hypot(e.x - x, e.y - y);
const sees = e => dist(e) <= (e.ev.hidden ? LURK : (e.ev.sight || SIGHT)) && clearLine(e.x, e.y, G.x, G.y);

/* the number in a band is rolled once, when it is first met */
function band(e) { return e.rolled || (e.rolled = e.ev.mons.map(([id, n]) => [id, typeof n === 'number' ? n : Math.max(1, rollDice(n))])); }

/* Surprise, on d6 for each side. A band is caught unawares on 1-2; on 1-3 when an elf or halfling in light
   armour goes before the party or a thief heard them through a door. The party is caught on 1-2, 1 with a
   ranger, 1-3 by an ambush, and an ambush itself is never surprised. */
const quietFolk = c => (c.race === 'elf' || c.race === 'halfling') && (!c.eq.armor || ['leather', 'studded', 'padded'].includes(baseId(c.eq.armor)));
function surprise(e) {
  const team = upPC();
  const them = e.ev.hidden ? 0 : 2 + (team.some(quietFolk) ? 1 : 0) + (G.flags[e.key + ':heard'] ? 1 : 0);
  const us = (e.ev.hidden ? 3 : 2) - (team.some(c => c.cls === 'R') ? 1 : 0);
  return { them: rnd(6) <= them, us: rnd(6) <= us };
}

/* fight the band and settle the outcome */
async function battle(e, px, py, extra) {
  G.flags[e.key + ':seen'] = 1;
  Watch.unaware.delete(e.key);
  const r = await fight(Object.assign({}, e.ev, { mons: band(e) }, extra || {}), px, py);
  if (r === 'win') {
    G.flags[e.key] = 1;
    if (e.ev.quest) { questDeed(e.ev.quest); log('A deed worth reporting at ' + theName(locName('hall')) + '.', 'good'); }
    saveGame('auto');
  } else if (r === 'fled') Watch.calm.add(e.key); // they let a fleeing party go, until it comes back into sight
  if (G && X.def && !isWild()) { buildSprites(); draw(); }
  return r;
}

/* The party and a band come face to face. `how`: 'sight' (they have a clear line to each other), 'bump'
   (the party walks into them), 'step' (onto their square), 'chest' (the party reaches for their treasure). */
async function meet(e, px, py, how) {
  const text = e.ev.text, wasUnaware = Watch.unaware.has(e.key);
  if (!foeSeen(e)) { G.flags[e.key + ':seen'] = 1; buildSprites(); draw(); }
  if (e.ev.surprise) return battle(e, px, py);
  if (how === 'bump' && wasUnaware) return battle(e, px, py, { surprise: 'enemy', text: 'You fall on them before they can raise the alarm!\n' + text });
  if (how === 'chest') return battle(e, px, py, { surprise: e.ev.hidden ? 'party' : 'none', text: (e.ev.hidden ? 'As you reach for the treasure, its guardians spring to life!' : 'You reach for the treasure, and its guardians are on you at once.') + '\n' + text });
  const s = surprise(e);
  if (s.them && !s.us) return unawares(e, px, py);
  if (s.us && !s.them) return battle(e, px, py, { surprise: 'party', text: text + '\nThey saw you first!' });
  return battle(e, px, py, { surprise: 'none' });
}

/* The party has seen a band that has not seen them. */
async function unawares(e, px, py) {
  const mons = band(e), thief = upPC().filter(c => c.cls === 'T').sort((a, b) => thiefSkills(b).ms - thiefSkills(a).ms)[0];
  const feet = Math.max(10, Math.round(dist(e)) * 10);
  const opts = [{ label: 'Attack (a free round)', cls: 'primary', id: 'attack' }];
  if (thief) { const t = thiefSkills(thief); opts.push({ label: thief.name.split(' ')[0] + ': creep up and strike (Move Silently ' + t.ms + '%, Hide in Shadows ' + t.hs + '%)', id: 'sneak', title: 'Unheard, the party keeps its free round; unseen as well, the thief begins the fight hidden and the first blow is a backstab (×' + backstabMult(thief) + ').' }); }
  if (px !== G.x || py !== G.y) opts.push({ label: 'Back away quietly', id: 'back' });
  opts.push({ label: 'Hold still and watch', cls: 'dim', id: 'wait' });
  const o = opts[await choice('Unseen', encounterBody('About ' + feet + ' feet away, they have not noticed you yet.', mons), opts)];
  if (o.id === 'attack') return battle(e, px, py, { surprise: 'enemy', text: 'You fall on them before they can raise the alarm!' });
  if (o.id === 'sneak') {
    const t = thiefSkills(thief);
    if (rnd(100) > t.ms) return battle(e, px, py, { surprise: 'none', text: thief.name + ' creeps forward, and a loose stone skitters away underfoot. They have heard!' });
    const hid = rnd(100) <= t.hs;
    return battle(e, px, py, { surprise: 'enemy', unseen: hid ? [thief.id] : [], text: hid ? thief.name + ' slips through the shadows unseen and unheard, a blade ready for the first unguarded back. The others follow on the signal.' : thief.name + ' gets close without a sound, but there is no cover left for the last few steps. Still, the party has the first move.' });
  }
  Watch.unaware.add(e.key);
  if (o.id === 'back') { G.x = px; G.y = py; setCam(); reveal(); draw(); refreshAll(); log('You back away. They have not seen you.', 'dim'); }
  else log('You stand still in the dark. They have not seen you, yet.', 'dim');
  return 'avoid';
}

/* After each step: bands that now have a line of sight to the party notice it (or are noticed). */
async function watchStep(px, py) {
  const live = encs();
  if (!live.length) return false;
  for (const e of live) if (!e.ev.hidden && !foeSeen(e) && dist(e) <= GLIMPSE && clearLine(e.x, e.y, G.x, G.y)) G.flags[e.key + ':seen'] = 1; // glimpsed further off, by your light
  const near = [];
  for (const e of live) {
    if (!sees(e)) { Watch.calm.delete(e.key); Watch.unaware.delete(e.key); continue; }
    if (!Watch.calm.has(e.key)) near.push(e);
  }
  near.sort((a, b) => dist(a) - dist(b));
  for (const e of near) {
    if (!sees(e)) continue; // the party backed out of sight of an earlier band
    if (Watch.unaware.has(e.key)) {
      if (rnd(6) > 2) continue; // still unnoticed, though every step under their noses is a risk
      await battle(e, px, py, { surprise: 'none', text: 'They have noticed you!\n' + e.ev.text });
    } else {
      const r = await meet(e, px, py, 'sight');
      if (r === 'avoid') continue;
    }
    return true;
  }
  return false;
}

/* The party walks into a band's square. */
async function engage(e) {
  X.lock = true;
  try { await meet(e, G.x, G.y, 'bump'); } finally { X.lock = false; }
}

/* Is the chest on this square guarded? By the band its event names, or else the nearest live band with
   a line of sight to it. Returns the fight's result, or null when no one guards it. */
async function guardChest(ev, x, y) {
  const live = encs();
  let g = ev.guard ? live.find(e => e.ch === ev.guard) : null;
  if (!g) g = live.filter(e => dist(e, x, y) <= SIGHT && clearLine(e.x, e.y, x, y)).sort((a, b) => dist(a, x, y) - dist(b, x, y))[0];
  if (!g) return null;
  return meet(g, x, y, 'chest');
}

/* A thief listens at each door the party comes up to, once per door per visit, and may hear a band
   waiting on the far side that the party cannot see. */
const SOUNDS = [
  [m => m.tags.includes('undead') && m.tags.includes('mindless'), 'the dry scrape of bone on stone'],
  [m => m.tags.includes('undead'), 'something that does not breathe, moving slowly'],
  [m => m.tags.includes('animal'), 'snuffling, and the click of claws'],
  [m => m.tags.includes('person') || m.tags.includes('human'), 'low voices and the clink of metal'],
  [m => m.size === 'L' || m.size === 'H' || m.size === 'G', 'heavy breathing, and something large shifting its weight'],
  [() => true, 'a faint, stealthy movement'],
];
function listenAtDoors() {
  const thief = upPC().filter(c => c.cls === 'T').sort((a, b) => thiefSkills(b).hn - thiefSkills(a).hn)[0];
  if (!thief) return;
  for (const [dx, dy] of DIRS) {
    const x = G.x + dx, y = G.y + dy, ch = cell(x, y);
    if (ch !== 'D' && ch !== 'L') continue;
    const k = x + ',' + y;
    if (Watch.doors.has(k)) continue;
    Watch.doors.add(k);
    const beyond = encs().filter(e => !e.ev.hidden && !foeSeen(e) && dist(e, x, y) <= SIGHT && clearLine(e.x, e.y, x, y) && !clearLine(e.x, e.y, G.x, G.y));
    if (!beyond.length || rnd(100) > thiefSkills(thief).hn) continue;
    const e = beyond.sort((a, b) => dist(a, x, y) - dist(b, x, y))[0], m = MONSTERS[leadOf(e.ev)];
    G.flags[e.key + ':heard'] = 1;
    log(thief.name + ' presses an ear to the door and hears ' + SOUNDS.find(([f]) => f(m))[1] + ' beyond it. (Hear Noise ' + thiefSkills(thief).hn + '%)', 'good');
  }
}
