'use strict';
/* ============================================================
   Maps: what is marked on the corner minimap, the names shown
   when the mouse rests on it, and the full-page map (M).
   ============================================================ */

/* each kind of building has its own colour on the map */
const LOC_COL = { inn: '#f2c94c', tavern: '#e8853a', armory: '#b9c4d2', apothecary: '#62c46e', store: '#4fb8a6', temple: '#f6f1e2', hall: '#d6584f', training: '#c79a62' };

/* unopened chests and dropped gear on the current map (only drawn where the party has looked) */
function mapMarks() {
  const out = lootSpots().map(p => ({ x: p.x, y: p.y, kind: 'loot' }));
  if (!X.cells || isWild()) return out;
  X.cells.forEach((row, y) => row.forEach((ch, x) => {
    if (ch >= 'a' && ch <= 'z') { const ev = X.def.ev[ch]; if (ev && ev.type === 'chest' && !G.flags[G.map + ':' + ch]) out.push({ x, y, kind: 'chest' }); }
  }));
  return out.concat(foeMarks());
}
function mapOpts(big) {
  const locCol = {};
  for (const k in X.def.locs || {}) locCol[k] = LOC_COL[X.def.locs[k]] || View3D.MAPCOL.door;
  return { marks: mapMarks(), locCol, big: !!big, pad: big ? 36 : 0 };
}

/* what the party knows about one square of the current map, in words */
function mapInfoAt(x, y) {
  const seen = G.seen[G.map];
  if (isWild()) {
    const [w, hh] = Over.size;
    if (x < 0 || y < 0 || x >= w || y >= hh || !seen[y * w + x]) return '';
    const t = Over.terr(x, y), s = X.def.sites[Over.at(x, y)], n = groundAt(x, y).length;
    return (s ? s.name : t.name + (t.block ? ' (impassable)' : '')) + (n ? ' · dropped gear: ' + groundAt(x, y).map(id => item(id).name).join(', ') : '') + (x === G.x && y === G.y ? ' · you are here' : '');
  }
  if (!X.M || x < 0 || y < 0 || x >= X.M.w || y >= X.M.h || !seen[y * X.M.w + x]) return '';
  const ch = cell(x, y), parts = [];
  if (ch >= '1' && ch <= '9') { const id = X.def.locs[ch]; parts.push(locName(id) + ' (' + SERVICES[id].kind + ')'); }
  else if (ch === '<' || ch === '>') { const s = X.def.stairs && X.def.stairs[ch]; parts.push('Stairs ' + (ch === '<' ? 'up' : 'down') + (s && MAPS[s.map] ? ' to ' + lowerThe(MAPS[s.map].name) : '')); }
  else if (ch === 'G') parts.push(X.def.exit ? (X.def.exit.title || 'The gate') : 'A barred gate');
  else if (ch === 'D') parts.push('A door');
  else if (ch === 'L') parts.push('A locked door');
  else if (ch === 'F') parts.push('A fountain');
  else if (ch === 'T') parts.push('A tree');
  else if (ch >= 'a' && ch <= 'z' && X.def.ev[ch] && X.def.ev[ch].type === 'chest' && !G.flags[G.map + ':' + ch]) parts.push('A chest, unopened');
  const foe = foeAt(x, y);
  if (foe && foeSeen(foe)) parts.push('Foes: ' + band(foe).map(([id, n]) => (n > 1 ? n + ' × ' : '') + MONSTERS[id].name).join(', '));
  const g = groundAt(x, y);
  if (g.length) parts.push('Dropped gear: ' + g.map(id => item(id).name).join(', '));
  if (x === G.x && y === G.y) parts.push('You are here');
  return parts.join(' · ');
}
function mapCellAt(canvas, e) {
  const g = canvas._geo; if (!g) return null;
  const r = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) * canvas.width / r.width - g.ox) / g.cs), y = Math.floor(((e.clientY - r.top) * canvas.height / r.height - g.oy) / g.cs);
  return x >= 0 && y >= 0 && x < g.w && y < g.h ? { x, y } : null;
}

