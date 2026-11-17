'use strict';
/* ============================================================
   Treasure: the magic items of the first-edition treasure
   tables (potions, scrolls, rings, rods, staves and wands,
   miscellaneous magic, armor and shields, swords and other
   weapons), gems and jewelry, and the tables that hand them out.

   New item types (see data.js for w r a s g p q):
     m  worn item; `slot` says where (cloak, boots, gloves, belt, neck, charm)
     d  device with charges that casts a spell (wands, staves, rods, necklaces)
     x  scroll: a spell to read once, or a ward against a kind of creature
     k  book that raises an ability score when read
     v  valuables: gems and jewelry, sold for their full worth
   A device's remaining charges ride on its id: 'wandFire#12'.

   Fields read by the rules (see wornSum / wornHas in this file):
     prot      AC and saving throws        acBonus   AC only          saveBonus  saving throws only
     str       sets Strength [score, %]    strAdd, dexAdd             regen      hit points a round
     resist    'fire' | 'cold' (half damage)   free   cannot be held  noDrain, noPoison
     displace  AC -2, saves +2             speed     hasted in battle invis      begins battle unseen
     wiz       spell levels whose wizard slots are doubled
   Weapons: vs {tag: extra to hit and damage}, vsRegen, mult {tag: damage multiplier},
     slayOn (natural roll that kills outright), critOn + critMult, crit20 (extra dice on a 20),
     disrupt (destroys undead), venom, pal {bonus, evilDmg} for a paladin, dwarf {...} for a dwarf.
   ============================================================ */

/* ---------------- reading an item id ---------------- */
function itemBase(id) { return id ? String(id).split('#')[0] : id; }
function itemCharges(id) { const p = String(id).split('#'); return p.length > 1 ? +p[1] : null; }

/* ---------------- what a character wears ---------------- */
const WORN_SLOTS = ['weapon', 'armor', 'shield', 'ring', 'ring2', 'cloak', 'boots', 'gloves', 'belt', 'neck', 'charm'];
function wornItems(ch) { const out = []; for (const s of WORN_SLOTS) { const it = ch.eq && ch.eq[s] ? item(ch.eq[s]) : null; if (it) out.push(it); } return out; }
function wornSum(ch, key) { let n = 0; for (const it of wornItems(ch)) if (typeof it[key] === 'number') n += it[key]; return n; }
function wornHas(ch, key, val) { return wornItems(ch).some(it => val === undefined ? !!it[key] : it[key] === val); }
/* the best Strength any worn item lends, as [score, percentile], or null */
function wornStr(ch) { let best = null; for (const it of wornItems(ch)) if (it.str && (!best || it.str[0] > best[0] || (it.str[0] === best[0] && it.str[1] > best[1]))) best = it.str; return best; }
/* which slot an item goes in, or null if it is not worn or wielded */
function slotOf(ch, it) {
  if (!it) return null;
  if (it.t === 'm') return it.slot;
  if (it.t === 'g') return ch && ch.eq.ring && !ch.eq.ring2 ? 'ring2' : 'ring';
  return { w: 'weapon', r: 'ranged', a: 'armor', s: 'shield' }[it.t] || null;
}

