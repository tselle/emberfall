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
  if (f.ghost) c.globalAlpha *= f.ghost;
  if (f.wings) { wing(c, -4, -31 + bob, 24, 24, shade(f.wings, -0.25), Math.sin(t / 260 + (f.ph || 0)) * 2); }
  if (f.tail) { c.save(); c.lineCap = 'round'; c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineWidth = 4.4; c.beginPath(); c.moveTo(-5, -15); c.quadraticCurveTo(-18, -12, -19, -1); c.stroke(); c.strokeStyle = f.tail; c.lineWidth = 2.8; c.beginPath(); c.moveTo(-5, -15); c.quadraticCurveTo(-18, -12, -19, -1); c.stroke(); c.restore(); }
  if (f.coil) { c.save(); c.lineCap = 'round'; for (const [w, col] of [[9.5, 'rgba(15,12,10,.9)'], [7.5, f.coil]]) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(0, -15); c.quadraticCurveTo(12, -8, 2, -5); c.quadraticCurveTo(-16, -2, -20, -9); c.stroke(); } c.restore(); }
  if (f.heads2) { c.fillStyle = skin; disc(c, hx - 9, hy + 1, 6.4); c.fillStyle = '#1a1512'; disc(c, hx - 6.5, hy, 1, false); if (f.hair) { c.fillStyle = f.hair; c.beginPath(); c.arc(hx - 9, hy, 6.7, Math.PI * 0.9, Math.PI * 2.05); c.closePath(); c.fill(); c.stroke(); } }
  // back arm
  seg(c, -7 * thin, -31 + bob, -11, -22 + bob, 3.5 * thin, shade(body, -0.2));
  if (f.arms4) seg(c, -7 * thin, -27 + bob, -13, -15 + bob, 3.2 * thin, shade(body, -0.25));
  // legs
  if (!f.robe && !f.coil && !(f.ghost && f.ghost < 0.7)) { c.fillStyle = legs; rbox(c, -6.5 * thin, -15, 5.5 * thin, 15, 2); rbox(c, 1.5 * thin, -15, 5.5 * thin, 15, 2); }
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
    case 'snakes': c.save(); c.strokeStyle = f.hair || '#4f8a3a'; c.lineWidth = 1.8; c.lineCap = 'round'; for (let i = 0; i < 7; i++) { const a = Math.PI * (1.05 + i * 0.15), w = Math.sin(t / 160 + i * 1.3) * 2; c.beginPath(); c.moveTo(hx + Math.cos(a) * 6, hy + Math.sin(a) * 6); c.quadraticCurveTo(hx + Math.cos(a) * 11 + w, hy + Math.sin(a) * 11, hx + Math.cos(a) * 13, hy + Math.sin(a) * 13 + w); c.stroke(); } c.restore(); break;
    case 'tree': c.fillStyle = f.hair || '#3f7a35'; disc(c, hx - 5, hy - 7, 7); disc(c, hx + 5, hy - 8, 7.5); disc(c, hx, hy - 13, 7.5); break;
    case 'tentacles': c.save(); c.strokeStyle = skin; c.lineWidth = 2; c.lineCap = 'round'; for (let i = 0; i < 4; i++) { const w = Math.sin(t / 170 + i * 1.5) * 1.5; c.beginPath(); c.moveTo(hx + 1 + i * 1.6, hy + 4); c.quadraticCurveTo(hx + 2 + i * 2 + w, hy + 9, hx + 1 + i * 2.2, hy + 14 + w); c.stroke(); } c.restore(); break;
    case 'bare': if (f.hair) { c.fillStyle = f.hair; c.beginPath(); c.arc(hx, hy - 1, 7.4, Math.PI * 0.9, Math.PI * 2.05); c.closePath(); c.fill(); c.stroke(); } break;
  }
  if (f.elf) { c.fillStyle = skin; c.beginPath(); c.moveTo(hx - 5, hy - 2); c.lineTo(hx - 10, hy - 8); c.lineTo(hx - 6, hy + 2); c.closePath(); c.fill(); c.stroke(); }
  // weapon arm and weapon
  if (f.arms4) seg(c, 7 * thin, -27 + bob, 14, -16 + bob, 3.2 * thin, shade(body, -0.05));
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
  c.fillStyle = f.mark || '#7a1f2b'; c.beginPath(); c.ellipse(-6, -11, 3, 5, 0, 0, 6.3); c.fill();
  c.fillStyle = shade(f.body, 0.1); disc(c, 6, -8, 5.5);
  c.fillStyle = f.eye || '#f33'; disc(c, 8, -9.5, 1, false); disc(c, 10, -7.5, 1, false);
  if (f.glow) { c.save(); c.globalAlpha *= 0.5 + 0.3 * Math.sin(t / 220 + (f.ph || 0)); c.fillStyle = f.glow; disc(c, -9, -14, 3, false); disc(c, 6, -13, 2.4, false); c.restore(); }
}
/* many-legged crawlers: giant centipedes and carrion crawlers */
function drawCentipede(c, f, t) {
  const ph = f.ph || 0, segs = f.segs || 7, body = f.body;
  c.lineCap = 'round'; c.lineWidth = 1.2; c.strokeStyle = 'rgba(15,12,10,.9)';
  const pts = [];
  for (let i = 0; i < segs; i++) { const x = -18 + i * 5.6, y = -5 - Math.sin(t / 150 + ph + i * 0.9) * 1.6 - (i === segs - 1 ? 5 : 0) - (f.rear && i >= segs - 2 ? 4 : 0); pts.push([x, y]); }
  for (let i = 0; i < segs - 1; i++) {
    const [x, y] = pts[i], k = Math.sin(t / 90 + ph + i * 1.3) * 1.8;
    c.strokeStyle = shade(body, -0.35); c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2 + k, 0); c.stroke();
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 2 - k, 0.5); c.stroke();
  }
  c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineWidth = 1.2;
  for (let i = 0; i < segs; i++) { const [x, y] = pts[i], r = i === segs - 1 ? 4.8 : 4.2 - Math.abs(i - segs / 2) * 0.15; c.fillStyle = shade(body, i % 2 ? 0.08 : -0.05); disc(c, x, y, r); }
  const [hx, hy] = pts[segs - 1];
  if (f.tent) { c.strokeStyle = f.tent; c.lineWidth = 1.3; for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.36, w = Math.sin(t / 120 + i) * 2; c.beginPath(); c.moveTo(hx + 3, hy + 1); c.quadraticCurveTo(hx + 9 + w, hy - 3 + i, hx + 8 + Math.cos(a) * 8, hy + 2 + Math.sin(a) * 8); c.stroke(); } }
  else { c.strokeStyle = shade(body, -0.4); c.lineWidth = 1.2; c.beginPath(); c.moveTo(hx + 3, hy - 3); c.quadraticCurveTo(hx + 10, hy - 10, hx + 13, hy - 6); c.moveTo(hx + 3, hy - 1); c.quadraticCurveTo(hx + 11, hy - 4, hx + 14, hy); c.stroke(); }
  c.fillStyle = f.eye || '#f33'; disc(c, hx + 2, hy - 1.5, 1, false);
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

