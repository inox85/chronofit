// ── Chronofit — Vista Equitazione: sola visualizzazione ─────────────────────
// Pagina pensata per un secondo schermo (proiettore/monitor). Mostra la STESSA
// griglia della tabella Arrivi della console (index.html / script.js) per la
// disciplina Equitazione: una riga per passaggio, con le stesse colonne,
// lo stesso ordinamento, gli stessi Δ (dal passaggio precedente) e trascorso
// (dal primo passaggio), lo stesso filtro linee.
//
// Impostazioni, in ordine di priorità:
//   1. quelle salvate dal popup di questa vista (VIEW_SETTINGS_KEY);
//   2. quelle della console, se il browser è lo stesso e la disciplina attiva
//      è Equitazione (chiavi chronofit_view_prefs / chronofit_discipline);
//   3. il preset "equestrian" di disciplines.js.

const VIEW_SETTINGS_KEY  = 'chronofit_equestrian_view_settings';
const CONSOLE_PREFS_KEY  = 'chronofit_view_prefs';     // = VIEW_PREFS_KEY di script.js
const CONSOLE_DISC_KEY   = 'chronofit_discipline';     // = DISCIPLINE_KEY di script.js
const DISCIPLINE_ID      = 'equestrian';

// Stessi colori di linea della console (lineColors in script.js)
const lineColors = {
  1: "#ffcccc",
  2: "#ccffcc",
  3: "#ccccff",
  4: "#fff5cc",
  5: "#808080ff",
  6: "#808080ff"
};

// Default di fabbrica della console per la visibilità linee (DEFAULT_LINE_VISIBILITY)
const DEFAULT_LINE_VISIBILITY = { "1": true, "2": true, "3": true, "4": true, "5": false, "6": true };

const VIEW_FIELDS = ['showRank', 'showIndex', 'showLine', 'showTest', 'showName', 'showSurname',
                     'timestamp', 'deltaTime', 'elapsedTime', 'penality', 'showDisabled', 'reverseOrder'];

let viewPrefs = null;

function _presetPrefs() {
  const disc = (typeof DISCIPLINES !== 'undefined') ? DISCIPLINES.find(d => d.id === DISCIPLINE_ID) : null;
  return disc ? { ...disc.prefs } : {};
}

