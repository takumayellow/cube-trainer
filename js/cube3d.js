/**
 * cube3d.js — the cube as a cube
 *
 * The unfolded net is exact but nothing like the object in your hands: on a net
 * "the front-right pair" is two squares at opposite ends of the page. So the
 * same state is drawn a second time as six faces stood up in CSS 3D, turned by
 * dragging, with the pieces the current step is about lit up on both.
 *
 * Six flat faces, not 27 little cubes: turning a layer is never animated here,
 * so the extra machinery would buy nothing. The transforms below place each
 * face so that sticker 0 lands where cubie.js says it does — U starts at the
 * back-left, D at the front-left, and the side faces read with U on top.
 *
 * Depends on: net.js (colour names only)
 */

(function () {
  'use strict';

  const FACES = ['U', 'D', 'F', 'B', 'L', 'R'];

  // Local +z of each face points outward; the rest follows from that, which is
  // what puts sticker 0 in the right corner without a per-face index table.
  const TRANSFORM = {
    F: h => `rotateY(0deg) translateZ(${h}px)`,
    B: h => `rotateY(180deg) translateZ(${h}px)`,
    L: h => `rotateY(-90deg) translateZ(${h}px)`,
    R: h => `rotateY(90deg) translateZ(${h}px)`,
    U: h => `rotateX(90deg) translateZ(${h}px)`,
    D: h => `rotateX(-90deg) translateZ(${h}px)`,
  };

  const START = { x: -24, y: -34 };     // a corner-on view: three faces visible
  const LIMIT_X = 89;                   // past straight up the cube turns inside out

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /**
   * Build a 3D view inside `container`.
   * @param {HTMLElement} container
   * @param {{size?: number}} [opts]
   * @returns {{render: function(object, object=): void, reset: function(): void}}
   */
  function create(container, opts) {
    const size = (opts && opts.size) || 180;
    const stickers = {};

    container.textContent = '';
    container.classList.add('cube3d');
    container.style.setProperty('--cube-size', size + 'px');

    const scene = document.createElement('div');
    scene.className = 'scene';
    const body = document.createElement('div');
    body.className = 'cube-body';

    for (const face of FACES) {
      const plane = document.createElement('div');
      plane.className = 'cube-face';
      plane.style.transform = TRANSFORM[face](size / 2);
      stickers[face] = [];
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.dataset.face = face;
        cell.dataset.index = String(i);
        plane.appendChild(cell);
        stickers[face].push(cell);
      }
      body.appendChild(plane);
    }
    scene.appendChild(body);
    container.appendChild(scene);

    let angle = { ...START };
    const show = () => {
      body.style.transform = `rotateX(${angle.x}deg) rotateY(${angle.y}deg)`;
    };
    show();

    // ── dragging ────────────────────────────────────────────────────────────
    let drag = null;
    container.addEventListener('pointerdown', ev => {
      if (drag) return;              // a second finger must not steal the first
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, from: { ...angle } };
      container.setPointerCapture(ev.pointerId);
      container.classList.add('dragging');
    });
    container.addEventListener('pointermove', ev => {
      if (!drag || ev.pointerId !== drag.id) return;
      angle = {
        x: clamp(drag.from.x - (ev.clientY - drag.y) * 0.5, -LIMIT_X, LIMIT_X),
        y: drag.from.y + (ev.clientX - drag.x) * 0.5,
      };
      show();
    });
    const stop = ev => {
      if (!drag || ev.pointerId !== drag.id) return;
      drag = null;
      container.classList.remove('dragging');
    };
    container.addEventListener('pointerup', stop);
    container.addEventListener('pointercancel', stop);

    function render(state, o) {
      const marked = new Set(((o && o.highlight) || []).map(h => `${h.face}${h.index}`));
      for (const face of FACES) {
        for (let i = 0; i < 9; i++) {
          const cell = stickers[face][i];
          const colour = state[face][i];
          cell.className = `sticker c-${colour}` + (marked.has(`${face}${i}`) ? ' hl' : '');
          cell.title = `${face}${i} — ${Net.COLOUR_NAMES[colour] || colour}`;
        }
      }
    }

    function reset() {
      angle = { ...START };
      show();
    }

    return { render, reset };
  }

  window.Cube3D = { create };
})();
