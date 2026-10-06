/*
 * Somtoday Cijfer Onthuller
 * Alles draait lokaal in de browser. Er wordt niets verstuurd of opgeslagen.
 *
 * Werkwijze:
 *  - Een herkend cijfer blijft ongewijzigd in de pagina staan. We zetten er alleen
 *    het attribuut data-sdr op (CSS verbergt het visueel) en voegen tijdelijk een knop toe.
 *  - Na de onthulling verwijderen we alleen die knop en zetten we data-sdr op "done".
 */
(() => {
  'use strict';

  if (window.__somtodaySdrLoaded) return;
  window.__somtodaySdrLoaded = true;

  /* ------------------------------------------------------------------ */
  /* Constanten                                                          */
  /* ------------------------------------------------------------------ */

  // Een cijfer: 1 t/m 10, optioneel met één of twee decimalen (komma of punt).
  const GRADE_RE = /^(?:10(?:[.,]0{1,2})?|[1-9](?:[.,]\d{1,2})?)$/;
  // Kolomkoppen waarin cijfers staan.
  const HEADER_RE = /cijfer|resultaat|beoordeling/i;
  const HEADER_EXCLUDE_RE = /weging|gewicht|aantal|datum/i;

  const GRID_SEL = 'table, [role="table"], [role="grid"], [role="treegrid"]';

  const ATTR_SEL = [
    '[data-grade]',
    '[data-cijfer]',
    '[data-resultaat]',
    '[data-testid*="cijfer" i]',
    '[data-testid*="grade" i]',
    '[data-test*="cijfer" i]',
    '[data-test*="grade" i]',
    '[aria-label*="cijfer" i]',
    '[class*="cijfer" i]',
    '[class*="grade" i]'
  ].join(',');

  const EXCLUDE_SEL =
    '.sdr-overlay, script, style, noscript, input, textarea, select, option, ' +
    '[contenteditable="true"], [data-sdr-ignore]';



  /* ------------------------------------------------------------------ */
  /* Kleine hulpfuncties                                                 */
  /* ------------------------------------------------------------------ */

  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

  function h(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  // Tekst van een element, zonder onze eigen knop.
  function ownText(el) {
    if (!el.querySelector('.sdr-wrap')) return el.textContent || '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.sdr-wrap').forEach((n) => n.remove());
    return clone.textContent || '';
  }

  // Leest het huidige cijfer uit een host-element. Geeft null als er geen cijfer staat.
  function readGrade(host) {
    const whole = norm(ownText(host));
    if (GRADE_RE.test(whole)) return whole;
    for (const n of host.childNodes) {
      if (n.nodeType === 3) {
        const t = n.nodeValue.trim();
        if (GRADE_RE.test(t)) return t;
      }
    }
    return null;
  }

  // Stabiele sleutel om een cijfer te herkennen als de pagina het element opnieuw opbouwt.
  function keyFor(host, value) {
    const ctx = host.closest('tr, [role="row"], li') || host.parentElement || host;
    return location.pathname + '|' + norm(ownText(ctx)).slice(0, 400) + '|' + value;
  }

  /* ------------------------------------------------------------------ */
  /* Herkennen van cijfers                                               */
  /* ------------------------------------------------------------------ */

  function gridRows(g) {
    if (g.tagName === 'TABLE') return Array.from(g.rows);
    return Array.from(g.querySelectorAll('[role="row"]')).filter((r) => r.closest(GRID_SEL) === g);
  }

  function rowCells(r) {
    if (r.tagName === 'TR') return Array.from(r.cells);
    return Array.from(r.children).filter((c) =>
      /^(columnheader|gridcell|cell|rowheader)$/.test(c.getAttribute('role') || '')
    );
  }

  function isHeaderCell(c) {
    return c.tagName === 'TH' || c.getAttribute('role') === 'columnheader';
  }

  function colSpanOf(c) {
    if (c.tagName === 'TD' || c.tagName === 'TH') return c.colSpan || 1;
    return parseInt(c.getAttribute('aria-colspan'), 10) || 1;
  }

  function isHeaderLabel(cell) {
    const t = norm(cell.textContent);
    return HEADER_RE.test(t) && !HEADER_EXCLUDE_RE.test(t) && !GRADE_RE.test(t);
  }

  function isHeaderRow(row, ri, cells) {
    const inThead = row.parentElement && row.parentElement.tagName === 'THEAD';
    const looksLikeHeader =
      ri === 0 &&
      cells.some(isHeaderLabel) &&
      !cells.some((c) => GRADE_RE.test(norm(ownText(c))));
    return !!(inThead || cells.every(isHeaderCell) || looksLikeHeader);
  }

  // Zoekt in een cel het element waarin het cijfer staat.
  function findHostInCell(cell) {
    if (cell.hasAttribute('data-sdr')) return cell;
    const marked = cell.querySelector('[data-sdr]');
    if (marked) return marked;
    if (GRADE_RE.test(norm(ownText(cell)))) return cell;
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const p = n.parentElement;
      if (!p || p.closest('.sdr-wrap')) continue;
      if (GRADE_RE.test(n.nodeValue.trim())) return p;
    }
    return null;
  }

  // Tabellen en ARIA-grids: kolommen met een kop als "cijfer", "resultaat" of "beoordeling".
  function discoverGrids(found) {
    document.querySelectorAll(GRID_SEL).forEach((grid) => {
      if (grid.closest('.sdr-overlay')) return;
      let cols = null;
      gridRows(grid).forEach((row, ri) => {
        const cells = rowCells(row);
        if (!cells.length) return;

        if (isHeaderRow(row, ri, cells)) {
          cols = [];
          let idx = 0;
          cells.forEach((c) => {
            if (isHeaderLabel(c)) cols.push(idx);
            idx += colSpanOf(c);
          });
          return;
        }

        if (!cols || !cols.length) return;
        let idx = 0;
        cells.forEach((c) => {
          const span = colSpanOf(c);
          if (cols.some((i) => i >= idx && i < idx + span)) {
            const host = findHostInCell(c);
            if (host) found.add(host);
          }
          idx += span;
        });
      });
    });
  }

  // Overige elementen met een duidelijk grade/cijfer-attribuut, waarvan de tekst alleen een cijfer is.
  function discoverAttrs(found) {
    document.querySelectorAll(ATTR_SEL).forEach((el) => {
      if (el.hasAttribute('data-sdr') || el.closest('.sdr-overlay')) return;
      const text = el.textContent || '';
      if (text.length > 12) return;
      if (GRADE_RE.test(norm(text))) found.add(el);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Verbergen / tonen (zonder de inhoud van de pagina aan te passen)    */
  /* ------------------------------------------------------------------ */

  const revealedHosts = new WeakMap(); // element -> cijfer dat onthuld is
  const revealedKeys = new Set(); // sleutels van onthulde cijfers (alleen in het geheugen)

  function ensureWrap(host) {
    for (const c of host.children) if (c.classList.contains('sdr-wrap')) return;
    const wrap = h('span', 'sdr-wrap');
    const btn = h('button', 'sdr-btn', 'Onthul cijfer');
    btn.type = 'button';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openReveal(host);
    });
    ['keydown', 'keyup', 'mousedown', 'mouseup', 'pointerdown', 'dblclick'].forEach((t) =>
      btn.addEventListener(t, (e) => e.stopPropagation())
    );
    wrap.appendChild(btn);
    host.appendChild(wrap);
  }

  function removeWrap(host) {
    for (const c of Array.from(host.children)) if (c.classList.contains('sdr-wrap')) c.remove();
  }

  function applyHost(host) {
    if (!host.isConnected) return;
    const cur = host.getAttribute('data-sdr');

    if (!cur) {
      if (host.closest(EXCLUDE_SEL)) return;
      if (host.parentElement && host.parentElement.closest('[data-sdr]')) return;
      if (host.querySelector('[data-sdr]')) return;
    }

    const value = readGrade(host);
    if (!value) {
      // Het element toont geen cijfer (meer): geen knop laten staan.
      if (cur) {
        host.removeAttribute('data-sdr');
        removeWrap(host);
      }
      return;
    }

    const revealed =
      revealedHosts.get(host) === value || revealedKeys.has(keyFor(host, value));

    if (revealed) {
      if (cur !== 'done') host.setAttribute('data-sdr', 'done');
      revealedHosts.set(host, value);
      removeWrap(host);
    } else {
      if (cur !== 'hidden') host.setAttribute('data-sdr', 'hidden');
      ensureWrap(host);
    }
  }

  let scanning = false;
  function scan() {
    if (scanning || !document.body) return;
    scanning = true;
    try {
      const hosts = new Set();
      discoverGrids(hosts);
      discoverAttrs(hosts);
      document.querySelectorAll('[data-sdr]').forEach((el) => hosts.add(el));
      hosts.forEach(applyHost);
    } catch (err) {
      /* De extensie mag de pagina nooit laten crashen. */
    } finally {
      scanning = false;
    }
  }

  let lastRun = 0;
  let pending = null;
  function schedule() {
    if (pending) return;
    const since = Date.now() - lastRun;
    if (since >= 100) {
      lastRun = Date.now();
      scan();
      return;
    }
    pending = setTimeout(() => {
      pending = null;
      lastRun = Date.now();
      scan();
    }, 100 - since);
  }

  function isOwnMutation(m) {
    const t = m.target;
    if (t.nodeType === 1 && t.closest && t.closest('.sdr-overlay')) return true;
    if (m.type === 'characterData') {
      return !!(t.parentElement && t.parentElement.closest('.sdr-overlay, .sdr-wrap'));
    }
    const nodes = [...m.addedNodes, ...m.removedNodes];
    return (
      nodes.length > 0 &&
      nodes.every(
        (n) =>
          n.nodeType === 1 &&
          (n.classList.contains('sdr-wrap') || n.classList.contains('sdr-overlay'))
      )
    );
  }

  /* ------------------------------------------------------------------ */
  /* Nepcijfers voor het draaien (alleen decoratie, nooit het eindresultaat) */
  /* ------------------------------------------------------------------ */

  // Deterministische reeks (LCG): zelfde invoer, zelfde uitvoer. Het eindcijfer wordt
  // hier nooit uit afgeleid; de reeks eindigt altijd op het echte cijfer dat we meekrijgen.
  function makeFillers(value, count, seed) {
    const m = /^(\d{1,2})(?:([.,])(\d{1,2}))?$/.exec(value);
    const sep = (m && m[2]) || ',';
    const dec = m && m[3] ? m[3].length : 0;
    const scale = Math.pow(10, dec);
    const out = [];
    let k = seed * 7919 + 13;
    let prev = value;
    let guard = 0;
    while (out.length < count && guard++ < 2000) {
      k = (Math.imul(k, 1103515245) + 12345) & 0x7fffffff;
      const v = scale + ((k >> 8) % (9 * scale + 1));
      const text = dec ? (v / scale).toFixed(dec).replace('.', sep) : String(v);
      if (text === value || text === prev || text.length > value.length) continue;
      out.push(text);
      prev = text;
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Popup                                                               */
  /* ------------------------------------------------------------------ */

  let active = null;

  function openReveal(host) {
    if (active) return;
    const value = readGrade(host);
    if (!value) return;
    active = createOverlay({
      host,
      value,
      key: keyFor(host, value),
      lastFocus: document.activeElement
    });
  }

  const BALL_SVG =
    '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
    '<circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" stroke-width="5"/>' +
    '<polygon points="50,34 65.2,45.1 59.4,62.9 40.6,62.9 34.8,45.1" fill="currentColor"/>' +
    '<path d="M50 34V5M65.2 45.1L92.8 36.1M59.4 62.9L76.4 86.4M40.6 62.9L23.6 86.4M34.8 45.1L7.2 36.1" ' +
    'stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/></svg>';

  /* ------------------------------------------------------------------ */
  /* Toetsinformatie (vak, omschrijving, weging, datum, ...)             */
  /* ------------------------------------------------------------------ */

  const CANON = [
    { re: /^vak/i, name: 'Vak', abbr: 'VAK', pri: 0 },
    { re: /weging|gewicht/i, name: 'Weging', abbr: 'WEG', pri: 2 },
    { re: /datum|ingevoerd|gemaakt/i, name: 'Datum', abbr: 'DAT', pri: 3 },
    { re: /periode|blok|semester/i, name: 'Periode', abbr: 'PER', pri: 4 },
    { re: /docent|leraar/i, name: 'Docent', abbr: 'DOC', pri: 5 },
    { re: /type|soort|categorie/i, name: 'Type', abbr: 'TYP', pri: 6 },
    { re: /omschrijving|toets|titel|onderwerp|naam|beschrijving/i, name: 'Toets', abbr: 'TST', pri: 1 }
  ];

  const DATE_RE =
    /\b\d{1,2}[-\/]\d{1,2}([-\/]\d{2,4})?\b|\b\d{1,2}\.\d{1,2}\.\d{2,4}\b|\b\d{1,2}\s+(jan|feb|mrt|maa|apr|mei|jun|jul|aug|sep|okt|nov|dec)[a-z]*\.?(\s+\d{2,4})?/i;

  function canonOf(label) {
    for (const c of CANON) if (c.re.test(label)) return c;
    return null;
  }

  function trimVal(v, max) {
    const t = norm(v);
    return t.length > max ? t.slice(0, max - 1) + '\u2026' : t;
  }

  // Kolomkoppen (per kolomindex) voor de rij van een cijfer.
  function headerLabels(grid, row) {
    const labels = [];
    if (!grid) return labels;
    const rows = gridRows(grid);
    let best = null;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] === row) break;
      const cells = rowCells(rows[i]);
      if (cells.length && isHeaderRow(rows[i], i, cells)) best = cells;
    }
    if (!best) return labels;
    let idx = 0;
    best.forEach((c) => {
      const span = colSpanOf(c);
      const t = norm(c.textContent);
      for (let k = 0; k < span; k++) labels[idx + k] = t;
      idx += span;
    });
    return labels;
  }

  // Zonder tabel: losse tekstjes rond het cijfer (lijstitem, kaart, ...).
  function looseInfo(host, value) {
    const box =
      host.closest('li, article, [role="listitem"], [class*="card" i], [class*="item" i], [class*="row" i]') ||
      (host.parentElement && host.parentElement.parentElement);
    const out = [];
    if (!box || (box.textContent || '').length > 700) return out;
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walker.nextNode()) && out.length < 8) {
      const p = n.parentElement;
      if (!p || p.closest('.sdr-wrap, .sdr-overlay, [data-sdr], script, style') || host.contains(n)) continue;
      const t = norm(n.nodeValue);
      if (!t || t === value || t.length > 80 || seen.has(t)) continue;
      seen.add(t);
      const m = /^([A-Za-z\u00c0-\u00ff ]{2,16}):\s*(.+)$/.exec(t);
      if (m) out.push({ label: m[1], text: m[2] });
      else if (DATE_RE.test(t)) out.push({ label: 'Datum', text: t });
      else if (/^\d+([.,]\d+)?\s*x$/i.test(t) || /^x\s*\d/i.test(t)) out.push({ label: 'Weging', text: t });
      else out.push({ label: '', text: t });
    }
    return out;
  }

  // Haalt informatie over de toets uit de pagina. Verbergt nooit iets en toont nooit andere cijfers.
  function extractInfo(host, value) {
    let raw = [];
    try {
      const row = host.closest('tr, [role="row"]');
      if (row) {
        const labels = headerLabels(row.closest(GRID_SEL), row);
        let idx = 0;
        rowCells(row).forEach((c) => {
          const label = labels[idx] || '';
          idx += colSpanOf(c);
          if (c.contains(host) || host.contains(c)) return;
          if (c.hasAttribute('data-sdr') || c.querySelector('[data-sdr]')) return;
          const text = norm(ownText(c));
          if (!text) return;
          if (label && HEADER_RE.test(label) && !HEADER_EXCLUDE_RE.test(label)) return;
          if (text === value && !HEADER_EXCLUDE_RE.test(label)) return;
          raw.push({ label, text });
        });
      }
      if (!raw.length) raw = looseInfo(host, value);
    } catch (err) {
      raw = [];
    }

    const items = [];
    const seen = new Set();
    raw.forEach((r, order) => {
      const label = norm(r.label);
      const c = label ? canonOf(label) : null;
      const name = c ? c.name : label ? label.charAt(0).toUpperCase() + label.slice(1, 14) : 'Info';
      const abbr = c ? c.abbr : (label.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'INF');
      const text = trimVal(r.text, 40);
      const key = name + '|' + text;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ name, abbr, text, pri: c ? c.pri : 7, order });
    });
    items.sort((a, b) => a.pri - b.pri || a.order - b.order);
    return items;
  }

  function compactStat(it) {
    if (it.name === 'Datum') {
      const m = /(\d{1,2})[-\/. ](\d{1,2})/.exec(it.text);
      if (m) return m[1] + '-' + m[2];
    }
    return it.text.length > 7 ? it.text.slice(0, 6) + '\u2026' : it.text;
  }

  /* ------------------------------------------------------------------ */
  /* Walkout-kaart (alles in CSS en eigen SVG, geen logo's of assets)     */
  /* ------------------------------------------------------------------ */

  // Kleurklasse van een cijfer (alleen gebruikt op het moment van landen).
  function tierOf(v) {
    const n = parseFloat(String(v).replace(',', '.'));
    return n >= 8.5 ? 'special' : n >= 7 ? 'gold' : n >= 5.5 ? 'silver' : 'bronze';
  }

  // Lootbox-kist, volledig in CSS.
  function crateArt() {
    const c = h('div', 'sdr-crate-art');
    c.setAttribute('aria-hidden', 'true');
    const lid = h('div', 'sdr-cr-lid');
    const bodyEl = h('div', 'sdr-cr-body');
    c.append(bodyEl, h('div', 'sdr-cr-seam'), lid, h('div', 'sdr-cr-lock'));
    return c;
  }

  function fcCard(o) {
    const root = h('div', 'sdr-fc');
    root.setAttribute('data-tier', o.tier);
    root.setAttribute('aria-hidden', 'true');
    const edge = h('div', 'sdr-fc-edge');
    const face = h('div', 'sdr-fc-face');

    const left = h('div', 'sdr-fc-left');
    const rating = h('div', 'sdr-fc-rating', o.rating);
    rating.setAttribute('data-len', String(Math.min(5, Math.max(2, o.len || 2))));
    const pos = h('div', 'sdr-fc-pos', o.pos);
    const ball = h('div', 'sdr-fc-ball');
    ball.innerHTML = BALL_SVG; // vaste, eigen SVG; geen paginagegevens
    const chip = h('div', 'sdr-fc-chip', o.chip || '');
    left.append(rating, pos, ball, chip);

    const art = h('div', 'sdr-fc-art');
    art.append(h('i', 'sdr-fc-head'), h('i', 'sdr-fc-body'));

    const name = h('div', 'sdr-fc-name', o.name);
    name.setAttribute('data-len', o.name.length > 20 ? 'xl' : o.name.length > 13 ? 'l' : 's');
    const stats = h('div', 'sdr-fc-stats');
    o.stats.forEach((st) => {
      const d = h('div', 'sdr-fc-stat');
      d.append(h('b', null, st.v), h('span', null, st.l));
      stats.appendChild(d);
    });

    face.append(
      h('div', 'sdr-fc-pattern'),
      h('div', 'sdr-fc-shine'),
      left,
      art,
      name,
      h('div', 'sdr-fc-line'),
      stats
    );
    root.append(edge, face);
    return { root, rating };
  }

  function createOverlay(ctx) {
    const { host, value } = ctx;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers = new Set();
    let closed = false;
    let revealed = false;
    let raf = 0;

    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!closed) fn();
      }, ms);
      timers.add(id);
      return id;
    };

    /* ---- Skelet ---- */
    const overlay = h('div', 'sdr-overlay');
    const dialog = h('div', 'sdr-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'sdr-title');
    dialog.tabIndex = -1;

    const head = h('div', 'sdr-head');
    const headText = h('div', 'sdr-headtext');
    const titleEl = h('h2', 'sdr-title');
    titleEl.id = 'sdr-title';
    const subEl = h('p', 'sdr-sub');
    headText.append(titleEl, subEl);
    const closeBtn = h('button', 'sdr-close', '\u00d7');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Sluiten');
    head.append(headText, closeBtn);

    const body = h('div', 'sdr-body');
    dialog.append(head, body);
    overlay.appendChild(dialog);

    const setHead = (title, sub) => {
      titleEl.textContent = title;
      subEl.textContent = sub;
    };
    const clearBody = () => {
      body.textContent = '';
    };
    const focusFirst = () => {
      const b = body.querySelector('button');
      (b || closeBtn).focus({ preventScroll: true });
    };

    /* ---- Afsluiten en opruimen ---- */
    function close() {
      if (closed) return;
      closed = true;
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      document.removeEventListener('keydown', onKey, true);
      overlay.querySelectorAll('.sdr-confetti').forEach((n) => n.remove());
      overlay.remove();
      active = null;
      const f = ctx.lastFocus;
      if (f && f.isConnected && typeof f.focus === 'function') {
        try {
          f.focus({ preventScroll: true });
        } catch (e) {
          /* negeren */
        }
      }
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const f = Array.from(dialog.querySelectorAll('button:not([disabled])'));
      if (!f.length) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = f[0];
      const last = f[f.length - 1];
      const inside = dialog.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) close();
    });
    ['click', 'keydown', 'keyup', 'keypress'].forEach((t) =>
      overlay.addEventListener(t, (e) => e.stopPropagation())
    );
    document.addEventListener('keydown', onKey, true);

    /* ---- Reveal afronden: alleen de knop verdwijnt, het cijfer stond er al ---- */
    function finishReveal() {
      if (revealed) return;
      revealed = true;
      revealedKeys.add(ctx.key);
      if (host.isConnected) revealedHosts.set(host, value);
      scan(); // zet alle bijbehorende elementen op "done" en verwijdert de knop
    }

    function confetti() {
      if (reduce || closed) return;
      const layer = h('div', 'sdr-confetti');
      layer.setAttribute('aria-hidden', 'true');
      const colors = ['#8b5cf6', '#3b82f6', '#22d3ee', '#f5c542', '#f472b6', '#ffffff'];
      for (let i = 0; i < 80; i++) {
        const p = h('i', 'sdr-conf');
        const w = 6 + Math.random() * 7;
        p.style.setProperty('--l', (Math.random() * 100).toFixed(1) + '%');
        p.style.setProperty('--w', w.toFixed(1) + 'px');
        p.style.setProperty('--c', colors[i % colors.length]);
        p.style.setProperty('--dx', (Math.random() * 240 - 120).toFixed(0) + 'px');
        p.style.setProperty('--r', (Math.random() * 900 - 450).toFixed(0) + 'deg');
        p.style.setProperty('--d', (2 + Math.random() * 1.6).toFixed(2) + 's');
        p.style.setProperty('--dl', (Math.random() * 0.5).toFixed(2) + 's');
        layer.appendChild(p);
      }
      overlay.appendChild(layer);
      later(() => layer.remove(), 4600);
    }

    function showDone() {
      const foot = h('div', 'sdr-foot');
      const status = h('p', 'sdr-status', 'Je cijfer: ' + value);
      status.setAttribute('role', 'status');
      const done = h('button', 'sdr-primary', 'Sluiten');
      done.type = 'button';
      done.addEventListener('click', close);
      foot.append(status, done);
      body.appendChild(foot);
      done.focus({ preventScroll: true });
    }

    function complete() {
      finishReveal();
      showDone();
      confetti();
    }

    /* ---- Scherm 1: keuze ---- */
    function choiceButton(title, desc, art, onClick) {
      const b = h('button', 'sdr-choice');
      b.type = 'button';
      const artWrap = h('div', 'sdr-choice-art');
      artWrap.appendChild(art);
      b.append(artWrap, h('strong', null, title), h('span', 'sdr-choice-desc', desc));
      b.addEventListener('click', onClick);
      return b;
    }

    function miniWheel() {
      const w = h('div', 'sdr-mini-wheel');
      w.setAttribute('aria-hidden', 'true');
      return w;
    }

    function miniScratch() {
      const w = h('div', 'sdr-mini-scratch', 'Kras!');
      w.setAttribute('aria-hidden', 'true');
      return w;
    }

    function miniDice() {
      const wrap = h('div', 'sdr-mini-dice');
      wrap.setAttribute('aria-hidden', 'true');
      for (let d = 0; d < 2; d++) {
        const die = h('div', 'sdr-mini-die');
        [1, 0, 1, 0, 1, 0, 1, 0, 1].forEach((on) => die.appendChild(h('i', on ? 'on' : '')));
        wrap.appendChild(die);
      }
      return wrap;
    }

    function miniCard() {
      const c = fcCard({
        tier: 'gold',
        rating: '?',
        len: 2,
        pos: 'WOT',
        name: 'WALKOUT',
        chip: '',
        stats: ['VAK', 'WEG', 'DAT', 'PER', 'TST', 'TYP'].map((l) => ({ v: '?', l }))
      });
      return c.root;
    }

    function showChoice() {
      clearBody();
      dialog.classList.remove('is-cinema');
      setHead('Onthul je cijfer', 'Kies hoe je het wilt zien.');

      const mini = h('div', 'sdr-mini-slot');
      mini.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i++) mini.appendChild(h('i', null, '?'));

      const grid = h('div', 'sdr-choices');
      grid.append(
        choiceButton('Walkout', 'Cutscene met je toetsgegevens en een speelkaart', miniCard(), startWalkout),
        choiceButton('Casino reveal', 'Trek de hendel en wacht op de rollen', mini, startCasino),
        choiceButton('Rad van fortuin', 'Draai het rad, de pijl wijst je cijfer aan', miniWheel(), startWheel),
        choiceButton('Kraskaart', 'Kras het vak open', miniScratch(), startScratch),
        choiceButton('Dobbelstenen', 'Gooi de stenen en lees je cijfer af', miniDice(), startDice),
        choiceButton('Lootbox', 'Open de kist en kijk wat erin zit', crateArt(), startLootbox)
      );
      body.appendChild(grid);
      focusFirst();
    }

    /* ---- Walkout (cutscene) ---- */
    function startWalkout() {
      clearBody();
      dialog.classList.add('is-cinema');
      setHead('Walkout', 'Je cijfer komt eraan\u2026');

      const info = extractInfo(host, value);
      const tier = tierOf(value);
      const find = (n) => info.find((x) => x.name === n);
      const vak = find('Vak');
      const toets = find('Toets');
      const weging = find('Weging');
      const cardName = (toets || vak || info[0] || { text: 'Resultaat' }).text;
      const pos = vak
        ? (vak.text.replace(/[^A-Za-z\u00c0-\u00ff]/g, '').slice(0, 3) || 'TST').toUpperCase()
        : 'TST';
      const slidesData = (info.length ? info : [{ name: 'Resultaat', text: 'Nieuw resultaat' }]).slice(0, 4);

      const card = fcCard({
        tier: 'neutral',
        rating: '?',
        len: value.length,
        pos,
        name: cardName,
        chip: weging ? weging.text.slice(0, 6) : '',
        stats: info.slice(0, 6).map((it) => ({ v: compactStat(it), l: it.abbr }))
      });

      /* podium en sfeer */
      const stage = h('div', 'sdr-wo');
      const beams = h('div', 'sdr-wo-beams');
      for (let i = 0; i < 6; i++) {
        const b = h('i', 'sdr-wo-beam');
        b.style.setProperty('--x', 8 + i * 17 + '%');
        b.style.setProperty('--r', ((i - 2.5) * 9).toFixed(1) + 'deg');
        b.style.setProperty('--t', (3 + i * 0.7).toFixed(1) + 's');
        b.style.setProperty('--d', (-i * 0.6).toFixed(1) + 's');
        beams.appendChild(b);
      }
      const cams = h('div', 'sdr-wo-cams');
      for (let i = 0; i < 30; i++) {
        const c = h('i', 'sdr-wo-cam');
        c.style.left = (Math.random() * 96 + 2).toFixed(1) + '%';
        c.style.top = (Math.random() * 30 + 6).toFixed(1) + '%';
        c.style.setProperty('--d', (-Math.random() * 2).toFixed(2) + 's');
        cams.appendChild(c);
      }
      /* tunnel: ringen vliegen langs je heen, aan het eind brandt het stadionlicht */
      const tunnel = h('div', 'sdr-tn');
      tunnel.setAttribute('aria-hidden', 'true');
      tunnel.appendChild(h('div', 'sdr-tn-lines'));
      for (let i = 0; i < 10; i++) {
        const r = h('i', 'sdr-tn-ring');
        r.style.setProperty('--i', String(i));
        tunnel.appendChild(r);
      }
      tunnel.appendChild(h('div', 'sdr-tn-light'));
      const nums = h('div', 'sdr-wo-nums');
      nums.setAttribute('aria-hidden', 'true');
      const tag = h('div', 'sdr-wo-tag');
      tag.appendChild(h('span', null, 'Walkout'));
      const slides = h('div', 'sdr-wo-slides');
      const cardWrap = h('div', 'sdr-wo-cardwrap');
      cardWrap.appendChild(card.root);
      const actions = h('div', 'sdr-wo-actions');
      const sr = h('p', 'sdr-sr');
      sr.setAttribute('role', 'status');

      stage.append(
        h('div', 'sdr-wo-glow'),
        tunnel,
        beams,
        h('div', 'sdr-wo-floor'),
        cams,
        h('div', 'sdr-wo-vig'),
        tag,
        slides,
        h('div', 'sdr-wo-ring'),
        h('div', 'sdr-wo-ring2'),
        nums,
        cardWrap,
        h('div', 'sdr-wo-flash'),
        h('div', 'sdr-wo-flash2'),
        actions,
        sr
      );
      body.appendChild(stage);
      closeBtn.focus({ preventScroll: true });

      /* een info-slide met inkomende en uitgaande animatie */
      const showSlide = (it, i, ms) => {
        const sl = h('div', 'sdr-wo-slide');
        const badge = h('div', 'sdr-wo-badge');
        const ch = (it.text.match(/[A-Za-z0-9]/) || ['\u2605'])[0].toUpperCase();
        badge.appendChild(h('span', null, ch));
        const val = h('div', 'sdr-wo-value', it.text);
        val.setAttribute('data-size', it.text.length > 24 ? 's' : it.text.length > 13 ? 'm' : 'l');
        sl.append(badge, h('div', 'sdr-wo-label', it.name), val, h('div', 'sdr-wo-barline'));
        slides.appendChild(sl);
        stage.style.setProperty('--hue', i * 42 + 'deg');
        sl.classList.add('is-in');
        later(() => sl.classList.add('is-out'), ms - 300);
        later(() => sl.remove(), ms + 200);
      };

      /* het cijfer rolt langs getallen op de kaart en landt op het echte cijfer */
      const land = () => {
        stopShuffle();
        card.rating.classList.remove('is-rolling');
        card.rating.textContent = value; // het echte cijfer, rechtstreeks uit Somtoday
        card.root.setAttribute('data-tier', tier);
        stage.classList.add('is-land', 'is-done');
        subEl.textContent = 'Dit is je cijfer.';
        sr.textContent = 'Je cijfer: ' + value;
        finishReveal();
        confetti();
        const done = h('button', 'sdr-primary', 'Sluiten');
        done.type = 'button';
        done.addEventListener('click', close);
        actions.appendChild(done);
        done.focus({ preventScroll: true });
      };

      /* losse cijfers die door elkaar zweven rond de kaart (alleen decoratie) */
      const floaters = [];
      let shuffling = false;
      const startShuffle = () => {
        if (reduce) return;
        const pool = makeFillers(value, 40, 11);
        shuffling = true;
        for (let i = 0; i < 18; i++) {
          const f = h('i', 'sdr-wo-float', pool[i % pool.length]);
          f.style.left = (4 + Math.random() * 90).toFixed(1) + '%';
          f.style.top = (14 + Math.random() * 72).toFixed(1) + '%';
          f.style.setProperty('--fs', (1.1 + Math.random() * 1.8).toFixed(2) + 'em');
          f.style.setProperty('--fd', (2 + Math.random() * 2).toFixed(2) + 's');
          f.style.setProperty('--fo', (-Math.random() * 2).toFixed(2) + 's');
          nums.appendChild(f);
          floaters.push(f);
        }
        const swap = () => {
          if (!shuffling) return;
          for (let n = 0; n < 5; n++) {
            const f = floaters[Math.floor(Math.random() * floaters.length)];
            f.textContent = pool[Math.floor(Math.random() * pool.length)];
          }
          later(swap, 110);
        };
        swap();
      };
      const stopShuffle = () => {
        shuffling = false;
        nums.classList.add('is-off');
        later(() => nums.textContent = '', 900);
      };

      const roll = () => {
        const list = makeFillers(value, 24, 7);
        list.push(value);
        card.rating.classList.add('is-rolling');
        startShuffle();
        let i = 0;
        const step = () => {
          card.rating.textContent = list[i];
          if (i === list.length - 1) {
            land();
            return;
          }
          const delay = 50 + Math.pow(i / (list.length - 1), 3) * 560;
          i += 1;
          later(step, delay);
        };
        step();
      };

      /* tijdlijn */
      const per = reduce ? 700 : 1100;
      let t = reduce ? 400 : 1000;
      slidesData.forEach((it, i) => {
        later(() => showSlide(it, i, per), t);
        t += per;
      });
      later(() => stage.classList.add('is-build'), t);
      t += reduce ? 300 : 1400;
      later(() => stage.classList.add('is-card'), t);
      later(roll, t + (reduce ? 300 : 950));
    }

    /* ---- Casino reveal ---- */
    function startCasino() {
      clearBody();
      setHead('Casino reveal', 'De rollen draaien\u2026');

      const slot = h('div', 'sdr-slot');
      const marquee = h('div', 'sdr-marquee');
      marquee.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 11; i++) marquee.appendChild(h('i'));
      const sign = h('div', 'sdr-sign', 'Lucky grade');
      const win = h('div', 'sdr-win');
      win.setAttribute('aria-hidden', 'true');

      const reels = [];
      for (let i = 0; i < 3; i++) {
        const reel = h('div', 'sdr-reel');
        const strip = h('div', 'sdr-strip');
        const count = 22 + i * 7;
        const items = makeFillers(value, count, i + 1);
        items.push(value); // index "count": hier stopt de rol, altijd op het echte cijfer
        items.push(...makeFillers(value, 1, i + 11));
        let finalEl = null;
        items.forEach((t, idx) => {
          const sym = h('div', 'sdr-sym');
          const txt = h('span', null, t);
          sym.appendChild(txt);
          if (idx === count) finalEl = txt;
          strip.appendChild(sym);
        });
        reel.appendChild(strip);
        win.appendChild(reel);
        reels.push({ reel, strip, finalIndex: count, finalEl });
      }
      win.appendChild(h('div', 'sdr-payline'));

      const lever = h('div', 'sdr-lever');
      lever.append(h('span', 'sdr-lever-stick'), h('span', 'sdr-lever-ball'));
      lever.setAttribute('aria-hidden', 'true');

      slot.append(marquee, sign, win, lever, h('div', 'sdr-tray'));
      body.appendChild(slot);
      closeBtn.focus({ preventScroll: true });

      const target = (r) => 'translateY(calc(var(--ih) * ' + -(r.finalIndex - 1) + '))';

      const allDone = () => {
        // Veiligheidscheck: elke rol moet op precies het Somtoday-cijfer staan.
        reels.forEach((r) => {
          r.finalEl.textContent = value;
        });
        slot.classList.add('is-win');
        subEl.textContent = 'Dit is je cijfer.';
        complete();
      };

      if (reduce) {
        // Minder beweging: geen vloeiend scrollen, maar de rollen springen wel
        // zichtbaar van cijfer naar cijfer en vertragen tot ze stoppen.
        later(() => {
          let longest = 0;
          reels.forEach((r) => {
            r.strip.style.transition = 'none';
            let k = 0;
            let t = 0;
            const n = r.finalIndex - 1;
            const stepTo = (pos) => {
              r.strip.style.transform = 'translateY(calc(var(--ih) * ' + -pos + '))';
            };
            for (let pos = 1; pos <= n; pos++) {
              t += 50 + Math.pow(pos / n, 3) * 380;
              later(() => stepTo(pos), t);
            }
            later(() => r.reel.classList.add('is-stopped'), t);
            longest = Math.max(longest, t);
            k += 1;
          });
          later(allDone, longest + 350);
        }, 500);
        return;
      }

      later(() => {
        lever.classList.add('is-pull');
        slot.classList.add('is-spinning');
        void slot.offsetHeight; // reflow, zodat de overgang echt start
        reels.forEach((r, i) => {
          const dur = 2300 + i * 850;
          r.reel.classList.add('is-spinning');
          r.strip.style.transition = 'transform ' + dur + 'ms cubic-bezier(.17,.8,.26,1.03)';
          r.strip.style.transform = target(r);
          later(() => r.reel.classList.remove('is-spinning'), Math.round(dur * 0.8));
          later(() => r.reel.classList.add('is-stopped'), dur);
        });
        later(allDone, 2300 + 2 * 850 + 350);
      }, 700);
    }

    /* ---- Rad van fortuin ---- */
    function startWheel() {
      clearBody();
      setHead('Rad van fortuin', 'Het rad draait\u2026');

      const SEG = 10;
      const seg = 360 / SEG;
      const realIdx = 6; // vaste plek van het echte cijfer op het rad
      const pool = [];
      makeFillers(value, 60, 3).forEach((f) => {
        if (!pool.includes(f)) pool.push(f);
      });
      const labels = [];
      let pi = 0;
      for (let i = 0; i < SEG; i++) {
        labels.push(i === realIdx ? value : pool.length ? pool[pi++ % pool.length] : '?');
      }

      const NS = 'http://www.w3.org/2000/svg';
      const el = (tag, attrs) => {
        const e = document.createElementNS(NS, tag);
        Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
        return e;
      };
      const pt = (a, r) => {
        const rad = (a * Math.PI) / 180;
        return [100 + r * Math.sin(rad), 100 - r * Math.cos(rad)];
      };
      const colors = ['#7c3aed', '#2563eb', '#a855f7', '#0ea5e9', '#5b21b6'];

      const wheel = h('div', 'sdr-wheel');
      wheel.setAttribute('aria-hidden', 'true');
      const svg = el('svg', { viewBox: '0 -16 200 218', class: 'sdr-wheel-svg', focusable: 'false' });
      const g = el('g');
      for (let i = 0; i < SEG; i++) {
        const [x1, y1] = pt(i * seg, 92);
        const [x2, y2] = pt((i + 1) * seg, 92);
        g.appendChild(
          el('path', {
            d: 'M100 100 L' + x1.toFixed(2) + ' ' + y1.toFixed(2) +
              ' A92 92 0 0 1 ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' Z',
            fill: colors[i % colors.length],
            stroke: 'rgba(255,255,255,.55)',
            'stroke-width': '1.2'
          })
        );
        const txt = el('text', {
          x: '100',
          y: '38',
          'text-anchor': 'middle',
          'dominant-baseline': 'middle',
          fill: '#fff',
          'font-weight': '800',
          'font-size': labels[i].length > 3 ? '13' : '17',
          transform: 'rotate(' + ((i + 0.5) * seg).toFixed(2) + ' 100 100)'
        });
        txt.textContent = labels[i];
        g.appendChild(txt);
      }
      g.appendChild(el('circle', { cx: '100', cy: '100', r: '95', fill: 'none', stroke: '#f5c542', 'stroke-width': '5' }));
      for (let i = 0; i < 20; i++) {
        const [x, y] = pt(i * 18, 95);
        g.appendChild(el('circle', { cx: x.toFixed(2), cy: y.toFixed(2), r: '2.2', fill: '#fff7cc' }));
      }
      svg.appendChild(g);
      svg.appendChild(el('circle', { cx: '100', cy: '100', r: '13', fill: '#f5c542', stroke: '#7a3d06', 'stroke-width': '2' }));
      const pointer = el('polygon', { points: '100,12 89,-12 111,-12', fill: '#ef4444', stroke: '#fff', 'stroke-width': '2', class: 'sdr-wheel-pointer' });
      svg.appendChild(pointer);
      wheel.appendChild(svg);

      const read = h('div', 'sdr-wheel-read');
      read.setAttribute('aria-hidden', 'true');
      const readLabel = h('span', null, 'Bij de pijl:');
      const readNum = h('strong', 'sdr-wheel-num', '\u2026');
      read.append(readLabel, readNum);
      body.append(wheel, read);
      closeBtn.focus({ preventScroll: true });

      let lastIdx = -1;
      const show = (idx) => {
        if (idx === lastIdx) return;
        lastIdx = idx;
        readNum.textContent = labels[idx];
        pointer.classList.remove('tick');
        void pointer.getBoundingClientRect();
        pointer.classList.add('tick');
      };
      const setAngle = (theta) => g.setAttribute('transform', 'rotate(' + theta.toFixed(2) + ' 100 100)');
      const segUnder = (theta) => Math.floor((((-theta % 360) + 360) % 360) / seg) % SEG;

      const finish = () => {
        readNum.textContent = value; // het segment onder de pijl is het echte cijfer
        wheel.classList.add('is-done');
        read.classList.add('is-done');
        subEl.textContent = 'Dit is je cijfer.';
        complete();
      };

      if (reduce) {
        // Minder beweging: het rad springt van segment naar segment en vertraagt.
        const N = SEG * 2 + realIdx;
        let t = 500;
        for (let pos = 1; pos <= N; pos++) {
          t += 70 + Math.pow(pos / N, 3) * 420;
          const sIdx = pos % SEG;
          later(() => {
            setAngle(-(sIdx + 0.5) * seg);
            show(sIdx);
          }, t);
        }
        later(finish, t + 300);
        return;
      }

      const total = 360 * 5 + (360 - (realIdx + 0.5) * seg);
      const dur = 5800;
      let t0 = 0;
      const frame = (now) => {
        raf = 0;
        if (closed) return;
        if (!t0) t0 = now;
        const p = Math.min(1, (now - t0) / dur);
        const theta = total * (1 - Math.pow(1 - p, 4));
        setAngle(theta);
        show(segUnder(theta));
        if (p < 1) raf = requestAnimationFrame(frame);
        else finish();
      };
      later(() => {
        raf = requestAnimationFrame(frame);
      }, 600);
    }

    /* ---- Kraskaart ---- */
    function startScratch() {
      clearBody();
      setHead('Kraskaart', 'Kras het vak open.');

      const card = h('div', 'sdr-scratch');
      const panel = h('div', 'sdr-sc-panel');
      const numEl = h('div', 'sdr-sc-num', '');
      numEl.setAttribute('data-len', String(Math.min(5, value.length)));
      numEl.setAttribute('aria-hidden', 'true');
      const canvas = document.createElement('canvas');
      canvas.className = 'sdr-sc-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      panel.append(numEl, canvas);
      card.append(h('div', 'sdr-sc-title', 'Kraskaart'), panel);

      const hint = h('p', 'sdr-sc-hint', 'Kras met je muis of vinger. Het cijfer verandert nog even.');
      const autoRow = h('div', 'sdr-foot');
      const autoBtn = h('button', 'sdr-ghost', 'Automatisch krassen');
      autoBtn.type = 'button';
      autoRow.appendChild(autoBtn);
      body.append(card, hint, autoRow);
      closeBtn.focus({ preventScroll: true });

      /* canvas voorbereiden */
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth || 300;
      const H = canvas.clientHeight || 150;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.scale(dpr, dpr);

      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#cfc9f5');
      grad.addColorStop(0.35, '#8f87cc');
      grad.addColorStop(0.65, '#e9e6ff');
      grad.addColorStop(1, '#7d75b9');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      for (let x = -H; x < W + H; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.lineTo(x + H, 0);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(45,25,100,0.6)';
      ctx.font = '800 ' + Math.round(Math.min(26, W / 9)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('KRAS HIER', W / 2, H / 2);

      const brush = Math.max(26, Math.round(W * 0.1));
      const scratch = (x0, y0, x1, y1) => {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = brush;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      };
      const clearedShare = () => {
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const stride = Math.max(4, Math.round(8 * dpr));
        let n = 0;
        let c = 0;
        for (let y = 0; y < canvas.height; y += stride) {
          for (let x = 0; x < canvas.width; x += stride) {
            n += 1;
            if (d[(y * canvas.width + x) * 4 + 3] < 40) c += 1;
          }
        }
        return n ? c / n : 0;
      };

      /* wisselende cijfers onder het laagje (alleen decoratie) */
      const cycle = makeFillers(value, 40, 9);
      let settled = false;
      let k = 0;
      const tick = () => {
        if (settled) return;
        numEl.textContent = cycle[k++ % cycle.length];
        later(tick, reduce ? 260 : 90);
      };
      tick();

      const settle = () => {
        if (settled) return;
        settled = true;
        canvas.classList.add('is-cleared');
        autoRow.remove();
        hint.textContent = 'Het cijfer komt tot rust\u2026';
        subEl.textContent = 'Het cijfer komt tot rust\u2026';
        const list = makeFillers(value, 14, 5);
        list.push(value);
        let i = 0;
        const step = () => {
          numEl.textContent = list[i];
          if (i === list.length - 1) {
            card.classList.add('is-done');
            hint.remove();
            subEl.textContent = 'Dit is je cijfer.';
            complete();
            return;
          }
          const delay = 110 + Math.pow(i / (list.length - 1), 2) * 520;
          i += 1;
          later(step, delay);
        };
        step();
      };

      let lastCheck = 0;
      const check = (force) => {
        if (settled) return;
        const now = performance.now();
        if (!force && now - lastCheck < 120) return;
        lastCheck = now;
        if (clearedShare() >= 0.42) settle();
      };

      /* muis en touch */
      let drawing = false;
      let last = null;
      const pos = (e) => {
        const r = canvas.getBoundingClientRect();
        return {
          x: ((e.clientX - r.left) / (r.width || 1)) * W,
          y: ((e.clientY - r.top) / (r.height || 1)) * H
        };
      };
      canvas.addEventListener('pointerdown', (e) => {
        if (settled) return;
        drawing = true;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (err) {
          /* negeren */
        }
        last = pos(e);
        scratch(last.x, last.y, last.x, last.y);
        e.preventDefault();
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!drawing || settled) return;
        const p = pos(e);
        scratch(last.x, last.y, p.x, p.y);
        last = p;
        check(false);
      });
      ['pointerup', 'pointercancel'].forEach((t) =>
        canvas.addEventListener(t, () => {
          drawing = false;
          check(true);
        })
      );

      /* automatisch krassen (ook voor toetsenbord) */
      let autoStarted = false;
      autoBtn.addEventListener('click', () => {
        if (autoStarted || settled) return;
        autoStarted = true;
        autoBtn.disabled = true;
        const segs = [];
        let dir = 1;
        for (let y = brush / 2; y < H + brush / 2; y += brush * 0.75) {
          const yy = Math.min(H - brush / 4, y);
          const xa = dir === 1 ? brush / 3 : W - brush / 3;
          const xb = dir === 1 ? W - brush / 3 : brush / 3;
          for (let q = 0; q < 4; q++) {
            segs.push([xa + ((xb - xa) * q) / 4, yy, xa + ((xb - xa) * (q + 1)) / 4, yy]);
          }
          dir = -dir;
        }
        if (reduce) {
          segs.forEach((sg) => scratch(sg[0], sg[1], sg[2], sg[3]));
          settle();
          return;
        }
        segs.forEach((sg, idx) => {
          later(() => scratch(sg[0], sg[1], sg[2], sg[3]), idx * 45);
        });
        later(() => {
          check(true);
          settle();
        }, segs.length * 45 + 60);
      });
    }

    /* ---- Dobbelstenen ---- */
    function startDice() {
      clearBody();
      setHead('Dobbelstenen', 'De dobbelstenen rollen\u2026');

      // Welke draaihoek laat welke zijde naar voren kijken?
      const ANG_A = [0, 0, 0, 0, -90, 90];
      const ANG_B = [0, 180, -90, 90, 0, 0];

      const row = h('div', 'sdr-dice-row');
      row.setAttribute('aria-hidden', 'true');
      const chars = Array.from(value);
      const dice = chars.map((ch, i) => {
        const real = 1 + ((i * 2) % 5); // zijde met het echte teken; nooit zijde 0 (beginstand)
        const pool = /\d/.test(ch)
          ? '0123456789'.split('').filter((d) => d !== ch)
          : ['.', ',', ';', ':', '\u00b7', '/'].filter((d) => d !== ch);
        const faces = [];
        let pi = (i * 3 + 1) % pool.length;
        for (let f = 0; f < 6; f++) {
          if (f === real) {
            faces.push(ch);
          } else {
            faces.push(pool[pi % pool.length]);
            pi += 1;
          }
        }
        const die = h('div', 'sdr-die');
        const cube = h('div', 'sdr-cube');
        faces.forEach((t, f) => {
          const face = h('div', 'sdr-dface sdr-f' + f);
          face.appendChild(h('span', null, t));
          cube.appendChild(face);
        });
        die.append(cube, h('div', 'sdr-die-shadow'));
        row.appendChild(die);
        return { die, cube, real, i };
      });
      body.appendChild(row);
      closeBtn.focus({ preventScroll: true });

      let landed = 0;
      const allDone = () => {
        subEl.textContent = 'Dit is je cijfer.';
        complete();
      };
      const onLanded = (d) => {
        d.die.classList.add('is-landed');
        landed += 1;
        if (landed === dice.length) later(allDone, 400);
      };

      dice.forEach((d) => {
        const others = [0, 1, 2, 3, 4, 5].filter((f) => f !== d.real);
        const steps = [];
        const n = 6 + d.i * 2;
        for (let s = 0; s < n - 1; s++) steps.push(others[(s * 2 + d.i) % 5]);
        steps.push(d.real);

        let s = 0;
        const next = () => {
          const face = steps[s];
          const isLast = s === steps.length - 1;
          if (reduce) {
            d.cube.style.transition = 'none';
            d.cube.style.transform = 'rotateX(' + ANG_A[face] + 'deg) rotateY(' + ANG_B[face] + 'deg)';
            const wait = 150 + Math.pow(s / steps.length, 2) * 420;
            s += 1;
            if (isLast) later(() => onLanded(d), 250);
            else later(next, wait);
            return;
          }
          const dur = isLast ? 1300 : Math.round(380 + (s / steps.length) * 450);
          const spins = s + 1;
          d.cube.style.transition = 'transform ' + dur + 'ms ' + (isLast ? 'cubic-bezier(.2,.8,.2,1)' : 'linear');
          d.cube.style.transform =
            'rotateX(' + (ANG_A[face] + 360 * spins) + 'deg) rotateY(' + (ANG_B[face] + 360 * spins) + 'deg)';
          s += 1;
          if (isLast) later(() => onLanded(d), dur);
          else later(next, dur);
        };
        later(next, 500 + d.i * 350);
      });
    }

    /* ---- Lootbox ---- */
    function startLootbox() {
      clearBody();
      setHead('Lootbox', 'Klik op de kist om te openen.');

      const tier = tierOf(value);
      const REAL = 33; // vaste plek van het echte cijfer op de rol
      const COUNT = 40;
      const pool = makeFillers(value, COUNT - 1, 21);
      const labels = [];
      let pi = 0;
      for (let i = 0; i < COUNT; i++) labels.push(i === REAL ? value : pool[pi++ % pool.length]);

      const stage = h('div', 'sdr-lb');
      const crateBtn = h('button', 'sdr-lb-crate');
      crateBtn.type = 'button';
      crateBtn.setAttribute('aria-label', 'Open de lootbox');
      crateBtn.appendChild(crateArt());

      const sparks = h('div', 'sdr-lb-sparks');
      sparks.setAttribute('aria-hidden', 'true');

      const reel = h('div', 'sdr-lb-reel');
      reel.setAttribute('aria-hidden', 'true');
      const strip = h('div', 'sdr-lb-strip');
      labels.forEach((t) => {
        const it = h('div', 'sdr-lb-item');
        const num = h('span', 'sdr-lb-num', t);
        num.setAttribute('data-len', String(Math.min(5, t.length)));
        it.appendChild(num);
        strip.appendChild(it);
      });
      const marker = h('div', 'sdr-lb-marker');
      reel.append(strip, marker);

      const glow = h('div', 'sdr-lb-glow');
      const beam = h('div', 'sdr-lb-beam');
      stage.append(glow, beam, crateBtn, sparks, reel);
      const hint = h('p', 'sdr-lb-hint', 'Klik op de kist om te openen');
      body.append(stage, hint);
      crateBtn.focus({ preventScroll: true });

      /* rol: positie van de strip zodat item i onder de markering staat */
      const cw = () => reel.clientWidth || 360;
      const first = () => strip.children[0];
      const step = () => strip.children[1].offsetLeft - first().offsetLeft;
      const xFor = (i) => {
        const el = strip.children[i];
        return -(el.offsetLeft + el.offsetWidth / 2 - cw() / 2);
      };
      let lastIdx = -1;
      const place = (x) => {
        strip.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
        const el0 = first();
        const idx = Math.max(
          0,
          Math.min(COUNT - 1, Math.round((-x + cw() / 2 - el0.offsetWidth / 2 - el0.offsetLeft) / step()))
        );
        if (idx !== lastIdx) {
          lastIdx = idx;
          marker.classList.remove('tick');
          void marker.offsetWidth;
          marker.classList.add('tick');
        }
      };

      const land = () => {
        const it = strip.children[REAL];
        it.firstChild.textContent = value; // het echte cijfer, rechtstreeks uit Somtoday
        it.setAttribute('data-tier', tier);
        it.classList.add('is-win');
        marker.classList.add('is-hit');
        stage.classList.add('is-land');
        subEl.textContent = 'Dit is je cijfer.';
        complete();
      };

      const spin = () => {
        subEl.textContent = 'Wat zit erin\u2026';
        const startIdx = 3;
        const x0 = xFor(startIdx);
        const x1 = xFor(REAL);
        if (reduce) {
          // Minder beweging: de rol springt van cijfer naar cijfer en vertraagt.
          const n = REAL - startIdx;
          let t = 0;
          for (let k = 1; k <= n; k++) {
            t += 60 + Math.pow(k / n, 3) * 420;
            const idx = startIdx + k;
            later(() => place(xFor(idx)), t);
          }
          later(land, t + 350);
          return;
        }
        const dur = 6500;
        let t0 = 0;
        const frame = (now) => {
          raf = 0;
          if (closed) return;
          if (!t0) t0 = now;
          const p = Math.min(1, (now - t0) / dur);
          const e = 1 - Math.pow(1 - p, 4);
          place(x0 + (x1 - x0) * e);
          if (p < 1) raf = requestAnimationFrame(frame);
          else land();
        };
        raf = requestAnimationFrame(frame);
      };

      const burst = () => {
        if (reduce) return;
        const colors = ['#c4b5fd', '#93c5fd', '#22e6ff', '#ffffff', '#f5c542'];
        for (let i = 0; i < 28; i++) {
          const sp = h('i', 'sdr-lb-spark');
          const ang = (i / 28) * Math.PI * 2 + (i % 2) * 0.2;
          const dist = 5 + (i % 5) * 1.6;
          sp.style.setProperty('--sx', (Math.cos(ang) * dist * 1.3).toFixed(2) + 'em');
          sp.style.setProperty('--sy', (Math.sin(ang) * dist - 3).toFixed(2) + 'em');
          sp.style.setProperty('--c', colors[i % colors.length]);
          sparks.appendChild(sp);
        }
        later(() => {
          sparks.textContent = '';
        }, 1200);
      };

      let opened = false;
      crateBtn.addEventListener('click', () => {
        if (opened) return;
        opened = true;
        hint.remove();
        crateBtn.setAttribute('aria-disabled', 'true');
        subEl.textContent = 'De kist gaat open\u2026';
        place(xFor(3));
        stage.classList.add('is-shake');
        later(() => {
          stage.classList.add('is-open');
          burst();
        }, reduce ? 200 : 1300);
        later(() => stage.classList.add('is-reel'), reduce ? 400 : 2200);
        later(spin, reduce ? 700 : 2900);
      });
    }

    /* ---- Starten ---- */
    document.body.appendChild(overlay);
    showChoice();

    return { close };
  }

  window.addEventListener('pagehide', () => {
    if (active) active.close();
  });

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */

  const observer = new MutationObserver((records) => {
    if (records.every(isOwnMutation)) return;
    schedule();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  document.addEventListener('DOMContentLoaded', scan);
  window.addEventListener('load', scan);
  window.addEventListener('popstate', schedule);
  window.addEventListener('hashchange', schedule);
  scan();
})();