function _consolePrefs() {
  try {
    if (localStorage.getItem(CONSOLE_DISC_KEY) !== DISCIPLINE_ID) return null;
    const raw = localStorage.getItem(CONSOLE_PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function _ownPrefs() {
  try {
    const raw = localStorage.getItem(VIEW_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// Normalizza con gli stessi default che usa la console (applyDisciplinePreset).
function _normalize(p) {
  return {
    showRank:     p.showRank     ?? false,
    showIndex:    p.showIndex    ?? true,
    showLine:     p.showLine     ?? true,
    showTest:     p.showTest     ?? false,
    showName:     p.showName     ?? false,
    showSurname:  p.showSurname  ?? false,
    timestamp:    p.timestamp    ?? true,
    deltaTime:    p.deltaTime    ?? true,
    elapsedTime:  p.elapsedTime  ?? false,
    penality:     p.penality     ?? true,
    showDisabled: p.showDisabled ?? false,
    reverseOrder: p.reverseOrder ?? false,
    sortCol:      p.sortCol      || 'arrival',
    timePrecision: Math.max(1, Math.min(3, parseInt(p.timePrecision) || 3)),
    lines:        p.lines        || DEFAULT_LINE_VISIBILITY,
  };
}

function loadViewPrefs() {
  viewPrefs = _normalize(_ownPrefs() ?? _consolePrefs() ?? _presetPrefs());
  // Il tempo di gara della console esiste solo in modalità split, che questa
  // vista non gestisce: ordinare per "race-time" equivale all'ordine di arrivo
  // (nella console, senza split, la colonna è vuota per tutte le righe).
  if (viewPrefs.sortCol === 'race-time') viewPrefs.sortCol = 'arrival';
}

function saveOwnPrefs() {
  try { localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(viewPrefs)); } catch (e) {}
}

// ── Athlete registry (sola lettura, stessa chiave della console) ───────────
const ATHLETES_KEY = "chronofit_athletes";

function findAthlete(competitorNum) {
  try {
    const registry = JSON.parse(localStorage.getItem(ATHLETES_KEY) || "[]");
    return registry.find(a => String(a.competitor) === String(competitorNum)) ?? null;
  } catch (e) { return null; }
}

function getAthleteName(competitorNum) {
  const a = findAthlete(competitorNum);
  if (!a) return "";
  return a.name || a.firstname || a.nome || "";
}

function getAthleteSurname(competitorNum) {
  const a = findAthlete(competitorNum);
  if (!a) return "";
  return a.surname || a.lastname || a.cognome || "";
}

// ── Tempi (stesse funzioni della console) ──────────────────────────────────
function truncateMs(ms, precision) {
  if (precision === 1) return Math.floor(ms / 100) * 100;
  if (precision === 2) return Math.floor(ms / 10)  * 10;
  return ms;
}

function formatTime(h, m, s, ms, precision) {
  const msT = truncateMs(ms, precision);
  const msStr = precision === 1
    ? String(Math.floor(msT / 100))
    : precision === 2
      ? String(Math.floor(msT / 10)).padStart(2, "0")
      : String(msT).padStart(3, "0");
  return (
    String(h).padStart(2, "0") + ":" +
    String(m).padStart(2, "0") + ":" +
    String(s).padStart(2, "0") + "." +
    msStr
  );
}

function formatDuration(ms, precision) {
  ms = truncateMs(Math.abs(ms), precision);
  const h  = Math.floor(ms / 3600000);
  const m  = Math.floor((ms % 3600000) / 60000);
  const s  = Math.floor((ms % 60000) / 1000);
  return formatTime(h, m, s, ms % 1000, precision);
}

function rowToMs(row, precision) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return ((h * 3600 + m * 60 + s) * 1000) + truncateMs(ms, precision);
}

// Colonna "Prova": nome del dispositivo della linea come nella console
// (testColumnLabel di script.js); vuoto = "Non gestita".
function testColumnLabel(lineNumber, test) {
  if (Number(lineNumber) === 5) return 'Sync-Test';
  if (Number(lineNumber) === 6) return 'F.P.';
  return test ? String(test) : t('cp.tipo1_none');
}

// ── Griglia ─────────────────────────────────────────────────────────────────
// Upsert per data-row-id: nuovi checkpoint (TYPE_CHECKPOINT) e modifiche
// (TYPE_ROW_UPDATED, es. penalità o annullamento) arrivano con lo stesso id.
function upsertRow(cp) {
  const tbody = document.querySelector('#event-table tbody');
  let row = tbody.querySelector(`tr[data-row-id="${cp.id}"]`);
  if (!row) {
    row = document.createElement('tr');
    row.innerHTML =
      '<td class="col-rank"></td>' +
      '<td class="col-index"></td>' +
      '<td class="col-line"></td>' +
      '<td class="col-competitor"></td>' +
      '<td class="col-test"></td>' +
      '<td class="col-name"></td>' +
      '<td class="col-surname"></td>' +
      '<td class="timestamp"></td>' +
      '<td class="delta-time"></td>' +
      '<td class="elapsed-time"></td>' +
      '<td class="penality-cell"></td>';
    tbody.appendChild(row);
  }
  row.dataset.rowId      = cp.id;
  row.dataset.line       = cp.ln;
  row.dataset.competitor = cp.c;
  row.dataset.hour       = cp.h;
  row.dataset.minute     = cp.m;
  row.dataset.seconds    = cp.s;
  row.dataset.msRaw      = cp.ms;
  if (cp.p  !== undefined) row.dataset.test      = cp.p;
  if (cp.x  !== undefined) row.dataset.penality  = cp.x;
  if (cp.e  !== undefined) row.dataset.enabled   = Number(cp.e) ? '1' : '0';
  if (cp.an !== undefined) row.dataset.cancelled = Number(cp.an) ? '1' : '0';
  return row;
}

function clearRows() {
  document.querySelector('#event-table tbody').innerHTML = '';
}

function getRowSortVal(row, sc) {
  switch (sc) {
    case 'arrival':      return Number(row.dataset.rowId || 0);
    case 'line':         return Number(row.dataset.line) || 0;
    case 'competitor':   return Number(row.dataset.competitor) || 0;
    case 'name':         return (row.querySelector('.col-name')?.textContent  || '').toLowerCase();
    case 'surname':      return (row.querySelector('.col-surname')?.textContent || '').toLowerCase();
    case 'event-time':   return rowToMs(row, 3);
    case 'delta-time':   return row._deltaMs   ?? Infinity;
    case 'elapsed-time': return row._elapsedMs ?? Infinity;
    default:             return Number(row.dataset.rowId || 0);
  }
}

// Ridisegna tutta la griglia: testo delle celle, filtro linee/righe
// disabilitate, Δ ed elapsed in ordine cronologico, ordinamento, 🏅, colonne.
function renderTable() {
  const p = viewPrefs;
  const prec = p.timePrecision;
  const tbody = document.querySelector('#event-table tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));

  rows.forEach(row => {
    const ln = row.dataset.line;
    const comp = Number(row.dataset.competitor) || 0;
    row.querySelector('.col-index').textContent = row.dataset.rowId;
    const lineTd = row.querySelector('.col-line');
    lineTd.textContent = ln;
    lineTd.style.backgroundColor = lineColors[ln] || '#f5f5f5';
    row.querySelector('.col-competitor').textContent = comp > 0 ? comp : '';
    row.querySelector('.col-test').textContent = testColumnLabel(ln, row.dataset.test);
    row.querySelector('.col-name').textContent = getAthleteName(comp);
    row.querySelector('.col-surname').textContent = getAthleteSurname(comp);
    row.querySelector('.timestamp').textContent = formatTime(
      Number(row.dataset.hour), Number(row.dataset.minute), Number(row.dataset.seconds), Number(row.dataset.msRaw), prec);
    row.querySelector('.penality-cell').textContent = row.dataset.penality ?? 0;

    const enabled = row.dataset.enabled !== '0';
    row.classList.toggle('row-disabled', !enabled);
    row.classList.toggle('row-cancelled', row.dataset.cancelled === '1');
    const lineOk = !!p.lines[String(ln)];
    row.style.display = (lineOk && (enabled || p.showDisabled)) ? '' : 'none';
  });

  // Δ ed elapsed: come recalcDeltaTimes/recalcElapsedTimes della console,
  // sulle sole righe visibili in ordine cronologico (id del passaggio).
  const visible = rows.filter(r => r.style.display !== 'none')
    .sort((a, b) => (Number(a.dataset.rowId) || 0) - (Number(b.dataset.rowId) || 0));
  const firstMs = visible.length ? rowToMs(visible[0], prec) : null;
  let prevMs = null;
  visible.forEach(row => {
    const cur = rowToMs(row, prec);
    row.classList.remove('negative-row');
    const deltaTd = row.querySelector('.delta-time');
    if (prevMs === null) {
      deltaTd.textContent = '—';
      row._deltaMs = null;
    } else if (cur - prevMs < 0) {
      deltaTd.textContent = '—';
      row._deltaMs = null;
      row.classList.add('negative-row');
    } else {
      deltaTd.textContent = formatDuration(cur - prevMs, prec);
      row._deltaMs = cur - prevMs;
    }
    prevMs = cur;

    const elapsedTd = row.querySelector('.elapsed-time');
    const el = cur - firstMs;
    elapsedTd.textContent = el < 0 ? '—' : formatDuration(el, prec);
    row._elapsedMs = el < 0 ? null : el;
  });

  // Ordinamento: come applyTableSort della console (verso naturale crescente
  // per le colonne di tempo, reverseOrder in XOR).
  const sc = p.sortCol;
  const naturalAsc = ['delta-time', 'elapsed-time', 'event-time'].includes(sc);
  rows.sort((a, b) => {
    const av = getRowSortVal(a, sc);
    const bv = getRowSortVal(b, sc);
    let cmp = typeof av === 'string' ? av.localeCompare(bv) : (av - bv);
    if (Number.isNaN(cmp)) cmp = 0;
    return (!p.reverseOrder !== naturalAsc) ? cmp : -cmp;
  });
  rows.forEach(r => tbody.appendChild(r));

  // 🏅 = posizione nella griglia visualizzata (updateRankColumn della console)
  let rank = 0;
  rows.forEach(r => {
    r.querySelector('.col-rank').textContent = r.style.display === 'none' ? '' : ++rank;
  });

  applyColumnVisibility();
}

function applyColumnVisibility() {
  const p = viewPrefs;
  const cols = [
    ['col-rank-col',     'col-rank',      p.showRank],
    ['col-index-col',    'col-index',     p.showIndex],
    ['col-line-col',     'col-line',      p.showLine],
    ['col-test-col',     'col-test',      p.showTest],
    ['col-name-col',     'col-name',      p.showName],
    ['col-surname-col',  'col-surname',   p.showSurname],
    ['timestamp-col',    'timestamp',     p.timestamp],
    ['delta-time-col',   'delta-time',    p.deltaTime],
    ['elapsed-time-col', 'elapsed-time',  p.elapsedTime],
    ['penality-col',     'penality-cell', p.penality],
  ];
  cols.forEach(([th, td, show]) => {
    const d = show ? 'table-cell' : 'none';
    document.querySelectorAll(`#event-table th.${th}, #event-table td.${td}`).forEach(el => el.style.display = d);
  });
}

async function populateTableFromSaved() {
  try {
    const response = await fetch('/getCheckpoints');
    const text = await response.text();
    text.trim().split('\n').forEach(line => {
      if (!line.trim()) return;
      try {
        const cp = JSON.parse(line);
        if (cp.id !== undefined) upsertRow(cp);
      } catch (err) {
        console.warn('Errore parsing JSON:', err, line);
      }
    });
    renderTable();
  } catch (err) {
    console.error('Errore caricamento checkpoint:', err);
  }
}

// ── Popup impostazioni ──────────────────────────────────────────────────────
function fillSettingsForm() {
  VIEW_FIELDS.forEach(f => {
    const el = document.getElementById('vs-' + f);
    if (el) el.checked = !!viewPrefs[f];
  });
  document.getElementById('vs-sort-col').value = viewPrefs.sortCol;
  document.getElementById('vs-precision').value = viewPrefs.timePrecision;
}

function onSettingsChange() {
  VIEW_FIELDS.forEach(f => {
    const el = document.getElementById('vs-' + f);
    if (el) viewPrefs[f] = el.checked;
  });
  viewPrefs.sortCol = document.getElementById('vs-sort-col').value;
  viewPrefs.timePrecision = Number(document.getElementById('vs-precision').value) || 2;
  saveOwnPrefs();
  renderTable();
}

function initSettingsPopup() {
  const overlay = document.getElementById('viewSettingsOverlay');
  const header = document.querySelector('#event-table thead tr');
  if (header) {
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => { fillSettingsForm(); overlay.style.display = 'flex'; });
  }
  document.getElementById('closeViewSettings')?.addEventListener('click', () => { overlay.style.display = 'none'; });
  document.getElementById('resetViewSettings')?.addEventListener('click', () => {
    try { localStorage.removeItem(VIEW_SETTINGS_KEY); } catch (e) {}
    loadViewPrefs();
    fillSettingsForm();
    renderTable();
  });
  overlay.querySelectorAll('input, select').forEach(el => el.addEventListener('change', onSettingsChange));
}

// Le preferenze della console cambiano in un'altra scheda dello stesso browser:
// se non ci sono impostazioni proprie della vista, le si segue dal vivo.
window.addEventListener('storage', (e) => {
  if ([CONSOLE_PREFS_KEY, CONSOLE_DISC_KEY, ATHLETES_KEY, VIEW_SETTINGS_KEY].includes(e.key)) {
    loadViewPrefs();
    renderTable();
  }
});

// ── Orologio ─────────────────────────────────────────────────────────────────
function updateClockFromData(data) {
  const timeEl = document.getElementById('time');
  if (!timeEl) return;
  timeEl.innerText =
    String(data.h).padStart(2, '0') + ':' +
    String(data.m).padStart(2, '0') + ':' +
    String(data.s).padStart(2, '0') + '.000';
}

// ── WebSocket ────────────────────────────────────────────────────────────────
let ws;
let lastMessageTime = 0;
let watchdogTimer;
let wsConnecting = false;
let reconnectTimer = null;

const popup = document.getElementById('popup');

function showPopup() {
  if (!popup.classList.contains('show')) {
    popup.classList.remove('hidden');
    setTimeout(() => popup.classList.add('show'), 10);
  }
}

function hidePopup() {
  if (popup.classList.contains('show')) {
    popup.classList.remove('show');
    setTimeout(() => popup.classList.add('hidden'), 500);
  }
}

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (wsConnecting) return;
  wsConnecting = true;

  ws = new WebSocket(`ws://${window.location.host}/ws`);

  ws.onopen = () => {
    wsConnecting = false;
    hidePopup();
    lastMessageTime = Date.now();
    startWatchdog();
  };

  ws.onmessage = (event) => {
    lastMessageTime = Date.now();
    hidePopup();
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch (e) {
      console.error('Errore JSON:', e);
    }
  };

  ws.onclose = () => {
    wsConnecting = false;
    showPopup();
    stopWatchdog();
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connectWebSocket(); }, 1000);
    }
  };
}

