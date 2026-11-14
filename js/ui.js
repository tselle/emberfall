'use strict';
/* ============================================================
   Interface: DOM helpers, dialogs, party panel, character
   creation, character sheets, shops and town services.
   ============================================================ */
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'disabled') e.disabled = true;
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(3)) { if (kid == null || kid === false) continue; e.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return e;
}
function log(msg, cls) {
  const el = $('#log'); if (!el) return;
  el.append(h('div', { class: 'ln ' + (cls || ''), text: msg }));
  while (el.childElementCount > 250) el.firstChild.remove();
  el.scrollTop = el.scrollHeight;
}

/* ---------------- dialogs ---------------- */
const modals = [];
function modal(o) {
  const ov = h('div', { class: 'overlay' }), box = h('div', { class: 'modal' + (o.wide ? ' wide' : '') });
  if (o.title) box.append(h('h2', { text: o.title }));
  const body = h('div', { class: 'mbody' });
  if (typeof o.body === 'string') o.body.split('\n').forEach(p => body.append(h('p', { text: p })));
  else if (o.body) body.append(o.body);
  const m = { ov, box, body, closable: o.closable !== false, onclose: o.onclose };
  const bar = h('div', { class: 'mbar' });
  (o.buttons || [{ label: 'Close' }]).forEach(b => bar.append(h('button', { class: 'btn ' + (b.cls || ''), text: b.label, disabled: b.disabled, title: b.title,
    onclick: () => { if (!b.keep) closeModal(m); if (b.on) b.on(); } })));
  box.append(body, bar); ov.append(box); document.body.append(ov);
  modals.push(m);
  return m;
}
function closeModal(m) {
  m = m || modals[modals.length - 1]; if (!m) return;
  const i = modals.indexOf(m); if (i < 0) return;
  modals.splice(i, 1); m.ov.remove();
  if (m.onclose) m.onclose();
}
const msgBox = (title, text, label) => new Promise(r => modal({ title, body: text, closable: false, buttons: [{ label: label || 'Continue', cls: 'primary', on: r }] }));
const choice = (title, text, opts) => new Promise(r => modal({ title, body: text, closable: false,
  buttons: opts.map((o, i) => ({ label: o.label || o, cls: o.cls, disabled: o.disabled, title: o.title, on: () => r(i) })) }));
function pickMember(title, filter) {
  return new Promise(r => {
    const list = P().filter(filter || (() => true));
    modal({ title, closable: false, body: list.length ? '' : 'No one suitable.',
      buttons: list.map(ch => ({ label: ch.name + ' (' + ch.hp + '/' + ch.maxhp + ')', on: () => r(ch) })).concat([{ label: 'Cancel', cls: 'dim', on: () => r(null) }]) });
  });
}

/* ---------------- command bar / party panel ---------------- */
const UI = {
  cmds(list, hint) {
    $('#cmdhint').textContent = hint || '';
    $('#cmdbar').replaceChildren(...list.map(b => {
      const el = h('button', { class: 'btn cmd ' + (b.cls || ''), disabled: b.disabled, title: b.title, onclick: b.on }, b.label, b.key ? h('kbd', { text: b.key }) : null);
      if (b.key) el.dataset.key = b.key.toLowerCase();
      return el;
    }));
  },
  cmdKey(k) {
    k = k === ' ' ? 'space' : k.toLowerCase();
    return [...$('#cmdbar').children].find(b => b.dataset.key === k && !b.disabled) || null;
  },
  refreshParty() {
    if (!G) return;
    $('#party').replaceChildren(...P().map((ch, i) => {
      const k = clamp(ch.hp / ch.maxhp, 0, 1), st = statusOf(ch);
      return h('div', { class: 'pcard' + (ch.dead ? ' dead' : ch.hp <= 0 ? ' down' : ''), onclick: () => { if (!Combat.active && !modals.length) showSheet(ch); }, title: 'Open character sheet (' + (i + 1) + ')' },
        portrait(figForChar(ch), 46),
        h('div', { class: 'pinfo' },
          h('div', { class: 'pname' }, ch.name, canLevel(ch) ? h('span', { class: 'lvlup', text: '▲', title: 'Ready to train' }) : null),
          h('div', { class: 'psub', text: RACES[ch.race].name + ' ' + CLASSES[ch.cls].name + ' ' + ch.lvl }),
          h('div', { class: 'hpbar' }, h('div', { class: 'hpfill ' + (k > 0.5 ? 'ok' : k > 0.25 ? 'mid' : 'low'), style: 'width:' + k * 100 + '%' })),
          h('div', { class: 'pstat' }, h('span', { text: 'HP ' + ch.hp + '/' + ch.maxhp }), h('span', { text: 'AC ' + charAC(ch) }), st !== 'OK' ? h('span', { class: 'bad', text: st }) : null)));
    }));
  },
};
function statusOf(ch) { return ch.dead ? 'Dead' : ch.hp <= 0 ? 'Unconscious' : ch.poison ? 'Poisoned' : 'OK'; }

