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
const MAX_LEVEL = 20;

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
       xp: [0, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 750000, 1000000, 1250000, 1500000, 1750000, 2000000, 2250000, 2500000, 2750000, 3000000],
       notes: 'Any weapon or armor. Weapon specialization: +1 to hit, +2 damage, and an extra attack every 2 rounds (3 per 2 rounds at 1st level, 2 a round at 7th, 5 per 2 at 13th).' },
  P: { name: 'Paladin', group: 'warrior', hd: 10, req: { str: 12, con: 9, wis: 13, cha: 17 }, prime: ['str', 'cha'], gold: '5d4', align: ['LG'],
       xp: [0, 2250, 4500, 9000, 18000, 36000, 75000, 150000, 300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2700000, 3000000, 3300000, 3600000],
       notes: 'Lawful good humans only. +2 to all saves, lay on hands (2 hp/level daily). Aura of protection: evil foes within one square suffer -1 to hit. Turns undead from 3rd level, as a cleric two levels lower. Priest spells from 9th level.' },
  R: { name: 'Ranger', group: 'warrior', hd: 10, req: { str: 13, dex: 13, con: 14, wis: 14 }, prime: ['str', 'dex', 'wis'], gold: '5d4', align: ['LG', 'NG', 'CG'],
       xp: [0, 2250, 4500, 9000, 18000, 36000, 75000, 150000, 300000, 600000, 900000, 1200000, 1500000, 1800000, 2100000, 2400000, 2700000, 3000000, 3300000, 3600000],
       notes: 'Good alignment. Against a chosen species enemy: +4 to hit and +1 melee damage per level. In light armor, with a one-handed weapon and no shield, fights with a second blade: an extra off-hand attack each round.' },
  M: { name: 'Mage', group: 'wizard', hd: 4, req: { int: 9 }, prime: ['int'], gold: '1d4+1',
       xp: [0, 2500, 5000, 10000, 20000, 40000, 60000, 90000, 135000, 250000, 375000, 750000, 1125000, 1500000, 1875000, 2250000, 2625000, 3000000, 3375000, 3750000],
       notes: 'Wizard spells from a spellbook. No armor; dagger, staff, dart or sling only.' },
  C: { name: 'Cleric', group: 'priest', hd: 8, req: { wis: 9 }, prime: ['wis'], gold: '3d6',
       xp: [0, 1500, 3000, 6000, 13000, 27500, 55000, 110000, 225000, 450000, 675000, 900000, 1125000, 1350000, 1575000, 1800000, 2025000, 2250000, 2475000, 2700000],
       notes: 'Priest spells, turns undead. Any armor; blunt weapons only. High Wisdom grants bonus spells.' },
  T: { name: 'Thief', group: 'rogue', hd: 6, req: { dex: 9 }, prime: ['dex'], gold: '2d6', notAlign: ['LG'],
       xp: [0, 1250, 2500, 5000, 10000, 20000, 40000, 70000, 110000, 160000, 220000, 440000, 660000, 880000, 1100000, 1320000, 1540000, 1760000, 1980000, 2200000],
       notes: 'Backstab (+4 to hit, x2 damage, rising to x5 at 13th level), open locks, find/remove traps, hide in shadows. Leather armor only.' },
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
  warrior: [[0, [16, 18, 17, 20, 19]], [2, [14, 16, 15, 17, 17]], [4, [13, 15, 14, 16, 16]], [6, [11, 13, 12, 13, 14]], [8, [10, 12, 11, 12, 13]], [10, [8, 10, 9, 9, 11]], [12, [7, 9, 8, 8, 10]],
            [14, [5, 7, 6, 5, 8]], [16, [4, 6, 5, 4, 7]], [99, [3, 5, 4, 4, 6]]],
  priest:  [[3, [10, 14, 13, 16, 15]], [6, [9, 13, 12, 15, 14]], [9, [7, 11, 10, 13, 12]], [12, [6, 10, 9, 12, 11]], [15, [5, 9, 8, 11, 10]], [18, [4, 8, 7, 10, 9]], [99, [2, 6, 5, 8, 7]]],
  rogue:   [[4, [13, 14, 12, 16, 15]], [8, [12, 12, 11, 15, 13]], [12, [11, 10, 10, 14, 11]], [16, [10, 8, 9, 13, 9]], [20, [9, 6, 8, 12, 7]], [99, [8, 4, 7, 11, 5]]],
  wizard:  [[5, [14, 11, 13, 15, 12]], [10, [13, 9, 11, 13, 10]], [15, [11, 7, 9, 11, 8]], [20, [10, 5, 7, 9, 6]], [99, [8, 3, 5, 7, 4]]],
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
/* Spells memorized per spell level, by character level 1-20 (PHB Tables 21 and 24; paladins Table 17, from 9th level) */
const MAGE_SLOTS = [[1], [2], [2, 1], [3, 2], [4, 2, 1], [4, 2, 2], [4, 3, 2, 1], [4, 3, 3, 2], [4, 3, 3, 2, 1], [4, 4, 3, 2, 2],
  [4, 4, 4, 3, 3], [4, 4, 4, 4, 4, 1], [5, 5, 5, 4, 4, 2], [5, 5, 5, 4, 4, 2, 1], [5, 5, 5, 5, 5, 2, 1], [5, 5, 5, 5, 5, 3, 2, 1],
  [5, 5, 5, 5, 5, 3, 3, 2], [5, 5, 5, 5, 5, 3, 3, 2, 1], [5, 5, 5, 5, 5, 3, 3, 3, 1], [5, 5, 5, 5, 5, 4, 3, 3, 2]];
