'use strict';
/* ============================================================
   Bestiary: a record of every kind of creature the company has
   met, with its likeness, and what was learned by fighting it.
   Also draws the creatures shown in the encounter dialog.
   ============================================================ */
for (const id in MONSTERS) MONSTERS[id].id = id;

/* a line of lore for each creature, written once it has been sighted */
const LORE = {
  rat: 'Cellar vermin grown to the size of a terrier. Alone they flee; in packs they swarm anything that bleeds.',
  kobold: 'Small, scaly, dog-faced tunnellers. Cowardly one at a time, cunning with traps, and bold only in numbers.',
  goblin: 'Wiry green raiders who hate the sun and love an ambush. The Redfang tribe paints its teeth with ochre.',
  slinger: 'Goblins too canny to stand in the front rank. They hang back and pelt the nearest spellcaster with stones.',
  chief: 'Chieftain of the Redfangs, bigger and meaner than any goblin has a right to be. The tribe breaks without him.',
  orc: 'Brutal, pig-snouted soldiers for hire to any master who promises plunder.',
  hobgoblin: 'Disciplined cousins of the goblins who drill, march and hold a line like trained infantry.',
  gnoll: 'Tall hyena-headed marauders. They take slaves, eat what they cannot carry, and laugh while they do it.',
  ogre: 'Nine feet of muscle, appetite and bad temper. One blow from its club can fell a strong man.',
  spider: 'A hunting spider the size of a hound. Its bite is not strong, but the venom works slowly and kills later.',
  skeleton: 'Bones bound to a necromancer\'s will. Blades and arrows slip between the ribs; a mace does honest work.',
  zombie: 'A corpse that walks. Slow and mindless, it strikes last, but it feels no pain and never retreats.',
  ghoul: 'An eater of the dead whose filthy claws leave the living rigid and helpless. Elves alone shrug off its touch.',
  thug: 'A back-alley cutthroat who prefers odds of four to one and a victim looking the other way.',
  cultist: 'A hooded devotee of the Ashen Circle, glad to die for a master who will only raise him again.',
  adept: 'A priest of the Ashen Circle whose prayers can lock a warrior\'s limbs in place.',
  malvek: 'Malvek the Ashen, necromancer of the Hollow Vaults. He wears stolen years like a crown and commands the abbey\'s dead.',
  wolf: 'Grey hunters of the Emberwild. A pack circles, tests, and pulls down whoever stands apart.',
  hyena: 'Spotted scavengers that run with gnoll packs and worry at the wounded.',
  bandit: 'Farmhands and deserters turned to robbery on the east road. Most would rather be paid than bleed.',
  archer: 'A bandit with a short bow and a good eye, loosing two arrows for every swing of your sword.',
  captain: 'A brigand captain in looted mail, quick with a blade and quicker to run if the day turns.',
  gnollLord: 'Packlord of the Bloodmanes, crowned in a mane dyed with the blood of his rivals.',
  centipede: 'A yard of clattering legs with a venomous bite. Weak, but it comes out of every crack at once.',
  fireBeetle: 'A beetle as big as a dog, with glands that glow red for days after it dies. Its mandibles shear leather.',
  koboldChief: 'Skarrik, self-crowned king of the Thornwick kobolds, who rules from a throne of casks in a copper-kettle crown.',
  bugbear: 'Hulking, hairy goblin-kin that move in silence despite their size. They prefer to strike first and from above.',
  gorrak: 'Gorrak Skullsplitter, the bugbear warlord who took the Deepcut Mine in a single night.',
  crawler: 'A pale segmented scavenger with eight writhing tentacles. Their slime paralyses anyone, elf or not.',
  ghast: 'A ghoul grown strong and foul. Not even elves resist its paralysing claws.',
  wight: 'A barrow-dweller of hate and cold. Ordinary steel passes through it, and its touch drains away life and skill.',
  ironKing: 'The Iron King, dead three hundred years and still jealous of his crown. Only silver or enchantment can wound him.',
  worg: 'A wolf the size of a pony, clever and cruel, that serves goblins and trolls as mount and hunting partner.',
  hellhound: 'A rust-red hound from the lower planes. Every other breath it takes comes back as a gout of fire.',
  troll: 'A rubbery, long-armed horror whose wounds close as you watch. Strike hard and fast, or it simply stands up again.',
  trollChief: 'Gnashrot, chief of the moor trolls, in a cloak of raven feathers. Bigger, older and hungrier than the rest.',
  gargoyle: 'A winged thing of living stone. Ordinary weapons only chip it; bring an enchanted blade.',
  hillGiant: 'Grull, a hill giant bought with Vharra\'s gold. He throws boulders before he bothers to walk over.',
  ravenWitch: 'One of Vharra\'s apprentices, feathered and half-mad, with mirror images and choking clouds at her call.',
  vharra: 'Vharra the Witch-Queen of Ravenmoor. Fire and lightning answer her, and haste makes her two foes at once.',
};