/* ---------------- equipment ---------------- */
const SLOT = { w: 'weapon', r: 'ranged', a: 'armor', s: 'shield', g: 'ring' };
const SLOT_NAMES = { weapon: 'Weapon', ranged: 'Missile', armor: 'Armor', shield: 'Shield', ring: 'Ring' };
function itemDesc(it) {
  if (it.t === 'w') return 'Dmg ' + it.dmg + ' / ' + it.dmgL + ' · speed ' + it.sp + (it.hands === 2 ? ' · two-handed' : '');
  if (it.t === 'r') return 'Dmg ' + it.dmg + ' · ' + it.rof + '/round · range ' + it.range.map(r => r * 30).join('/') + ' ft';
  if (it.t === 'a') return 'AC ' + (it.ac - (it.bonus || 0));
  if (it.t === 's') return 'AC bonus ' + (1 + (it.bonus || 0));
  if (it.t === 'g') return 'AC and saves +' + it.prot;
  if (it.t === 'p') return it.heal ? 'Heals ' + it.heal : 'Neutralizes poison';
  if (it.t === 'x') return 'A mage may copy this spell into a spellbook';
  return 'Quest item';
}
function equip(ch, id) {
  const it = item(id), slot = SLOT[it.t];
  if (!slot) return 'That cannot be equipped.';
  if (!canUse(ch, it)) return CLASSES[ch.cls].name + 's cannot use that.';
  const w = item(ch.eq.weapon);
  if (it.t === 's' && w && w.hands === 2) return 'A two-handed weapon leaves no hand for a shield.';
  ch.inv.splice(ch.inv.indexOf(id), 1);
  if (ch.eq[slot]) ch.inv.push(ch.eq[slot]);
  ch.eq[slot] = id;
  if (it.t === 'w' && it.hands === 2 && ch.eq.shield) { ch.inv.push(ch.eq.shield); ch.eq.shield = null; }
  return null;
}

