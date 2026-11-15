'use strict';
/* ============================================================
   Procedural vector figures (party members and monsters).
   Drawn with canvas paths so they stay crisp at any scale.
   ============================================================ */
function hexRGB(hex) {
  if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function shade(hex, amt) {
  const [r, g, b] = hexRGB(hex), f = amt < 0 ? 0 : 255, p = Math.abs(amt);
  return 'rgb(' + Math.round(r + (f - r) * p) + ',' + Math.round(g + (f - g) * p) + ',' + Math.round(b + (f - b) * p) + ')';
}
function rbox(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  c.fill(); c.stroke();
}
function disc(c, x, y, r, stroke) { c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); if (stroke !== false) c.stroke(); }
function seg(c, x1, y1, x2, y2, w, col) {
  c.save(); c.lineCap = 'round';
  c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineWidth = w + 2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.restore();
}

function drawWeapon(c, f, t, bob) {
  const hx = 11, hy = -23 + bob, steel = '#cfd6de', wood = '#7a5230';
  switch (f.wpn) {
    case 'sword': seg(c, hx, hy, hx + 9, hy - 22, 3, steel); seg(c, hx - 3, hy - 3, hx + 4, hy - 1, 2.5, '#b8963e'); break;
    case 'dagger': seg(c, hx, hy, hx + 6, hy - 11, 2.5, steel); break;
    case 'axe': seg(c, hx - 1, hy + 4, hx + 7, hy - 21, 2.5, wood);
      c.fillStyle = steel; c.beginPath(); c.moveTo(hx + 5, hy - 22); c.quadraticCurveTo(hx + 18, hy - 22, hx + 13, hy - 10); c.lineTo(hx + 6, hy - 15); c.closePath(); c.fill(); c.stroke(); break;
    case 'mace': seg(c, hx - 1, hy + 3, hx + 7, hy - 17, 2.5, wood); c.fillStyle = '#9aa3ad'; disc(c, hx + 8, hy - 20, 4.5); break;
    case 'club': seg(c, hx - 1, hy + 3, hx + 6, hy - 14, 3, wood); seg(c, hx + 6, hy - 14, hx + 10, hy - 24, 6, '#6b4526'); break;
    case 'spear': seg(c, hx - 4, hy + 16, hx + 9, hy - 30, 2, wood);
      c.fillStyle = steel; c.beginPath(); c.moveTo(hx + 11, hy - 38); c.lineTo(hx + 12, hy - 29); c.lineTo(hx + 6, hy - 30); c.closePath(); c.fill(); c.stroke(); break;
    case 'staff': seg(c, hx + 1, -1, hx + 1, -54 + bob, 2.5, wood);
      if (f.glow) { c.save(); c.globalAlpha *= 0.65 + 0.3 * Math.sin(t / 200); const g = c.createRadialGradient(hx + 1, -56 + bob, 0, hx + 1, -56 + bob, 10); g.addColorStop(0, '#fff'); g.addColorStop(0.3, f.glow); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(hx + 1, -56 + bob, 10, 0, 6.3); c.fill(); c.restore(); }
      break;
    case 'bow': c.save(); c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineWidth = 4; c.beginPath(); c.arc(hx - 2, hy - 4, 15, -1.25, 1.25); c.stroke();
      c.strokeStyle = wood; c.lineWidth = 2.2; c.beginPath(); c.arc(hx - 2, hy - 4, 15, -1.25, 1.25); c.stroke();
      c.strokeStyle = '#ddd'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(hx + 2.7, hy - 18.2); c.lineTo(hx + 2.7, hy + 10.2); c.stroke(); c.restore(); break;
    case 'claws': c.save(); c.strokeStyle = '#eee'; c.lineWidth = 1.3;
      for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(hx + 4, hy - 4 + i * 2); c.lineTo(hx + 9, hy - 5 + i * 3); c.stroke(); } c.restore(); break;
  }
}

