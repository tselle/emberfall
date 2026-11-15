'use strict';
/* ============================================================
   Campaigns: choosing an adventure module, fielding a party at
   the module's starting level (new, or carried over from a
   saved game), finishing a module and moving on to the next.
   ============================================================ */
const mod = () => MODULES[(G && G.module) || 'hollow'];

/* ---------------- home-base services ---------------- */
const SERVICES = {
  inn:        { kind: 'inn', open: () => innDialog() },
  armory:     { kind: 'arms and armor', open: () => shopDialog('armory') },
  tavern:     { kind: 'tavern', open: () => tavernDialog() },
  apothecary: { kind: 'apothecary', open: () => shopDialog('apothecary') },
  store:      { kind: 'general store', open: () => shopDialog('store') },
  temple:     { kind: 'temple', open: () => templeDialog() },
  hall:       { kind: 'commissions', open: () => hallDialog() },
  training:   { kind: 'training', open: () => trainingDialog() },
};
const DEFAULT_NAMES = { town: 'town', inn: 'The Inn', armory: 'The Armory', tavern: 'The Tavern', apothecary: 'The Apothecary', store: 'The General Store', temple: 'The Temple',
  hall: 'The Town Hall', training: 'The Training Hall', giver: 'The reeve', trainer: 'The weapon-master' };
function locName(id) { return (mod().names || {})[id] || DEFAULT_NAMES[id] || id; }
function shopStock(id) { const s = mod().shops || {}; return SHOPS[s[id] || (id === 'store' ? 'village' : id)]; }

/* ---------------- fielding a party at the module's level ---------------- */
function kitTier(lvl) { return lvl >= 5 ? 5 : lvl >= 3 ? 3 : 0; }
const KIT_GOLD = { 3: 150, 5: 500 }; // extra purse for characters made from scratch above 1st level
/* advance a character to the module's starting level and issue its kit.
   Pregenerated heroes are fully re-equipped; new recruits receive only the
   kit's magic and silver gear (and buy the rest themselves). */
function outfit(ch, lvl, pregen) {
  advanceTo(ch, lvl);
  const k = (KITS[kitTier(lvl)] || {})[ch.cls];
  if (!k) return;
  for (const slot in k.eq) {
    const id = k.eq[slot], it = item(id);
    if (!pregen && !it.magic && !it.silver) continue;
    if (ch.eq[slot] && !pregen) { ch.inv.push(id); continue; }
    ch.eq[slot] = id;
  }
  const w = item(ch.eq.weapon);
  if (w && w.hands === 2 && ch.eq.shield) { ch.inv.push(ch.eq.shield); ch.eq.shield = null; }
  ch.inv.push(...k.inv);
}
/* called when a character is created in the roster screen or at an inn */
function outfitRecruit(ch) {
  const lvl = mod().lvl;
  if (lvl <= 1) return;
  outfit(ch, lvl, false);
  G.gold += KIT_GOLD[kitTier(lvl)] || 0;
}
function newState(mid) {
  const M = MODULES[mid], s = MAPS[M.hub].start;
  const roster = makePregens();
  roster.forEach(c => outfit(c, M.lvl, true));
  return { v: 2, module: mid, done: [], roster, party: [], gold: M.gold, map: M.hub, x: s.x, y: s.y, dir: s.dir, time: 8 * 60, march: 0,
           flags: {}, mods: {}, seen: {}, quests: {}, won: false };
}
/* bring a company from a saved game into a new module */
function importState(mid, slot) {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(SAVE + slot)); } catch (e) { /* corrupt */ }
  if (!data || !data.roster) return null;
  const g = newState(mid), M = MODULES[mid];
  g.roster = data.roster; g.party = (data.party || []).filter(id => data.roster.some(c => c.id === id));
  g.gold = data.gold || 0; g.done = data.done || (data.won ? ['hollow'] : []);
  g.flags = data.flags || {}; g.quests = data.quests || {}; g.mods = data.mods || {}; g.seen = data.seen || {};
  g.time = data.time || g.time;
  readyCompany(g.roster, M);
  return g;
}
/* between adventures: wounds heal, spells return, and anyone below the module's level catches up */
function readyCompany(roster, M) {
  const raised = [];
  for (const c of roster) {
    if (c.dead) continue;
    c.hp = c.maxhp; c.poison = null; c.fx = {}; c.layUsed = false;
    if (c.lvl < M.lvl) { advanceTo(c, M.lvl); raised.push(c.name); }
    autoPrep(c); memorizeAll(c);
  }
  return raised;
}
function partyLevel(list) { const l = list.filter(c => !c.dead); return l.length ? l.reduce((s, c) => s + c.lvl, 0) / l.length : 0; }