/* ---------------- character sheet ---------------- */
function showSheet(ch) {
  const body = h('div', { class: 'sheet' });
  const m = modal({ title: '', wide: true, body, buttons: [{ label: 'Close', cls: 'primary' }], onclose: refreshAll });
  let msg = '';
  const alive = ch.hp > 0 && !ch.dead;
  async function campCast(id) {
    const sp = SPELLS[id];
    const t = await pickMember('Cast ' + sp.name + ' on whom?', c => !c.dead);
    if (!t) return;
    ch.mem[id]--;
    if (ch.cls === 'C' && rnd(100) <= clericFailure(ch.wis)) { msg = 'The prayer falters; the spell is lost.'; return render(); }
    if (id === 'cureLight') { const n = rnd(8); t.hp = Math.min(t.maxhp, Math.max(0, t.hp) + n); msg = t.name + ' is healed for ' + n + ' hit points.'; }
    else if (id === 'armor') { t.fx.armor = 8 + ch.lvl; msg = t.name + ' is sheathed in a shimmering field (AC 6).'; }
    else if (id === 'strength') { applyStrength(t, ch.lvl); msg = t.name + '\'s Strength rises to ' + strText(t) + ' for ' + ch.lvl + ' hour(s).'; }
    else if (id === 'slowPoison') { t.poison = null; msg = 'The poison in ' + t.name + '\'s veins is stilled.'; }
    log(ch.name + ' casts ' + sp.name + '. ' + msg, 'spell'); render();
  }
  async function useItem(id) {
    const it = item(id);
    if (it.t === 'p') {
      const t = await pickMember('Give the ' + it.name + ' to whom?', c => !c.dead);
      if (!t) return;
      ch.inv.splice(ch.inv.indexOf(id), 1);
      if (it.heal) { const n = rollDice(it.heal); t.hp = Math.min(t.maxhp, Math.max(0, t.hp) + n); msg = t.name + ' recovers ' + n + ' hit points.'; }
      if (it.cure === 'poison') { t.poison = null; msg = t.name + ' is cured of poison.'; }
    } else if (it.t === 'x') {
      if (ch.cls !== 'M') { msg = 'Only a mage can make use of a spell scroll.'; return render(); }
      if (ch.book.includes(it.spell)) { msg = ch.name + ' already knows that spell.'; return render(); }
      ch.inv.splice(ch.inv.indexOf(id), 1);
      const pct = learnChance(ch.int);
      if (rnd(100) <= pct) { ch.book.push(it.spell); msg = ch.name + ' copies ' + SPELLS[it.spell].name + ' into the spellbook! (' + pct + '% chance to learn)'; }
      else msg = 'The formula defeats ' + ch.name + '; the scroll crumbles. (' + pct + '% chance to learn)';
    }
    log(msg); render();
  }
  function render() {
    const C = CLASSES[ch.cls], sm = strMods(ch), dm = dexMods(ch), w = wpn(ch), r = rwpn(ch), spec = isSpecialized(ch, ch.eq.weapon);
    const hitB = sm.hit + (w.bonus || 0) + (spec ? 1 : 0), dmgB = sm.dmg + (w.bonus || 0) + (spec ? 2 : 0), halves = meleeHalves(ch);
    const fmt = n => (n >= 0 ? '+' : '') + n;
    const left = h('div', { class: 'col' },
      h('div', { class: 'shead' }, portrait(figForChar(ch), 84),
        h('div', null, h('h2', { text: ch.name }),
          h('div', { class: 'sub', text: RACES[ch.race].name + ' ' + C.name + ', level ' + ch.lvl + ' · ' + ALIGNS[ch.align] }),
          h('div', { class: 'sub', text: 'XP ' + ch.xp + (ch.lvl < MAX_LEVEL ? ' / ' + xpForNext(ch) + ' for level ' + (ch.lvl + 1) : ' (maximum level)') + (canLevel(ch) ? ' — ready to train!' : '') }),
          h('div', { class: 'sub ' + (statusOf(ch) === 'OK' ? '' : 'bad'), text: 'Status: ' + statusOf(ch) + (ch.fx.armor ? ' · Armor spell (' + ch.fx.armor + ')' : '') + (ch.fx.strength ? ' · Strength spell' : '') }))),
      h('div', { class: 'grid2' },
        h('table', { class: 'stats' }, ABILS.map(a => h('tr', null, h('td', { text: ABIL_NAMES[a] }), h('td', { class: 'num', text: a === 'str' ? strText(ch) : ch[a] }),
          h('td', { class: 'note', text: a === 'str' ? 'hit ' + fmt(sm.hit) + ', dmg ' + fmt(sm.dmg) : a === 'dex' ? 'missile ' + fmt(dm.missile) + ', AC ' + fmt(dm.def) : a === 'con' ? 'hp ' + fmt(conHp(ch)) + '/level' : a === 'wis' ? (ch.cls === 'C' ? 'bonus spells' : 'mental saves ' + fmt(wisAdj(ch))) : a === 'int' && ch.cls === 'M' ? 'learn ' + learnChance(ch.int) + '%' : '' })))),
        h('table', { class: 'stats' },
          h('tr', null, h('td', { text: 'Hit Points' }), h('td', { class: 'num', text: ch.hp + ' / ' + ch.maxhp })),
          h('tr', null, h('td', { text: 'Armor Class' }), h('td', { class: 'num', text: charAC(ch) })),
          h('tr', null, h('td', { text: 'THAC0' }), h('td', { class: 'num', text: charThac0(ch) })),
          h('tr', null, h('td', { text: 'Melee' }), h('td', { class: 'num', text: w.name + ' ' + w.dmg + (dmgB ? fmt(dmgB) : '') })),
          h('tr', null, h('td', { text: 'To hit / attacks' }), h('td', { class: 'num', text: fmt(hitB) + ' · ' + (halves === 2 ? '1' : halves === 3 ? '3/2' : '2') + ' per round' + (spec ? ' (specialist)' : '') })),
          r ? h('tr', null, h('td', { text: 'Missile' }), h('td', { class: 'num', text: r.name.split(' &')[0] + ' ' + r.dmg + ' · ' + r.rof + '/rd' })) : null,
          h('tr', null, h('td', { text: 'Movement' }), h('td', { class: 'num', text: moveRate(ch) })))),
      h('div', { class: 'saves' }, h('b', { text: 'Saving throws  ' }), ['Para/Poison', 'Rod/Wand', 'Petrify', 'Breath', 'Spell'].map((n, i) => h('span', { title: SAVE_NAMES[i], text: n + ' ' + charSave(ch, i) }))),
      ch.cls === 'T' ? (() => { const t = thiefSkills(ch); return h('div', { class: 'saves' }, h('b', { text: 'Thief skills  ' }), h('span', { text: 'Open Locks ' + t.ol + '%' }), h('span', { text: 'Find/Remove Traps ' + t.ft + '%' }), h('span', { text: 'Move Silently ' + t.ms + '%' }), h('span', { text: 'Hide in Shadows ' + t.hs + '%' }), h('span', { text: 'Backstab ×' + backstabMult(ch) })); })() : null,
      ch.cls === 'R' && ch.foe ? h('div', { class: 'saves', text: 'Species enemy: ' + SPECIES_ENEMIES[ch.foe] + ' (+4 to hit)' }) : null,
      ch.cls === 'P' ? h('div', { class: 'saves' }, 'Lay on hands: ' + ch.lvl * 2 + ' hp ', h('button', { class: 'btn mini', text: 'Use', disabled: ch.layUsed || !alive || Combat.active,
        onclick: async () => { const t = await pickMember('Lay hands on whom?', c => !c.dead); if (!t) return; ch.layUsed = true; t.hp = Math.min(t.maxhp, Math.max(0, t.hp) + ch.lvl * 2); msg = t.name + ' is healed for ' + ch.lvl * 2 + '.'; render(); } }), ch.layUsed ? ' (used today)' : '') : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn mini', text: 'Move up in marching order', disabled: G.party.indexOf(ch.id) <= 0, onclick: () => { const i = G.party.indexOf(ch.id); G.party.splice(i, 1); G.party.splice(i - 1, 0, ch.id); msg = 'Marching order changed. The first three stand in the front rank.'; render(); } })),
      msg ? h('div', { class: 'msg', text: msg }) : null);

    const eqRows = Object.keys(SLOT_NAMES).map(s => h('tr', null, h('td', { class: 'dimtxt', text: SLOT_NAMES[s] }), h('td', { text: ch.eq[s] ? item(ch.eq[s]).name : '—', title: ch.eq[s] ? itemDesc(item(ch.eq[s])) : '' }),
      h('td', null, ch.eq[s] ? h('button', { class: 'btn mini', text: 'Remove', onclick: () => { ch.inv.push(ch.eq[s]); ch.eq[s] = null; msg = ''; render(); } }) : null)));
    const others = P().filter(c => c !== ch && !c.dead);
    const invRows = ch.inv.map((id, idx) => { const it = item(id); return h('tr', null,
      h('td', { text: it.name, class: it.magic ? 'magic' : '', title: itemDesc(it) }), h('td', { class: 'note', text: itemDesc(it) }),
      h('td', { class: 'acts' },
        SLOT[it.t] ? h('button', { class: 'btn mini', text: 'Equip', disabled: !canUse(ch, it), title: canUse(ch, it) ? '' : 'Not usable by this class', onclick: () => { msg = equip(ch, id) || ''; render(); } }) : null,
        (it.t === 'p' || it.t === 'x') ? h('button', { class: 'btn mini', text: it.t === 'x' ? 'Learn' : 'Use', disabled: !alive, onclick: () => useItem(id) }) : null,
        others.length ? h('select', { class: 'mini', onchange: e => { const t = P().find(c => c.id === e.target.value); if (t) { ch.inv.splice(idx, 1); t.inv.push(id); msg = it.name + ' given to ' + t.name + '.'; render(); } } },
          h('option', { value: '', text: 'Give…' }), others.map(c => h('option', { value: c.id, text: c.name }))) : null,
        it.t !== 'q' ? h('button', { class: 'btn mini dim', text: 'Drop', onclick: () => { ch.inv.splice(idx, 1); msg = it.name + ' dropped.'; render(); } }) : null)); });
    const right = h('div', { class: 'col' },
      h('h3', { text: 'Equipped' }), h('table', { class: 'inv' }, eqRows),
      h('h3', { text: 'Pack' }), ch.inv.length ? h('table', { class: 'inv' }, invRows) : h('div', { class: 'dimtxt', text: 'Empty.' }));

    let spells = null;
    if (isCaster(ch)) {
      const slots = spellSlots(ch), known = knownSpells(ch);
      spells = h('div', { class: 'spells' }, h('h3', { text: ch.cls === 'M' ? 'Spellbook' : 'Priest Spells' }),
        h('div', { class: 'dimtxt', text: 'Choose which spells to memorize. Changes take effect after a full rest. "Ready" spells can be cast now.' }),
        slots.map((n, i) => h('div', null,
          h('div', { class: 'slvl', text: 'Level ' + (i + 1) + ' — ' + prepCount(ch, i + 1) + ' of ' + n + ' slots chosen' }),
          h('table', { class: 'inv' }, known.filter(id => SPELLS[id].l === i + 1).map(id => { const sp = SPELLS[id]; return h('tr', null,
            h('td', { text: sp.name, title: sp.desc }), h('td', { class: 'note', text: sp.desc }),
            h('td', { class: 'acts' },
              h('span', { class: 'ready', text: 'Ready ' + (ch.mem[id] || 0) }),
              sp.camp ? h('button', { class: 'btn mini', text: 'Cast', disabled: !(ch.mem[id] > 0) || !alive || Combat.active, onclick: () => campCast(id) }) : null,
              h('button', { class: 'btn mini', text: '−', disabled: !ch.prep[id], onclick: () => { ch.prep[id]--; if (!ch.prep[id]) delete ch.prep[id]; render(); } }),
              h('span', { class: 'cnt', text: ch.prep[id] || 0 }),
              h('button', { class: 'btn mini', text: '+', disabled: prepCount(ch, i + 1) >= n, onclick: () => { ch.prep[id] = (ch.prep[id] || 0) + 1; render(); } }))); })))));
    }
    body.replaceChildren(h('div', { class: 'cols' }, left, right), spells);
  }
  render();
}

