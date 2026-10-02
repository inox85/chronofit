// ── Chronofit — Vista Equitazione: sola visualizzazione classifica ─────────
// Pagina pensata per un secondo schermo (proiettore/monitor): riceve i
// checkpoint via WebSocket, li accumula in una tabella nascosta (mai
// mostrata) e visualizza l'orologio corrente + la classifica, calcolando
// per ogni concorrente il tempo di gara (Finish - Start) sulla coppia di
// linee configurata. Il piazzamento (🏅) riflette sempre il miglior tempo
// di gara, indipendentemente dalla colonna scelta per l'ordinamento
// visualizzato della tabella.

// ── Classifica: stato e default ─────────────────────────────────────────────
const RESULTS_LINES_KEY = 'chronofit_equestrian_results_lines';
let resLineStart   = 1;
let resLineFinish  = 2;
let resSortCol     = 'race-time'; // 'race-time' | 'delta' | 'competitor' | 'start' | 'finish'
let resPrecision   = 2;

function restoreResultsSettings() {
  try {
    const raw = localStorage.getItem(RESULTS_LINES_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.start)     { resLineStart  = saved.start;  const el = document.getElementById('res-line-start');  if (el) el.value = saved.start; }
    if (saved.finish)    { resLineFinish = saved.finish; const el = document.getElementById('res-line-finish'); if (el) el.value = saved.finish; }
    if (saved.sortCol)   { resSortCol    = saved.sortCol; const el = document.getElementById('res-sort-col');    if (el) el.value = saved.sortCol; }
    if (saved.precision) { resPrecision  = saved.precision; const el = document.getElementById('res-time-precision'); if (el) el.value = saved.precision; }
  } catch (e) {
    console.warn('Errore lettura impostazioni classifica:', e);
  }
}

function _saveResultsPrefs() {
  localStorage.setItem(RESULTS_LINES_KEY, JSON.stringify({
    start: resLineStart, finish: resLineFinish,
    sortCol: resSortCol, precision: resPrecision
  }));
}

function onResultsPrecisionChange(val) {
  val = Math.max(1, Math.min(3, parseInt(val) || 2));
  resPrecision = val;
  document.getElementById('res-time-precision').value = val;
  _saveResultsPrefs();
  rebuildResultsTable();
}

function onResultsLinesChange() {
  resLineStart  = Number(document.getElementById('res-line-start')?.value  ?? 1);
  resLineFinish = Number(document.getElementById('res-line-finish')?.value ?? 2);
  _saveResultsPrefs();
  rebuildResultsTable();
}

function onResultsSortChange() {
  resSortCol = document.getElementById('res-sort-col')?.value ?? 'race-time';
  _saveResultsPrefs();
  rebuildResultsTable();
}

// ── Athlete registry (sola lettura, stessa chiave della GUI principale) ────
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

// ── Calcolo tempi ────────────────────────────────────────────────────────────

function truncateMs(ms, precision = resPrecision) {
  if (precision === 1) return Math.floor(ms / 100) * 100;
  if (precision === 2) return Math.floor(ms / 10)  * 10;
  return ms;
}

function formatTime(h, m, s, ms, precision = resPrecision) {
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

function msToTimeText(totalMs, precision = resPrecision) {
  const h  = Math.floor(totalMs / 3600000);
  const m  = Math.floor((totalMs % 3600000) / 60000);
  const s  = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return formatTime(h, m, s, ms, precision);
}

// Tronca i ms alla precisione scelta PRIMA di comporre il totale, così il
// tempo di gara (Finish - Start) resta coerente con la precisione mostrata.
function rowToMs(row, precision = resPrecision) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return ((h * 3600 + m * 60 + s) * 1000) + truncateMs(ms, precision);
}

function rowToMsExact(row) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return ((h * 3600 + m * 60 + s) * 1000) + ms;
}

// Prima riga (cronologicamente) per ogni concorrente su una data linea.
function _firstRowPerCompetitor(lineNumber) {
  const rows = Array.from(document.querySelectorAll('#event-table tbody tr'))
    .filter(r => String(r.dataset.line) === String(lineNumber))
    .filter(r => { const c = (r.dataset.competitor ?? '').trim(); return c && c !== '0'; })
    .sort((a, b) => rowToMsExact(a) - rowToMsExact(b));

  const byCompetitor = {};
  rows.forEach(r => {
    const c = r.dataset.competitor;
    if (!(c in byCompetitor)) byCompetitor[c] = r;
  });
  return byCompetitor;
}

