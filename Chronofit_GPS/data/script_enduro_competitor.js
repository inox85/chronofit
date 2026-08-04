// ── Chronofit — Vista Enduro: ultimo concorrente transitato ─────────────────
// Pagina pensata per un secondo schermo (proiettore/monitor): riceve i
// checkpoint via WebSocket, li accumula in una tabella nascosta (mai
// mostrata) e mostra solo l'ultimo concorrente transitato sulla linea
// configurata (partenza) oppure il suo tempo netto/posizione/distacco
// (arrivo), a seconda di ENDURO_COMPETITOR_MODE ('start' | 'finish')
// impostato dalla pagina HTML prima di includere questo script.

const ecompMode = document.body.dataset.mode; // 'start' | 'finish'

// ── Impostazioni linee (persistite per modalità) ────────────────────────────
const ECOMP_SETTINGS_KEY = ecompMode === 'finish'
  ? 'chronofit_enduro_competitor_finish'
  : 'chronofit_enduro_competitor_start';

let ecompStartLine  = 1;
let ecompFinishLine = 3;

function restoreEcompSettings() {
  try {
    const raw = localStorage.getItem(ECOMP_SETTINGS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (ecompMode === 'finish') {
      if (saved.start)  { ecompStartLine  = saved.start;  const el = document.getElementById('ecomp-start-line');  if (el) el.value = saved.start; }
      if (saved.finish) { ecompFinishLine = saved.finish; const el = document.getElementById('ecomp-finish-line'); if (el) el.value = saved.finish; }
    } else {
      if (saved.line) { ecompStartLine = saved.line; const el = document.getElementById('ecomp-start-line'); if (el) el.value = saved.line; }
    }
  } catch (e) {
    console.warn('Errore lettura impostazioni ecomp:', e);
  }
}

function saveEcompSettings() {
  const data = ecompMode === 'finish'
    ? { start: ecompStartLine, finish: ecompFinishLine }
    : { line: ecompStartLine };
  localStorage.setItem(ECOMP_SETTINGS_KEY, JSON.stringify(data));
}

// "any" (Qualsiasi) resta una stringa — ogni altro valore è un numero di linea.
function _parseEcompLineValue(val, fallback) {
  if (val === 'any') return 'any';
  return Number(val ?? fallback);
}

function onEcompLineChange() {
  ecompStartLine = _parseEcompLineValue(document.getElementById('ecomp-start-line')?.value, 1);
  if (ecompMode === 'finish') {
    ecompFinishLine = _parseEcompLineValue(document.getElementById('ecomp-finish-line')?.value, 3);
  }
  saveEcompSettings();
  recomputeLastCompetitorFromHistory();
}

// ── Formattazione tempo (identica a script_view_enduro.js) ─────────────────
const timePrecision = 3;

function formatTime(h, m, s, ms) {
  return (
    String(h).padStart(2, "0") + ":" +
    String(m).padStart(2, "0") + ":" +
    String(s).padStart(2, "0") + "." +
    String(ms).padStart(3, "0")
  );
}

function formatDuration(totalMs) {
  totalMs = Math.max(0, totalMs);
  const h  = Math.floor(totalMs / 3600000); totalMs %= 3600000;
  const m  = Math.floor(totalMs / 60000);   totalMs %= 60000;
  const s  = Math.floor(totalMs / 1000);
  const ms = totalMs % 1000;
  return formatTime(h, m, s, ms);
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
  return formatTime(h, m, s, ms);
}

// Prima riga (cronologicamente) per ogni concorrente su una data linea, oppure
// su una qualsiasi linea se lineNumber === 'any'.
function _firstRowPerCompetitor(lineNumber) {
  const rows = Array.from(document.querySelectorAll('#event-table tbody tr'))
    .filter(r => lineNumber === 'any' || String(r.dataset.line) === String(lineNumber))
    .filter(r => { const c = (r.dataset.competitor ?? '').trim(); return c && c !== '0'; })
    .sort((a, b) => rowToMsExact(a) - rowToMsExact(b));

  const byCompetitor = {};
  rows.forEach(r => {
    const c = r.dataset.competitor;
    if (!(c in byCompetitor)) byCompetitor[c] = r;
  });
  return byCompetitor;
}

// ── Registro atleti (read-only, condiviso via localStorage con la GUI principale) ──
const ATHLETES_KEY = 'chronofit_athletes';

function findAthlete(competitorNum) {
  try {
    const registry = JSON.parse(localStorage.getItem(ATHLETES_KEY) || '[]');
    return registry.find(a => String(a.competitor) === String(competitorNum)) ?? null;
  } catch (e) { return null; }
}

function getAthleteName(competitorNum) {
  const a = findAthlete(competitorNum);
  if (!a) return '';
  return a.name || a.firstname || a.nome || '';
}

function getAthleteSurname(competitorNum) {
  const a = findAthlete(competitorNum);
  if (!a) return '';
  return a.surname || a.lastname || a.cognome || '';
}

function getAthleteTeam(competitorNum) {
  const a = findAthlete(competitorNum);
  if (!a) return '';
  return a.team || a.squadra || a.club || '';
}

// ── Stato: ultimo concorrente transitato sulla linea monitorata ────────────
let ecompLastCompetitor = null;
let ecompLastRow = null;

function updateEcompDisplayEls() {
  const wrap = document.getElementById('ecompWrap');
  if (ecompLastCompetitor === null) {
    wrap.classList.add('waiting');
    return;
  }
  wrap.classList.remove('waiting');

  const comp = ecompLastCompetitor;
  document.getElementById('ecompNumber').textContent = comp;
  const name    = getAthleteName(comp);
  const surname = getAthleteSurname(comp);
  const team    = getAthleteTeam(comp);
  const fullName = [surname ? surname.toUpperCase() : '', name].filter(Boolean).join(' ');
  document.getElementById('ecompName').textContent = fullName || '—';
  document.getElementById('ecompTeam').textContent = team;

  if (ecompMode === 'start') {
    document.getElementById('ecompTime').textContent = ecompLastRow ? _rowAbsoluteTimeText(ecompLastRow) : '—';

    const byComp = _firstRowPerCompetitor(ecompStartLine);
    const ordered = Object.entries(byComp).sort((a, b) => rowToMsExact(a[1]) - rowToMsExact(b[1]));
    const idx = ordered.findIndex(([c]) => String(c) === String(comp));
    document.getElementById('ecompPosition').textContent = idx >= 0 ? String(idx + 1) : '—';
  } else {
    const startByComp  = _firstRowPerCompetitor(ecompStartLine);
    const finishByComp = _firstRowPerCompetitor(ecompFinishLine);

    const ranked = Object.keys(finishByComp)
      .filter(c => startByComp[c])
      .map(c => ({ comp: c, netMs: rowToMsExact(finishByComp[c]) - rowToMsExact(startByComp[c]) }))
      .filter(r => r.netMs >= 0)
      .sort((a, b) => a.netMs - b.netMs);

    const myEntry = ranked.find(r => String(r.comp) === String(comp));

    if (myEntry) {
      document.getElementById('ecompTime').textContent = formatDuration(myEntry.netMs);
      const position = ranked.findIndex(r => String(r.comp) === String(comp)) + 1;
      document.getElementById('ecompPosition').textContent = String(position);
      const leaderMs = ranked[0].netMs;
      document.getElementById('ecompGap').textContent = position === 1
        ? t('enduro.leader')
        : '+' + formatDuration(myEntry.netMs - leaderMs);
    } else {
      document.getElementById('ecompTime').textContent = '—';
      document.getElementById('ecompPosition').textContent = '—';
      document.getElementById('ecompGap').textContent = '—';
    }
  }
}

function refreshEcompDisplay() {
  if (ecompLastCompetitor !== null) updateEcompDisplayEls();
}

function flashEcomp() {
  const wrap = document.getElementById('ecompWrap');
  wrap.classList.remove('ecomp-flash');
  void wrap.offsetWidth;
  wrap.classList.add('ecomp-flash');
  setTimeout(() => wrap.classList.remove('ecomp-flash'), 900);
}

// Considera un nuovo checkpoint sulla linea monitorata (partenza per lo
// screen 'start', arrivo per lo screen 'finish') come "ultimo transitato".
function maybeAdoptLastCompetitor(lineNumber, competitor, row, { flash } = { flash: false }) {
  const monitoredLine = ecompMode === 'start' ? ecompStartLine : ecompFinishLine;
  if (monitoredLine !== 'any' && Number(lineNumber) !== Number(monitoredLine)) return;
  const comp = (competitor ?? '').toString().trim();
  if (!comp || comp === '0') return;
  ecompLastCompetitor = comp;
  ecompLastRow = row;
  updateEcompDisplayEls();
  if (flash) flashEcomp();
}

// Ricalcola l'ultimo transitato a partire dallo storico (usato all'avvio).
function recomputeLastCompetitorFromHistory() {
  const monitoredLine = ecompMode === 'start' ? ecompStartLine : ecompFinishLine;
  const byComp = _firstRowPerCompetitor(monitoredLine);
  const rows = Object.entries(byComp);
  if (rows.length === 0) {
    ecompLastCompetitor = null;
    ecompLastRow = null;
    updateEcompDisplayEls();
    return;
  }
  rows.sort((a, b) => rowToMsExact(b[1]) - rowToMsExact(a[1]));
  ecompLastCompetitor = rows[0][0];
  ecompLastRow = rows[0][1];
  updateEcompDisplayEls();
}

// ── Tabella dati grezzi (nascosta) ──────────────────────────────────────────
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
  return row;
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
    recomputeLastCompetitorFromHistory();
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
    case TYPE_CHECKPOINT: {
      const row = addRawEventRow(data.id, data.ln, data.c, data.h, data.m, data.s, data.ms);
      maybeAdoptLastCompetitor(data.ln, data.c, row, { flash: true });
      break;
    }
    case TYPE_SESSION_CLEARED:
      clearEventTableRows();
      ecompLastCompetitor = null;
      ecompLastRow = null;
      updateEcompDisplayEls();
      break;
    case TYPE_ROW_UPDATED: {
      const row = addRawEventRow(data.id, data.ln, data.c, data.h, data.m, data.s, data.ms);
      // Un edit può cambiare linea/competitor di una riga passata: ricalcola
      // sempre da zero per restare coerenti, invece di fidarsi solo di questo evento.
      recomputeLastCompetitorFromHistory();
      break;
    }
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

// ── Header click → apre il popup impostazioni ───────────────────────────────
const ecompTitle = document.getElementById('ecompTitle');
if (ecompTitle) {
  ecompTitle.style.cursor = 'pointer';
  ecompTitle.addEventListener('click', () => {
    document.getElementById('ecompSettingsOverlay').style.display = 'flex';
  });
}

document.getElementById('closeEcompSettings')?.addEventListener('click', () => {
  document.getElementById('ecompSettingsOverlay').style.display = 'none';
});

// ── Avvio ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  applyTranslations();
  restoreEcompSettings();
  connectWebSocket();
  populateTableFromSaved();
  keepScreenOn();
});

window.addEventListener('load', () => {
  const splash = document.getElementById('splash');
  setTimeout(() => splash.classList.add('finished'), 1000);
  setTimeout(() => splash.remove(), 2000);
});