/* ---- figures for the wider bestiary ---- */
function tri(c, x1, y1, x2, y2, x3, y3) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill(); c.stroke(); }
function ell(c, x, y, rx, ry, rot, stroke) { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832); c.fill(); if (stroke !== false) c.stroke(); }
/* a leathery or feathered wing rooted at (x, y), raised by `up` and swept back by `back` */
function wing(c, x, y, back, up, col, flap, feather) {
  c.fillStyle = col; c.beginPath(); c.moveTo(x, y);
  c.quadraticCurveTo(x - back * 0.3, y - up * 1.1 - flap, x - back, y - up - flap);
  if (feather) { c.lineTo(x - back * 0.9, y - up * 0.55 - flap * 0.6); c.lineTo(x - back * 0.72, y - up * 0.62 - flap * 0.5); c.lineTo(x - back * 0.66, y - up * 0.25 - flap * 0.3); c.lineTo(x - back * 0.45, y - up * 0.3); }
  else { c.quadraticCurveTo(x - back * 0.78, y - up * 0.5, x - back * 0.8, y - up * 0.2 - flap * 0.4); c.quadraticCurveTo(x - back * 0.6, y - up * 0.42, x - back * 0.5, y - up * 0.05); c.quadraticCurveTo(x - back * 0.34, y - up * 0.3, x - back * 0.2, y + 1); }
  c.closePath(); c.fill(); c.stroke();
}
/* Four-legged beasts. f.head: cat | bear | boar | horse | bull | beak | croc | lizard | elephant | rhino | human.
   Options: long, bulk, leg (proportions), mane, horn, wings, feather, tail (tuft | thick | none | spike | snake | club),
   stripes, spots, spines, tent (shoulder tentacles), torso (a rider's body rising from the forequarters), heads (extra heads). */