const CLERIC_SLOTS = [[1], [2], [2, 1], [3, 2], [3, 3, 1], [3, 3, 2], [3, 3, 2, 1], [3, 3, 3, 2], [4, 4, 3, 2, 1], [4, 4, 3, 3, 2],
  [5, 4, 4, 3, 2, 1], [6, 5, 5, 3, 2, 2], [6, 6, 6, 4, 2, 2], [6, 6, 6, 5, 3, 2, 1], [6, 6, 6, 6, 4, 2, 1], [7, 7, 7, 6, 4, 3, 1],
  [7, 7, 7, 7, 5, 3, 2], [8, 8, 8, 8, 6, 4, 2], [9, 9, 8, 8, 6, 4, 2], [9, 9, 9, 8, 7, 5, 2]];
const PALADIN_SLOTS = { 9: [1], 10: [2], 11: [2, 1], 12: [2, 2], 13: [2, 2, 1], 14: [3, 2, 1], 15: [3, 2, 1, 1], 16: [3, 3, 2, 1], 17: [3, 3, 3, 1], 18: [3, 3, 3, 1], 19: [3, 3, 3, 2], 20: [3, 3, 3, 3] };
/* the priest spells a paladin may pray for: those of combat, healing and protection */
const PALADIN_SPELLS = ['cureLight', 'bless', 'protEvil', 'aid', 'slowPoison', 'prayer', 'dispelMagic', 'removeParalysis'];
/* which spell list a character casts from: 'M' wizard, 'C' priest, or null */
function spellClass(ch) { return ch.cls === 'M' ? 'M' : ch.cls === 'C' || (ch.cls === 'P' && ch.lvl >= 9) ? 'C' : null; }
/* the level a character's spells are cast at; a paladin's begin at 1st when he reaches 9th level, and stop at 9th */
function casterLevel(ch) { return ch.cls === 'P' ? clamp(ch.lvl - 8, 1, 9) : ch.lvl; }
/* the highest spell level there are spells of, for a spell list: slots above it would have nothing to hold */
function topSpellLevel(c) { let m = 0; for (const id in SPELLS) if (SPELLS[id].c === c && SPELLS[id].l > m) m = SPELLS[id].l; return m; }
function spellSlots(ch) {
  const L = clamp(ch.lvl, 1, MAX_LEVEL);
  if (ch.cls === 'M') return MAGE_SLOTS[L - 1].slice(0, topSpellLevel('M'));
  if (ch.cls === 'C') {
    const base = CLERIC_SLOTS[L - 1].slice(0, topSpellLevel('C')), b = wisBonusSpells(ch.wis);
    return base.map((n, i) => n + (b[i] || 0));
  }
  if (ch.cls === 'P') return (PALADIN_SLOTS[L] || []).slice(0, topSpellLevel('C'));
  return [];
}
function isCaster(ch) { return !!spellClass(ch); }
function knownSpells(ch) {
  if (ch.cls === 'M') return ch.book.slice();
  if (spellClass(ch) === 'C') {
    const max = spellSlots(ch).length;
    return Object.keys(SPELLS).filter(id => SPELLS[id].c === 'C' && SPELLS[id].l <= max && (ch.cls !== 'P' || PALADIN_SPELLS.includes(id)));
  }
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
    const pri = (PREP_PRIORITY[spellClass(ch)][i] || []).filter(id => known.includes(id));
    let k = prepCount(ch, i + 1), guard = 0;
    while (pri.length && prepCount(ch, i + 1) < n && guard++ < 20) { const id = pri[k++ % pri.length]; ch.prep[id] = (ch.prep[id] || 0) + 1; }
  });
}
function memorizeAll(ch) { if (isCaster(ch)) ch.mem = Object.assign({}, ch.prep); }

