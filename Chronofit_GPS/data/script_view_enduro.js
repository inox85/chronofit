// ── Chronofit — Vista Enduro: sola visualizzazione tempi netti ─────────────
// Pagina pensata per un secondo schermo (proiettore/monitor): riceve i
// checkpoint via WebSocket, li accumula in una tabella nascosta (mai
// mostrata) e visualizza solo la card "Tempi netti", con le stesse
// impostazioni (linee, ordinamento, coppie abilitate) configurate nella
// pagina principale e condivise via localStorage.

// ── Tempi netti: stato e default (identici a script.js/disciplines.js) ─────
const NET_TIMES_KEY = 'chronofit_net_times_lines';
let netTimesStartLine   = 1;
let netTimesFinishLine  = 3;
let netTimesStartLine2  = 2;
let netTimesFinishLine2 = 4;
let netTimesSortCol     = 'competitor';
let netTimesPair1Enabled = true;
let netTimesPair2Enabled = true;

let timePrecision = 3;

function restoreNetTimesSettings() {
  try {
    const raw = localStorage.getItem(NET_TIMES_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.start)   { netTimesStartLine   = saved.start;   const el = document.getElementById('net-line-start');    if (el) el.value = saved.start; }
    if (saved.finish)  { netTimesFinishLine  = saved.finish;  const el = document.getElementById('net-line-finish');   if (el) el.value = saved.finish; }
    if (saved.start2)  { netTimesStartLine2  = saved.start2;  const el = document.getElementById('net-line-start-2');  if (el) el.value = saved.start2; }
    if (saved.finish2) { netTimesFinishLine2 = saved.finish2; const el = document.getElementById('net-line-finish-2'); if (el) el.value = saved.finish2; }
    if (saved.sortCol) { netTimesSortCol     = saved.sortCol; const el = document.getElementById('net-sort-col');      if (el) el.value = saved.sortCol; }
    if (saved.enabled  !== undefined) { netTimesPair1Enabled = saved.enabled;  const el = document.getElementById('net-pair1-enabled'); if (el) el.checked = saved.enabled; }
    if (saved.enabled2 !== undefined) { netTimesPair2Enabled = saved.enabled2; const el = document.getElementById('net-pair2-enabled'); if (el) el.checked = saved.enabled2; }
    updateNetPairEnabledUI(1);
    updateNetPairEnabledUI(2);
  } catch (e) {
    console.warn('Errore lettura impostazioni tempi netti:', e);
  }
}

function _saveNetTimesPrefs() {
  localStorage.setItem(NET_TIMES_KEY, JSON.stringify({
    start: netTimesStartLine, finish: netTimesFinishLine,
    start2: netTimesStartLine2, finish2: netTimesFinishLine2,
    sortCol: netTimesSortCol,
    enabled: netTimesPair1Enabled, enabled2: netTimesPair2Enabled
  }));
}

function onNetTimesLinesChange() {
  netTimesStartLine   = Number(document.getElementById('net-line-start')?.value    ?? 1);
  netTimesFinishLine  = Number(document.getElementById('net-line-finish')?.value   ?? 3);
  netTimesStartLine2  = Number(document.getElementById('net-line-start-2')?.value  ?? 2);
  netTimesFinishLine2 = Number(document.getElementById('net-line-finish-2')?.value ?? 4);
  _saveNetTimesPrefs();
  rebuildNetTimesTable();
}

function onNetTimesSortChange() {
  netTimesSortCol = document.getElementById('net-sort-col')?.value ?? 'competitor';
  _saveNetTimesPrefs();
  rebuildNetTimesTable();
}

// Abilita/disabilita una delle due coppie partenza/arrivo: quando disattiva,
// le sue righe scompaiono dalla tabella e le select restano visibili ma
// disattivate (stessa UX della pagina principale).
function updateNetPairEnabledUI(pairNum) {
  const enabled  = pairNum === 2 ? netTimesPair2Enabled : netTimesPair1Enabled;
  const startId  = pairNum === 2 ? 'net-line-start-2'  : 'net-line-start';
  const finishId = pairNum === 2 ? 'net-line-finish-2' : 'net-line-finish';
  [startId, finishId].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !enabled;
    el.style.opacity = enabled ? '1' : '0.4';
  });
}

function onNetPairEnabledChange(pairNum) {
  const id = pairNum === 2 ? 'net-pair2-enabled' : 'net-pair1-enabled';
  const val = document.getElementById(id)?.checked ?? true;
  if (pairNum === 2) netTimesPair2Enabled = val; else netTimesPair1Enabled = val;
  updateNetPairEnabledUI(pairNum);
  _saveNetTimesPrefs();
  rebuildNetTimesTable();
}

function switchNetTimesSettingsTab(tab) {
  const overlay = document.getElementById('netTimesSettingsOverlay');
  overlay.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab));
  overlay.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
  document.getElementById(`nettab-${tab}`).style.display = '';
}

function truncateMs(ms, precision = timePrecision) {
  if (precision === 1) return Math.floor(ms / 100) * 100;
  if (precision === 2) return Math.floor(ms / 10)  * 10;
  return ms;
}

function formatTime(h, m, s, ms, precision = timePrecision) {
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

function rowToMsExact(row) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return ((h * 3600 + m * 60 + s) * 1000) + ms;
}

function _rowAbsoluteTimeText(row) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return formatTime(h, m, s, ms, 3);
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