function drawBeast(c, f, t) {
  const still = f.still, ph = f.ph || 0, b = still ? 0 : Math.sin(t / 190 + ph), g = still ? 0 : Math.sin(t / 190 + ph + 1.6);
  const body = f.body, dark = shade(body, -0.3), L = f.long || 1, H = f.bulk || 1, leg = f.leg || 10, head = f.head || 'cat';
  const by = -(leg + 6.5 * H) + b * 0.4, bw = 15 * L, bh = 7.5 * H, lw = 3.6 * Math.sqrt(H);
  c.lineWidth = 1.3; c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineCap = 'round'; c.lineJoin = 'round';
  if (f.wings) wing(c, 2, by - bh * 0.6, 26 * L, 22 * H, shade(f.wings, -0.25), b * 3 - 2, f.feather);
  seg(c, -bw * 0.6, by + 2, -bw * 0.72 + g * 2, 0, lw, dark); seg(c, bw * 0.55, by + 2, bw * 0.68 - g * 2, 0, lw, dark);
  if (f.legs8) { seg(c, -bw * 0.2, by + 2, -bw * 0.3 - g * 2, 0, lw, dark); seg(c, bw * 0.15, by + 2, bw * 0.25 + g * 2, 0, lw, dark); }
  const tx = -bw + 1, ty = by - 1;
  c.fillStyle = body;
  switch (f.tail || 'tuft') {
    case 'thick': c.beginPath(); c.moveTo(tx + 3, ty - 4 * H); c.quadraticCurveTo(tx - 16, ty + 2 + b, tx - 22, -1); c.quadraticCurveTo(tx - 10, ty + 6, tx + 3, ty + 4 * H); c.closePath(); c.fill(); c.stroke(); break;
    case 'none': break;
    case 'spike': case 'snake': case 'club': case 'tuft': {
      c.save(); c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineWidth = 4.2; c.beginPath(); c.moveTo(tx + 2, ty); c.quadraticCurveTo(tx - 12, ty - 2 + b, tx - 13, ty - 14 + b * 2); c.stroke();
      c.strokeStyle = f.tail === 'snake' ? '#5a7a3a' : body; c.lineWidth = 2.6; c.beginPath(); c.moveTo(tx + 2, ty); c.quadraticCurveTo(tx - 12, ty - 2 + b, tx - 13, ty - 14 + b * 2); c.stroke(); c.restore();
      const ex = tx - 13, ey = ty - 14 + b * 2;
      if (f.tail === 'tuft') { c.fillStyle = f.mane || dark; disc(c, ex, ey - 1, 2.6); }
      else if (f.tail === 'spike') { c.fillStyle = '#e9e2cf'; for (let i = -1; i <= 1; i++) tri(c, ex - 2, ey, ex + i * 5, ey - 9, ex + 2, ey); }
      else if (f.tail === 'club') { c.fillStyle = dark; disc(c, ex, ey - 1, 4); }
      else { c.fillStyle = '#5a7a3a'; ell(c, ex + 1, ey - 2, 3.4, 2.4, -0.5); c.fillStyle = '#f33'; disc(c, ex + 2, ey - 2.5, 0.8, false); }
    }
  }
  c.fillStyle = body; ell(c, 0, by, bw, bh, -0.04);
  c.fillStyle = f.belly || shade(body, 0.22); ell(c, 0, by + bh * 0.45, bw * 0.7, bh * 0.35, 0, false);
  if (f.stripes) { c.save(); c.strokeStyle = f.stripes; c.lineWidth = 1.6; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * bw * 0.24, by - bh * 0.85); c.quadraticCurveTo(i * bw * 0.24 + 2, by - bh * 0.2, i * bw * 0.24 - 1, by + bh * 0.3); c.stroke(); } c.restore(); }
  if (f.spots) { c.fillStyle = f.spots; for (const [sx, sy] of [[-0.5, -0.3], [-0.15, -0.5], [0.25, -0.2], [-0.3, 0.15], [0.5, -0.45]]) disc(c, sx * bw, by + sy * bh, 1.5 * Math.sqrt(H), false); }
  if (f.spines) { c.fillStyle = f.spines; for (let i = -3; i <= 3; i++) tri(c, i * bw * 0.24 - 2.5, by - bh * 0.86, i * bw * 0.24, by - bh - 5 * H, i * bw * 0.24 + 2.5, by - bh * 0.86); }
  seg(c, -bw * 0.45, by + 2, -bw * 0.4 - g * 2, 0, lw + 0.4, body); seg(c, bw * 0.7, by + 2, bw * 0.76 + g * 2, 0, lw + 0.4, body);
  if (f.legs8) { seg(c, -bw * 0.05, by + 2, 0 + g * 2, 0, lw + 0.4, body); seg(c, bw * 0.35, by + 2, bw * 0.4 - g * 2, 0, lw + 0.4, body); }
  if (f.tent) { c.save(); c.strokeStyle = f.tent; c.lineWidth = 2; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(bw * 0.4, by - bh * 0.7); c.quadraticCurveTo(bw * 0.2 + k * 6, by - bh - 16 + b * 2 * k, bw * 0.75 + k * 5, by - bh - 13 - b * 2 * k); c.stroke(); } c.restore(); }
  if (f.torso) { // centaur and its kind: a rider's body grows where the neck would be
    const sx = bw * 0.78, sy = by - bh * 0.5;
    c.fillStyle = f.torso; rbox(c, sx - 5, sy - 19, 10, 20, 4);
    seg(c, sx + 3, sy - 15, sx + 10, sy - 8, 3, f.torso);
    c.fillStyle = f.skin || '#d8a47f'; disc(c, sx + 1, sy - 24, 5.4);
    if (f.hair) { c.fillStyle = f.hair; c.beginPath(); c.arc(sx + 1, sy - 25, 5.7, Math.PI * 0.9, Math.PI * 2.05); c.closePath(); c.fill(); c.stroke(); }
    c.fillStyle = '#1a1512'; disc(c, sx + 3.5, sy - 24.5, 0.9, false);
    seg(c, sx + 10, sy + 2, sx + 13, sy - 30, 1.6, '#7a5230');
    return;
  }
  const heads = f.heads || 1;
  for (let k = heads - 1; k >= 0; k--) {
    const up = (f.neck || 0) + k * 9, hx = bw + 4 - k * 5 + (head === 'croc' ? 2 : 0), hy = by - bh * 0.55 - up + b * 0.5 + (head === 'croc' || head === 'lizard' ? bh * 0.5 : 0);
    c.fillStyle = body; c.beginPath(); c.moveTo(bw * 0.55, by - bh * 0.7); c.lineTo(hx - 3, hy - 4); c.lineTo(hx + 1, hy + 4); c.lineTo(bw * 0.8, by + bh * 0.2); c.closePath(); c.fill(); c.stroke();
    if (f.mane && head !== 'horse') { c.fillStyle = f.mane; disc(c, hx - 3, hy, 8.2); }
    if (f.mane && head === 'horse') { c.fillStyle = f.mane; c.beginPath(); c.moveTo(bw * 0.5, by - bh * 0.75); c.lineTo(hx - 5, hy - 6); c.lineTo(hx - 1, hy - 5); c.lineTo(bw * 0.72, by - bh * 0.6); c.closePath(); c.fill(); c.stroke(); }
    c.fillStyle = body;
    if (head === 'elephant') {
      c.fillStyle = dark; ell(c, hx - 5, hy - 1, 7, 9, 0.2); c.fillStyle = body; disc(c, hx, hy, 8);
      c.save(); c.lineWidth = 5.4; c.strokeStyle = 'rgba(15,12,10,.9)'; c.beginPath(); c.moveTo(hx + 6, hy + 2); c.quadraticCurveTo(hx + 13, hy + 8, hx + 10 + b, -3); c.stroke(); c.lineWidth = 3.6; c.strokeStyle = body; c.beginPath(); c.moveTo(hx + 6, hy + 2); c.quadraticCurveTo(hx + 13, hy + 8, hx + 10 + b, -3); c.stroke(); c.restore();
      c.fillStyle = '#f1ead8'; tri(c, hx + 3, hy + 5, hx + 14, hy + 9, hx + 5, hy + 8);
    } else if (head === 'croc' || head === 'lizard') {
      const jl = head === 'croc' ? 15 : 10;
      c.beginPath(); c.moveTo(hx - 5, hy - 4); c.lineTo(hx + jl, hy - 1.5); c.lineTo(hx + jl, hy + 2); c.lineTo(hx - 5, hy + 4.5); c.closePath(); c.fill(); c.stroke();
      c.save(); c.strokeStyle = '#f1ead8'; c.lineWidth = 1; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(hx + 2 + i * 3, hy + 1.6); c.lineTo(hx + 3 + i * 3, hy + 3.6); c.stroke(); } c.restore();
    } else if (head === 'horse') {
      ell(c, hx + 3, hy + 1, 7.5, 4, 0.5); tri(c, hx - 2, hy - 3, hx - 1, hy - 9, hx + 2, hy - 3);
    } else if (head === 'beak') {
      disc(c, hx, hy, 5.8); c.fillStyle = f.beak || '#e3b23c'; tri(c, hx + 4, hy - 2.5, hx + 13, hy + 1.5, hx + 4, hy + 3);
      if (f.earTuft) { c.fillStyle = dark; tri(c, hx - 3, hy - 4, hx - 4, hy - 11, hx, hy - 5); }
    } else if (head === 'human') {
      c.fillStyle = f.skin || '#d8a47f'; disc(c, hx, hy, 5.6);
      if (f.hair) { c.fillStyle = f.hair; c.beginPath(); c.arc(hx, hy - 1, 5.9, Math.PI * 0.9, Math.PI * 2.05); c.closePath(); c.fill(); c.stroke(); }
    } else {
      ell(c, hx, hy, 6.2, 5.2, 0.1);
      if (head === 'bear') { disc(c, hx - 3.5, hy - 4.5, 2.2); c.fillStyle = shade(body, 0.2); ell(c, hx + 5.5, hy + 1.5, 3.6, 2.6); }
      else if (head === 'boar') { c.fillStyle = shade(body, 0.12); c.beginPath(); c.moveTo(hx + 3, hy - 2); c.lineTo(hx + 11, hy); c.lineTo(hx + 11, hy + 3.5); c.lineTo(hx + 3, hy + 4); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#f1ead8'; tri(c, hx + 6, hy + 3, hx + 8, hy - 3, hx + 9, hy + 3); c.fillStyle = dark; tri(c, hx - 3, hy - 4, hx - 4, hy - 9, hx, hy - 4.5); }
      else if (head === 'bull' || head === 'rhino') { c.fillStyle = shade(body, 0.12); ell(c, hx + 5.5, hy + 2, 4, 3); }
      else { c.fillStyle = dark; tri(c, hx - 4, hy - 3.5, hx - 4, hy - 9, hx - 0.5, hy - 4.6); c.fillStyle = shade(body, 0.18); ell(c, hx + 4.8, hy + 1.6, 3, 2.3); }
    }
    if (head === 'bull' || f.horn === 'pair') { c.fillStyle = '#e9e2cf'; c.beginPath(); c.moveTo(hx - 2, hy - 4); c.quadraticCurveTo(hx - 4, hy - 13, hx + 5, hy - 12); c.quadraticCurveTo(hx, hy - 10, hx + 2, hy - 4); c.closePath(); c.fill(); c.stroke(); }
    if (f.horn === 'one' || head === 'rhino') { c.fillStyle = '#f1ead8'; if (head === 'rhino') tri(c, hx + 6, hy - 1, hx + 10, hy - 10, hx + 9, hy); else tri(c, hx + 1, hy - 4, hx + 8, hy - 17, hx + 4, hy - 4); }
    if (head !== 'human') { c.fillStyle = f.eye || '#ffcf4a'; disc(c, hx + 2, hy - 1.4, 1.2, false); } else { c.fillStyle = '#1a1512'; disc(c, hx + 2.4, hy - 0.6, 0.9, false); }
    if (f.glow) { c.save(); c.globalAlpha *= 0.5 + 0.3 * Math.sin(t / 200 + ph); c.fillStyle = f.glow; disc(c, hx + 8, hy + 2, 3, false); c.restore(); }
  }
}
/* Dragons and their kin: f.belly, f.wings (colour, or false for none), f.heads, f.sting (wyvern), f.horn (colour), f.frill */
function drawDragon(c, f, t) {
  const still = f.still, ph = f.ph || 0, b = still ? 0 : Math.sin(t / 240 + ph), g = still ? 0 : Math.sin(t / 240 + ph + 1.6);
  const body = f.body, dark = shade(body, -0.32), belly = f.belly || shade(body, 0.3);
  c.lineWidth = 1.3; c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineCap = 'round'; c.lineJoin = 'round';
  if (f.wings !== false) wing(c, -1, -19, 30, 26, shade(f.wings || body, -0.3), b * 3 - 3);
  // tail
  c.fillStyle = body; c.beginPath(); c.moveTo(-9, -19); c.quadraticCurveTo(-26, -20 + b, -31, -6 + b); c.quadraticCurveTo(-33, 0, -27, -1); c.quadraticCurveTo(-22, -9, -9, -8); c.closePath(); c.fill(); c.stroke();
  if (f.sting) { c.fillStyle = '#e9e2cf'; tri(c, -31, -5 + b, -38, -9 + b, -30, -1 + b); }
  seg(c, -6, -9, -9 + g * 1.5, 0, 4.2, dark); seg(c, 8, -9, 10 - g * 1.5, 0, 4.2, dark);
  c.fillStyle = body; ell(c, 0, -14 + b * 0.4, 13, 8, -0.08);
  c.fillStyle = belly; ell(c, 1, -10.5 + b * 0.4, 9, 3.4, 0, false);
  if (f.frill !== false) { c.fillStyle = f.horn || dark; for (let i = -2; i <= 2; i++) tri(c, i * 4.5 - 2, -20.5, i * 4.5, -25.5, i * 4.5 + 2, -20.5); }
  seg(c, -3, -9, -2 - g * 1.5, 0, 4.6, body); seg(c, 10, -9, 12 + g * 1.5, 0, 4.6, body);
  if (f.wings !== false) wing(c, 2, -18, 26, 30, f.wings || body, b * 4 - 1);
  const heads = f.heads || 1;
  for (let k = heads - 1; k >= 0; k--) {
    const sp = heads > 1 ? (k - (heads - 1) / 2) : 0, hx = 22 + sp * 3.5, hy = -37 + b * 1.2 - Math.abs(sp) * -3 + sp * 6 + (still ? 0 : Math.sin(t / 300 + k * 1.7) * 1.2);
    c.save(); c.lineWidth = 8; c.strokeStyle = 'rgba(15,12,10,.9)'; c.beginPath(); c.moveTo(9, -16); c.quadraticCurveTo(14 + sp * 2, -30 + sp * 4, hx - 3, hy + 2); c.stroke();
    c.lineWidth = 5.6; c.strokeStyle = body; c.beginPath(); c.moveTo(9, -16); c.quadraticCurveTo(14 + sp * 2, -30 + sp * 4, hx - 3, hy + 2); c.stroke(); c.restore();
    c.fillStyle = body; c.beginPath(); c.moveTo(hx - 5, hy - 4); c.lineTo(hx + 4, hy - 4.5); c.lineTo(hx + 12, hy - 0.5); c.lineTo(hx + 12, hy + 2.5); c.lineTo(hx - 4, hy + 4.5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = f.horn || '#e9e2cf'; tri(c, hx - 4, hy - 3.5, hx - 11, hy - 9, hx - 1, hy - 4.4);
    c.fillStyle = f.eye || '#ffd24a'; disc(c, hx + 2.5, hy - 1.5, 1.3, false);
    c.save(); c.strokeStyle = '#f1ead8'; c.lineWidth = 1; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(hx + 5 + i * 2.4, hy + 2.6); c.lineTo(hx + 5.6 + i * 2.4, hy + 4.4); c.stroke(); } c.restore();
    if (f.glow) { c.save(); c.globalAlpha *= 0.45 + 0.3 * Math.sin(t / 180 + ph + k); c.fillStyle = f.glow; disc(c, hx + 13, hy + 2, 2.6, false); c.restore(); }
  }
}
/* Oozes, fungi, elementals and other shapeless things. f.shape: mound | cube | cap | pillar | flame | whirl.
   Options: alpha, eye (colour), tent (colour), arms (a shambling heap), spots. */