function drawHum(c, f, t) {
  const s = f.s || 1, thin = f.thin ? 0.68 : 1;
  c.scale(s * (f.wide || 1), s);
  const bob = f.still ? 0 : Math.sin(t / 380 + (f.ph || 0)) * 1.1;
  const body = f.body || '#777', skin = f.skin || '#d8a47f', legs = f.legs || shade(body, -0.45);
  c.lineWidth = 1.4; c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineJoin = 'round';
  const hx = f.hunch ? 4 : 0, hy = -43 + bob + (f.hunch ? 4 : 0);
  // back arm
  seg(c, -7 * thin, -31 + bob, -11, -22 + bob, 3.5 * thin, shade(body, -0.2));
  // legs
  if (!f.robe) { c.fillStyle = legs; rbox(c, -6.5 * thin, -15, 5.5 * thin, 15, 2); rbox(c, 1.5 * thin, -15, 5.5 * thin, 15, 2); }
  // torso
  const g = c.createLinearGradient(-9, 0, 9, 0);
  g.addColorStop(0, shade(body, 0.2)); g.addColorStop(1, shade(body, -0.28));
  c.fillStyle = g;
  if (f.robe) { c.beginPath(); c.moveTo(-7, -36 + bob); c.lineTo(7, -36 + bob); c.lineTo(11, -1); c.lineTo(-11, -1); c.closePath(); c.fill(); c.stroke(); }
  else rbox(c, -8.5 * thin, -36 + bob, 17 * thin, 23, 5);
  if (f.thin) { c.save(); c.strokeStyle = 'rgba(40,36,30,.7)'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-4, -31 + i * 4 + bob); c.lineTo(4, -31 + i * 4 + bob); c.stroke(); } c.restore(); }
  if (f.trim) { c.fillStyle = f.trim; c.fillRect(-2.5, -34.5 + bob, 5, f.robe ? 32 : 20); }
  if (!f.thin) { c.fillStyle = 'rgba(20,15,10,.75)'; c.fillRect(-8.5, -19 + bob, 17, 2.5); }
  // hood back
  if (f.head === 'hood') { c.fillStyle = shade(body, -0.3); disc(c, hx - 1, hy, 9); }
  // head
  c.fillStyle = skin; disc(c, hx, hy, 7);
  if (f.head === 'snout') { c.beginPath(); c.ellipse(hx + 7, hy + 2, 5, 3.3, 0, 0, 6.3); c.fill(); c.stroke(); }
  if (f.beard) { c.fillStyle = f.beard; c.beginPath(); c.moveTo(hx - 5, hy + 2); c.quadraticCurveTo(hx + 1, hy + 16, hx + 7, hy + 2); c.closePath(); c.fill(); c.stroke(); }
  // face
  if (f.head === 'skull') {
    c.fillStyle = '#1a1512'; disc(c, hx + 2.5, hy - 1, 2, false); disc(c, hx - 2.5, hy - 1, 1.6, false); c.fillRect(hx - 2, hy + 3.5, 6, 1.2);
  } else {
    c.fillStyle = f.eyes || '#1a1512'; disc(c, hx + 3.2, hy - 0.8, 1.15, false);
  }
  switch (f.head) {
    case 'helm': c.fillStyle = f.helm || '#aab3bf'; c.beginPath(); c.arc(hx, hy - 1, 7.6, Math.PI, 0); c.lineTo(hx + 7.6, hy + 1); c.lineTo(hx + 5, hy + 1); c.lineTo(hx + 5, hy - 1); c.lineTo(hx - 7.6, hy - 1); c.closePath(); c.fill(); c.stroke();
      if (f.plume) { c.fillStyle = f.plume; c.beginPath(); c.moveTo(hx - 1, hy - 8); c.quadraticCurveTo(hx - 10, hy - 16, hx - 9, hy - 4); c.closePath(); c.fill(); c.stroke(); } break;
    case 'hood': c.fillStyle = shade(body, -0.15); c.beginPath(); c.arc(hx, hy - 0.5, 7.8, Math.PI * 0.95, Math.PI * 1.95); c.quadraticCurveTo(hx + 2, hy - 5, hx - 7.6, hy + 2); c.closePath(); c.fill(); c.stroke(); break;
    case 'hat': c.fillStyle = shade(body, -0.1); c.beginPath(); c.moveTo(hx - 11, hy - 4); c.lineTo(hx + 11, hy - 4); c.lineTo(hx + 4, hy - 7); c.lineTo(hx - 3, hy - 23); c.lineTo(hx - 5, hy - 7); c.closePath(); c.fill(); c.stroke(); break;
    case 'ears': c.fillStyle = skin; c.beginPath(); c.moveTo(hx - 5, hy - 3); c.lineTo(hx - 15, hy - 8); c.lineTo(hx - 6, hy + 2); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(hx + 5, hy - 4); c.lineTo(hx + 13, hy - 10); c.lineTo(hx + 7, hy); c.closePath(); c.fill(); c.stroke(); break;
    case 'horns': c.fillStyle = '#e9e2cf'; c.beginPath(); c.moveTo(hx - 5, hy - 5); c.lineTo(hx - 10, hy - 15); c.lineTo(hx - 1, hy - 7); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(hx + 5, hy - 5); c.lineTo(hx + 10, hy - 15); c.lineTo(hx + 1, hy - 7); c.closePath(); c.fill(); c.stroke(); break;
    case 'tusks': c.fillStyle = '#f1ead8'; c.beginPath(); c.moveTo(hx + 1, hy + 4); c.lineTo(hx + 2.5, hy - 1); c.lineTo(hx + 4, hy + 4); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = shade(body, -0.3); c.beginPath(); c.arc(hx, hy - 2, 7.3, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); c.fill(); break;
    case 'crown': c.fillStyle = '#d4af37'; c.beginPath(); c.moveTo(hx - 6.5, hy - 4); c.lineTo(hx - 6.5, hy - 12); c.lineTo(hx - 3, hy - 8); c.lineTo(hx, hy - 13); c.lineTo(hx + 3, hy - 8); c.lineTo(hx + 6.5, hy - 12); c.lineTo(hx + 6.5, hy - 4); c.closePath(); c.fill(); c.stroke(); break;
    case 'bare': if (f.hair) { c.fillStyle = f.hair; c.beginPath(); c.arc(hx, hy - 1, 7.4, Math.PI * 0.9, Math.PI * 2.05); c.closePath(); c.fill(); c.stroke(); } break;
  }
  if (f.elf) { c.fillStyle = skin; c.beginPath(); c.moveTo(hx - 5, hy - 2); c.lineTo(hx - 10, hy - 8); c.lineTo(hx - 6, hy + 2); c.closePath(); c.fill(); c.stroke(); }
  // weapon arm and weapon
  seg(c, 7 * thin, -31 + bob, 11, -23 + bob, 3.5 * thin, shade(body, 0.05));
  drawWeapon(c, f, t, bob);
  c.fillStyle = skin; disc(c, 11, -23 + bob, 2.2);
  // shield
  if (f.shield) {
    c.fillStyle = f.trim || '#7b6a4d'; disc(c, -9, -24 + bob, 7.5);
    c.fillStyle = '#c8cdd4'; disc(c, -9, -24 + bob, 2.2);
  }
}
function drawRat(c, f, t) {
  const b = Math.sin(t / 160 + (f.ph || 0)) * 0.8;
  c.lineWidth = 1.3; c.strokeStyle = 'rgba(15,12,10,.9)';
  c.save(); c.strokeStyle = '#c49a9a'; c.lineWidth = 2; c.beginPath(); c.moveTo(-11, -6); c.quadraticCurveTo(-22, -4 + b * 2, -24, -13); c.stroke(); c.restore();
  c.fillStyle = f.body; c.beginPath(); c.ellipse(0, -8 + b, 13, 7.5, 0, 0, 6.3); c.fill(); c.stroke();
  c.fillStyle = shade(f.body, 0.12); c.beginPath(); c.ellipse(12, -8 + b, 6.5, 4.6, 0.2, 0, 6.3); c.fill(); c.stroke();
  c.fillStyle = '#d9a5a5'; disc(c, 9, -13 + b, 2.6);
  c.fillStyle = '#e33'; disc(c, 14, -9.5 + b, 1, false);
  c.fillStyle = shade(f.body, -0.3); c.fillRect(-8, -2, 3, 2.5); c.fillRect(5, -2, 3, 2.5);
}
function drawSpider(c, f, t) {
  const b = Math.sin(t / 140 + (f.ph || 0));
  c.strokeStyle = '#141216'; c.lineWidth = 2; c.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = -0.9 + i * 0.6, k = (i % 2 ? b : -b) * 1.5;
    c.beginPath(); c.moveTo(2, -9); c.lineTo(2 + Math.cos(a) * 12, -18 + k - i); c.lineTo(4 + Math.cos(a) * 20, -1); c.stroke();
    c.beginPath(); c.moveTo(-2, -9); c.lineTo(-2 - Math.cos(a) * 12, -18 - k - i); c.lineTo(-4 - Math.cos(a) * 20, -1); c.stroke();
  }
  c.lineWidth = 1.3;
  c.fillStyle = f.body; disc(c, -5, -10, 9);
  c.fillStyle = '#7a1f2b'; c.beginPath(); c.ellipse(-6, -11, 3, 5, 0, 0, 6.3); c.fill();
  c.fillStyle = shade(f.body, 0.1); disc(c, 6, -8, 5.5);
  c.fillStyle = '#f33'; disc(c, 8, -9.5, 1, false); disc(c, 10, -7.5, 1, false);
}