/* ---------------- record keeping ---------------- */
function bestiaryEntry(id) {
  G.bestiary = G.bestiary || {};
  return G.bestiary[id] || (G.bestiary[id] = { seen: G.time, fought: 0, slain: 0 });
}
/* returns true the first time a kind of creature is sighted */
function bestiarySee(id) { const isNew = !(G.bestiary && G.bestiary[id]); bestiaryEntry(id); return isNew; }
function bestiaryFight(mons) { for (const [id] of mons) if (MONSTERS[id]) bestiaryEntry(id).fought++; }
function bestiarySlay(id) { if (G && MONSTERS[id]) bestiaryEntry(id).slain++; }

/* ---------------- describing a creature ---------------- */
function hdText(hd) {
  if (hd < 1) return hd <= 0.5 ? '½' : '1−1';
  const f = Math.round((hd % 1) * 10);
  return Math.floor(hd) + (f ? '+' + f : '');
}
const SIZE_NAMES = { T: 'Tiny', S: 'Small', M: 'Man-sized', L: 'Large', H: 'Huge', G: 'Gargantuan' };
function monKind(m) {
  const t = m.tags || [];
  return t.includes('undead') ? 'Undead' : t.includes('animal') ? 'Beast' : t.includes('giant') || t.includes('troll') || t.includes('ogre') ? 'Giant-kin' : t.includes('human') ? 'Human' : t.includes('person') ? 'Humanoid' : 'Monster';
}
function monAbilities(m) {
  const a = [];
  if (m.ranged) a.push('Attacks from a distance for ' + m.ranged.dmg + ', out to ' + m.ranged.range[2] + ' squares.');
  if (m.spells) a.push('Casts spells: ' + [...new Set(m.spells)].map(s => (SPELLS[s] || {}).name || s).join(', ') + '.');
  if (m.breath) a.push('Breath weapon: ' + m.breath.text + ' every ' + m.breath.every + ' rounds. A saving throw halves the damage.');
  if (m.poison) a.push('Venomous: a failed saving throw means ' + m.poison.dmg + ' damage when the venom takes hold. Antivenom cures it.');
  if (m.paralyze) a.push('Its touch paralyses' + (m.paralyze === 'all' ? ', and elves are not immune.' : '. Elves are immune.'));
  if (m.drain) a.push('Its touch drains a level of experience.');
  if (m.regen) a.push('Regenerates ' + m.regen + ' hit points every round.');
  if (m.hitBy) a.push(m.hitBy === 'silver' ? 'Harmed only by silver or magical weapons.' : 'Harmed only by magical weapons.');
  if (m.halfEdged) a.push('Edged and piercing weapons do half damage. Use blunt weapons.');
  if (m.undead) a.push('Undead: a cleric or paladin can turn it.');
  if (m.slow) a.push('Slow: it always acts last in the round.');
  if (m.leader) a.push('A leader: its followers may lose heart when it falls.');
  return a;
}
function monPortrait(id, size) {
  const cv = portrait(MONSTERS[id].fig, size);
  cv.classList.add('monpic');
  return cv;
}