/* ---------------- character creation ---------------- */
const COLORS = ['#b03a2e', '#d4ac0d', '#2e86c1', '#1e8449', '#6c3483', '#ca6f1e', '#148f77', '#a93287'];
const NAMES = {
  human: ['Garrick Holt', 'Mira Ashdown', 'Tobias Wren', 'Isolde Marr', 'Corwin Vance', 'Helena Dray', 'Roderic Stane', 'Anya Brightwater'],
  dwarf: ['Durgan Ironbrow', 'Hilda Deepdelve', 'Thrain Copperbeard', 'Brunna Flintheart'],
  elf: ['Aelar Moonbrook', 'Sylwen Dawnleaf', 'Thalion Silverbough', 'Nimriel Starwind'],
  gnome: ['Fizzwick Tinkertop', 'Nella Pebblecap', 'Bimble Quartzwhistle'],
  halfelf: ['Kael Riversong', 'Liana Greywood', 'Devin Halfmoon', 'Seren Ashvale'],
  halfling: ['Merry Underbough', 'Rosie Tealeaf', 'Wilcome Burrows', 'Dob Hilltopple'],
};
function createDialog(onDone) {
  const st = { name: '', race: 'human', cls: 'F', align: 'NG', color: pick(COLORS), spec: 'longsword', foe: 'goblin', stats: null, gold: 0 };
  const body = h('div', { class: 'create' });
  const nameInput = h('input', { type: 'text', maxlength: '20', placeholder: 'Character name', oninput: e => { st.name = e.target.value; } });
  const m = modal({ title: 'Create a Character', wide: true, body, buttons: [
    { label: 'Cancel', cls: 'dim' },
    { label: 'Add to Roster', cls: 'primary', keep: true, on: () => {
      if (!st.name.trim()) { nameInput.focus(); nameInput.classList.add('err'); return; }
      const ch = newCharacter({ name: st.name.trim(), race: st.race, cls: st.cls, align: st.align, color: st.color, stats: st.stats, spec: st.cls === 'F' ? st.spec : null, foe: st.cls === 'R' ? st.foe : null });
      G.roster.push(ch); G.gold += st.gold;
      closeModal(m); onDone(ch);
    } }] });
  function fix() {
    if (!RACES[st.race].classes.includes(st.cls)) st.cls = RACES[st.race].classes[0];
    const C = CLASSES[st.cls];
    if (C.align && !C.align.includes(st.align)) st.align = C.align[0];
    if (C.notAlign && C.notAlign.includes(st.align)) st.align = 'N';
    st.stats = rollStats(st.race, st.cls); st.gold = startingGold(st.cls);
  }
  function render() {
    const C = CLASSES[st.cls], R = RACES[st.race];
    const pv = newCharacter({ name: st.name || 'x', race: st.race, cls: st.cls, align: st.align, color: st.color, stats: st.stats });
    const sm = strMods(pv), dm = dexMods(pv), fmt = n => (n >= 0 ? '+' : '') + n;
    const optBtns = (obj, cur, set, ok) => Object.keys(obj).map(k => h('button', { class: 'btn opt' + (k === cur ? ' on' : ''), text: obj[k].name || obj[k], disabled: ok && !ok(k), onclick: () => { set(k); fix(); render(); } }));
    const notes = { str: 'hit ' + fmt(sm.hit) + ', damage ' + fmt(sm.dmg), dex: 'missiles ' + fmt(dm.missile) + ', AC ' + fmt(dm.def), con: 'hit points ' + fmt(conHp(pv)) + ' per level',
      int: st.cls === 'M' ? learnChance(pv.int) + '% to learn spells' : '', wis: st.cls === 'C' ? (wisBonusSpells(pv.wis).length ? 'bonus priest spells' : clericFailure(pv.wis) ? clericFailure(pv.wis) + '% spell failure' : '') : 'mental saves ' + fmt(wisAdj(pv)), cha: '' };
    body.replaceChildren(
      h('div', { class: 'cols' },
        h('div', { class: 'col' },
          h('label', { text: 'Name' }), h('div', { class: 'row' }, nameInput, h('button', { class: 'btn mini', text: 'Suggest', onclick: () => { st.name = pick(NAMES[st.race]); nameInput.value = st.name; } })),
          h('label', { text: 'Race' }), h('div', { class: 'row wrap' }, optBtns(RACES, st.race, k => { st.race = k; })),
          h('div', { class: 'dimtxt', text: R.notes }),
          h('label', { text: 'Class' }), h('div', { class: 'row wrap' }, optBtns(CLASSES, st.cls, k => { st.cls = k; }, k => R.classes.includes(k))),
          h('div', { class: 'dimtxt', text: C.notes + ' Requires ' + Object.keys(C.req).map(a => ABIL_NAMES[a] + ' ' + C.req[a]).join(', ') + '.' }),
          h('label', { text: 'Alignment' }), h('div', { class: 'row wrap' }, optBtns(ALIGNS, st.align, k => { st.align = k; }, k => (!C.align || C.align.includes(k)) && !(C.notAlign && C.notAlign.includes(k)))),
          st.cls === 'F' ? [h('label', { text: 'Weapon specialization' }), h('select', { onchange: e => { st.spec = e.target.value; } }, SPEC_WEAPONS.map(id => h('option', { value: id, text: ITEMS[id].name, selected: id === st.spec ? '' : null })))] : null,
          st.cls === 'R' ? [h('label', { text: 'Species enemy' }), h('select', { onchange: e => { st.foe = e.target.value; } }, Object.keys(SPECIES_ENEMIES).map(id => h('option', { value: id, text: SPECIES_ENEMIES[id], selected: id === st.foe ? '' : null })))] : null,
          h('label', { text: 'Colors' }), h('div', { class: 'row' }, COLORS.map(col => h('button', { class: 'swatch' + (col === st.color ? ' on' : ''), style: 'background:' + col, onclick: () => { st.color = col; render(); } })))),
        h('div', { class: 'col' },
          h('div', { class: 'shead' }, portrait(figForChar(pv), 96), h('div', null,
            h('div', { class: 'big', text: R.name + ' ' + C.name }),
            h('div', { class: 'sub', text: 'Hit points ' + pv.maxhp + ' (d' + C.hd + ') · THAC0 20 · Gold ' + st.gold }),
            h('div', { class: 'sub', text: 'Saves: ' + [0, 1, 2, 3, 4].map(i => charSave(pv, i)).join(' / ') }))),
          h('table', { class: 'stats' }, ABILS.map(a => h('tr', null, h('td', { text: ABIL_NAMES[a] }), h('td', { class: 'num big', text: a === 'str' ? strText(pv) : pv[a] }), h('td', { class: 'note', text: notes[a] })))),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', text: '⚄ Reroll abilities', onclick: () => { fix(); render(); } })),
          h('div', { class: 'dimtxt', text: 'Abilities are rolled 4d6 (drop lowest) in order, with racial adjustments, and re-rolled until they meet the minimums for the chosen race and class.' }),
          st.cls === 'M' ? h('div', { class: 'dimtxt', text: 'Starting spellbook: Magic Missile, Sleep, Armor, Burning Hands, Shield.' }) : null)));
  }
  fix(); render();
}

