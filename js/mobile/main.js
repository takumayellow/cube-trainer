/**
 * mobile/main.js — the tab bar, and which tab hears what
 *
 * One tab is on screen at a time. Switching unmounts the old one (the scanner
 * lets go of the camera there) and mounts the new one into the same <main>.
 * The tab is kept in the URL hash, so reloading or sharing a link lands on it.
 *
 * Depends on: store.js, coach.js, scanner.js, shortest.js, dictionary.js, two-phase.js
 */

(function () {
  'use strict';

  const TABS = {
    coach: () => window.Coach,
    scan: () => window.Scanner,
    short: () => window.Shortest,
    gloss: () => window.Dictionary,
  };

  const screen = document.getElementById('screen');
  const buttons = document.querySelectorAll('.tabbar [data-tab]');
  let active = null;
  let activeKey = null;

  function go(key, opts) {
    if (!Object.prototype.hasOwnProperty.call(TABS, key)) key = 'coach';
    if (active && active.unmount) active.unmount();
    activeKey = key;
    active = TABS[key]();
    screen.textContent = '';
    screen.scrollTop = 0;
    window.scrollTo(0, 0);
    for (const b of buttons) {
      const on = b.dataset.tab === key;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    try { history.replaceState(null, '', `#${key}`); } catch { /* file:// in some browsers */ }
    active.mount(screen, opts || {});
  }

  for (const b of buttons) b.addEventListener('click', () => go(b.dataset.tab));

  Store.subscribe(source => { if (active && active.onChange) active.onChange(source); });

  document.addEventListener('keydown', ev => {
    if (ev.target.closest && ev.target.closest('input, textarea, select')) return;
    if (active && active.onKey) active.onKey(ev);
  });

  window.Main = { go, get tab() { return activeKey; } };

  go(location.hash.slice(1) || 'coach');

  // Build the solver's tables while the first screen is being read, so the
  // first press of 「最短」 does not wait for them.
  setTimeout(() => { try { TwoPhaseSolver.init(); } catch { /* solve() builds them again */ } }, 400);
})();