/* ---------------- module statistics for the chooser ---------------- */
function moduleStats(M) {
  let enc = 0, loot = 0, sites = 0;
  for (const id of M.maps) {
    const d = MAPS[id];
    for (const k in d.ev || {}) { const e = d.ev[k]; if (e.type === 'enc') enc++; else if (e.type === 'chest') loot++; }
    if (d.sites) sites += Object.keys(d.sites).length;
  }
  return { areas: M.maps.length, enc, loot, sites, quests: M.quests.length + M.side.length };
}
function pips(n) { return h('span', { class: 'pips', title: DIFFICULTY[n] }, [1, 2, 3, 4].map(i => h('i', { class: i <= n ? 'on' : '' }))); }
function moduleCard(mid, opts) {
  const M = MODULES[mid], st = moduleStats(M);
  return h('div', { class: 'modcard' + (opts.on ? ' on' : '') + (opts.done ? ' done' : ''), onclick: opts.onclick },
    h('div', { class: 'row' }, h('span', { class: 'modcode', text: M.code }), h('b', { class: 'modname', text: M.name }), opts.done ? h('span', { class: 'donemark', text: '✓ completed' }) : null),
    h('div', { class: 'modmeta' },
      h('span', { class: 'tag', text: 'Levels ' + M.levels[0] + '–' + M.levels[1] }),
      h('span', { class: 'tag' }, DIFFICULTY[M.diff] + ' ', pips(M.diff)),
      h('span', { class: 'tag', text: M.size }),
      h('span', { class: 'tag dim', text: M.length })),
    h('div', { class: 'modblurb', text: M.blurb }),
    h('div', { class: 'modstats', text: st.areas + ' areas · ' + st.enc + ' set battles' + (st.sites ? ' · ' + st.sites + ' wilderness sites' : '') + ' · ' + st.loot + ' treasures · ' + st.quests + ' commissions' +
      (M.lvl > 1 ? ' · heroes begin at level ' + M.lvl : '') }));
}

/* ---------------- the adventure chooser (new game) ---------------- */
function showCampaign() {
  while (modals.length) closeModal();
  showScreen('campaign');
  let sel = (G && MODULES[G.module]) ? G.module : CAMPAIGN.order[0], src = 'new';
  const saves = ['auto', '1', '2', '3'].map(s => ({ s, m: saveMeta(s) })).filter(o => o.m);
  function render() {
    const M = MODULES[sel];
    $('#campSub').textContent = CAMPAIGN.name + ': four adventures that may be played alone or in order with the same company. Each varies in starting level, difficulty and size.';
    const grid = h('div', { class: 'modgrid' }, CAMPAIGN.order.map(id => moduleCard(id, { on: id === sel, onclick: () => { sel = id; render(); } })));
    const party = h('div', { class: 'col' },
      h('h3', { text: 'Your company' }),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn opt' + (src === 'new' ? ' on' : ''), text: 'A new company' + (M.lvl > 1 ? ' (level ' + M.lvl + ', equipped)' : ''), onclick: () => { src = 'new'; render(); } }),
        saves.map(o => h('button', { class: 'btn opt' + (src === o.s ? ' on' : ''), title: o.m.saved, onclick: () => { src = o.s; render(); } }, 'Bring the party from ' + slotLabel(o.s) + ': ' + o.m.leader + (o.m.mod ? ' · ' + o.m.mod.split(' ')[0] : '')))),
      h('div', { class: 'dimtxt', text: src === 'new'
        ? 'Six ready-made adventurers' + (M.lvl > 1 ? ' at level ' + M.lvl + ' with gear fit for the task' : '') + ' wait in the roster. Add them, or create your own.'
        : 'The whole roster, its gear and its gold come along. Anyone below level ' + M.lvl + ' is trained up to it before setting out. The saved game itself is not changed.' }));
    $('#campBody').replaceChildren(grid, party);
    $('#campBtns').replaceChildren(
      h('button', { class: 'btn big', text: 'Back', onclick: showTitle }),
      h('button', { class: 'btn big primary', text: 'Assemble the Company', onclick: () => {
        const g = src === 'new' ? newState(sel) : importState(sel, src);
        if (!g) return msgBox('Import', 'That saved game could not be read.');
        G = g; showAssembly();
      } }));
  }
  render();
}

