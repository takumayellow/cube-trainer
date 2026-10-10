/**
 * mobile/dictionary.js — 「辞典」: only what this solve has actually used
 *
 * The PC glossary lists every technique. Read on a phone between turns, that
 * is a wall; what is worth reading is the handful this solve ran into — with
 * the moves that were really turned, not the textbook version — plus the one
 * on screen right now and the one coming up next.
 *
 * Depends on: store.js, ui.js, glossary.js
 */

(function () {
  'use strict';

  const { el, header } = UI;

  const STAGE_LABEL = { cross: 'Cross', f2l: 'F2L', oll: 'OLL', pll: 'PLL' };
  // What comes after the stage on screen, as one representative entry.
  const COMING = { cross: 'ペア挿入（基本形）', f2l: '辺の向きそろえ' };

  let root = null;
  let open = new Set();

  function entries() {
    const list = [];
    const current = Store.current();
    for (const t of Store.used()) {
      if (current && t.name === current.name) continue;      // shown as いまここ instead
      list.push({ ...t, tag: '使った', kind: 'used' });
    }
    if (current) list.push({ ...current, tag: 'いまここ', kind: 'now' });
    const next = current && COMING[current.stage];
    const entry = next && Glossary.ENTRIES.find(e => e.name === next);
    if (entry && !list.some(t => t.name === entry.name)) {
      list.push({ ...entry, tag: 'このあと', kind: 'next' });
    }
    return list;
  }

  function draw() {
    if (!root) return;
    root.textContent = '';
    root.appendChild(header('辞典', '今回の解き方で出てきたものだけ'));

    const list = entries();
    if (!list.length) {
      const card = el('div', 'card');
      card.appendChild(el('p', null,
        '「次の一手」で手順を進めると、使ったテクニックがここにたまります。'));
      root.appendChild(card);
      return;
    }

    const box = el('div', 'dict');
    for (const t of list) box.appendChild(item(t));
    root.appendChild(box);
  }

  function item(t) {
    const expanded = open.has(t.name);
    const wrap = el('div', `entry ${t.kind}` + (expanded ? ' open' : ''));

    const head = el('button', 'entry-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(expanded));
    head.append(
      el('span', `badge s-${t.stage}`, STAGE_LABEL[t.stage] || t.stage),
      el('span', 'entry-name', t.name),
      el('span', 'entry-tag', t.count > 1 ? `${t.tag} ×${t.count}` : t.tag),
      el('span', 'chev', expanded ? '−' : '+'));
    head.addEventListener('click', () => {
      open = new Set(open);
      if (expanded) open.delete(t.name); else open.add(t.name);
      draw();
    });
    wrap.appendChild(head);

    if (expanded) {
      const body = el('div', 'entry-body');
      if (t.jp) body.appendChild(el('p', 'jp', t.jp));
      if (t.moves && t.moves !== '—') {
        body.appendChild(el('p', 'card-label', t.kind === 'next' ? '代表的な手順' : '今回回した手順'));
        body.appendChild(el('p', 'alg', t.moves));
      }
      if (t.does) body.appendChild(para('何をする', t.does));
      if (t.when) body.appendChild(para('使う場面', t.when));
      wrap.appendChild(body);
    }
    return wrap;
  }

  function para(label, text) {
    const p = el('p');
    p.append(el('b', null, `${label} — `), document.createTextNode(text));
    return p;
  }

  window.Dictionary = {
    mount(node, opts) {
      root = node;
      if (opts && opts.open) open = new Set([opts.open]);
      draw();
    },
    unmount() { root = null; },
    onChange() { draw(); },
  };
})();