// Testo (Start/Finish/Net) + valori grezzi in ms (per l'ordinamento) per una
// singola coppia di linee, dato il set di righe-per-competitor già calcolato
// per ciascuna linea.
function _netPairText(startByComp, finishByComp, comp) {
  const sRow = startByComp[comp];
  const fRow = finishByComp[comp];

  const sText = sRow ? _rowAbsoluteTimeText(sRow) : '—';
  const fText = fRow ? _rowAbsoluteTimeText(fRow) : '—';

  let netText = '—';
  let netMs = null;
  if (sRow && fRow) {
    const diffMs = rowToMsExact(fRow) - rowToMsExact(sRow);
    if (diffMs >= 0) {
      const dH  = Math.floor(diffMs / 3600000);
      const dM  = Math.floor((diffMs % 3600000) / 60000);
      const dS  = Math.floor((diffMs % 60000) / 1000);
      const dMs = diffMs % 1000;
      netText = formatTime(dH, dM, dS, dMs, 3);
      netMs = diffMs;
    }
  }
  const startMs  = sRow ? rowToMsExact(sRow) : null;
  const finishMs = fRow ? rowToMsExact(fRow) : null;
  return { sText, fText, netText, startMs, finishMs, netMs };
}

// Chiave numerica di ordinamento per una riga già calcolata, secondo la
// colonna scelta nella pagina principale (competitor di default). I valori
// assenti (nessun passaggio su quella linea) vanno sempre in fondo.
function _netSortKey(comp, p) {
  switch (netTimesSortCol) {
    case 'start':  return p.startMs  ?? Infinity;
    case 'finish': return p.finishMs ?? Infinity;
    case 'net':    return p.netMs    ?? Infinity;
    case 'competitor':
    default:       return Number(comp);
  }
}

// Righe di un singolo gruppo (coppia di linee) da appendere alla tabella,
// una riga per competitor.
function _netGroupRows(tbody, startLine, finishLine) {
  const startByComp  = _firstRowPerCompetitor(startLine);
  const finishByComp = _firstRowPerCompetitor(finishLine);
  const comps = new Set([...Object.keys(startByComp), ...Object.keys(finishByComp)]);

  Array.from(comps)
    .map(comp => ({ comp, p: _netPairText(startByComp, finishByComp, comp) }))
    .sort((a, b) => (_netSortKey(a.comp, a.p) - _netSortKey(b.comp, b.p)) || (Number(a.comp) - Number(b.comp)))
    .forEach(({ comp, p }) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${comp}</td><td>${p.sText}</td><td>${p.fText}</td><td>${p.netText}</td>`;
      tbody.appendChild(tr);
    });
}

function rebuildNetTimesTable() {
  const tbody = document.querySelector('#net-times-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (netTimesPair1Enabled) _netGroupRows(tbody, netTimesStartLine,  netTimesFinishLine);
  if (netTimesPair2Enabled) _netGroupRows(tbody, netTimesStartLine2, netTimesFinishLine2);
}

// ── Tabella dati grezzi (nascosta) ──────────────────────────────────────────
// Upsert per data-row-id: usata sia per i nuovi checkpoint sia per gli edit
// (TYPE_ROW_UPDATED), che arrivano con lo stesso id.
function addRawEventRow(rowIndex, lineNumber, competitor, hour, minute, seconds, millis) {
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
          addRawEventRow(cp.id, cp.ln, cp.c, cp.h, cp.m, cp.s, cp.ms);
        } catch (err) {
          console.warn('Errore parsing JSON:', err, line);
        }
      }
    });
    rebuildNetTimesTable();
  } catch (err) {
    console.error('Errore caricamento checkpoint:', err);
  }
}

// ── WebSocket ────────────────────────────────────────────────────────────
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
const TYPE_SESSION_CLEARED = 2;
const TYPE_ROW_UPDATED     = 4;

function handleMessage(data) {
  switch (data.t) {
    case TYPE_CHECKPOINT:
      addRawEventRow(data.id, data.ln, data.c, data.h, data.m, data.s, data.ms);
      rebuildNetTimesTable();
      break;
    case TYPE_SESSION_CLEARED:
      clearEventTableRows();
      rebuildNetTimesTable();
      break;
    case TYPE_ROW_UPDATED:
      addRawEventRow(data.id, data.ln, data.c, data.h, data.m, data.s, data.ms);
      rebuildNetTimesTable();
      break;
  }
}

// ── Always-on display (proiettore/monitor) ─────────────────────────────────
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

// ── Header click → apre il popup impostazioni (stesso pattern della GUI
// principale: click sull'intera riga di header della tabella). ─────────────
const netTimesHeaderRow = document.querySelector('#net-times-table thead tr');
if (netTimesHeaderRow) {
  netTimesHeaderRow.style.cursor = 'pointer';
  netTimesHeaderRow.addEventListener('click', () => {
    document.getElementById('netTimesSettingsOverlay').style.display = 'flex';
  });
}

document.getElementById('closeNetTimesSettings')?.addEventListener('click', () => {
  document.getElementById('netTimesSettingsOverlay').style.display = 'none';
});

// ── Avvio ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  restoreNetTimesSettings();
  connectWebSocket();
  populateTableFromSaved();
  keepScreenOn();
});

window.addEventListener('load', () => {
  const splash = document.getElementById('splash');
  setTimeout(() => splash.classList.add('finished'), 1000);
  setTimeout(() => splash.remove(), 2000);
});