// Un elemento per concorrente: tempo di partenza/arrivo, tempo di gara
// (Finish - Start, solo se entrambi presenti e Finish >= Start), penalità
// (presa dalla riga di arrivo se presente, altrimenti da quella di partenza).
function _computeResults() {
  const startByComp  = _firstRowPerCompetitor(resLineStart);
  const finishByComp = _firstRowPerCompetitor(resLineFinish);
  const comps = new Set([...Object.keys(startByComp), ...Object.keys(finishByComp)]);

  const list = Array.from(comps).map(comp => {
    const sRow = startByComp[comp];
    const fRow = finishByComp[comp];
    const startMs  = sRow ? rowToMs(sRow, resPrecision) : null;
    const finishMs = fRow ? rowToMs(fRow, resPrecision) : null;

    let netMs = null;
    if (startMs !== null && finishMs !== null) {
      const diff = finishMs - startMs;
      if (diff >= 0) netMs = diff;
    }
    const penalty = Number((fRow ?? sRow)?.dataset.penality ?? 0) || 0;

    return { comp, startMs, finishMs, netMs, penalty };
  });

  // Piazzamento: sempre per tempo di gara crescente, a prescindere
  // dall'ordinamento scelto per la tabella. I concorrenti senza tempo di
  // gara completo non hanno piazzamento.
  const ranked = [...list].sort((a, b) => (a.netMs ?? Infinity) - (b.netMs ?? Infinity));
  const bestMs = ranked.length && ranked[0].netMs !== null ? ranked[0].netMs : null;
  let rank = 1;
  ranked.forEach(item => {
    item.rank = item.netMs !== null ? rank++ : null;
    item.deltaMs = (item.netMs !== null && bestMs !== null) ? item.netMs - bestMs : null;
  });

  return list;
}

function _sortKeyFor(item) {
  switch (resSortCol) {
    case 'delta':      return item.deltaMs      ?? Infinity;
    case 'competitor': return Number(item.comp);
    case 'start':      return item.startMs      ?? Infinity;
    case 'finish':     return item.finishMs     ?? Infinity;
    case 'race-time':
    default:           return item.netMs        ?? Infinity;
  }
}

function rebuildResultsTable() {
  const tbody = document.querySelector('#results-table tbody');
  if (!tbody) return;

  const list = _computeResults();
  list.sort((a, b) => (_sortKeyFor(a) - _sortKeyFor(b)) || (Number(a.comp) - Number(b.comp)));

  tbody.innerHTML = '';
  list.forEach(item => {
    const raceTimeText = item.netMs !== null ? msToTimeText(item.netMs) : '—';
    const deltaText = (item.rank === 1 || item.deltaMs === null) ? '—' : '+' + msToTimeText(item.deltaMs);
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${item.rank ?? '—'}</td>` +
      `<td>${item.comp}</td>` +
      `<td>${getAthleteName(item.comp)}</td>` +
      `<td>${getAthleteSurname(item.comp)}</td>` +
      `<td>${raceTimeText}</td>` +
      `<td>${deltaText}</td>` +
      `<td>${item.penalty || '—'}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Tabella dati grezzi (nascosta) ──────────────────────────────────────────
// Upsert per data-row-id: usata sia per i nuovi checkpoint sia per gli edit
// (TYPE_ROW_UPDATED, es. assegnazione penalità), che arrivano con lo stesso id.
function addRawEventRow(rowIndex, lineNumber, competitor, hour, minute, seconds, millis, penality) {
  const tbody = document.querySelector('#event-table tbody');
  let row = tbody.querySelector(`tr[data-row-id="${rowIndex}"]`);
  if (!row) {
    row = document.createElement('tr');
    tbody.appendChild(row);
  }
  row.dataset.rowId      = rowIndex;
  row.dataset.line       = lineNumber;
  row.dataset.competitor = competitor;
  row.dataset.hour       = hour;
  row.dataset.minute     = minute;
  row.dataset.seconds    = seconds;
  row.dataset.msRaw      = millis;
  if (penality !== undefined) row.dataset.penality = penality;
}

function clearEventTableRows() {
  document.querySelector('#event-table tbody').innerHTML = '';
}

async function populateTableFromSaved() {
  try {
    const response = await fetch('/getCheckpoints');
    const text = await response.text();
    const lines = text.trim().split('\n');
    lines.forEach(line => {
      if (line.trim().length > 0) {
        try {
          const cp = JSON.parse(line);
          addRawEventRow(cp.id, cp.ln, cp.c, cp.h, cp.m, cp.s, cp.ms, cp.x);
        } catch (err) {
          console.warn('Errore parsing JSON:', err, line);
        }
      }
    });
    rebuildResultsTable();
  } catch (err) {
    console.error('Errore caricamento checkpoint:', err);
  }
}

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
      addRawEventRow(data.id, data.ln, data.c, data.h, data.m, data.s, data.ms, data.x ?? 0);
      rebuildResultsTable();
      break;
    case TYPE_TIME_UPDATE:
      updateClockFromData(data);
      break;
    case TYPE_SESSION_CLEARED:
      clearEventTableRows();
      rebuildResultsTable();
      break;
    case TYPE_ROW_UPDATED:
      addRawEventRow(data.id, data.ln, data.c, data.h, data.m, data.s, data.ms, data.x);
      rebuildResultsTable();
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

// ── Header click → apre il popup impostazioni (stesso pattern della vista
// Enduro: click sull'intera riga di header della tabella). ──────────────────
const resultsHeaderRow = document.querySelector('#results-table thead tr');
if (resultsHeaderRow) {
  resultsHeaderRow.style.cursor = 'pointer';
  resultsHeaderRow.addEventListener('click', () => {
    document.getElementById('resultsSettingsOverlay').style.display = 'flex';
  });
}

document.getElementById('closeResultsSettings')?.addEventListener('click', () => {
  document.getElementById('resultsSettingsOverlay').style.display = 'none';
});

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
  restoreResultsSettings();
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