/* ---------------- the encounter dialog ----------------
   The text of an encounter, followed by a likeness of each kind of creature present. */
function encounterBody(text, mons) {
  const body = h('div', { class: 'encounter' });
  String(text || '').split('\n').filter(Boolean).forEach(p => body.append(h('p', { text: p })));
  body.append(h('div', { class: 'encrow' }, mons.map(([id, n]) => {
    const m = MONSTERS[id], isNew = bestiarySee(id);
    return h('div', { class: 'enccard', title: LORE[id] || '' },
      monPortrait(id, 92),
      h('div', { class: 'encname', text: (n > 1 ? n + ' × ' : '') + m.name }),
      h('div', { class: 'enckind' }, monKind(m), isNew ? h('span', { class: 'encnew', text: 'New' }) : null));
  })));
  return body;
}

/* ---------------- the bestiary ---------------- */
function bestiaryDialog(showId) {
  if (!G) return;
  const known = Object.keys(MONSTERS).filter(id => G.bestiary && G.bestiary[id]);
  known.sort((a, b) => G.bestiary[a].seen - G.bestiary[b].seen || MONSTERS[a].hd - MONSTERS[b].hd);
  let cur = showId && known.includes(showId) ? showId : known[0];
  const body = h('div', { class: 'bestiary' });
  modal({ title: 'Bestiary', body, wide: true, buttons: [{ label: 'Close', cls: 'primary' }] });

  function detail(id) {
    const m = MONSTERS[id], e = G.bestiary[id], row = (k, v) => h('tr', null, h('td', { text: k }), h('td', { class: 'num', text: v }));
    const out = [
      h('div', { class: 'bhead' }, monPortrait(id, 150),
        h('div', null, h('h2', { text: m.name }),
          h('div', { class: 'sub', text: monKind(m) + ' · ' + (SIZE_NAMES[m.size] || 'Man-sized') }),
          h('div', { class: 'sub', text: 'First seen on day ' + (Math.floor(e.seen / 1440) + 1) + ' · fought ' + e.fought + (e.fought === 1 ? ' time' : ' times') + ' · ' + e.slain + ' slain' }))),
      h('div', { class: 'msg', text: LORE[id] || 'Little is known of this creature.' })];
    if (!e.fought) out.push(h('p', { class: 'jempty', text: 'You have seen this creature but never fought it. Its strengths and weaknesses are still unknown.' }));
    else {
      const ab = monAbilities(m);
      out.push(h('div', { class: 'grid2' },
        h('table', { class: 'stats' }, row('Hit Dice', hdText(m.hd)), row('Armor Class', m.ac), row('THAC0', m.thac0), row('Movement', m.mv)),
        h('table', { class: 'stats' }, row('Attacks', m.atk.join(' / ')), row('Morale', m.ml >= 20 ? 'Fearless' : m.ml), row('Experience', m.xp + ' each'), row('Slain', e.slain))),
        h('h3', { text: 'What you have learned' }),
        ab.length ? h('ul', { class: 'blist' }, ab.map(t => h('li', { text: t }))) : h('div', { class: 'dimtxt', text: 'Nothing out of the ordinary: it fights with tooth, claw or steel.' }));
    }
    return out;
  }
  function render() {
    if (!known.length) return void body.replaceChildren(h('p', { class: 'jempty', text: 'No creatures recorded yet. Each kind you meet is sketched here, and what you learn by fighting it is written beside the sketch.' }));
    const total = Object.keys(MONSTERS).length;
    body.replaceChildren(
      h('div', { class: 'bside' },
        h('div', { class: 'dimtxt', text: known.length + ' of ' + total + ' creatures recorded' }),
        h('div', { class: 'bgrid' }, known.map(id => h('button', { class: 'bcard' + (id === cur ? ' on' : ''), title: MONSTERS[id].name, onclick: () => { cur = id; render(); } },
          monPortrait(id, 58), h('span', { text: MONSTERS[id].name }))))),
      h('div', { class: 'bdetail' }, detail(cur)));
  }
  render();
}