/* ---------------- roster / party assembly ---------------- */
function rosterView(onChange) {
  const box = h('div', { class: 'roster' });
  function card(ch, inParty) {
    const idx = G.party.indexOf(ch.id);
    return h('div', { class: 'rcard' + (ch.dead ? ' dead' : '') },
      portrait(figForChar(ch), 54),
      h('div', { class: 'pinfo' },
        h('div', { class: 'pname', text: ch.name }),
        h('div', { class: 'psub', text: RACES[ch.race].name + ' ' + CLASSES[ch.cls].name + ' ' + ch.lvl + ' · ' + ch.align + (ch.dead ? ' · DEAD' : '') }),
        h('div', { class: 'psub', text: 'S ' + strText(ch) + '  D ' + ch.dex + '  C ' + ch.con + '  I ' + ch.int + '  W ' + ch.wis + '  Ch ' + ch.cha + '  ·  HP ' + ch.maxhp + '  AC ' + charAC(ch) })),
      h('div', { class: 'racts' },
        inParty ? [
          h('button', { class: 'btn mini', text: '▲', disabled: idx === 0, title: 'Move forward in marching order', onclick: () => { G.party.splice(idx, 1); G.party.splice(idx - 1, 0, ch.id); render(); } }),
          h('button', { class: 'btn mini', text: 'Remove', onclick: () => { G.party.splice(idx, 1); render(); } })]
        : [
          h('button', { class: 'btn mini primary', text: 'Add', disabled: G.party.length >= 6, onclick: () => { G.party.push(ch.id); render(); } }),
          h('button', { class: 'btn mini dim', text: 'Delete', title: 'Remove this character permanently', onclick: () => { G.roster.splice(G.roster.indexOf(ch), 1); render(); } })]));
  }
  function render() {
    const inP = P(), out = G.roster.filter(c => !G.party.includes(c.id));
    box.replaceChildren(
      h('div', { class: 'col' }, h('h3', { text: 'Roster' }), out.length ? out.map(c => card(c, false)) : h('div', { class: 'dimtxt', text: 'No one is waiting. Create a new character.' }),
        h('button', { class: 'btn', text: '+ Create Character', onclick: () => createDialog(() => render()) })),
      h('div', { class: 'col' }, h('h3', { text: 'Party (' + inP.length + ' of 6)' }),
        inP.length ? inP.map(c => card(c, true)) : h('div', { class: 'dimtxt', text: 'Add up to six adventurers. The first three in order fight in the front rank.' }),
        h('div', { class: 'dimtxt', text: 'A balanced party needs warriors for the front line, a cleric to heal and turn undead, a thief for locks and traps, and a mage.' })));
    if (onChange) onChange();
  }
  render();
  return box;
}