/* ---------------- building the catalogue ---------------- */
(function () {
  const add = (id, o) => { if (!ITEMS[id]) ITEMS[id] = o; return id; };
  const plus = n => ' +' + n, price = n => [0, 1500, 4000, 9000, 18000, 32000][n];

  /* enchanted weapons, +1 to +5 for swords and +1 to +3 for the rest */
  const WPN = { longsword: 5, shortsword: 3, broadsword: 5, twohander: 5, dagger: 3, mace: 3, hammer: 3, flail: 3, morningstar: 3, battleaxe: 3, handaxe: 3, spear: 3, halberd: 3, staff: 3,
    longbow: 3, shortbow: 3, crossbow: 3, sling: 3 };
  const short = { mace: 'Mace', flail: 'Flail', staff: 'Quarterstaff', longbow: 'Long Bow', shortbow: 'Short Bow', crossbow: 'Light Crossbow', sling: 'Sling' };
  for (const b in WPN) for (let n = 1; n <= WPN[b]; n++)
    add(b + n, Object.assign({}, ITEMS[b], { name: (short[b] || ITEMS[b].name) + plus(n), base: b, bonus: n, magic: true, cost: Math.round(price(n) * (ITEMS[b].t === 'r' ? 1.2 : b === 'dagger' ? 0.5 : 1)) }));
  /* enchanted armor and shields, +1 to +5 */
  for (const b of ['leather', 'studded', 'scale', 'chain', 'splint', 'banded', 'plate']) for (let n = 1; n <= 5; n++)
    add(b + n, Object.assign({}, ITEMS[b], { name: ITEMS[b].name + plus(n), bonus: n, magic: true, cost: Math.round(price(n) * (b === 'plate' ? 2.5 : b === 'leather' || b === 'studded' ? 0.7 : 1.3)) }));
  for (let n = 1; n <= 5; n++) add('shield' + n, Object.assign({}, ITEMS.shield, { name: 'Shield' + plus(n), bonus: n, magic: true, cost: Math.round(price(n) * 0.8) }));
  add('elvenChain', { name: 'Elven Chain Mail', t: 'a', ac: 5, cost: 6000, cls: 'FPRCT', magic: true, note: 'Light enough for a thief to wear.' });
  for (const [ac, cost] of [[8, 1000], [7, 1500], [5, 3000], [3, 6000], [2, 9000]]) add('bracers' + ac, { name: 'Bracers of Defense AC ' + ac, t: 'a', ac, cost, magic: true });

  /* swords with powers of their own */
  const sword = (id, name, bonus, cost, o) => add(id, Object.assign({}, ITEMS.longsword, { name, base: 'longsword', bonus, magic: true, cost }, o));
  sword('swordLyc', 'Sword +1, +2 vs. Lycanthropes', 1, 3000, { vs: { lycanthrope: 1 }, note: '+2 against shapechangers.' });
  sword('swordSpell', 'Sword +1, +2 vs. Enchanted Creatures', 1, 3500, { vs: { construct: 1, elemental: 1, fiend: 1 }, note: '+2 against golems, elementals and fiends.' });
  sword('swordRegen', 'Sword +1, +3 vs. Regenerating Creatures', 1, 4000, { vsRegen: 2, note: '+3 against anything that regenerates.' });
  sword('swordReptile', 'Sword +1, +4 vs. Reptiles', 1, 4500, { vs: { dragon: 3 }, note: '+4 against dragons and their kin.' });
  sword('flameTongue', 'Sword +1, Flame Tongue', 1, 7500, { vsRegen: 1, vs: { undead: 3, cold: 2 }, note: '+2 against regenerating creatures, +3 against those of cold, +4 against undead.' });
  sword('frostBrand', 'Sword +3, Frost Brand', 3, 14000, { vs: { fire: 3 }, resist: 'fire', note: '+6 against creatures of fire; the wielder takes half damage from fire.' });
  sword('luckBlade', 'Sword +1, Luck Blade', 1, 5000, { saveBonus: 1, note: '+1 to all saving throws.' });
  sword('defender', 'Sword +4, Defender', 4, 22000, { acBonus: 1, note: 'Also improves armor class by 1.' });
  sword('dragonSlayer', 'Sword +2, Dragon Slayer', 2, 12000, { vs: { dragon: 2 }, mult: { dragon: 3 }, note: '+4 against dragons, and triple damage.' });
  sword('giantSlayer', 'Sword +2, Giant Slayer', 2, 9000, { vs: { giant: 1 }, mult: { giant: 2 }, note: '+3 against giants, and double damage.' });
  sword('holyAvenger', 'Sword +5, Holy Avenger', 2, 40000, { pal: { bonus: 5, evilDmg: 10 }, cls: 'FPR', note: '+2 in ordinary hands. For a paladin it is +5 and deals +10 damage to evil creatures.' });
  sword('vorpal', 'Sword +3, Vorpal Weapon', 3, 30000, { slayOn: 18, note: 'On a natural roll of 18 or better that hits, it severs the neck.' });
  sword('sharpness', 'Sword of Sharpness', 3, 22000, { critOn: 19, critMult: 2, note: 'Treated as +3. A natural 19 or 20 takes a limb: double damage.' });
  sword('lifeStealer', 'Sword of Life Stealing', 2, 16000, { crit20: '2d8', drainHeal: true, note: 'On a natural 20 it drains life: 2d8 extra damage, which heals the wielder.' });
  sword('nineLives', 'Sword +2, Nine Lives Stealer', 2, 18000, { slaySave: 20, note: 'On a natural 20 the victim must save vs. spell or die.' });
  sword('wounding', 'Sword of Wounding', 1, 12000, { extra: '1d4', note: 'Its wounds bleed: 1d4 extra damage.' });
  add('shortQuick', Object.assign({}, ITEMS.shortsword, { name: 'Short Sword of Quickness +2', base: 'shortsword', bonus: 2, sp: 0, magic: true, cost: 6000, note: 'Always strikes first.' }));

  /* other weapons */
  add('maceDisruption', Object.assign({}, ITEMS.mace, { name: 'Mace of Disruption', base: 'mace', bonus: 1, magic: true, cost: 17500, cls: 'FPRC', disrupt: true, note: 'Undead it strikes must save or be destroyed, and take double damage if they save.' }));
  add('hammerDwarven', Object.assign({}, ITEMS.hammer, { name: 'Hammer +3, Dwarven Thrower', base: 'hammer', bonus: 2, magic: true, cost: 15000, dwarf: { bonus: 3, mult: { giant: 2 } }, note: '+2; in a dwarf\'s hands +3, with double damage against giant-kin.' }));
  add('daggerVenom', Object.assign({}, ITEMS.dagger, { name: 'Dagger of Venom', base: 'dagger', bonus: 1, magic: true, cost: 6000, venom: true, note: 'On a natural 20 the victim must save vs. poison or die.' }));
  add('staffStriking', Object.assign({}, ITEMS.staff, { name: 'Staff of Striking', base: 'staff', bonus: 3, dmg: '1d6+3', dmgL: '1d6+3', magic: true, cost: 12000, cls: 'MCFPRT' }));
  add('staffWithering', Object.assign({}, ITEMS.staff, { name: 'Staff of Withering', base: 'staff', bonus: 1, dmg: '2d4+1', dmgL: '2d4+1', magic: true, cost: 14000, cls: 'C' }));
  add('staffSerpent', Object.assign({}, ITEMS.staff, { name: 'Staff of the Serpent', base: 'staff', bonus: 2, magic: true, cost: 9000, cls: 'C' }));
  add('rodSmiting', Object.assign({}, ITEMS.mace, { name: 'Rod of Smiting', base: 'mace', bonus: 3, magic: true, cost: 16000, cls: 'FPRC', mult: { construct: 2 }, note: 'Double damage against golems.' }));
  add('rodLordly', Object.assign({}, ITEMS.mace, { name: 'Rod of Lordly Might', base: 'mace', bonus: 2, dmg: '1d8+2', dmgL: '1d8+2', magic: true, cost: 20000, cls: 'FPR' }));
  add('crossbowSpeed', Object.assign({}, ITEMS.crossbow, { name: 'Crossbow of Speed', base: 'crossbow', bonus: 1, rof: 2, magic: true, cost: 7500, note: 'Fires twice a round.' }));
  add('crossbowAccuracy', Object.assign({}, ITEMS.crossbow, { name: 'Crossbow of Accuracy +3', base: 'crossbow', bonus: 3, magic: true, cost: 9000 }));
  add('slingSeeking', Object.assign({}, ITEMS.sling, { name: 'Sling of Seeking +2', base: 'sling', bonus: 2, magic: true, cost: 3500 }));

  /* rings (two may be worn) */
  const ring = (id, name, cost, o) => add(id, Object.assign({ name, t: 'g', cost, magic: true }, o));
  ring('ringProt3', 'Ring of Protection +3', 9000, { prot: 3 });
  ring('ringRegen', 'Ring of Regeneration', 25000, { regen: 1, note: 'Restores 1 hit point every round of battle and 10 with each rest.' });
  ring('ringFire', 'Ring of Fire Resistance', 5000, { resist: 'fire', note: 'Half damage from fire.' });
  ring('ringWarmth', 'Ring of Warmth', 4000, { resist: 'cold', note: 'Half damage from cold.' });
  ring('ringFree', 'Ring of Free Action', 6000, { free: true, note: 'The wearer cannot be held, paralysed or stunned.' });
  ring('ringInvis', 'Ring of Invisibility', 8000, { invis: true, note: 'The wearer begins every battle unseen, until they strike.' });
  ring('ringWiz1', 'Ring of Wizardry (1st level)', 12000, { wiz: [1], cls: 'M', note: 'Doubles a mage\'s 1st-level spells.' });
  ring('ringWiz2', 'Ring of Wizardry (1st-2nd level)', 20000, { wiz: [1, 2], cls: 'M', note: 'Doubles a mage\'s 1st- and 2nd-level spells.' });
  ring('ringWiz3', 'Ring of Wizardry (1st-3rd level)', 30000, { wiz: [1, 2, 3], cls: 'M', note: 'Doubles a mage\'s 1st- to 3rd-level spells.' });
  ring('ringWiz45', 'Ring of Wizardry (4th-5th level)', 40000, { wiz: [4, 5], cls: 'M', note: 'Doubles a mage\'s 4th- and 5th-level spells.' });

  /* miscellaneous magic that is worn */
  const worn = (id, name, slot, cost, o) => add(id, Object.assign({ name, t: 'm', slot, cost, magic: true }, o));
  for (let n = 1; n <= 3; n++) worn('cloakProt' + n, 'Cloak of Protection' + plus(n), 'cloak', price(n) + 500, { prot: n });
  worn('cloakDisplacement', 'Cloak of Displacement', 'cloak', 12000, { displace: true, note: 'AC better by 2 and +2 to saving throws.' });
  worn('bootsSpeed', 'Boots of Speed', 'boots', 15000, { speed: true, note: 'The wearer moves and attacks at double speed in battle.' });
  worn('gauntletsOgre', 'Gauntlets of Ogre Power', 'gloves', 10000, { str: [18, 100], note: 'Strength 18/00.' });
  worn('gauntletsDex', 'Gauntlets of Dexterity', 'gloves', 6000, { dexAdd: 2, note: 'Dexterity +2.' });
  [['Hill', 19, 12000], ['Stone', 20, 16000], ['Frost', 21, 20000], ['Fire', 22, 25000], ['Cloud', 23, 30000], ['Storm', 24, 36000]].forEach(([k, s, cost]) =>
    worn('girdle' + k, 'Girdle of ' + k + ' Giant Strength', 'belt', cost, { str: [s, 0], note: 'Strength ' + s + '.' }));
  worn('amuletLife', 'Amulet of Life Protection', 'neck', 12000, { noDrain: true, note: 'The wearer cannot be drained of levels.' });
  worn('periaptPoison', 'Periapt of Proof Against Poison', 'neck', 6000, { noPoison: true, note: 'The wearer cannot be poisoned.' });
  worn('scarabProt', 'Scarab of Protection', 'neck', 10000, { saveBonus: 1, noDrain: true, note: '+1 to saving throws; wards off level draining.' });
  worn('luckstone', 'Stone of Good Luck', 'charm', 5000, { saveBonus: 1, note: '+1 to all saving throws.' });
  worn('iounRose', 'Ioun Stone (dusty rose)', 'charm', 6000, { acBonus: 1, note: 'Armor class better by 1.' });
  worn('iounWhite', 'Ioun Stone (pearly white)', 'charm', 15000, { regen: 1, note: 'Restores 1 hit point every round of battle and 10 with each rest.' });
  worn('iounRed', 'Ioun Stone (deep red)', 'charm', 6000, { dexAdd: 1, note: 'Dexterity +1.' });
  worn('iounBlue', 'Ioun Stone (pale blue)', 'charm', 6000, { strAdd: 1, note: 'Strength +1.' });

  /* books that raise an ability score */
  [['manualExercise', 'Manual of Gainful Exercise', 'str'], ['manualQuickness', 'Manual of Quickness of Action', 'dex'], ['manualHealth', 'Manual of Bodily Health', 'con'],
   ['tomeThought', 'Tome of Clear Thought', 'int'], ['tomeUnderstanding', 'Tome of Understanding', 'wis'], ['tomeLeadership', 'Tome of Leadership and Influence', 'cha']]
    .forEach(([id, name, abil]) => add(id, { name, t: 'k', abil, cost: 25000, magic: true }));

  /* potions */
  const pot = (id, name, cost, o) => add(id, Object.assign({ name, t: 'p', cost, magic: true }, o));
  pot('potSpeed', 'Potion of Speed', 500, { buff: { haste: '5d4' }, note: 'Double speed for 5d4 rounds.' });
  pot('potHeroism', 'Potion of Heroism', 500, { buff: { bless: '10' }, temp: '2d8', note: '+1 to hit and 2d8 extra hit points for the battle.', cls: 'FPR' });
  pot('potSuperHeroism', 'Potion of Super-Heroism', 900, { buff: { bless: '10', aid: '10' }, temp: '4d8', note: '+2 to hit, +1 to saves and 4d8 extra hit points for the battle.', cls: 'FPR' });
  pot('potInvuln', 'Potion of Invulnerability', 700, { buff: { invuln: '5d4' }, note: 'AC better by 2 and +2 to saves for 5d4 rounds.', cls: 'FPR' });
  pot('potFireRes', 'Potion of Fire Resistance', 400, { buff: { resFire: '99' }, note: 'Half damage from fire for the battle.' });
  pot('potInvis', 'Potion of Invisibility', 500, { hide: true, note: 'The drinker is unseen until they strike.' });
  pot('elixirHealth', 'Elixir of Health', 600, { cure: 'poison', cureAll: true, note: 'Cures poison, blindness and sickness.' });
  [['Hill', 19, 600], ['Stone', 20, 800], ['Frost', 21, 1000], ['Fire', 22, 1200], ['Cloud', 23, 1500], ['Storm', 24, 1800]].forEach(([k, s, cost]) =>
    pot('potGiant' + k, 'Potion of ' + k + ' Giant Strength', cost, { giant: s, note: 'Strength ' + s + ' for an hour.', cls: 'FPR' }));

  /* scrolls of protection */
  [['protUndead', 'Undead', 'undead'], ['protFiend', 'Demons and Devils', 'fiend'], ['protLyc', 'Lycanthropes', 'lycanthrope'], ['protElem', 'Elementals', 'elemental'], ['protDragon', 'Dragons', 'dragon']]
    .forEach(([id, what, tag]) => add(id, { name: 'Scroll of Protection from ' + what, t: 'x', ward: tag, cost: 1500, magic: true }));

  /* wands, staves, rods and other things with charges */
  const dev = (id, name, cost, o) => add(id, Object.assign({ name, t: 'd', cost, magic: true }, o));
  dev('wandMissile', 'Wand of Magic Missiles', 6000, { spells: ['magicMissile'], lvl: 5, charges: '4d6+8', cls: 'M' });
  dev('wandFire', 'Wand of Fire', 14000, { spells: ['fireball', 'burningHands'], lvl: 6, charges: '3d6+6', cls: 'M' });
  dev('wandFrost', 'Wand of Frost', 14000, { spells: ['coneOfCold', 'iceStorm'], lvl: 6, charges: '3d6+6', cls: 'M' });
  dev('wandLightning', 'Wand of Lightning', 14000, { spells: ['lightningBolt'], lvl: 6, charges: '3d6+6', cls: 'M' });
  dev('wandParalyze', 'Wand of Paralyzation', 16000, { spells: ['holdMonster'], lvl: 6, charges: '3d6+6', cls: 'M' });
  dev('wandWonder', 'Wand of Wonder', 10000, { spells: ['fireball', 'lightningBolt', 'stinkingCloud', 'sleep', 'magicMissile', 'iceStorm', 'holdMonster'], wonder: true, lvl: 6, charges: '3d6+6', cls: 'M', note: 'Nobody knows what it will do.' });
  dev('staffCuring', 'Staff of Curing', 18000, { spells: ['cureSerious', 'neutralizePoison'], lvl: 8, charges: '2d6+6', cls: 'C', camp: true });
  dev('staffPower', 'Staff of Power', 35000, { spells: ['fireball', 'lightningBolt', 'coneOfCold', 'magicMissile'], lvl: 8, charges: '2d6+10', cls: 'M' });
  dev('staffMagi', 'Staff of the Magi', 60000, { spells: ['fireball', 'lightningBolt', 'iceStorm', 'coneOfCold', 'holdMonster', 'chainLightning'], lvl: 12, charges: '2d6+10', cls: 'M' });
  dev('rodResurrection', 'Rod of Resurrection', 45000, { spells: ['resurrection'], lvl: 16, charges: '1d4+2', cls: 'C', camp: true });
  dev('necklaceMissiles', 'Necklace of Missiles', 9000, { spells: ['fireball'], lvl: 6, charges: '1d4+3' });
  dev('javelinLightning', 'Javelin of Lightning', 1500, { spells: ['lightningBolt'], lvl: 5, charges: '1', cls: 'FPRCT' });

  /* gems and jewelry: sold for their full worth */
  [['gem10', 'Ornamental Stones', 10], ['gem50', 'Semi-Precious Stones', 50], ['gem100', 'Fancy Stone', 100], ['gem500', 'Precious Stone', 500], ['gem1000', 'Gemstone', 1000], ['gem5000', 'Flawless Jewel', 5000],
   ['jewel300', 'Silver Jewelry', 300], ['jewel1000', 'Gold Jewelry', 1000], ['jewel3000', 'Jewelled Gold Jewelry', 3000], ['jewel8000', 'Jewelled Platinum Crown', 8000]]
    .forEach(([id, name, cost]) => add(id, { name, t: 'v', cost }));

  /* creatures of fire and of cold, for the swords that care */
  for (const id of ['hellhound', 'salamander', 'efreeti', 'elementalFire', 'giantFire', 'dragonRed', 'dragonRedGreat', 'dragonGold', 'fireLizard', 'demon6', 'pitFiend', 'nightmare', 'chimera']) if (MONSTERS[id] && !MONSTERS[id].tags.includes('fire')) MONSTERS[id].tags.push('fire');
  for (const id of ['yeti', 'winterWolf', 'giantFrost', 'dragonWhite', 'dragonSilver', 'devilIce', 'remorhaz', 'mammoth']) if (MONSTERS[id] && !MONSTERS[id].tags.includes('cold')) MONSTERS[id].tags.push('cold');
})();

