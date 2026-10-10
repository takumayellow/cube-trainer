/**
 * mobile/ui.js — the small pieces every tab of the phone app is built from
 *
 * The net here is not net.js's 12 x 9 sticker grid: on a phone each face is
 * its own block in a 4 x 3 layout, sized to the screen, so a face can be lit
 * as a whole and the gaps between faces read as edges of the cube.
 *
 *        [U]
 *   [L]  [F]  [R]  [B]
 *        [D]
 */

(function () {
  'use strict';

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };

  // Column / row of each face block.
  const LAYOUT = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
  const key = s => `${s.face}${s.index}`;

  /**
   * The unfolded cube.
   * @param {object} state
   * @param {object} [o]
   * @param {number} [o.size]       largest face size in px (shrinks to fit the screen)
   * @param {Array}  [o.highlight]  stickers to ring
   * @param {boolean}[o.dim]        fade everything not highlighted
   * @param {Array}  [o.flagged]    stickers to ring in red (doubtful reads)
   * @param {object} [o.selected]   one sticker picked for repainting
   * @param {function(string, number): void} [o.onCell]
   */
  function faceNet(state, o = {}) {
    const marked = new Set((o.highlight || []).map(key));
    const flagged = new Set((o.flagged || []).map(key));
    const picked = o.selected ? key(o.selected) : null;

    const net = el('div', 'fnet');
    if (o.dim && marked.size) net.classList.add('dimmed');
    if (o.onCell) net.classList.add('tappable');
    if (o.size) net.style.setProperty('--f-max', `${o.size}px`);

    for (const face of Object.keys(LAYOUT)) {
      const [col, row] = LAYOUT[face];
      const block = el('div', 'fface');
      block.style.gridColumn = String(col + 1);
      block.style.gridRow = String(row + 1);
      for (let i = 0; i < 9; i++) {
        const colour = state[face][i];
        const cell = el('div', `st c-${colour}`);
        const id = `${face}${i}`;
        if (marked.has(id)) cell.classList.add('hl');
        if (flagged.has(id)) cell.classList.add('flag');
        if (picked === id) cell.classList.add('sel');
        cell.dataset.face = face;
        cell.dataset.index = String(i);
        cell.title = `${face}${i} — ${Net.COLOUR_NAMES[colour] || colour}`;
        block.appendChild(cell);
      }
      net.appendChild(block);
    }

    if (o.onCell) {
      net.addEventListener('click', ev => {
        const cell = ev.target.closest('.st');
        if (cell) o.onCell(cell.dataset.face, Number(cell.dataset.index));
      });
    }
    return net;
  }

  function button(label, cls, onClick) {
    const b = el('button', 'btn' + (cls ? ` ${cls}` : ''), label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  /** Screen title, a one-line subtitle, and optional buttons on the right. */
  function header(title, sub, actions) {
    const head = el('header', 'head');
    const text = el('div');
    text.appendChild(el('h1', null, title));
    if (sub) text.appendChild(el('p', null, sub));
    head.appendChild(text);
    if (actions && actions.length) {
      const side = el('div', 'head-actions');
      side.append(...actions);
      head.appendChild(side);
    }
    return head;
  }

  /** A row of moves, the one at `at` filled in and the ones before it faded. */
  function moveChips(moves, at, onPick) {
    const row = el('div', 'chips');
    moves.forEach((m, i) => {
      const chip = el(onPick ? 'button' : 'span',
        'chip' + (i < at ? ' past' : i === at ? ' now' : ''), m);
      if (onPick) {
        chip.type = 'button';
        chip.addEventListener('click', () => onPick(i));
      }
      row.appendChild(chip);
    });
    return row;
  }

  /** Every sticker of one face — "turn this one" lit as a whole. */
  const wholeFace = face => Array.from({ length: 9 }, (_, index) => ({ face, index }));

  window.UI = { el, faceNet, button, header, moveChips, wholeFace };
})();