function startWatchdog() {
  stopWatchdog();
  watchdogTimer = setInterval(() => {
    if (Date.now() - lastMessageTime > 6000) {
      showPopup();
      try { ws.close(); } catch (e) {}
      stopWatchdog();
      setTimeout(connectWebSocket, 500);
    }
  }, 2000);
}

function stopWatchdog() {
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
}

window.addEventListener('beforeunload', () => { if (ws) { ws.close(); ws = null; } });

const TYPE_CHECKPOINT      = 0;
const TYPE_TIME_UPDATE     = 1;
const TYPE_SESSION_CLEARED = 2;
const TYPE_ROW_UPDATED     = 4;

function handleMessage(data) {
  switch (data.t) {
    case TYPE_CHECKPOINT:
    case TYPE_ROW_UPDATED:
      upsertRow(data);
      renderTable();
      break;
    case TYPE_TIME_UPDATE:
      updateClockFromData(data);
      break;
    case TYPE_SESSION_CLEARED:
      clearRows();
      renderTable();
      break;
  }
}

// ── Always-on display (proiettore/monitor) ──────────────────────────────────
let wakeLock = null;

async function keepScreenOn() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
          try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) { console.error(err); }
        }
      });
    }
  } catch (err) { console.error('❌ Errore wake lock:', err); }
}

