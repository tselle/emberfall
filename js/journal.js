'use strict';
/* ============================================================
   Quest journal: the commissions the company has taken on,
   and a dated record of what has happened along the way.
   ============================================================ */

/* "the Town Hall", "the Elder's Longhouse", "Hesk's": a name with the right article for running text */
function theName(name) {
  if (/^the /i.test(name)) return 'the ' + name.slice(4);
  if (/^([A-Z][\w-]* ){0,2}[A-Z][\w-]*'s\b/.test(name)) return name;
  return 'the ' + name;
}

/* a map's name in running text: "the Hollow Vaults", "Emberfall" (no article is added) */
const lowerThe = name => /^The /.test(name) ? 'the ' + name.slice(4) : name;

/* add a dated note to the journal (repeat notes are ignored) */
function jot(text, kind) {
  if (!G) return;
  G.journal = G.journal || [];
  if (G.journal.some(e => e.text === text && e.mod === G.module)) return;
  G.journal.push({ t: G.time, mod: G.module, text, kind: kind || 'note' });
}

/* where a commission stands: null (not offered), 'active', 'report' or 'done' */
function questState(id) {
  const s = G.quests[id], q = QUESTS[id];
  if (!s) return null;
  if (s === 'done') return 'done';
  if (G.flags['q:' + id] && (!q.needItem || P().some(c => c.inv.includes(q.needItem)))) return 'report';
  return 'active';
}
const QSTATE = { active: 'In progress', report: 'Ready to report', done: 'Complete' };

function questProgress(id) {
  const q = QUESTS[id], M = mod(), st = questState(id), who = M.names.giver, where = theName(locName('hall'));
  if (st === 'done') return 'Reported to ' + who + '. Paid ' + q.gold + ' gold.';
  if (st === 'report') return 'Done. Report to ' + who + ' at ' + where + ' for your reward.';
  if (q.needItem && G.flags['q:' + id]) return 'You found ' + theName(item(q.needItem).name) + ', but no one in the company is carrying it now.';
  return 'Reward: ' + q.gold + ' gold.';
}

function journalDialog(tab) {
  if (!G) return;
  tab = tab || 'quests';
  const body = h('div', { class: 'journal' });
  modal({ title: 'Journal', body, wide: true, buttons: [{ label: 'Close', cls: 'primary' }] });

  function questCard(id) {
    const q = QUESTS[id], st = questState(id);
    return h('div', { class: 'jquest ' + st },
      h('div', { class: 'jqhead' },
        h('span', { class: 'jqname', text: q.name }),
        h('span', { class: 'tag dim', text: q.side ? 'Side' : 'Main' }),
        h('span', { class: 'jstate ' + st, text: QSTATE[st] })),
      st !== 'done' && q.goal ? h('div', { class: 'jgoal', text: q.goal }) : null,
      h('div', { class: 'jprog', text: questProgress(id) }),
      st !== 'done' ? h('details', null, h('summary', { text: 'What ' + mod().names.giver + ' said' }), h('div', { class: 'jquote', text: '"' + q.offer + '"' })) : null);
  }

  function quests() {
    const M = mod(), ids = M.quests.concat(M.side).filter(id => G.quests[id]);
    const order = { report: 0, active: 1, done: 2 };
    ids.sort((a, b) => order[questState(a)] - order[questState(b)] || (QUESTS[a].side ? 1 : 0) - (QUESTS[b].side ? 1 : 0));
    const open = ids.filter(id => questState(id) !== 'done').length;
    const out = [h('div', { class: 'dimtxt', text: M.code + ': ' + M.name + ' · ' + (ids.length ? open + ' open, ' + (ids.length - open) + ' complete' : 'no commissions yet') })];
    if (!ids.length) out.push(h('p', { class: 'jempty', text: 'You have taken on no work yet. ' + M.names.giver + ' at ' + theName(locName('hall')) + ' in ' + M.names.town + ' is looking for capable adventurers.' }));
    else out.push(ids.map(questCard));
    // earlier adventures in the saga
    const past = (CAMPAIGN.order || []).filter(mid => mid !== G.module && MODULES[mid] && MODULES[mid].quests.concat(MODULES[mid].side).some(id => G.quests[id]));
    if (past.length) out.push(h('h3', { text: 'Earlier adventures' }), past.map(mid => {
      const P2 = MODULES[mid], all = P2.quests.concat(P2.side).filter(id => G.quests[id]);
      return h('details', { class: 'jpast' }, h('summary', { text: P2.code + ': ' + P2.name + (G.done.includes(mid) ? ' (complete)' : '') }),
        all.map(id => h('div', { class: 'jpastq' }, h('span', { text: QUESTS[id].name }), h('span', { class: 'jstate ' + (G.quests[id] === 'done' ? 'done' : 'active'), text: G.quests[id] === 'done' ? 'Complete' : 'Unfinished' }))));
    }));
    return out;
  }

  function notes() {
    const list = (G.journal || []).slice().reverse();
    if (!list.length) return [h('p', { class: 'jempty', text: 'Nothing written yet. Notes appear here as you take on commissions, explore new places and hear rumours.' })];
    let day = null;
    const out = [];
    for (const e of list) {
      const d = Math.floor(e.t / 1440) + 1;
      if (d !== day) { day = d; out.push(h('div', { class: 'jday', text: 'Day ' + d })); }
      const tm = e.t % 1440;
      out.push(h('div', { class: 'jnote ' + e.kind },
        h('span', { class: 'jtime', text: String(Math.floor(tm / 60)).padStart(2, '0') + ':' + String(tm % 60).padStart(2, '0') }),
        h('span', { class: 'jtext', text: e.text }),
        e.mod !== G.module && MODULES[e.mod] ? h('span', { class: 'tag dim', text: MODULES[e.mod].code }) : null));
    }
    return out;
  }

  function render() {
    const tabs = [['quests', 'Commissions'], ['notes', 'Notes']];
    body.replaceChildren(
      h('div', { class: 'jtabs' }, tabs.map(([k, label]) => h('button', { class: 'btn mini' + (k === tab ? ' on' : ''), text: label, onclick: () => { tab = k; render(); } })),
        h('button', { class: 'btn mini', text: 'Bestiary', title: 'Creatures you have met (B)', onclick: () => { closeModal(); bestiaryDialog(); } })),
      h('div', { class: 'jbody' }, tab === 'quests' ? quests() : notes()));
  }
  render();
}