function drawBlob(c, f, t) {
  const still = f.still, ph = f.ph || 0, b = still ? 0 : Math.sin(t / 300 + ph), body = f.body, shp = f.shape || 'mound';
  c.lineWidth = 1.3; c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineJoin = 'round'; c.lineCap = 'round';
  c.save(); if (f.alpha) c.globalAlpha *= f.alpha;
  const gr = c.createLinearGradient(-14, -30, 14, 0); gr.addColorStop(0, shade(body, 0.28)); gr.addColorStop(1, shade(body, -0.3)); c.fillStyle = gr;
  if (shp === 'cube') { rbox(c, -15, -30 + b * 0.6, 30, 30 - b * 0.6, 3); c.fillStyle = shade(body, 0.4); c.globalAlpha *= 0.5; c.fillRect(-11, -26, 5, 18); }
  else if (shp === 'cap') { c.fillStyle = f.stalk || '#d9d2bf'; rbox(c, -4, -20, 8, 20, 3); c.fillStyle = gr; c.beginPath(); c.moveTo(-16, -17 + b * 0.5); c.quadraticCurveTo(0, -42 + b, 16, -17 + b * 0.5); c.quadraticCurveTo(0, -12, -16, -17 + b * 0.5); c.closePath(); c.fill(); c.stroke(); }
  else if (shp === 'pillar') { c.beginPath(); c.moveTo(-10, 0); c.quadraticCurveTo(-9, -30, -4, -44 + b); c.quadraticCurveTo(0, -48 + b, 4, -44 + b); c.quadraticCurveTo(9, -30, 10, 0); c.closePath(); c.fill(); c.stroke(); }
  else if (shp === 'flame') { for (const [k, col] of [[1, body], [0.62, shade(body, 0.45)], [0.3, '#fff6c8']]) { c.fillStyle = col; c.beginPath(); c.moveTo(-12 * k, 0); c.quadraticCurveTo(-17 * k, -18 * k, -5 * k + b * 2, -30 * k); c.quadraticCurveTo(-2 * k, -40 * k - b * 2, 2 * k + b, -48 * k); c.quadraticCurveTo(5 * k, -34 * k, 9 * k - b * 2, -30 * k); c.quadraticCurveTo(17 * k, -16 * k, 12 * k, 0); c.closePath(); c.fill(); if (k === 1) c.stroke(); } }
  else if (shp === 'whirl') { for (let i = 0; i < 6; i++) { c.fillStyle = shade(body, 0.1 * (i % 2 ? 1 : -1) + 0.15); ell(c, Math.sin(t / 140 + ph + i) * (still ? 0 : 2.4), -3 - i * 8, 4 + i * 2.6, 4, 0); } }
  else { c.beginPath(); c.moveTo(-17, 0); c.quadraticCurveTo(-19, -15 + b, -9 - b, -20 + b); c.quadraticCurveTo(-1, -29 - b * 1.5, 7, -21 + b); c.quadraticCurveTo(18 + b, -15, 17, 0); c.closePath(); c.fill(); c.stroke(); }
  c.restore();
  if (f.spots) { c.fillStyle = f.spots; for (const [sx, sy] of [[-7, -9], [3, -14], [8, -6], [-2, -5]]) disc(c, sx, sy + b * 0.5, 1.8, false); }
  if (f.arms) { seg(c, -11, -16, -19, -8 + b * 2, 4.5, shade(body, -0.15)); seg(c, 11, -16, 20, -9 - b * 2, 4.5, shade(body, -0.1)); }
  if (f.tent) { c.save(); c.strokeStyle = f.tent; c.lineWidth = 1.8; for (let i = 0; i < 5; i++) { const a = -2.6 + i * 0.55, w = still ? 0 : Math.sin(t / 150 + i * 1.3) * 3; c.beginPath(); c.moveTo(Math.cos(a) * 6, -22 + Math.sin(a) * 6); c.quadraticCurveTo(Math.cos(a) * 16 + w, -24 + Math.sin(a) * 14, Math.cos(a) * 24, -14 + Math.sin(a) * 16 - w); c.stroke(); } c.restore(); }
  if (f.eye) { const ey = shp === 'pillar' ? -34 : shp === 'cap' ? -22 : shp === 'cube' ? -17 : -13; c.fillStyle = '#f4f1e6'; disc(c, 2, ey + b * 0.5, 3.4); c.fillStyle = f.eye; disc(c, 3, ey + b * 0.5, 1.6, false); }
  if (f.glow) { c.save(); c.globalAlpha *= 0.35 + 0.2 * Math.sin(t / 200 + ph); const g2 = c.createRadialGradient(0, -18, 0, 0, -18, 26); g2.addColorStop(0, f.glow); g2.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g2; c.beginPath(); c.arc(0, -18, 26, 0, 6.3); c.fill(); c.restore(); }
}
/* Serpents and worms. Options: hood (cobra), human (a naga's face: skin, hair), maw (a worm's ring of teeth), spines, heads (two-ended), belly. */
function drawSnake(c, f, t) {
  const still = f.still, ph = f.ph || 0, body = f.body, w = f.thick || 5;
  c.lineCap = 'round'; c.lineJoin = 'round';
  const pts = []; for (let i = 0; i <= 12; i++) { const x = -24 + i * 3.2; pts.push([x, -w / 2 - 1 - Math.abs(Math.sin(i * 0.8 + (still ? 0 : t / 260) + ph)) * 5]); }
  const b = still ? 0 : Math.sin(t / 300 + ph), hx = 17 + b, hy = -27 + b;
  const path = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) c.lineTo(x, y); c.quadraticCurveTo(21, -12, hx - 1, hy + 2); };
  c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineWidth = w + 2.4; path(); c.stroke();
  c.strokeStyle = body; c.lineWidth = w; path(); c.stroke();
  if (f.belly) { c.strokeStyle = f.belly; c.lineWidth = w * 0.3; c.setLineDash([3, 4]); path(); c.stroke(); c.setLineDash([]); }
  c.lineWidth = 1.3; c.strokeStyle = 'rgba(15,12,10,.9)';
  if (f.spines) { c.fillStyle = f.spines; for (let i = 2; i < 12; i += 2) tri(c, pts[i][0] - 2, pts[i][1] - w / 2, pts[i][0], pts[i][1] - w / 2 - 6, pts[i][0] + 2, pts[i][1] - w / 2); }
  if (f.heads === 2) { c.fillStyle = body; ell(c, pts[0][0] - 3, pts[0][1] - 1, w * 0.9, w * 0.7, 0); c.fillStyle = '#f33'; disc(c, pts[0][0] - 4, pts[0][1] - 2, 0.9, false); }
  if (f.hood) { c.fillStyle = f.hood; ell(c, hx - 2, hy + 3, w * 1.5, w * 1.9, 0.2); }
  if (f.human) { c.fillStyle = f.skin || '#d8a47f'; disc(c, hx + 1, hy - 1, w + 1.2); if (f.hair) { c.fillStyle = f.hair; c.beginPath(); c.arc(hx + 1, hy - 2, w + 1.5, Math.PI * 0.9, Math.PI * 2.05); c.closePath(); c.fill(); c.stroke(); } c.fillStyle = '#1a1512'; disc(c, hx + 3.5, hy - 1, 1, false); return; }
  c.fillStyle = body;
  if (f.maw) { disc(c, hx + 1, hy - 1, w + 1.5); c.fillStyle = '#3a0d14'; disc(c, hx + 3, hy - 1, w * 0.7); c.fillStyle = '#f1ead8'; for (let i = 0; i < 6; i++) { const a = i * 1.05; tri(c, hx + 3 + Math.cos(a) * w * 0.7, hy - 1 + Math.sin(a) * w * 0.7, hx + 3 + Math.cos(a + 0.2) * w * 0.25, hy - 1 + Math.sin(a + 0.2) * w * 0.25, hx + 3 + Math.cos(a + 0.4) * w * 0.7, hy - 1 + Math.sin(a + 0.4) * w * 0.7); } return; }
  ell(c, hx + 2, hy - 1, w * 1.15, w * 0.8, -0.2);
  c.fillStyle = f.eye || '#ffd24a'; disc(c, hx + 3, hy - 2, 1.1, false);
  c.save(); c.strokeStyle = '#d33'; c.lineWidth = 1; c.beginPath(); c.moveTo(hx + 2 + w, hy); c.lineTo(hx + 7 + w, hy + 1 + b); c.stroke(); c.restore();
}
/* Floating things: beholders, gas spores, will-o'-wisps. Options: eye, stalks, maw, glow, alpha. */
function drawOrb(c, f, t) {
  const still = f.still, ph = f.ph || 0, b = still ? 0 : Math.sin(t / 320 + ph) * 2, body = f.body, r = f.r || 13, cy = -26 + b;
  c.lineWidth = 1.3; c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineCap = 'round';
  if (f.glow) { c.save(); c.globalAlpha *= 0.5 + 0.25 * Math.sin(t / 150 + ph); const g = c.createRadialGradient(0, cy, 0, 0, cy, r * 2.2); g.addColorStop(0, '#fff'); g.addColorStop(0.3, f.glow); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, cy, r * 2.2, 0, 6.3); c.fill(); c.restore(); }
  if (f.stalks) for (let i = 0; i < f.stalks; i++) { const a = -Math.PI * 0.92 + i * (Math.PI * 0.84 / Math.max(1, f.stalks - 1)), w = still ? 0 : Math.sin(t / 170 + i * 1.4) * 2, ex = Math.cos(a) * (r + 9) + w, ey = cy + Math.sin(a) * (r + 9); seg(c, Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, ex, ey, 2, shade(body, -0.15)); c.fillStyle = '#f4f1e6'; disc(c, ex, ey, 2.4); c.fillStyle = '#1a1512'; disc(c, ex + 0.6, ey, 1, false); }
  c.save(); if (f.alpha) c.globalAlpha *= f.alpha;
  const gr = c.createRadialGradient(-r * 0.3, cy - r * 0.4, 1, 0, cy, r); gr.addColorStop(0, shade(body, 0.3)); gr.addColorStop(1, shade(body, -0.3)); c.fillStyle = gr; disc(c, 0, cy, r, !f.glow || !!f.eye);
  c.restore();
  if (f.eye) { c.fillStyle = '#f4f1e6'; ell(c, 3, cy - 2, r * 0.48, r * 0.4, 0); c.fillStyle = f.eye; disc(c, 4.5, cy - 2, r * 0.22, false); c.fillStyle = '#111'; disc(c, 5, cy - 2, r * 0.1, false); }
  if (f.maw) { c.fillStyle = '#3a0d14'; c.beginPath(); c.moveTo(-r * 0.5, cy + r * 0.42); c.quadraticCurveTo(2, cy + r * 0.95, r * 0.75, cy + r * 0.35); c.quadraticCurveTo(2, cy + r * 0.6, -r * 0.5, cy + r * 0.42); c.closePath(); c.fill(); c.stroke(); c.save(); c.strokeStyle = '#f1ead8'; c.lineWidth = 1; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(-r * 0.3 + i * r * 0.22, cy + r * 0.5); c.lineTo(-r * 0.25 + i * r * 0.22, cy + r * 0.64); c.stroke(); } c.restore(); }
}
/* Birds and other fliers. Options: beak, bat (leathery wings, ears), human (a harpy's face), comb, antlers, tail (snake), long (a stirge's snout). */
function drawBird(c, f, t) {
  const still = f.still, ph = f.ph || 0, b = still ? 0 : Math.sin(t / 130 + ph), body = f.body, dark = shade(body, -0.3), hov = f.bat || f.long ? -10 : 0;
  c.lineWidth = 1.3; c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineCap = 'round'; c.lineJoin = 'round';
  c.translate(0, hov + (hov ? b : 0));
  wing(c, -1, -17, 22, 16, dark, b * 5, !f.bat);
  if (!hov) { seg(c, -2, -8, -3, 0, 1.8, f.beak || '#e3b23c'); seg(c, 4, -8, 5, 0, 1.8, f.beak || '#e3b23c'); }
  if (f.tail === 'snake') { c.save(); c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineWidth = 4; c.beginPath(); c.moveTo(-9, -12); c.quadraticCurveTo(-22, -10, -24, -20 + b); c.stroke(); c.strokeStyle = '#5a7a3a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-9, -12); c.quadraticCurveTo(-22, -10, -24, -20 + b); c.stroke(); c.restore(); }
  else { c.fillStyle = dark; tri(c, -9, -15, -22, -11, -9, -9); }
  c.fillStyle = body; ell(c, 0, -14, 11, 7.5, -0.25);
  c.fillStyle = f.belly || shade(body, 0.25); ell(c, 2, -11.5, 7, 3.6, -0.2, false);
  wing(c, 2, -17, 20, 22, f.wings || body, b * 6, !f.bat);
  const hx = 11, hy = -23;
  if (f.human) { c.fillStyle = f.skin || '#d8a47f'; disc(c, hx, hy, 5.2); c.fillStyle = f.hair || '#3a2a1a'; c.beginPath(); c.arc(hx, hy - 1, 5.5, Math.PI * 0.85, Math.PI * 2.05); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#1a1512'; disc(c, hx + 2.4, hy - 0.4, 0.9, false); return; }
  c.fillStyle = body; disc(c, hx, hy, 5);
  if (f.bat) { c.fillStyle = dark; tri(c, hx - 4, hy - 3, hx - 4, hy - 10, hx - 0.5, hy - 4.5); tri(c, hx + 1, hy - 4.5, hx + 3, hy - 10, hx + 4, hy - 3); }
  if (f.comb) { c.fillStyle = f.comb; tri(c, hx - 3, hy - 4, hx, hy - 10, hx + 3, hy - 4); }
  if (f.antlers) { c.save(); c.strokeStyle = '#e9e2cf'; c.lineWidth = 1.6; for (const k of [-1, 1]) { c.beginPath(); c.moveTo(hx + k, hy - 4); c.lineTo(hx + k * 5, hy - 13); c.moveTo(hx + k * 3, hy - 9); c.lineTo(hx + k * 8, hy - 10); c.stroke(); } c.restore(); }
  if (f.long) seg(c, hx + 4, hy + 1, hx + 15, hy + 5, 1.6, f.beak || '#c9a27a');
  else if (!f.bat) { c.fillStyle = f.beak || '#e3b23c'; tri(c, hx + 3.5, hy - 2, hx + 11, hy + 1.5, hx + 3.5, hy + 2.5); }
  c.fillStyle = f.eye || '#111'; disc(c, hx + 1.8, hy - 1, 1.1, false);
}
/* Beetles, ants, wasps and scorpions. Options: shell (colour of the wing cases), sting, claws, wingsBug, horn, glow, thin (ant). */
function drawBug(c, f, t) {
  const still = f.still, ph = f.ph || 0, b = still ? 0 : Math.sin(t / 120 + ph), body = f.body, dark = shade(body, -0.35);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = '#141216'; c.lineWidth = 1.8;
  for (let i = 0; i < 3; i++) { const x = -7 + i * 7, k = (i % 2 ? b : -b) * 1.4; c.beginPath(); c.moveTo(x, -8); c.lineTo(x - 3 + k, -13); c.lineTo(x - 5 + k, 0); c.stroke(); c.beginPath(); c.moveTo(x + 2, -7); c.lineTo(x + 6 - k, -11); c.lineTo(x + 8 - k, 0); c.stroke(); }
  c.lineWidth = 1.3; c.strokeStyle = 'rgba(15,12,10,.9)';
  if (f.wingsBug) { c.save(); c.globalAlpha *= 0.55; c.fillStyle = '#dfe8f2'; ell(c, -6, -19 - b * 2, 11, 3.6, 0.5); ell(c, -2, -20 + b * 2, 11, 3.6, 0.25); c.restore(); }
  if (f.sting) { c.save(); c.strokeStyle = 'rgba(15,12,10,.9)'; c.lineWidth = 5; c.beginPath(); c.moveTo(-12, -9); c.quadraticCurveTo(-24, -14, -18, -27 + b); c.quadraticCurveTo(-12, -33 + b, -7, -27 + b); c.stroke(); c.strokeStyle = body; c.lineWidth = 3.2; c.beginPath(); c.moveTo(-12, -9); c.quadraticCurveTo(-24, -14, -18, -27 + b); c.quadraticCurveTo(-12, -33 + b, -7, -27 + b); c.stroke(); c.restore(); c.fillStyle = '#e9e2cf'; tri(c, -8, -29 + b, -2, -24 + b, -8, -24 + b); }
  if (f.thin) { c.fillStyle = body; ell(c, -9, -9, 6.5, 5); disc(c, 0, -9, 3.6); ell(c, 8, -10, 5, 4.2); }
  else { c.fillStyle = f.shell || body; ell(c, -3, -10, 12, 7.5, 0); c.save(); c.strokeStyle = dark; c.lineWidth = 1; c.beginPath(); c.moveTo(-14, -10.5); c.lineTo(8, -10.5); c.stroke(); c.restore(); c.fillStyle = dark; ell(c, 10, -9, 5, 4.4); }
  if (f.spots) { c.fillStyle = f.spots; disc(c, -7, -13, 1.7, false); disc(c, 0, -13.5, 1.7, false); disc(c, -4, -7.5, 1.5, false); }
  if (f.claws) { c.fillStyle = body; for (const k of [-1, 1]) { seg(c, 12, -9 + k, 19, -10 + k * 5, 2.2, body); ell(c, 22, -10.5 + k * 6, 3.8, 2.4, k * 0.3); } }
  else { c.save(); c.strokeStyle = dark; c.lineWidth = 1.8; c.beginPath(); c.moveTo(13, -10); c.quadraticCurveTo(19, -15, 20, -9); c.moveTo(13, -8); c.quadraticCurveTo(19, -3, 20, -8); c.stroke(); c.restore(); }
  if (f.horn) { c.fillStyle = dark; tri(c, 11, -12, 19, -22, 14, -11); }
  c.fillStyle = f.eye || '#f33'; disc(c, 12, -10.5, 1, false);
  if (f.glow) { c.save(); c.globalAlpha *= 0.5 + 0.3 * Math.sin(t / 220 + ph); c.fillStyle = f.glow; disc(c, -8, -12, 3, false); disc(c, 2, -12, 2.6, false); c.restore(); }
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
  if (f.type && f.s && f.s !== 1) c.scale(f.s, f.s); // beasts are drawn at their own scale
  if (f.type === 'rat') drawRat(c, ff, o.down ? 0 : t);
  else if (f.type === 'spider') drawSpider(c, ff, o.down ? 0 : t);
  else if (f.type === 'wolf') drawWolf(c, ff, o.down ? 0 : t);
  else if (f.type === 'centipede') drawCentipede(c, ff, o.down ? 0 : t);
  else if (FIG_TYPES[f.type]) FIG_TYPES[f.type](c, ff, o.down ? 0 : t);
  else drawHum(c, ff, t);
  c.restore();
}

const FIG_TYPES = { beast: drawBeast, dragon: drawDragon, blob: drawBlob, snake: drawSnake, orb: drawOrb, bird: drawBird, bug: drawBug };

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
  const s = fig.s || 1, big = fig.ps || (s > 1.1 ? Math.max(0.42, (fig.type ? 0.9 : 0.88) / s) : 1); // large creatures are drawn smaller so they fit the frame
  drawFig(c, Object.assign({}, fig, { still: true }), 30, fig.type ? 44 : 60, 0, { scale: big, noShadow: false });
  return cv;
}