/* ---------------- the full-page map ---------------- */
function mapDialog() {
  if (!G || !X.def) return;
  const cv = h('canvas', { class: 'bigmap' }); cv.width = 1840; cv.height = 1100;
  const hint = 'Move the mouse over the map to see what is there.';
  const info = h('div', { class: 'mapinfo', text: hint }), legend = h('div', { class: 'maplegend' });
  modal({ title: 'Map: ' + X.def.name, body: h('div', { class: 'mapwrap' }, cv, info, legend), wide: true, buttons: [{ label: 'Close', cls: 'primary' }] });
  const key = (col, text, shape) => h('span', { class: 'mapkey' }, h('i', { class: shape || '', style: 'background:' + col }), text);
  const C = View3D.MAPCOL, keys = [key(isWild() ? '#fff' : C.you, 'Your company', 'dot')];

  if (isWild()) {
    Over.fullMap(cv);
    keys.push(key('#ffd27a', 'Place', 'diamond'));
  } else {
    const geo = View3D.minimap(cv, X.M, G.seen[G.map], G.x, G.y, G.dir, mapOpts(true)), c = cv.getContext('2d'), seen = G.seen[G.map];
    // name the buildings, stairs and gates, nudging each label off any it would cover
    const placed = [], labels = [], has = {};
    X.cells.forEach((row, y) => row.forEach((ch, x) => {
      if (!seen[y * X.M.w + x]) return;
      if (ch >= '1' && ch <= '9') { const id = X.def.locs[ch]; labels.push([x, y, locName(id), LOC_COL[id] || '#f3e3b5']); has[id] = 1; }
      else if (ch === '<' || ch === '>') { const s = X.def.stairs && X.def.stairs[ch]; labels.push([x, y, (ch === '<' ? 'Up' : 'Down') + (s && MAPS[s.map] ? ' to ' + lowerThe(MAPS[s.map].name) : ''), '#9fe4f5']); has.stairs = 1; }
      else if (ch === 'G' && X.def.exit) labels.push([x, y, X.def.exit.title || 'The gate', '#f3e3b5']);
      else if (ch === 'D') has.door = 1; else if (ch === 'L') has.lock = 1;
    }));
    c.font = '600 23px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const [x, y, text, col] of labels) {
      const w = c.measureText(text).width + 10, mx = geo.ox + (x + 0.5) * geo.cs, my = geo.oy + (y + 0.5) * geo.cs;
      let best = null;
      for (const dy of [-0.95, 1.0, -1.75, 1.8, -2.55, 2.6]) {
        const cx = Math.max(w / 2 + 4, Math.min(cv.width - w / 2 - 4, mx)), cy = my + dy * Math.max(geo.cs, 30);
        if (cy < 16 || cy > cv.height - 16) continue;
        const r = [cx - w / 2, cy - 15, cx + w / 2, cy + 15];
        if (!best) best = [cx, cy, r];
        if (!placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) { best = [cx, cy, r]; break; }
      }
      if (!best) continue;
      placed.push(best[2]);
      c.lineWidth = 6; c.strokeStyle = 'rgba(8,8,12,.92)'; c.strokeText(text, best[0], best[1]); c.fillStyle = col; c.fillText(text, best[0], best[1]);
    }
    if (has.door) keys.push(key(C.door, 'Door'));
    if (has.lock) keys.push(key(C.lock, 'Locked door'));
    if (has.stairs) keys.push(key(C.stairs, 'Stairs'));
    for (const id in LOC_COL) if (has[id]) keys.push(key(LOC_COL[id], locName(id)));
    if (mapMarks().some(m => m.kind === 'chest' && seen[m.y * X.M.w + m.x])) keys.push(key(C.chest, 'Chest'));
    if (foeMarks().some(m => seen[m.y * X.M.w + m.x])) keys.push(key(C.foe, 'Monsters', 'dot'));
  }
  if (lootSpots().length) keys.push(key(View3D.MAPCOL.loot, 'Dropped gear', 'dot'));
  legend.replaceChildren(...keys);
  cv.addEventListener('mousemove', e => { const t = mapCellAt(cv, e); info.textContent = (t && mapInfoAt(t.x, t.y)) || hint; });
  cv.addEventListener('mouseleave', () => { info.textContent = hint; });
}

/* the corner minimap names what is under the mouse, and opens the full map when clicked */
function initMinimap() {
  const cv = $('#minimap');
  cv.addEventListener('mousemove', e => { const t = G && X.def && mapCellAt(cv, e); cv.title = (t && mapInfoAt(t.x, t.y)) || 'Click to open the map (M)'; });
  cv.addEventListener('click', () => { if (G && X.def && !busy()) mapDialog(); });
}