function drawWolf(c, f, t) {
  const still = f.still, ph = f.ph || 0, b = still ? 0 : Math.sin(t / 170 + ph), g = still ? 0 : Math.sin(t / 170 + ph + 1.6);
  const body = f.body, dark = shade(body, -0.3);
  c.lineWidth = 1.3; c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineCap = 'round';
  // far legs
  seg(c, -9, -10, -11 + g * 2, 0, 3.6, dark); seg(c, 9, -10, 11 - g * 2, 0, 3.6, dark);
  // tail
  c.fillStyle = body; c.beginPath(); c.moveTo(-15, -15); c.quadraticCurveTo(-26, -14 + b, -27, -5 + b); c.quadraticCurveTo(-22, -10, -14, -11); c.closePath(); c.fill(); c.stroke();
  // body
  c.fillStyle = body; c.beginPath(); c.ellipse(-1, -14 + b * 0.4, 16, 7.5, -0.05, 0, 6.3); c.fill(); c.stroke();
  c.fillStyle = f.belly || shade(body, 0.25); c.beginPath(); c.ellipse(0, -10.5 + b * 0.4, 11, 3, 0, 0, 6.3); c.fill();
  if (f.spots) { c.fillStyle = f.spots; for (const [sx, sy] of [[-8, -16], [-2, -18], [4, -15], [-5, -12], [8, -18]]) disc(c, sx, sy + b * 0.4, 1.6, false); }
  // near legs
  seg(c, -7, -10, -6 - g * 2, 0, 4, body); seg(c, 11, -10, 12 + g * 2, 0, 4, body);
  // neck and head
  c.fillStyle = body; c.beginPath(); c.moveTo(9, -19 + b * 0.4); c.lineTo(17, -25 + b * 0.5); c.lineTo(20, -17); c.lineTo(11, -11); c.closePath(); c.fill();
  c.beginPath(); c.ellipse(19, -23 + b * 0.5, 6, 4.8, 0.15, 0, 6.3); c.fill(); c.stroke();
  c.fillStyle = shade(body, 0.1); c.beginPath(); c.moveTo(22, -25 + b * 0.5); c.lineTo(30, -21 + b * 0.5); c.lineTo(29, -18 + b * 0.5); c.lineTo(21, -19 + b * 0.5); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = dark; c.beginPath(); c.moveTo(15, -26 + b * 0.5); c.lineTo(16, -33 + b * 0.5); c.lineTo(19.5, -27 + b * 0.5); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#111'; disc(c, 29.5, -20.5 + b * 0.5, 1.4, false);
  c.fillStyle = '#ffcf4a'; disc(c, 21.5, -24 + b * 0.5, 1.2, false);
}

