/* ============================================================
   column_order.js — ordine delle colonne scelto dall'utente
   ------------------------------------------------------------
   File comune a tutti i progetti Chronofit: tenerlo identico.

   Ogni tabella si registra con l'elenco delle chiavi delle
   colonne nell'ordine dell'HTML (che è anche l'ordine
   predefinito). Le celle vengono riconosciute dalla classe
   (col-index, timestamp, delta-time, …), non dalla posizione,
   quindi le righe create dagli script con il loro ordine fisso
   vengono riordinate da un MutationObserver appena inserite.
   Le tabelle senza classi sulle celle (tempi netti) usano
   `positional: true`: la posizione vale solo per le righe nuove.

   L'ordine è salvato in localStorage per pagina e tabella.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_PREFIX = 'chronofit_col_order:';

  // classe della cella → chiave della colonna
  const CLASS_KEYS = [
    ['col-rank', 'rank'], ['col-index', 'index'], ['col-line', 'line'], ['col-id', 'id'],
    ['col-competitor', 'competitor'], ['col-comp', 'competitor'],
    ['col-test', 'test'], ['col-trigger', 'trigger'],
    ['col-name', 'name'], ['col-surname', 'surname'],
    ['timestamp', 'timestamp'], ['race-time', 'race'],
    ['elapsed-time', 'elapsed'], ['delta-time', 'delta'],
    ['penality-cell', 'penalty'],
  ];
  // classe da dare a una cella creata o riconosciuta per completare una riga
  const KEY_CLASS = {
    rank: 'col-rank', index: 'col-index', line: 'col-line', id: 'col-id',
    competitor: 'col-competitor', test: 'col-test', trigger: 'col-trigger',
    name: 'col-name', surname: 'col-surname', timestamp: 'timestamp',
    race: 'race-time', elapsed: 'elapsed-time', delta: 'delta-time',
  };

  const TEXTS = {
    it: {
      title: '↕ Ordine colonne',
      hint: 'Sposta le colonne con le frecce. Vale anche per le colonne nascoste.',
      reset: 'Ordine predefinito',
      up: 'Sposta a sinistra', down: 'Sposta a destra', hidden: 'nascosta',
      rank: 'Classifica', index: 'Indice', penalty: 'Penalità', cancel: 'Annulla', send: 'Invio',
      start: 'Partenza', finish: 'Arrivo', net: 'Tempo netto',
    },
    en: {
      title: '↕ Column order',
      hint: 'Move columns with the arrows. Hidden columns are included.',
      reset: 'Default order',
      up: 'Move left', down: 'Move right', hidden: 'hidden',
      rank: 'Ranking', index: 'Index', penalty: 'Penalty', cancel: 'Cancel', send: 'Send',
      start: 'Start', finish: 'Finish', net: 'Net time',
    },
  };

  const tables = {};   // id tabella → stato

  function lang() {
    let l = (typeof _lang !== 'undefined' && _lang) || '';
    if (!l) { try { l = localStorage.getItem('chronofit_lang') || ''; } catch (e) { /* storage non disponibile */ } }
    return l === 'it' ? 'it' : (l ? 'en' : 'it');
  }
  function tx(key) { return (TEXTS[lang()] || TEXTS.it)[key] || TEXTS.it[key] || key; }

  function pageName() {
    const p = (location.pathname.split('/').pop() || 'index.html').replace(/\.gz$/, '');
    return p.replace(/\.html?$/, '') || 'index';
  }

  function loadOrder(st) {
    for (const k of [st.storageKey].concat(st.fallbackKeys)) {
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + k);
        if (raw) return normalize(JSON.parse(raw), st.keys);
      } catch (e) { /* valore corrotto o storage non disponibile */ }
    }
    return st.keys.slice();
  }

  function saveOrder(st) {
    try {
      if (sameOrder(st.order, st.keys)) localStorage.removeItem(STORAGE_PREFIX + st.storageKey);
      else localStorage.setItem(STORAGE_PREFIX + st.storageKey, JSON.stringify(st.order));
    } catch (e) { /* storage non disponibile: l'ordine vale fino al ricaricamento */ }
  }

  // tiene solo le chiavi note e aggiunge in coda (nella posizione predefinita
  // relativa) quelle nuove, così un ordine salvato sopravvive a colonne aggiunte
  function normalize(order, keys) {
    const out = Array.isArray(order) ? order.filter((k, i) => keys.includes(k) && order.indexOf(k) === i) : [];
    keys.forEach((k, i) => {
      if (out.includes(k)) return;
      const prev = keys.slice(0, i).reverse().find(p => out.includes(p));
      out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k);
    });
    return out;
  }

  function sameOrder(a, b) { return a.length === b.length && a.every((k, i) => k === b[i]); }

  function classKey(td) {
    if (td.dataset.col) return td.dataset.col;
    const cl = td.classList;
    for (const [c, k] of CLASS_KEYS) if (cl.contains(c)) return k;
    if (td.querySelector('.cancel-btn')) return 'cancel';
    if (td.querySelector('.send-btn')) return 'send';
    if (td.querySelector('.penality')) return 'penalty';
    return null;
  }

  function headerCell(st, key) {
    return st.table.querySelector('thead th[data-col="' + key + '"]');
  }

  // la cella aggiunta prende la visibilità attuale della colonna
  function adopt(st, td, key) {
    td.dataset.col = key;
    if (!td.className && KEY_CLASS[key]) td.className = KEY_CLASS[key];
    const th = headerCell(st, key);
    if (th && th.style.display && !td.style.display) td.style.display = th.style.display;
  }

  function arrangeHeader(st) {
    const tr = st.table.querySelector('thead tr');
    if (!tr) return;
    const ths = Array.from(tr.children);
    const want = st.order.map(k => ths.find(th => th.dataset.col === k)).filter(Boolean)
      .concat(ths.filter(th => !th.dataset.col));
    if (sameOrder(ths, want)) return;
    want.forEach(th => tr.appendChild(th));
  }

  function arrangeRow(st, tr) {
    const cells = Array.from(tr.children);
    if (cells.length < 2 || cells.some(c => c.tagName !== 'TD' || c.colSpan > 1)) return;

    const byKey = {};
    const unkeyed = [];
    cells.forEach((td, i) => {
      let k = classKey(td);
      if (!k && st.positional && !td.dataset.col) k = st.keys[i];
      if (k && st.keys.includes(k) && !byKey[k]) { byKey[k] = td; td.dataset.col = k; }
      else unkeyed.push(td);
    });

    // celle vuote senza classe (righe dei distacchi): vanno alle colonne mancanti
    const missing = st.keys.filter(k => !byKey[k]);
    const extra = [];
    unkeyed.forEach(td => {
      const k = missing.shift();
      if (k) { byKey[k] = td; adopt(st, td, k); } else extra.push(td);
    });
    missing.forEach(k => {
      const td = document.createElement('td');
      adopt(st, td, k);
      byKey[k] = td;
    });

    const want = st.order.map(k => byKey[k]).concat(extra);
    if (sameOrder(cells, want)) return;
    want.forEach(td => tr.appendChild(td));
  }

  function arrangeAll(st) {
    arrangeHeader(st);
    st.table.querySelectorAll('tbody tr').forEach(tr => arrangeRow(st, tr));
  }

  function observe(st) {
    const obs = new MutationObserver(records => {
      const rows = new Set();
      records.forEach(r => {
        const node = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (!node || !node.closest('tbody')) return;
        const tr = node.closest('tr');
        if (tr) rows.add(tr);
        r.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          if (n.tagName === 'TR') rows.add(n);
          else n.querySelectorAll && n.querySelectorAll('tr').forEach(x => rows.add(x));
        });
      });
      rows.forEach(tr => { if (tr.isConnected && st.table.contains(tr)) arrangeRow(st, tr); });
      obs.takeRecords();   // scarta le mutazioni causate dal riordino appena fatto
    });
    obs.observe(st.table, { childList: true, subtree: true });
  }

  /* ── Editor nelle impostazioni ─────────────────────────────── */

  function label(st, key) {
    if (st.labels[key]) return st.labels[key];
    const th = headerCell(st, key);
    const text = th ? th.textContent.replace(/[▲▼↑↓⇅]/g, '').replace(/\s+/g, ' ').trim() : '';
    const descr = TEXTS.it[key] ? tx(key) : '';
    if (!text) return descr || key;
    // intestazioni fatte solo di simboli (🏅, #, ❌, 🚫): aggiunge la descrizione
    return /\p{L}/u.test(text) || !descr ? text : text + ' ' + descr;
  }

  function isHidden(st, key) {
    const th = headerCell(st, key);
    return !!th && th.style.display === 'none';
  }

  function renderEditors(st) {
    st.editors.forEach(box => {
      box.innerHTML = '';
      const title = document.createElement('div');
      title.className = 'colorder-title';
      title.textContent = tx('title');
      const hint = document.createElement('div');
      hint.className = 'colorder-hint';
      hint.textContent = tx('hint');
      const list = document.createElement('div');
      list.className = 'colorder-list';
      st.order.forEach((k, i) => {
        const row = document.createElement('div');
        row.className = 'colorder-item' + (isHidden(st, k) ? ' colorder-hidden' : '');
        const name = document.createElement('span');
        name.className = 'colorder-name';
        name.textContent = label(st, k);
        if (isHidden(st, k)) {
          const h = document.createElement('small');
          h.textContent = ' (' + tx('hidden') + ')';
          name.appendChild(h);
        }
        row.appendChild(name);
        [['▲', -1, 'up'], ['▼', 1, 'down']].forEach(([sym, dir, tip]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'colorder-btn';
          b.textContent = sym;
          b.title = tx(tip);
          b.disabled = (dir < 0 && i === 0) || (dir > 0 && i === st.order.length - 1);
          b.addEventListener('click', ev => { ev.stopPropagation(); move(st.id, k, dir); });
          row.appendChild(b);
        });
        list.appendChild(row);
      });
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'colorder-reset';
      reset.textContent = tx('reset');
      reset.disabled = sameOrder(st.order, st.keys);
      reset.addEventListener('click', ev => { ev.stopPropagation(); ColumnOrder.reset(st.id); });
      box.append(title, hint, list, reset);
    });
  }

  function move(id, key, dir) {
    const st = tables[id];
    if (!st) return;
    const o = st.order.slice();
    const i = o.indexOf(key), j = i + dir;
    if (i < 0 || j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    ColumnOrder.setOrder(id, o);
  }

  function injectStyle() {
    if (document.getElementById('colorder-style')) return;
    const css = document.createElement('style');
    css.id = 'colorder-style';
    css.textContent =
      '.colorder-box{margin-top:14px;padding-top:10px;border-top:1px solid rgba(128,128,128,.35);text-align:left}' +
      '.colorder-title{font-weight:bold;font-size:18px;margin-bottom:2px}' +
      '.colorder-hint{font-size:13px;opacity:.7;margin-bottom:8px}' +
      '.colorder-list{display:flex;flex-direction:column;gap:4px}' +
      '.colorder-item{display:flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid rgba(128,128,128,.3);border-radius:8px}' +
      '.colorder-hidden{opacity:.55}' +
      '.colorder-name{flex:1;font-size:16px}' +
      '.colorder-btn{width:38px;height:32px;padding:0;margin:0;font-size:15px;line-height:1;border-radius:6px;cursor:pointer}' +
      '.colorder-btn:disabled{opacity:.3;cursor:default}' +
      '.colorder-reset{margin-top:8px;padding:6px 14px;font-size:15px;border-radius:6px;cursor:pointer}' +
      '.colorder-reset:disabled{opacity:.4;cursor:default}';
    document.head.appendChild(css);
  }

  let refreshTimer = null;
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => Object.values(tables).forEach(renderEditors), 0);
  }

  /* ── API ───────────────────────────────────────────────────── */

  const ColumnOrder = {
    /**
     * opts.table       id della tabella
     * opts.keys        chiavi delle colonne nell'ordine dell'HTML (= predefinito)
     * opts.storageKey  chiave di salvataggio (predefinita: pagina:id)
     * opts.fallbackKeys chiavi da cui leggere l'ordine se manca il proprio
     * opts.editor      contenitore (selettore o elemento) in cui aggiungere l'editor;
     *                  opts.editorAfter: elemento dopo la cui .toggle-row inserirlo
     * opts.positional  le celle senza classe si riconoscono dalla posizione
     * opts.labels      etichette per chiave (altrimenti il testo dell'intestazione)
     */
    register(opts) {
      const table = document.getElementById(opts.table);
      if (!table || tables[opts.table]) return;
      const ths = Array.from(table.querySelectorAll('thead tr:first-child > th'));
      ths.forEach((th, i) => { if (opts.keys[i] && !th.dataset.col) th.dataset.col = opts.keys[i]; });
      const st = {
        id: opts.table,
        table,
        keys: opts.keys.slice(),
        storageKey: opts.storageKey || (pageName() + ':' + opts.table),
        fallbackKeys: opts.fallbackKeys || [],
        positional: !!opts.positional,
        labels: opts.labels || {},
        editors: [],
      };
      st.order = loadOrder(st);
      tables[st.id] = st;

      injectStyle();
      const host = typeof opts.editor === 'string' ? document.querySelector(opts.editor) : opts.editor;
      const after = typeof opts.editorAfter === 'string' ? document.querySelector(opts.editorAfter) : opts.editorAfter;
      if (host || after) {
        const box = document.createElement('div');
        box.className = 'colorder-box';
        box.addEventListener('click', ev => ev.stopPropagation());
        if (host) host.appendChild(box);
        else {
          const anchor = after.closest('.toggle-row') || after;
          anchor.parentNode.insertBefore(box, anchor.nextSibling);
        }
        st.editors.push(box);
      }

      arrangeAll(st);
      observe(st);
      renderEditors(st);
    },

    getOrder(id) { return tables[id] ? tables[id].order.slice() : null; },

    setOrder(id, order) {
      const st = tables[id];
      if (!st) return;
      st.order = normalize(order, st.keys);
      saveOrder(st);
      arrangeAll(st);
      renderEditors(st);
    },

    reset(id) { const st = tables[id]; if (st) ColumnOrder.setOrder(id, st.keys); },

    /** da chiamare se cambiano lingua o visibilità delle colonne */
    refreshEditors: scheduleRefresh,
  };

  // interruttori delle colonne, apertura delle impostazioni e cambio lingua
  // cambiano etichette e stato "nascosta": l'editor si ridisegna dopo il gestore
  document.addEventListener('change', scheduleRefresh, true);
  document.addEventListener('click', scheduleRefresh, true);
  window.addEventListener('load', scheduleRefresh);   // intestazioni già tradotte

  window.ColumnOrder = ColumnOrder;
})();