/* ---------------- the treasure tables ----------------
   Each entry: [item id, weight, level]. `level` 1-5 is how deep in the game the item belongs;
   a find draws only on items at or below its own level. The categories and their odds are
   those of the magic item table: potions 20, scrolls 15, rings 5, rods/staves/wands 5,
   miscellaneous magic 15, armor and shields 15, swords 11, other weapons 14. */
const TREASURE = {
  cats: [['potion', 20], ['scroll', 15], ['ring', 5], ['device', 5], ['misc', 15], ['armor', 15], ['sword', 11], ['weapon', 14]],
  potion: [['potHeal', 20, 1], ['potExtra', 12, 1], ['antidote', 6, 1], ['potSpeed', 6, 1], ['potHeroism', 6, 1], ['potFireRes', 5, 1], ['potInvis', 5, 1], ['potGiantHill', 5, 1], ['elixirHealth', 5, 2],
    ['potInvuln', 5, 2], ['potGiantStone', 4, 2], ['potSuperHeroism', 5, 3], ['potGiantFrost', 4, 3], ['potGiantFire', 3, 3], ['potGiantCloud', 3, 4], ['potGiantStorm', 2, 5]],
  scroll: [['@scroll', 60, 1], ['protUndead', 8, 1], ['protLyc', 6, 1], ['protElem', 6, 2], ['protFiend', 8, 3], ['protDragon', 6, 3]],
  ring: [['ringProt', 30, 1], ['ringFire', 12, 1], ['ringWarmth', 10, 1], ['ringProt2', 16, 2], ['ringFree', 8, 2], ['ringInvis', 8, 2], ['ringWiz1', 6, 2], ['ringProt3', 10, 3], ['ringWiz2', 5, 3],
    ['ringRegen', 5, 4], ['ringWiz3', 4, 4], ['ringWiz45', 3, 5]],
  device: [['javelinLightning', 14, 1], ['wandMissile', 14, 1], ['necklaceMissiles', 8, 2], ['wandFire', 9, 2], ['wandFrost', 9, 2], ['wandLightning', 9, 2], ['wandWonder', 6, 2], ['wandParalyze', 7, 3],
    ['staffCuring', 9, 3], ['staffPower', 5, 4], ['rodResurrection', 4, 4], ['staffMagi', 2, 5]],
  misc: [['bracers8', 8, 1], ['bracers7', 8, 1], ['cloakProt1', 12, 1], ['luckstone', 6, 1], ['bracers6', 8, 2], ['bracers5', 6, 2], ['gauntletsOgre', 6, 2], ['gauntletsDex', 5, 2], ['cloakProt2', 8, 2], ['periaptPoison', 5, 2],
    ['iounRed', 3, 2], ['iounBlue', 3, 2], ['iounRose', 3, 2], ['bracers4', 6, 3], ['cloakProt3', 6, 3], ['cloakDisplacement', 6, 3], ['bootsSpeed', 5, 3], ['girdleHill', 5, 3], ['amuletLife', 4, 3], ['scarabProt', 4, 3],
    ['bracers3', 5, 4], ['girdleStone', 4, 4], ['girdleFrost', 4, 4], ['iounWhite', 3, 4], ['manualExercise', 2, 4], ['manualQuickness', 2, 4], ['manualHealth', 2, 4], ['tomeThought', 2, 4], ['tomeUnderstanding', 2, 4], ['tomeLeadership', 1, 4],
    ['bracers2', 4, 5], ['girdleFire', 3, 5], ['girdleCloud', 3, 5], ['girdleStorm', 2, 5]],
  armor: [['leather1', 10, 1], ['studded1', 8, 1], ['chain1', 12, 1], ['shield1', 14, 1], ['scale1', 5, 1], ['splint1', 6, 2], ['banded1', 6, 2], ['plate1', 8, 2], ['leather2', 6, 2], ['chain2', 8, 2], ['shield2', 10, 2], ['elvenChain', 4, 2],
    ['studded2', 5, 3], ['plate2', 7, 3], ['chain3', 6, 3], ['shield3', 8, 3], ['leather3', 5, 3], ['banded2', 4, 3], ['plate3', 6, 4], ['shield4', 6, 4], ['chain4', 5, 4], ['studded3', 4, 4], ['leather4', 3, 4],
    ['plate4', 4, 5], ['plate5', 2, 5], ['shield5', 4, 5], ['chain5', 3, 5], ['leather5', 2, 5]],
  sword: [['longsword1', 24, 1], ['shortsword1', 10, 1], ['broadsword1', 8, 1], ['swordLyc', 6, 1], ['swordSpell', 5, 2], ['swordRegen', 5, 2], ['swordReptile', 5, 2], ['longsword2', 14, 2], ['twohander1', 6, 2], ['luckBlade', 4, 2],
    ['shortsword2', 5, 2], ['flameTongue', 6, 3], ['giantSlayer', 5, 3], ['dragonSlayer', 5, 3], ['longsword3', 10, 3], ['twohander2', 5, 3], ['shortQuick', 4, 3], ['wounding', 4, 3], ['frostBrand', 5, 4], ['longsword4', 7, 4],
    ['lifeStealer', 4, 4], ['nineLives', 3, 4], ['sharpness', 3, 4], ['defender', 3, 4], ['twohander3', 4, 4], ['shortsword3', 4, 4], ['longsword5', 4, 5], ['vorpal', 2, 5], ['holyAvenger', 2, 5], ['twohander5', 2, 5]],
  weapon: [['dagger1', 12, 1], ['mace1', 12, 1], ['staff1', 6, 1], ['spear1', 6, 1], ['handaxe1', 5, 1], ['hammer1', 6, 1], ['sling1', 5, 1], ['shortbow1', 6, 1], ['battleaxe1', 8, 1], ['flail1', 6, 1], ['longbow1', 8, 2], ['mace2', 8, 2],
    ['dagger2', 6, 2], ['battleaxe2', 6, 2], ['staff2', 5, 2], ['hammer2', 5, 2], ['morningstar1', 5, 2], ['halberd1', 4, 2], ['slingSeeking', 4, 2], ['crossbowSpeed', 4, 2], ['daggerVenom', 3, 2], ['flail2', 4, 2],
    ['longbow2', 6, 3], ['mace3', 6, 3], ['staffStriking', 4, 3], ['staffSerpent', 3, 3], ['crossbowAccuracy', 4, 3], ['hammerDwarven', 4, 3], ['battleaxe3', 4, 3], ['dagger3', 4, 3], ['spear3', 3, 3], ['halberd2', 3, 3],
    ['longbow3', 4, 4], ['maceDisruption', 4, 4], ['rodSmiting', 3, 4], ['staffWithering', 3, 4], ['hammer3', 3, 4], ['flail3', 3, 4], ['rodLordly', 2, 5], ['staff3', 3, 5], ['halberd3', 3, 5], ['morningstar3', 3, 5]],
  gems: [['gem10', 1], ['gem50', 1], ['gem100', 2], ['gem500', 3], ['gem1000', 4], ['gem5000', 5]],
  jewelry: [['jewel300', 1], ['jewel1000', 2], ['jewel3000', 4], ['jewel8000', 5]],
};
const Treasure = (() => {
  const pickW = (R, list) => { let t = 0; for (const e of list) t += e[1]; let r = R() * t; for (const e of list) { r -= e[1]; if (r < 0) return e; } return list[list.length - 1]; };
  const int = (R, a, b) => a + Math.floor(R() * (b - a + 1));
  /* a spell scroll suited to the level of the find */
  function scroll(R, lvl) {
    const max = Math.max(1, Math.min(9, lvl + 1 + Math.floor(R() * 2))), c = R() < 0.7 ? 'M' : 'C';
    const ids = Object.keys(SPELLS).filter(id => SPELLS[id].c === c && SPELLS[id].l <= max && SPELLS[id].l >= Math.max(1, max - 3) && !SPELLS[id].explore);
    return 'scroll:' + (ids.length ? ids[Math.floor(R() * ids.length)] : 'magicMissile');
  }
  /* an item id ready for a pack: devices get their charges */
  function ready(R, id) {
    const it = ITEMS[id];
    if (it && it.t === 'd') { const m = /^(\d+)d(\d+)\+?(\d+)?$/.exec(it.charges); let n = m ? +(m[3] || 0) : +it.charges || 1; if (m) for (let i = 0; i < +m[1]; i++) n += 1 + Math.floor(R() * +m[2]); return id + '#' + n; }
    return id;
  }
  /* one magic item for a find of the given level (1-5), optionally from one category */
  function magic(R, lvl, cat) {
    cat = cat || pickW(R, TREASURE.cats)[0];
    let list = TREASURE[cat].filter(e => e[2] <= lvl);
    // deep in the game, the least items turn up less often
    list = list.map(e => [e[0], e[1] * (e[2] >= lvl - 1 ? 1 : e[2] === lvl - 2 ? 0.45 : 0.15), e[2]]);
    const id = pickW(R, list)[0];
    return id === '@scroll' ? scroll(R, lvl) : ready(R, id);
  }
  function valuables(R, lvl, n) {
    const out = [];
    for (let i = 0; i < n; i++) { const tab = R() < 0.65 ? TREASURE.gems : TREASURE.jewelry, ok = tab.filter(e => e[1] <= lvl && e[1] >= lvl - 2); out.push(ok[Math.floor(R() * ok.length)][0]); }
    return out;
  }
  /* A whole find. charLevel: the party level it is meant for. kind: 'chest', 'cache' (a guarded or hidden one) or 'hoard'.
     Returns { gold, items }. */
  function roll(R, charLevel, kind) {
    const lvl = Math.max(1, Math.min(5, Math.ceil(charLevel / 4))), deep = Math.min(5, lvl + (kind === 'hoard' ? 1 : 0));
    const base = 25 * Math.pow(charLevel, 1.45) * (0.6 + R() * 0.8);
    const gold = Math.round(base * (kind === 'hoard' ? 6 : kind === 'cache' ? 2 : 1) / 5) * 5;
    const items = [];
    const nMagic = kind === 'hoard' ? 2 + (lvl >= 3 ? 1 : 0) + (R() < 0.4 ? 1 : 0) : kind === 'cache' ? 1 + (R() < 0.3 ? 1 : 0) : (R() < 0.12 + 0.07 * lvl ? 1 : 0);
    for (let i = 0; i < nMagic; i++) items.push(magic(R, i === 0 && kind === 'hoard' ? deep : lvl));
    const nPot = kind === 'hoard' ? int(R, 1, 3) : R() < 0.4 ? 1 : 0;
    for (let i = 0; i < nPot; i++) items.push(magic(R, lvl, 'potion'));
    const nVal = kind === 'hoard' ? int(R, 2, 4) : kind === 'cache' ? int(R, 0, 2) : R() < 0.3 ? 1 : 0;
    items.push(...valuables(R, lvl, nVal));
    return { gold, items };
  }
  return { roll, magic, scroll, ready, valuables };
})();