/* ---- Turning undead (PHB Table 61) ---- */
const TURN = {
  // columns: priest levels 1 to 9, then 10-11, 12-13 and 14 or more (see turnCol)
  skeleton: [10, 7, 4, 'T', 'T', 'D', 'D', 'D', 'D', 'D', 'D', 'D'],
  zombie:   [13, 10, 7, 4, 'T', 'T', 'D', 'D', 'D', 'D', 'D', 'D'],
  ghoul:    [16, 13, 10, 7, 4, 'T', 'T', 'D', 'D', 'D', 'D', 'D'],
  shadow:   [19, 16, 13, 10, 7, 4, 'T', 'T', 'D', 'D', 'D', 'D'],
  wight:    [20, 19, 16, 13, 10, 7, 4, 'T', 'T', 'D', 'D', 'D'],
  ghast:    [21, 20, 19, 16, 13, 10, 7, 4, 'T', 'T', 'D', 'D'],   // 21: cannot be turned at that level
  wraith:   [21, 21, 20, 19, 16, 13, 10, 7, 4, 'T', 'T', 'D'],
};
function turnCol(L) { return L <= 9 ? L - 1 : L <= 11 ? 9 : L <= 13 ? 10 : 11; }
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
function backstabMult(ch) { return ch.lvl <= 4 ? 2 : ch.lvl <= 8 ? 3 : ch.lvl <= 12 ? 4 : 5; }

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
/* Hit dice are rolled up to HD_LEVELS; beyond it each level brings a fixed HP_AFTER, with no Constitution bonus (PHB) */
const HD_LEVELS = { warrior: 9, priest: 9, rogue: 10, wizard: 10 }, HP_AFTER = { warrior: 3, priest: 2, rogue: 2, wizard: 1 };
function levelUp(ch) {
  const before = spellSlots(ch).length, g = CLASSES[ch.cls].group;
  ch.lvl++;
  const gain = ch.lvl > HD_LEVELS[g] ? HP_AFTER[g] : Math.max(1, rnd(CLASSES[ch.cls].hd) + conHp(ch));
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
  const g = CLASSES[ch.cls].group, top = HD_LEVELS[g], fixed = Math.max(0, ch.lvl - top) * HP_AFTER[g];
  const per = ch.lvl > top ? HP_AFTER[g] : Math.max(1, Math.round((ch.maxhp - fixed - CLASSES[ch.cls].hd) / (ch.lvl - 1)));
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
/* attacks per round expressed in halves: 2 = 1/round, 3 = 3/2, 4 = 2/round, 5 = 5/2 */
function halvesText(h) { return h % 2 ? h + '/2' : String(h / 2); }
function atkHalves(ch, ranged) {
  if (ranged) { const r = rwpn(ch); return r ? r.rof * 2 : 0; }
  return meleeHalves(ch);
}
function baseId(id) { return id ? (item(id).base || id) : null; }
function isSpecialized(ch, weaponId) { return ch.cls === 'F' && !!ch.spec && baseId(weaponId) === ch.spec; }
/* A ranger in leather or studded leather (or no armor), with a one-handed weapon and no shield, fights with a second
   blade in the off hand: one extra attack each round, 1d6 with Strength bonuses but none from the main weapon. */
const OFFHAND = { name: 'Off-hand blade', t: 'w', dmg: '1d6', dmgL: '1d6', sp: 2, dt: 'S', bonus: 0 };
function twoWeapon(ch) {
  const a = item(ch.eq.armor), w = item(ch.eq.weapon);
  return ch.cls === 'R' && !!w && w.hands !== 2 && !ch.eq.shield && (!a || a.ac >= 7);
}
/* a ranger's extra melee damage against the chosen species enemy */
function foeDmg(ch, tags) { return ch.cls === 'R' && ch.foe && tags.includes(ch.foe) ? ch.lvl : 0; }
function meleeHalves(ch) {
  let h = 2;
  if (CLASSES[ch.cls].group === 'warrior') h = ch.lvl >= 13 ? 4 : ch.lvl >= 7 ? 3 : 2;
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
