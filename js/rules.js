'use strict';
/* ============================================================
   AD&D 2nd Edition rules engine: dice, ability tables, classes,
   races, THAC0, saving throws, spell progression, experience.
   ============================================================ */
const rnd = n => Math.floor(Math.random() * n) + 1;
const dice = (n, s) => { let t = 0; for (let i = 0; i < n; i++) t += rnd(s); return t; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/* How wide (in its own drawing units) a canvas of fixed drawing height should be to fill the box it is shown in.
   The picture is never narrower than `min` nor wider than 2.8 times its height. Returns 0 while the canvas is hidden. */
function fitWidth(cv, height, min) {
  const w = cv.clientWidth, hh = cv.clientHeight;
  return w && hh ? Math.max(min, Math.round(height * Math.min(w / hh, 2.8) / 2) * 2) : 0;
}
function rollDice(spec) {
  if (typeof spec === 'number') return spec;
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(spec);
  if (!m) return parseInt(spec, 10) || 0;
  return Math.max(0, dice(+m[1], +m[2]) + (m[3] ? +m[3] : 0));
}

const ABILS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABIL_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const ALIGNS = { LG: 'Lawful Good', NG: 'Neutral Good', CG: 'Chaotic Good', LN: 'Lawful Neutral', N: 'True Neutral', CN: 'Chaotic Neutral', LE: 'Lawful Evil', NE: 'Neutral Evil', CE: 'Chaotic Evil' };
const SAVE_NAMES = ['Paralyzation / Poison / Death', 'Rod / Staff / Wand', 'Petrification / Polymorph', 'Breath Weapon', 'Spell'];
const MAX_LEVEL = 8;

/* ---- Races (PHB Table 7 minimums/maximums, Table 8 adjustments) ---- */
const RACES = {
  human:    { name: 'Human',    adj: {}, min: {}, max: {}, classes: 'FPRMCT', mv: 12, th: {},
              notes: 'No adjustments. May be any class.' },
  dwarf:    { name: 'Dwarf',    adj: { con: 1, cha: -1 }, min: { str: 8, con: 11 }, max: { dex: 17, cha: 17 }, classes: 'FCT', mv: 6,
              th: { ol: 10, ft: 15 },
              notes: '+1 Con, -1 Cha. Save bonus vs. magic and poison. +1 to hit orcs and goblinkind; ogres suffer -4 to hit.' },
  elf:      { name: 'Elf',      adj: { dex: 1, con: -1 }, min: { dex: 6, con: 7, int: 8, cha: 8 }, max: {}, classes: 'FRMCT', mv: 12,
              th: { ol: -5, ms: 5, hs: 10 },
              notes: '+1 Dex, -1 Con. 90% resistance to sleep. +1 to hit with bows and long/short swords. Immune to ghoul paralysis.' },
  gnome:    { name: 'Gnome',    adj: { int: 1, wis: -1 }, min: { str: 6, con: 8, int: 6 }, max: {}, classes: 'FCT', mv: 6,
              th: { ol: 5, ft: 10, ms: 5, hs: 5 },
              notes: '+1 Int, -1 Wis. Save bonus vs. magic. +1 to hit kobolds and goblins; ogres and gnolls suffer -4 to hit.' },
  halfelf:  { name: 'Half-Elf', adj: {}, min: { dex: 6, con: 6, int: 4 }, max: {}, classes: 'FRMCT', mv: 12,
              th: { hs: 5 },
              notes: 'No adjustments. 30% resistance to sleep.' },
  halfling: { name: 'Halfling', adj: { dex: 1, str: -1 }, min: { str: 7, dex: 7, con: 10, int: 6 }, max: { wis: 17 }, classes: 'FCT', mv: 6,
              th: { ol: 5, ft: 5, ms: 10, hs: 15 },
              notes: '+1 Dex, -1 Str. Save bonus vs. magic and poison. +1 to hit with slings and thrown weapons.' },
};

/* ---- Classes ---- */
const CLASSES = {
  F: { name: 'Fighter', group: 'warrior', hd: 10, req: { str: 9 }, prime: ['str'], gold: '5d4',
       xp: [0, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000],
       notes: 'Any weapon or armor. Weapon specialization: +1 to hit, +2 damage, 3 attacks per 2 rounds.' },
  P: { name: 'Paladin', group: 'warrior', hd: 10, req: { str: 12, con: 9, wis: 13, cha: 17 }, prime: ['str', 'cha'], gold: '5d4', align: ['LG'],
       xp: [0, 2250, 4500, 9000, 18000, 36000, 75000, 150000, 300000],
       notes: 'Lawful good humans only. +2 to all saves, lay on hands (2 hp/level daily), turns undead from 3rd level.' },
  R: { name: 'Ranger', group: 'warrior', hd: 10, req: { str: 13, dex: 13, con: 14, wis: 14 }, prime: ['str', 'dex', 'wis'], gold: '5d4', align: ['LG', 'NG', 'CG'],
       xp: [0, 2250, 4500, 9000, 18000, 36000, 75000, 150000, 300000],
       notes: 'Good alignment. +4 to hit against a chosen species enemy.' },
  M: { name: 'Mage', group: 'wizard', hd: 4, req: { int: 9 }, prime: ['int'], gold: '1d4+1',
       xp: [0, 2500, 5000, 10000, 20000, 40000, 60000, 90000, 135000],
       notes: 'Wizard spells from a spellbook. No armor; dagger, staff, dart or sling only.' },
  C: { name: 'Cleric', group: 'priest', hd: 8, req: { wis: 9 }, prime: ['wis'], gold: '3d6',
       xp: [0, 1500, 3000, 6000, 13000, 27500, 55000, 110000, 225000],
       notes: 'Priest spells, turns undead. Any armor; blunt weapons only. High Wisdom grants bonus spells.' },
  T: { name: 'Thief', group: 'rogue', hd: 6, req: { dex: 9 }, prime: ['dex'], gold: '2d6', notAlign: ['LG'],
       xp: [0, 1250, 2500, 5000, 10000, 20000, 40000, 70000, 110000],
       notes: 'Backstab (+4 to hit, x2 damage), open locks, find/remove traps, hide in shadows. Leather armor only.' },
};
const SPECIES_ENEMIES = { goblin: 'Goblins', orc: 'Orcs', kobold: 'Kobolds', undead: 'Skeletons & Zombies', giantkin: 'Ogres & Gnolls' };

/* ---- Ability tables ---- */
function effStr(ch) {
  let s = ch.str, x = ch.strx || 0;
  if (ch.fx && ch.fx.strength) { s = ch.fx.strength.s; x = ch.fx.strength.x; }
  return { s, x };
}
function strMods(ch) {
  const { s, x } = effStr(ch);
  if (s <= 3) return { hit: -3, dmg: -1, open: 2 };
  if (s <= 5) return { hit: -2, dmg: -1, open: 3 };
  if (s <= 7) return { hit: -1, dmg: 0, open: 4 };
  if (s <= 9) return { hit: 0, dmg: 0, open: 5 };
  if (s <= 11) return { hit: 0, dmg: 0, open: 6 };
  if (s <= 13) return { hit: 0, dmg: 0, open: 7 };
  if (s <= 15) return { hit: 0, dmg: 0, open: 8 };
  if (s === 16) return { hit: 0, dmg: 1, open: 9 };
  if (s === 17) return { hit: 1, dmg: 1, open: 10 };
  if (s === 18) {
    if (!x) return { hit: 1, dmg: 2, open: 11 };
    if (x <= 50) return { hit: 1, dmg: 3, open: 12 };
    if (x <= 75) return { hit: 2, dmg: 3, open: 13 };
    if (x <= 90) return { hit: 2, dmg: 4, open: 14 };
    if (x <= 99) return { hit: 2, dmg: 5, open: 15 };
    return { hit: 3, dmg: 6, open: 16 };
  }
  return { hit: 3, dmg: 7, open: 16 };
}
function strText(ch) {
  const { s, x } = effStr(ch);
  return s === 18 && x ? '18/' + (x === 100 ? '00' : String(x).padStart(2, '0')) : String(s);
}
function dexMods(ch) {
  const dx = clamp(ch.dex, 3, 19);
  const react = [0, 0, 0, -3, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 3][dx];
  const def = [0, 0, 0, 4, 3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, -1, -2, -3, -4, -4][dx];
  return { react, missile: react, def };
}
function conHp(ch) {
  const c = ch.con, w = CLASSES[ch.cls].group === 'warrior';
  if (c <= 3) return -2;
  if (c <= 6) return -1;
  if (c <= 14) return 0;
  if (c === 15) return 1;
  if (c === 16) return 2;
  if (!w) return 2;
  return c === 17 ? 3 : c === 18 ? 4 : 5;
}
function wisAdj(ch) {
  const w = clamp(ch.wis, 3, 19);
  return [0, 0, 0, -3, -2, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 4][w];
}
function wisBonusSpells(wis) { // extra priest spells per spell level
  if (wis >= 18) return [2, 2, 1, 1];
  if (wis === 17) return [2, 2, 1];
  if (wis === 16) return [2, 2];
  if (wis === 15) return [2, 1];
  if (wis === 14) return [2];
  if (wis === 13) return [1];
  return [];
}
function clericFailure(wis) { return wis >= 13 ? 0 : wis === 12 ? 5 : wis === 11 ? 10 : wis === 10 ? 15 : 20; }
function learnChance(int) { return int >= 19 ? 95 : int === 18 ? 85 : clamp(35 + (int - 9) * 5, 0, 75); }
function resurrectionChance(con) { return con >= 18 ? 100 : con >= 13 ? 90 + (con - 13) * 2 : clamp(40 + (con - 3) * 5, 40, 85); }

/* ---- THAC0 / saves / spells ---- */
function charThac0(ch) {
  const L = ch.lvl - 1;
  switch (CLASSES[ch.cls].group) {
    case 'warrior': return 20 - L;
    case 'priest': return 20 - 2 * Math.floor(L / 3);
    case 'rogue': return 20 - Math.floor(L / 2);
    default: return 20 - Math.floor(L / 3);
  }
}
const SAVES = {
  warrior: [[0, [16, 18, 17, 20, 19]], [2, [14, 16, 15, 17, 17]], [4, [13, 15, 14, 16, 16]], [6, [11, 13, 12, 13, 14]], [8, [10, 12, 11, 12, 13]], [10, [8, 10, 9, 9, 11]], [99, [7, 9, 8, 8, 10]]],
  priest:  [[3, [10, 14, 13, 16, 15]], [6, [9, 13, 12, 15, 14]], [9, [7, 11, 10, 13, 12]], [99, [6, 10, 9, 12, 11]]],
  rogue:   [[4, [13, 14, 12, 16, 15]], [8, [12, 12, 11, 15, 13]], [99, [11, 10, 10, 14, 11]]],
  wizard:  [[5, [14, 11, 13, 15, 12]], [10, [13, 9, 11, 13, 10]], [99, [11, 7, 9, 11, 8]]],
};
function saveBase(group, lvl) {
  for (const [max, row] of SAVES[group]) if (lvl <= max) return row;
  return SAVES[group][SAVES[group].length - 1][1];
}
/* type: 0 PPD, 1 RSW, 2 PP, 3 BW, 4 Spell. Returns the d20 roll needed. */
function charSave(ch, type, opt) {
  opt = opt || {};
  let t = saveBase(CLASSES[ch.cls].group, ch.lvl)[type];
  if (ch.cls === 'P') t -= 2;
  const hardy = ch.race === 'dwarf' || ch.race === 'gnome' || ch.race === 'halfling';
  if (hardy && (type === 1 || type === 4 || (opt.poison && ch.race !== 'gnome'))) t -= Math.floor(ch.con / 3.5);
  const ring = item(ch.eq.ring);
  if (ring && ring.prot) t -= ring.prot;
  if (opt.mental) t -= wisAdj(ch);
  return t;
}
const MAGE_SLOTS = [[1], [2], [2, 1], [3, 2], [4, 2, 1], [4, 2, 2], [4, 3, 2, 1], [4, 3, 3, 2], [4, 3, 3, 2, 1]];
const CLERIC_SLOTS = [[1], [2], [2, 1], [3, 2], [3, 3, 1], [3, 3, 2], [3, 3, 2, 1], [3, 3, 3, 2], [4, 4, 3, 2, 1]];
function spellSlots(ch) {
  if (ch.cls === 'M') return MAGE_SLOTS[ch.lvl - 1].slice(0, 3);
  if (ch.cls === 'C') {
    const base = CLERIC_SLOTS[ch.lvl - 1].slice(0, 3), b = wisBonusSpells(ch.wis);
    return base.map((n, i) => n + (b[i] || 0));
  }
  return [];
}
function isCaster(ch) { return ch.cls === 'M' || ch.cls === 'C'; }
function knownSpells(ch) {
  if (ch.cls === 'M') return ch.book.slice();
  if (ch.cls === 'C') { const max = spellSlots(ch).length; return Object.keys(SPELLS).filter(id => SPELLS[id].c === 'C' && SPELLS[id].l <= max); }
  return [];
}
const PREP_PRIORITY = {
  M: [['sleep', 'magicMissile', 'magicMissile', 'armor'], ['stinkingCloud', 'mirrorImage', 'stinkingCloud'], ['fireball', 'holdPerson', 'haste']],
  C: [['cureLight', 'cureLight', 'bless', 'cureLight', 'cureLight'], ['holdPersonC', 'aid', 'slowPoison', 'holdPersonC', 'silence'], ['prayer', 'dispelMagic', 'removeParalysis']],
};
function prepCount(ch, lvl) { let n = 0; for (const id in ch.prep) if (SPELLS[id] && SPELLS[id].l === lvl) n += ch.prep[id]; return n; }
/* fill any empty preparation slots with sensible defaults */
function autoPrep(ch) {
  if (!isCaster(ch)) return;
  const slots = spellSlots(ch), known = knownSpells(ch);
  slots.forEach((n, i) => {
    const pri = PREP_PRIORITY[ch.cls][i].filter(id => known.includes(id));
    let k = prepCount(ch, i + 1), guard = 0;
    while (pri.length && prepCount(ch, i + 1) < n && guard++ < 20) { const id = pri[k++ % pri.length]; ch.prep[id] = (ch.prep[id] || 0) + 1; }
  });
}
function memorizeAll(ch) { if (isCaster(ch)) ch.mem = Object.assign({}, ch.prep); }

/* ---- Turning undead (PHB Table 61) ---- */
const TURN = {
  skeleton: [10, 7, 4, 'T', 'T', 'D', 'D', 'D', 'D'],
  zombie:   [13, 10, 7, 4, 'T', 'T', 'D', 'D', 'D'],
  ghoul:    [16, 13, 10, 7, 4, 'T', 'T', 'D', 'D'],
  shadow:   [19, 16, 13, 10, 7, 4, 'T', 'T', 'D'],
  wight:    [20, 19, 16, 13, 10, 7, 4, 'T', 'T'],
  ghast:    [21, 20, 19, 16, 13, 10, 7, 4, 'T'],   // 21: cannot be turned at that level
  wraith:   [21, 21, 20, 19, 16, 13, 10, 7, 4],
};
const TURN_ORDER = ['skeleton', 'zombie', 'ghoul', 'shadow', 'wight', 'ghast', 'wraith'];
function turnLevel(ch) { return ch.cls === 'C' ? ch.lvl : ch.cls === 'P' ? ch.lvl - 2 : 0; }

/* ---- Thief skills (PHB Tables 26-28) ---- */
function thiefSkills(ch) {
  const t = { ol: 10, ft: 5, ms: 10, hs: 5 };
  const r = RACES[ch.race].th;
  for (const k in r) t[k] += r[k];
  const d = { 9: { ol: -10, ft: -10, ms: -20, hs: -10 }, 10: { ol: -5, ft: -10, ms: -15, hs: -5 }, 11: { ft: -5, ms: -10 }, 12: { ms: -5 },
              16: { ol: 5 }, 17: { ol: 10, ms: 5, hs: 5 }, 18: { ol: 15, ft: 5, ms: 10, hs: 10 }, 19: { ol: 20, ft: 10, ms: 15, hs: 15 } }[ch.dex] || {};
  for (const k in d) t[k] += d[k];
  // discretionary points: 60 at 1st level, 30 per level thereafter
  t.ol += 20 + 10 * (ch.lvl - 1); t.ft += 20 + 10 * (ch.lvl - 1); t.ms += 10 + 5 * (ch.lvl - 1); t.hs += 10 + 5 * (ch.lvl - 1);
  for (const k in t) t[k] = clamp(t[k], 1, 95);
  return t;
}
function backstabMult(ch) { return ch.lvl <= 4 ? 2 : ch.lvl <= 8 ? 3 : 4; }

/* ---- Character generation ---- */
function meetsReq(stats, race, cls) {
  const R = RACES[race], C = CLASSES[cls];
  for (const a of ABILS) {
    const raw = stats[a] - (R.adj[a] || 0);
    if (raw < (R.min[a] || 3) || raw > (R.max[a] || 18)) return false;
    if (stats[a] < (C.req[a] || 3)) return false;
  }
  return true;
}
/* Method V (4d6 drop lowest), in order, re-rolled until race/class minimums are met */
function rollStats(race, cls) {
  const R = RACES[race];
  for (let tries = 0; tries < 50000; tries++) {
    const st = {};
    for (const a of ABILS) {
      const r = [rnd(6), rnd(6), rnd(6), rnd(6)].sort((x, y) => y - x);
      st[a] = r[0] + r[1] + r[2] + (R.adj[a] || 0);
    }
    if (meetsReq(st, race, cls)) {
      st.strx = (CLASSES[cls].group === 'warrior' && st.str === 18) ? rnd(100) : 0;
      return st;
    }
  }
  const st = {};
  for (const a of ABILS) st[a] = Math.max(12, CLASSES[cls].req[a] || 0, (R.min[a] || 0) + (R.adj[a] || 0));
  st.strx = 0;
  return st;
}
let _cid = 1;
function newCharacter(o) {
  const C = CLASSES[o.cls];
  const ch = {
    id: 'c' + Date.now().toString(36) + (_cid++), name: o.name, race: o.race, cls: o.cls, align: o.align, lvl: 1, xp: 0,
    str: o.stats.str, strx: o.stats.strx || 0, dex: o.stats.dex, con: o.stats.con, int: o.stats.int, wis: o.stats.wis, cha: o.stats.cha,
    hp: 1, maxhp: 1, eq: { weapon: null, ranged: null, armor: null, shield: null, ring: null }, inv: [],
    color: o.color || '#b33', spec: o.spec || null, foe: o.foe || null, fx: {}, book: [], prep: {}, mem: {}, poison: null, dead: false, layUsed: false,
  };
  ch.maxhp = Math.max(1, C.hd + conHp(ch)); // maximum hit points at 1st level
  ch.hp = ch.maxhp;
  if (ch.cls === 'M') ch.book = ['magicMissile', 'sleep', 'armor', 'burningHands', 'shield'];
  autoPrep(ch); memorizeAll(ch);
  return ch;
}
function startingGold(cls) { return rollDice(CLASSES[cls].gold) * 10; }

/* ---- Experience ---- */
function xpForNext(ch) { return ch.lvl >= MAX_LEVEL ? Infinity : CLASSES[ch.cls].xp[ch.lvl]; }
function awardXP(ch, amt) {
  if (CLASSES[ch.cls].prime.every(a => ch[a] >= 16)) amt = Math.floor(amt * 1.1); // prime requisite bonus
  ch.xp += amt;
  // a character may not advance more than one level at a time
  const cap = ch.lvl + 1 >= MAX_LEVEL ? Infinity : CLASSES[ch.cls].xp[ch.lvl + 1] - 1;
  if (ch.xp > cap) ch.xp = cap;
  return amt;
}
function canLevel(ch) { return !ch.dead && ch.lvl < MAX_LEVEL && ch.xp >= xpForNext(ch); }
function levelUp(ch) {
  const before = spellSlots(ch).length;
  ch.lvl++;
  const gain = Math.max(1, rnd(CLASSES[ch.cls].hd) + conHp(ch));
  ch.maxhp += gain; ch.hp += gain;
  autoPrep(ch);
  return { hp: gain, newSpellLevel: spellSlots(ch).length > before };
}
/* drop prepared spells that no longer fit the character's slots */
function trimPrep(ch) {
  if (!isCaster(ch)) return;
  const slots = spellSlots(ch), known = knownSpells(ch);
  for (const id in ch.prep) if (!known.includes(id) || SPELLS[id].l > slots.length) delete ch.prep[id];
  slots.forEach((n, i) => { for (const id in ch.prep) while (SPELLS[id].l === i + 1 && prepCount(ch, i + 1) > n && ch.prep[id]) { if (!--ch.prep[id]) delete ch.prep[id]; } });
  for (const id in ch.mem) if (!ch.prep[id]) delete ch.mem[id]; else ch.mem[id] = Math.min(ch.mem[id], ch.prep[id]);
}
/* level drain (wights and worse): lose a level and its hit points; a 1st-level victim dies */
function drainLevel(ch) {
  if (ch.lvl <= 1) { ch.dead = true; ch.hp = -10; return false; }
  const per = Math.max(1, Math.round((ch.maxhp - CLASSES[ch.cls].hd) / (ch.lvl - 1)));
  ch.lvl--; ch.maxhp = Math.max(1, ch.maxhp - per); ch.hp = Math.min(ch.hp, ch.maxhp);
  const xp = CLASSES[ch.cls].xp; ch.xp = Math.floor((xp[ch.lvl - 1] + xp[ch.lvl]) / 2);
  trimPrep(ch);
  return true;
}
/* mages learn one new spell per level gained; this picks for characters advanced automatically */
const SPELL_PICKS = ['fireball', 'haste', 'lightningBolt', 'holdPerson', 'stinkingCloud', 'mirrorImage', 'strength', 'knock'];
function pickNewSpell(ch) {
  const max = spellSlots(ch).length, id = SPELL_PICKS.find(s => SPELLS[s].l <= max && !ch.book.includes(s));
  if (id) ch.book.push(id);
  return id;
}
/* raise a character to the given level, as if the months between adventures were spent training */
function advanceTo(ch, lvl) {
  lvl = Math.min(lvl, MAX_LEVEL);
  if (ch.dead || ch.lvl >= lvl) return false;
  while (ch.lvl < lvl) { levelUp(ch); if (ch.cls === 'M') pickNewSpell(ch); }
  ch.xp = Math.max(ch.xp, CLASSES[ch.cls].xp[ch.lvl - 1]);
  ch.hp = ch.maxhp; autoPrep(ch); memorizeAll(ch);
  return true;
}

/* ---- Equipment helpers ---- */
function canUse(ch, it) { return !!it && (!it.cls || it.cls.includes(ch.cls)); }
const FIST = { name: 'Fist', t: 'w', dmg: '1d2', dmgL: '1d2', sp: 0, dt: 'B', bonus: 0 };
function wpn(ch) { return item(ch.eq.weapon) || FIST; }
function rwpn(ch) { return item(ch.eq.ranged); }
/* attacks per round expressed in halves: 2 = 1/round, 3 = 3/2, 4 = 2/round */
function atkHalves(ch, ranged) {
  if (ranged) { const r = rwpn(ch); return r ? r.rof * 2 : 0; }
  return meleeHalves(ch);
}
function baseId(id) { return id ? (item(id).base || id) : null; }
function isSpecialized(ch, weaponId) { return ch.cls === 'F' && !!ch.spec && baseId(weaponId) === ch.spec; }
function meleeHalves(ch) {
  let h = 2;
  if (CLASSES[ch.cls].group === 'warrior' && ch.lvl >= 7) h = 3;
  if (isSpecialized(ch, ch.eq.weapon)) h += 1;
  return h;
}
function charAC(ch) {
  let ac = 10;
  const a = item(ch.eq.armor), s = item(ch.eq.shield), r = item(ch.eq.ring), w = item(ch.eq.weapon);
  if (a) ac = a.ac - (a.bonus || 0);
  if (ch.fx && ch.fx.armor > 0 && ac > 6) ac = 6;
  if (s && !(w && w.hands === 2)) ac -= 1 + (s.bonus || 0);
  if (r && r.prot) ac -= r.prot;
  return ac + dexMods(ch).def;
}
function moveRate(ch) { return RACES[ch.race].mv; }