/* ---------------- finishing and moving on ---------------- */
function moduleComplete() {
  const M = mod();
  if (!G.done.includes(G.module)) G.done.push(G.module);
  G.won = true;
  saveGame('auto');
  const N = M.next && MODULES[M.next];
  msgBox('Victory! ' + M.code + ': ' + M.name, M.victory + (N ? '' : '\n' + CAMPAIGN.name + ' is complete.'), 'Huzzah!').then(async () => {
    if (!N || G.done.includes(M.next)) return;
    const i = await choice('The Road Goes On', N.code + ': ' + N.name + ' (levels ' + N.levels[0] + '–' + N.levels[1] + ', ' + DIFFICULTY[N.diff].toLowerCase() + ', ' + N.size.toLowerCase() + ')\n' + N.blurb +
      '\nSet out now with your company? You can also leave later from the menu (Campaign).', [{ label: 'Set out', cls: 'primary' }, { label: 'Stay a while', cls: 'dim' }]);
    if (i === 0) travelTo(M.next);
  });
}
/* carry the company to another module's home base */
function travelTo(mid) {
  const M = MODULES[mid], s = MAPS[M.hub].start;
  G.module = mid; G.map = M.hub; G.x = s.x; G.y = s.y; G.dir = s.dir; G.march = 0;
  G.won = G.done.includes(mid);
  G.time = (Math.floor(G.time / 1440) + 14) * 1440 + 8 * 60; // a fortnight on the road; arrive in the morning
  const raised = readyCompany(G.roster, M);
  while (modals.length) closeModal();
  showScreen('game'); X.over = false; X.lock = false;
  enterMap();
  log('— ' + M.code + ': ' + M.name + ' —', 'round');
  log(M.hint, 'dim');
  saveGame('auto');
  msgBox(M.names.town, M.intro + (raised.length ? '\nOn the road, ' + raised.join(', ') + (raised.length === 1 ? ' trains' : ' train') + ' hard and ' + (raised.length === 1 ? 'reaches' : 'reach') + ' level ' + M.lvl + '.' : ''));
}
/* the campaign log, from the menu */
function campaignDialog() {
  const body = h('div', { class: 'col' });
  const cur = G.module, curDone = G.done.includes(cur);
  body.append(h('div', { class: 'dimtxt', text: CAMPAIGN.name + '. Party level ' + partyLevel(P()).toFixed(1) + ' · ' + G.gold + ' gp.' + (curDone ? ' This adventure is complete; the road is open.' : ' Leaving an adventure unfinished keeps your progress there; you may return to it later.') }));
  for (const id of CAMPAIGN.order) {
    const M = MODULES[id], done = G.done.includes(id), here = id === cur;
    const pl = partyLevel(P()), warn = pl > M.levels[1] + 1 ? 'Your company is past this challenge.' : pl < M.levels[0] - 0.5 ? 'Below level ' + M.lvl + ': your heroes will be trained up to it.' : '';
    body.append(h('div', { class: 'camprow' + (here ? ' here' : '') },
      h('span', { class: 'modcode', text: M.code }),
      h('div', { class: 'pinfo' }, h('div', { class: 'pname', text: M.name }),
        h('div', { class: 'psub', text: 'Levels ' + M.levels[0] + '–' + M.levels[1] + ' · ' + DIFFICULTY[M.diff] + ' · ' + M.size + (done ? ' · completed' : here ? ' · in progress' : '') + (warn && !here ? ' · ' + warn : '') })),
      here ? h('span', { class: 'gold', text: 'You are here' }) : h('button', { class: 'btn mini' + (curDone ? ' primary' : ''), text: done ? 'Revisit' : 'Travel there', disabled: Combat.active,
        onclick: async () => {
          if (!curDone && (await choice('Leave ' + mod().name + '?', 'The work here is unfinished. Your progress will be kept if you return.', [{ label: 'Travel on', cls: 'primary' }, { label: 'Stay', cls: 'dim' }])) !== 0) return;
          travelTo(id);
        } })));
  }
  modal({ title: 'Campaign', wide: true, body, buttons: [{ label: 'Close', cls: 'primary' }] });
}