// ── Branding dealer (logo opzionale accanto a quello Chronofit) ────────────
// BRANDING_CACHE_KEY è letta in modo sincrono da un piccolo script inline
// subito dopo lo splash (vedi l'HTML), per evitare che sponsor/separatore
// lampeggino mentre si attende la risposta (asincrona) di /brandingSettings.
const BRANDING_CACHE_KEY = 'chronofit_branding_cache';
async function applyBrandingSettings() {
  try {
    const res = await fetch('/brandingSettings');
    const data = await res.json();
    const showSponsorLogo   = !!data.showSponsorLogo;
    const sponsorLogoExists = !!data.sponsorLogoExists;
    const show = showSponsorLogo && sponsorLogoExists;
    document.querySelectorAll('.sponsor-visibility-toggle, .splash-divider').forEach(el => el.style.display = show ? '' : 'none');
    try { localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ showSponsorLogo, sponsorLogoExists })); } catch (e) {}
  } catch (e) {
    console.warn('Errore lettura impostazioni branding:', e);
  }
}

// ── Avvio ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  loadViewPrefs();
  initSettingsPopup();
  connectWebSocket();
  populateTableFromSaved();
  keepScreenOn();
  applyBrandingSettings();
});

window.addEventListener('load', () => {
  const splash = document.getElementById('splash');
  setTimeout(() => splash.classList.add('finished'), 1000);
  setTimeout(() => splash.remove(), 2000);
});
