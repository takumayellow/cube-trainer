/**
 * net.js — the unfolded cube, drawn and clicked
 *
 *        [U]
 *   [L]  [F]  [R]  [B]
 *        [D]
 *
 * One 12x9 grid of stickers; each face is placed by an offset. Stickers carry
 * their face and index as data attributes, so painting and highlighting both
 * work by address rather than by counting children.
 */

(function () {
  'use strict';

  // Column/row of each face's top-left sticker, in sticker units.
  const LAYOUT = {
    U: [3, 0],
    L: [0, 3], F: [3, 3], R: [6, 3], B: [9, 3],
    D: [3, 6],
  };

  const COLOURS = ['W', 'Y', 'G', 'B', 'O', 'R'];
  const COLOUR_NAMES = { W: '白', Y: '黄', G: '緑', B: '青', O: '橙', R: '赤' };

  /**
   * Draw a state into `container`.
   * @param {HTMLElement} container
   * @param {object} state  six faces of nine colour letters
   * @param {object} [opts]
   * @param {Array<{face: string, index: number}>} [opts.highlight] stickers to ring
   * @param {function(string, number): void} [opts.onClick] called with (face, index)
   */
  function render(container, state, opts) {
    const o = opts || {};
    const marked = new Set((o.highlight || []).map(h => `${h.face}${h.index}`));

    container.textContent = '';
    container.classList.add('net');

    for (const face of Object.keys(LAYOUT)) {
      const [col0, row0] = LAYOUT[face];
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = `sticker c-${state[face][i]}`;
        if (marked.has(`${face}${i}`)) cell.classList.add('hl');
        if (i === 4) cell.classList.add('centre');
        cell.style.gridColumn = col0 + (i % 3) + 1;
        cell.style.gridRow = row0 + Math.floor(i / 3) + 1;
        cell.dataset.face = face;
        cell.dataset.index = String(i);
        cell.title = `${face}${i} — ${COLOUR_NAMES[state[face][i]] || state[face][i]}`;
        container.appendChild(cell);
      }
    }

    // Delegation: the grid is rebuilt on every render, the listener is not.
    container.classList.toggle('paintable', !!o.onClick);
    container.onclick = o.onClick
      ? (ev) => {
          const cell = ev.target.closest('.sticker');
          if (cell) o.onClick(cell.dataset.face, Number(cell.dataset.index));
        }
      : null;
  }

  window.Net = { COLOURS, COLOUR_NAMES, LAYOUT, render };
})();
