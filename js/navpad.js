'use strict';
/* ============================================================
   On-screen movement pad for tablets and phones: large, faint
   buttons over the bottom corners of the view. Can sit on the
   left, the right or both sides, or be switched off; the choice
   is remembered on this device.
   ============================================================ */
const Nav = (() => {
  const KEY = 'emberfall.navpad', MODES = ['off', 'right', 'left', 'both'];
  const LABEL = { off: 'Off', right: 'Right', left: 'Left', both: 'Both sides' };
  let mode = 'off', root = null, shown = '';
  try { mode = localStorage.getItem(KEY) || (window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'right' : 'off'); } catch (e) { /* storage unavailable */ }
  if (!MODES.includes(mode)) mode = 'off';

  // dungeon and town: turn / forward / turn above, sidestep / back / sidestep below
  const EXPLORE = [
    ['↶', 'Turn left', () => turn(-1)], ['▲', 'Forward', () => move(1, 0)], ['↷', 'Turn right', () => turn(1)],
    ['⇤', 'Step left', () => move(0, -1)], ['▼', 'Back', () => move(-1, 0)], ['⇥', 'Step right', () => move(0, 1)],
  ];
  // overland: the eight compass directions around a button that visits the place you stand on
  const WILD = [
    ['↖', 'North-west', () => wildMove(-1, -1)], ['↑', 'North', () => wildMove(0, -1)], ['↗', 'North-east', () => wildMove(1, -1)],
    ['←', 'West', () => wildMove(-1, 0)], ['◎', 'Visit this place', () => { const b = UI.cmdKey('enter'); if (b && !busy()) b.click(); }, true], ['→', 'East', () => wildMove(1, 0)],
    ['↙', 'South-west', () => wildMove(-1, 1)], ['↓', 'South', () => wildMove(0, 1)], ['↘', 'South-east', () => wildMove(1, 1)],
  ];

  function button([glyph, title, fn, once]) {
    const b = h('button', { class: 'navbtn', title, 'aria-label': title, text: glyph });
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } b.classList.remove('down'); };
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); stop();
      if (!G || modals.length || Combat.active) return;
      b.classList.add('down'); fn();
      if (!once) timer = setInterval(() => { if (modals.length || Combat.active) stop(); else fn(); }, 110); // holding repeats the step
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    b.addEventListener('contextmenu', e => e.preventDefault());
    return b;
  }
  function pad(side, wild) {
    return h('div', { class: 'navpad ' + side + (wild ? ' wild' : '') }, (wild ? WILD : EXPLORE).map(button));
  }
  function render() {
    if (!root) return;
    const wild = typeof isWild === 'function' && X.def && isWild(), key = mode + (wild ? ':w' : ':e');
    if (key === shown) return;
    shown = key;
    const kids = [h('button', { class: 'navtoggle' + (mode === 'off' ? ' off' : ''), title: 'Touch controls: ' + LABEL[mode] + '. Tap to change.', 'aria-label': 'Touch controls', text: '✥', onclick: cycle })];
    if (mode === 'left' || mode === 'both') kids.push(pad('left', wild));
    if (mode === 'right' || mode === 'both') kids.push(pad('right', wild));
    root.replaceChildren(...kids);
  }
  function set(m) {
    mode = MODES.includes(m) ? m : 'off';
    try { localStorage.setItem(KEY, mode); } catch (e) { /* storage unavailable */ }
    render();
  }
  function cycle() {
    set(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
    if (typeof log === 'function') log('Touch controls: ' + LABEL[mode].toLowerCase() + '.', 'dim');
  }
  function init(el) { root = el; render(); }
  return { init, refresh: render, set, cycle, get mode() { return mode; }, get label() { return LABEL[mode]; } };
})();