/* ---------------- town services ---------------- */
function shopDialog(id) {
  const titles = { armory: 'Ironhand Outfitters', apothecary: 'The Gilded Mortar' };
  const blurb = { armory: '"Steel, leather and bowstring. If it keeps you alive, I sell it."', apothecary: '"Careful with the blue ones. Actually, careful with all of them."' };
  const body = h('div', { class: 'shop' });
  let buyer = P().find(c => !c.dead) || P()[0], msg = blurb[id];
  modal({ title: titles[id], wide: true, body, buttons: [{ label: 'Leave', cls: 'primary' }], onclose: refreshAll });
  function render() {
    body.replaceChildren(
      h('div', { class: 'row wrap' }, h('span', { class: 'dimtxt', text: 'Shopping for: ' }), P().map(c => h('button', { class: 'btn opt' + (c === buyer ? ' on' : ''), text: c.name.split(' ')[0] + ' (' + CLASSES[c.cls].name + ')', onclick: () => { buyer = c; render(); } })),
        h('span', { class: 'gold', text: G.gold + ' gp' })),
      h('div', { class: 'msg', text: msg }),
      h('div', { class: 'cols' },
        h('div', { class: 'col' }, h('h3', { text: 'For sale' }), h('div', { class: 'scroll' }, h('table', { class: 'inv' }, SHOPS[id].map(iid => { const it = ITEMS[iid], ok = canUse(buyer, it); return h('tr', { class: ok ? '' : 'unusable' },
          h('td', { text: it.name }), h('td', { class: 'note', text: itemDesc(it) + (ok ? '' : ' · not usable') }), h('td', { class: 'num', text: it.cost + ' gp' }),
          h('td', null, h('button', { class: 'btn mini', text: 'Buy', disabled: G.gold < it.cost, onclick: () => {
            G.gold -= it.cost; buyer.inv.push(iid); msg = buyer.name + ' buys ' + it.name + '.';
            const slot = SLOT[it.t];
            if (slot && ok && !buyer.eq[slot] && !equip(buyer, iid)) msg += ' Equipped.';
            render(); } }))); })))),
        h('div', { class: 'col' }, h('h3', { text: buyer.name + '\'s pack' }),
          h('div', { class: 'dimtxt', text: Object.keys(SLOT_NAMES).filter(s => buyer.eq[s]).map(s => item(buyer.eq[s]).name).join(', ') || 'Nothing equipped.' }),
          buyer.inv.length ? h('table', { class: 'inv' }, buyer.inv.map((iid, idx) => { const it = item(iid), val = Math.floor(it.cost / 2); return h('tr', null,
            h('td', { text: it.name, class: it.magic ? 'magic' : '' }),
            h('td', { class: 'acts' },
              SLOT[it.t] && canUse(buyer, it) ? h('button', { class: 'btn mini', text: 'Equip', onclick: () => { msg = equip(buyer, iid) || it.name + ' equipped.'; render(); } }) : null,
              it.t !== 'q' ? h('button', { class: 'btn mini', text: 'Sell ' + val + ' gp', onclick: () => { buyer.inv.splice(idx, 1); G.gold += val; msg = 'Sold ' + it.name + ' for ' + val + ' gp.'; render(); } }) : null)); }))
          : h('div', { class: 'dimtxt', text: 'Pack is empty.' }))));
  }
  render();
}
function innDialog() {
  const body = h('div');
  let msg = '"Beds are clean, stew is hot, and nothing in here will try to eat you." A night\'s rest restores spells and mends 3 hit points.';
  const m = modal({ title: 'The Drowsy Lantern', body, wide: true, buttons: [{ label: 'Leave', cls: 'primary' }], onclose: refreshAll });
  const cost = () => Math.max(1, P().length);
  function night() {
    G.gold -= cost(); G.time += 1440 - (G.time % 1440) + 420; // wake at 07:00
    for (const ch of P()) {
      if (ch.dead) continue;
      ch.hp = Math.min(ch.maxhp, Math.max(0, ch.hp) + 3); ch.layUsed = false; ch.fx = {};
    }
    // clerics spend yesterday's remaining cures before re-memorizing
    for (const ch of P()) if (ch.cls === 'C' && !ch.dead && ch.hp > 0) while (ch.mem.cureLight > 0) {
      const t = P().filter(c => !c.dead && c.hp < c.maxhp).sort((a, b) => a.hp / a.maxhp - b.hp / b.maxhp)[0];
      if (!t) break; ch.mem.cureLight--; t.hp = Math.min(t.maxhp, t.hp + rnd(8));
    }
    for (const ch of P()) if (!ch.dead) memorizeAll(ch);
    tickEffects(true);
  }
  function render() {
    const hurt = P().some(c => !c.dead && c.hp < c.maxhp);
    body.replaceChildren(h('div', { class: 'msg', text: msg }),
      h('div', { class: 'dimtxt', text: 'Party gold: ' + G.gold + ' gp. A night costs ' + cost() + ' gp.' }),
      h('div', { class: 'col' },
        h('button', { class: 'btn', text: 'Rest for the night (' + cost() + ' gp)', disabled: G.gold < cost(), onclick: () => { night(); msg = 'You sleep soundly. Spells are memorized anew.'; saveGame('auto'); render(); } }),
        h('button', { class: 'btn', text: 'Rest until healed', disabled: G.gold < cost() || !hurt, onclick: () => { let n = 0; while (G.gold >= cost() && P().some(c => !c.dead && c.hp < c.maxhp) && n < 60) { night(); n++; } msg = 'You rest for ' + n + ' night' + (n === 1 ? '' : 's') + '. ' + (P().some(c => !c.dead && c.hp < c.maxhp) ? 'Your purse is empty before your wounds have closed.' : 'The party is fully healed.'); saveGame('auto'); render(); } }),
        h('button', { class: 'btn', text: 'Change party members', onclick: () => {
          const rv = rosterView();
          modal({ title: 'Adventurers at the Inn', wide: true, body: rv, closable: false, buttons: [{ label: 'Done', cls: 'primary', keep: true, on: () => { if (!P().some(c => !c.dead && c.hp > 0)) return; closeModal(); refreshAll(); render(); } }] });
        } }),
        h('button', { class: 'btn', text: 'Save game', onclick: () => saveDialog(true) })));
    refreshAll();
  }
  render();
}
function templeDialog() {
  const body = h('div');
  let msg = '"The Dawn turns no one away," says the priestess, "though the roof does need mending."';
  modal({ title: 'Temple of the Dawn', body, wide: true, buttons: [{ label: 'Leave', cls: 'primary' }], onclose: refreshAll });
  function svc(label, cost, fn) { return h('button', { class: 'btn mini', text: label + ' — ' + cost + ' gp', disabled: G.gold < cost, onclick: () => { G.gold -= cost; fn(); render(); } }); }
  function render() {
    body.replaceChildren(h('div', { class: 'msg', text: msg }), h('div', { class: 'dimtxt', text: 'Party gold: ' + G.gold + ' gp' }),
      h('table', { class: 'inv' }, P().map(ch => h('tr', null, h('td', { text: ch.name }), h('td', { class: 'note', text: statusOf(ch) + ' · HP ' + ch.hp + '/' + ch.maxhp }),
        h('td', { class: 'acts' },
          ch.dead ? (ch.lost ? h('span', { class: 'bad', text: 'Beyond recall' }) : svc('Raise Dead', 400, () => {
            const pct = resurrectionChance(ch.con);
            if (rnd(100) <= pct) { ch.dead = false; ch.hp = 1; ch.con = Math.max(3, ch.con - 1); ch.poison = null; msg = ch.name + ' gasps and opens their eyes. (Resurrection survival ' + pct + '%; Constitution reduced by 1.)'; }
            else { ch.lost = true; msg = 'The prayers echo unanswered. ' + ch.name + '\'s spirit does not return. (' + pct + '% chance)'; }
          })) : [
            ch.hp < ch.maxhp ? svc('Cure Light Wounds', 20, () => { const n = rnd(8); ch.hp = Math.min(ch.maxhp, Math.max(0, ch.hp) + n); msg = ch.name + ' is healed for ' + n + '.'; }) : null,
            ch.hp < ch.maxhp ? svc('Cure Serious Wounds', 60, () => { const n = dice(2, 8) + 1; ch.hp = Math.min(ch.maxhp, Math.max(0, ch.hp) + n); msg = ch.name + ' is healed for ' + n + '.'; }) : null,
            ch.poison ? svc('Neutralize Poison', 80, () => { ch.poison = null; msg = 'The venom is drawn from ' + ch.name + '.'; }) : null,
            ch.hp >= ch.maxhp && !ch.poison ? h('span', { class: 'dimtxt', text: 'In good health' }) : null])))));
    refreshAll();
  }
  render();
}
function hallDialog() {
  const next = QUEST_ORDER.find(q => G.quests[q] !== 'done');
  if (!next) return void msgBox('Emberfall Town Hall', 'Reeve Halda rises as you enter. "Emberfall\'s champions! There is no more work for you today, and thank the Dawn for that."');
  const q = QUESTS[next];
  if (!G.quests[next]) {
    G.quests[next] = 'active';
    return void msgBox('Commission: ' + q.name, 'Reeve Halda unrolls a map of the old abbey.\n"' + q.offer + '"\nReward: ' + q.gold + ' gold, and the town\'s gratitude.');
  }
  const holder = q.needItem ? P().find(c => c.inv.includes(q.needItem)) : null;
  if (G.flags['q:' + next] && (!q.needItem || holder)) {
    if (holder) holder.inv.splice(holder.inv.indexOf(q.needItem), 1);
    G.quests[next] = 'done'; G.gold += q.gold;
    const live = P().filter(c => !c.dead);
    live.forEach(c => awardXP(c, q.xp));
    log('Commission complete: ' + q.name + '. +' + q.gold + ' gp, +' + q.xp + ' XP each.', 'good');
    saveGame('auto'); refreshAll();
    msgBox('Commission Complete: ' + q.name, '"' + q.done + '"\nThe party receives ' + q.gold + ' gold. Each member gains ' + q.xp + ' experience.').then(() => {
      if (next === 'malvek') { G.won = true; msgBox('Victory!', 'Bells ring across Emberfall. The Abbey of the Dawn will be rebuilt, and the names of your company will be carved above its door.\nYou have completed the adventure. You may keep exploring, or begin anew with a different party.', 'Huzzah!'); }
      else hallDialog();
    });
    return;
  }
  msgBox('Emberfall Town Hall', 'Reeve Halda looks up from her ledgers.\n"' + q.offer + '"\nYour commission stands: ' + q.name + '.');
}
function trainingDialog() {
  const body = h('div');
  let msg = '"Experience is the best teacher," growls Master Orrin. "I\'m the second best, and I charge."';
  modal({ title: 'Emberfall Training Hall', body, wide: true, buttons: [{ label: 'Leave', cls: 'primary' }], onclose: refreshAll });
  async function train(ch) {
    const cost = 100 * ch.lvl; G.gold -= cost;
    const r = levelUp(ch);
    msg = ch.name + ' advances to level ' + ch.lvl + '! +' + r.hp + ' hit points, THAC0 ' + charThac0(ch) + '.';
    if (ch.cls === 'M') {
      const max = spellSlots(ch).length, opts = Object.keys(SPELLS).filter(id => SPELLS[id].c === 'M' && SPELLS[id].l <= max && !ch.book.includes(id)).sort((a, b) => SPELLS[b].l - SPELLS[a].l);
      if (opts.length) {
        const i = await choice('New Spell', ch.name + ' may add one spell to the spellbook.', opts.map(id => ({ label: SPELLS[id].name + ' (level ' + SPELLS[id].l + ')', title: SPELLS[id].desc })));
        ch.book.push(opts[i]); autoPrep(ch); msg += ' Learned ' + SPELLS[opts[i]].name + '.';
      }
    }
    if (isCaster(ch)) msg += ' Rest to memorize new spells.';
    log(msg, 'good'); render();
  }
  function render() {
    body.replaceChildren(h('div', { class: 'msg', text: msg }), h('div', { class: 'dimtxt', text: 'Party gold: ' + G.gold + ' gp. Training costs 100 gp per current level.' }),
      h('table', { class: 'inv' }, P().map(ch => h('tr', null, h('td', { text: ch.name }), h('td', { class: 'note', text: CLASSES[ch.cls].name + ' ' + ch.lvl + ' · XP ' + ch.xp + (ch.lvl < MAX_LEVEL ? ' / ' + xpForNext(ch) : '') }),
        h('td', { class: 'acts' }, canLevel(ch) ? h('button', { class: 'btn mini primary', text: 'Train — ' + 100 * ch.lvl + ' gp', disabled: G.gold < 100 * ch.lvl, onclick: () => train(ch) }) : h('span', { class: 'dimtxt', text: ch.dead ? 'Dead' : ch.lvl >= MAX_LEVEL ? 'Master' : 'Needs ' + (xpForNext(ch) - ch.xp) + ' more XP' }))))));
    refreshAll();
  }
  render();
}
function tavernDialog() {
  const body = h('div');
  let msg = 'Smoke, laughter and the smell of spilled ale. A few locals eye your weapons with interest.';
  modal({ title: 'The Gilded Tankard', body, buttons: [{ label: 'Leave', cls: 'primary' }], onclose: refreshAll });
  function render() {
    body.replaceChildren(h('div', { class: 'msg', text: msg }),
      h('button', { class: 'btn', text: 'Buy a round and listen (2 gp)', disabled: G.gold < 2, onclick: () => { G.gold -= 2; G.rumor = ((G.rumor == null ? Math.floor(Math.random() * RUMORS.length) : G.rumor) + 1) % RUMORS.length; msg = RUMORS[G.rumor]; render(); } }),
      h('div', { class: 'dimtxt', text: 'Party gold: ' + G.gold + ' gp' }));
  }
  render();
}