/* (x, y) is the ground point beneath the figure's feet */
function drawFig(c, f, x, y, t, o) {
  o = o || {};
  c.save(); c.translate(x, y);
  if (o.alpha != null) c.globalAlpha = o.alpha;
  const sc = (f.s || 1) * (o.scale || 1);
  if (!o.noShadow) { c.fillStyle = 'rgba(0,0,0,.38)'; c.beginPath(); c.ellipse(0, 0, 15 * sc, 6 * sc, 0, 0, 6.3); c.fill(); }
  if (o.scale) c.scale(o.scale, o.scale);
  if (o.down) { c.translate(-10, -5); c.rotate(-Math.PI / 2); c.globalAlpha *= 0.85; }
  if (o.flip) c.scale(-1, 1);
  const ff = o.down ? Object.assign({}, f, { still: true }) : f;
  if (f.type === 'rat') drawRat(c, ff, o.down ? 0 : t);
  else if (f.type === 'spider') drawSpider(c, ff, o.down ? 0 : t);
  else if (f.type === 'wolf') drawWolf(c, ff, o.down ? 0 : t);
  else drawHum(c, ff, t);
  c.restore();
}

function figForChar(ch) {
  const base = {
    F: { head: 'helm', wpn: 'sword', body: '#8c97a8' },
    P: { head: 'helm', wpn: 'sword', body: '#d9d4c0', plume: ch.color, helm: '#e2dcc0' },
    R: { head: 'hood', wpn: 'sword', body: '#4b6b3c' },
    M: { head: 'hat', wpn: 'staff', body: ch.color, robe: true },
    C: { head: 'bare', wpn: 'mace', body: '#c9c4b8', hair: '#6b4a2e' },
    T: { head: 'hood', wpn: 'dagger', body: '#3d3a40' },
  }[ch.cls];
  const f = Object.assign({ s: 1, trim: ch.cls === 'M' ? null : ch.color, ph: (ch.name.length * 1.7) % 6 }, base);
  const w = item(ch.eq.weapon), wid = baseId(ch.eq.weapon), a = ch.eq.armor;
  if (w) f.wpn = ['handaxe', 'battleaxe', 'halberd'].includes(wid) ? 'axe' : ['mace', 'hammer', 'flail', 'morningstar'].includes(wid) ? 'mace' : wid === 'club' ? 'club' : wid === 'staff' ? 'staff' : wid === 'dagger' ? 'dagger' : wid === 'spear' ? 'spear' : 'sword';
  else if (ch.eq.ranged && item(ch.eq.ranged).bow) f.wpn = 'bow';
  else if (ch.cls !== 'M') f.wpn = 'none';
  f.shield = !!ch.eq.shield && !(w && w.hands === 2);
  if (ch.cls !== 'M') {
    if (!a) f.body = ch.cls === 'C' ? '#c9c4b8' : '#8a7a62';
    else if (a === 'leather' || a === 'studded' || a === 'leather1') f.body = ch.cls === 'T' ? '#3d3a40' : ch.cls === 'R' ? '#4b6b3c' : '#7a5a3a';
    else f.body = ch.cls === 'P' ? '#d9d4c0' : '#8c97a8';
  }
  if (ch.race === 'dwarf') { f.s = 0.84; f.wide = 1.18; f.beard = '#a0522d'; f.skin = '#d39b76'; }
  else if (ch.race === 'halfling') { f.s = 0.74; f.skin = '#e0b08c'; }
  else if (ch.race === 'gnome') { f.s = 0.74; f.beard = '#ddd'; f.skin = '#c99673'; }
  else if (ch.race === 'elf') { f.s = 0.97; f.elf = true; f.skin = '#ecd3b8'; f.thin = false; }
  else if (ch.race === 'halfelf') { f.elf = true; f.skin = '#e2bb98'; }
  return f;
}
/* render a figure into a small canvas, used for portraits */
function portrait(fig, size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * 2; cv.style.width = cv.style.height = size + 'px';
  const c = cv.getContext('2d');
  const k = size * 2 / 64;
  c.scale(k, k);
  const s = fig.s || 1, big = s > 1.1 ? 0.8 : 1;
  drawFig(c, Object.assign({}, fig, { still: true }), 30, fig.type ? 44 : 60, 0, { scale: big, noShadow: false });
  return cv;
}