/* ---------------- save / load / menu ---------------- */
function slotLabel(s) { return s === 'auto' ? 'Autosave' : 'Slot ' + s; }
function saveDialog(saving) {
  const body = h('div', { class: 'col' });
  const m = modal({ title: saving ? 'Save Game' : 'Load Game', body, buttons: [{ label: 'Cancel', cls: 'dim' }] });
  const slots = saving ? ['1', '2', '3'] : ['auto', '1', '2', '3'];
  function render() {
    body.replaceChildren(...slots.map(s => {
      const meta = saveMeta(s);
      return h('button', { class: 'btn slot', disabled: !saving && !meta, onclick: () => {
        if (saving) { saveGame(s); log('Game saved to ' + slotLabel(s) + '.', 'good'); closeModal(m); }
        else { closeModal(m); loadGame(s); }
      } }, h('b', { text: slotLabel(s) }), h('span', { text: meta ? meta.leader + ' · ' + meta.where + ' · ' + meta.when : 'Empty' }), meta ? h('span', { class: 'dimtxt', text: meta.saved }) : null);
    }));
  }
  render();
}
function helpDialog() {
  const sec = (t, lines) => [h('h3', { text: t }), h('ul', null, lines.map(l => h('li', { text: l })))];
  modal({ title: 'How to Play', wide: true, body: h('div', { class: 'help' },
    sec('Exploring', ['W / ↑ move forward, S / ↓ step back, A / ← and D / → turn, Q / E sidestep.', 'Walk into a door to open it, and into a building\'s door to enter.', 'F searches for secret doors. R makes camp (dungeons only; you may be disturbed).', 'Click a party member or press 1–6 for their character sheet: equipment, spells and items.', 'Esc opens the menu (save, load, help).']),
    sec('Combat', ['Initiative is rolled each round: d10 plus weapon speed. Low goes first.', 'Click a highlighted square to move; click an adjacent enemy to attack; click a distant enemy to fire a missile weapon.', 'Moving away from an adjacent enemy gives it a free attack.', 'Spellcasters who are hit earlier in the round lose their concentration and cannot cast.', 'A character at 0 hp or below is dying and loses 1 hp each round until bandaged; at -10 they are dead.', 'Thieves backstab (+4 to hit, multiplied damage) when hidden or when an ally is on the opposite side of the target.', 'Space ends the turn. Stand on the edge of the field to flee.']),
    sec('The Rules', ['Second Edition AD&D: THAC0 and descending Armor Class, five saving throw categories, class experience tables, racial abilities and class restrictions.', 'Spells must be memorized and are regained only by resting. Choose them on the character sheet.', 'Levels are gained at the Training Hall once you have the experience (and the fee).', 'Experience comes from slain monsters, recovered treasure (1 XP per gold piece) and the Reeve\'s commissions.'])) });
}
function menuDialog() {
  modal({ title: 'Emberfall', body: h('div', { class: 'dimtxt', text: 'Day ' + (Math.floor(G.time / 1440) + 1) + ' · ' + G.gold + ' gold · ' + MAPS[G.map].name }), buttons: [
    { label: 'Save Game', on: () => saveDialog(true), disabled: Combat.active },
    { label: 'Load Game', on: () => saveDialog(false), disabled: Combat.active },
    { label: 'How to Play', on: helpDialog },
    { label: 'Quit to Title', cls: 'warn', on: () => { if (!Combat.active) showTitle(); }, disabled: Combat.active },
    { label: 'Resume', cls: 'primary' }] });
}
