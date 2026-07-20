const FLAG_SYNC_ENABLED = 1; // 0001
const FLAG_TIME_VALID = 2; // 0010
const FLAG_LOCATION_VALID = 4; // 0100
const FLAG_PPS_DETECTED = 8; // 1000

const SYNC_NONE = 0;
const SYNC_MANUAL_SET = 1;  // Tempo settato manualmente
const SYNC_WAIT_LINE_SIGNAL = 2;  // In attesa del segnale di sincronismo (esterno)
const SYNC_SET_BY_LINE_SIGNAL =3;  // Tempo impostato tramite segnale esterno
const SYNC_FIRST_GPS_SYNC = 4;   // In attesa della sincronizzazione GPS
const SYNC_WAIT_GPS = 5;   // Sincronizzato tramite GPS
const SYNC_GPS_SYNCED = 6;   // Sincronizzato tramite GPS
const ELAPSED_WAITING_START = 7;   // In attesa di un segnale si inizio cronometraggio
const ELAPSED_TIME_STARTED = 8;   // In attesa di un segnale si inizio cronometraggio

const GPS_TEST_REQESTED = 1;
const GPS_TEST_DONE = 0;

const WIFI_STATUS_DISCONNECTED = 0;
const WIFI_STATUS_CONNECING = 1;
const WIFI_STATUS_CONNECTED = 2;
const WIFI_STATUS_INTERNET_OK = 3;
const WIFI_STATUS_RECONNECTING = 4;

const POWER_MODE_NONE = 0;   // Alimentatore esterno non collegato
const POWER_MODE_USB = 1;   // Dispositivo alimentato da POWER BANK
const POWER_MODE_BATTERY = 2;   // Dispositivo alimentato a 12V



let prevPowerSource = 1;

let timeOffset = 0;


const audioCache = {};

const audioFiles = [
  "/sound1.mp3",
  "/sound2.mp3",
  "/sound3.mp3",
  "/sound4.mp3"
];

const lineColors = {
  1: "#ffcccc", // rosso tenue
  2: "#ccffcc", // verde tenue
  3: "#ccccff", // blu tenue
  4: "#fff5cc", // giallo tenue
  5: "#808080ff", // grigio (sync-test GPS)
  6: "#808080ff" // grigio (fuori pressostato)
};


// ── Precisione temporale ──────────────────────────────────────
// 1 = decimi, 2 = centesimi, 3 = millisecondi
let timePrecision = 3;
let timePrecision2 = 3;

function onTimePrecisionChange(val) {
  val = Math.max(1, Math.min(3, parseInt(val) || 3));
  timePrecision = val;
  document.getElementById("time-precision").value = val;
  refreshAllTimestamps();
  recalcDeltaTimes();
  recalcElapsedTimes();
  saveViewPrefs();
}

function onTimePrecisionChange2(val) {
  val = Math.max(1, Math.min(3, parseInt(val) || 3));
  timePrecision2 = val;
  document.getElementById("time-precision-2").value = val;
  refreshAllTimestamps2();
  recalcDeltaTimes2();
  recalcElapsedTimes2();
  saveViewPrefs();
}

function truncateMs(ms, precision = timePrecision) {
  if (precision === 1) return Math.floor(ms / 100) * 100;
  if (precision === 2) return Math.floor(ms / 10)  * 10;
  return ms;
}

function refreshAllTimestamps(tableId = "event-table", precision = timePrecision) {
  document.querySelectorAll(`#${tableId} tbody tr`).forEach(row => {
    const tsCell = row.querySelector(".timestamp");
    if (!tsCell || tsCell.querySelector("input")) return;
    const h  = parseInt(row.dataset.hour     ?? 0);
    const m  = parseInt(row.dataset.minute   ?? 0);
    const s  = parseInt(row.dataset.seconds  ?? 0);
    const ms = parseInt(row.dataset.msRaw    ?? 0);
    tsCell.textContent = formatTime(h, m, s, ms, precision);
  });
}

function refreshAllTimestamps2() {
  refreshAllTimestamps("event-table-2", timePrecision2);
}

// Converte i data-* raw di una riga in ms (con troncamento precisione)
function rowToMs(row, precision = timePrecision) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return ((h * 3600 + m * 60 + s) * 1000) + truncateMs(ms, precision);
}

async function cacheAudioFiles(url) {
  for (const file of audioFiles) {
      const audio = new Audio();
      audio.src = file;
      await audio.load();  // Precarica il file
      audioCache[file] = audio;
    }
    console.log("Audio precaricati:", Object.keys(audioCache));
}

function uploadFW() {
    let fileInput = document.getElementById("fw-file");
    if(fileInput.files.length == 0) {
        alert("Select a file first!");
        return;
    }

    let file = fileInput.files[0];
    if(!file.name.endsWith(".bin")) {
        alert("Firmware must be a .bin file!");
        return;
    }

    let formData = new FormData();
    formData.append("fw", file);

    fetch("/update", { method: "POST", body: formData })
        .then(res => res.text())
        .then(msg => document.getElementById("fw-msg").innerText = msg)
        .catch(err => console.error(err));
}

function uploadFS() {
    let fileInput = document.getElementById("fs-file");
    if(fileInput.files.length == 0) {
        alert("Select a file first!");
        return;
    }

    let file = fileInput.files[0];
    let formData = new FormData();
    formData.append("fs", file);

    fetch("/uploadFS", { method: "POST", body: formData })
        .then(res => res.text())
        .then(msg => document.getElementById("fs-msg").innerText = msg)
        .catch(err => console.error(err));
}

// function setCheckPointFields() {

//   const l1 = document.getElementById("l1").value;
//   const l2 = document.getElementById("l2").value;
//   const l3 = document.getElementById("l3").value;
//   const l4 = document.getElementById("l4").value;
//   const c1 = document.getElementById("c1").value;
//   const c2 = document.getElementById("c2").value;
//   const c3 = document.getElementById("c3").value;
//   const c4 = document.getElementById("c4").value;
//   const lag1 = document.getElementById("lag1").value;
//   const lag2 = document.getElementById("lag2").value;
//   const lag3 = document.getElementById("lag3").value;
//   const lag4 = document.getElementById("lag4").value;

//   const url = `/setCheckPointFields?l1=${encodeURIComponent(l1)}&l2=${encodeURIComponent(l2)}&l3=${encodeURIComponent(l3)}&l4=${encodeURIComponent(l4)}&c1=${encodeURIComponent(c1)}&c2=${encodeURIComponent(c2)}&c3=${encodeURIComponent(c3)}&c4=${encodeURIComponent(c4)}&lag1=${encodeURIComponent(lag1)}&lag2=${encodeURIComponent(lag2)}&lag3=${encodeURIComponent(lag3)}&lag4=${encodeURIComponent(lag4)}`;

//   console.log(url);

//   fetch(url)
//     .then(response => response.text())
//     .then(msg => {
//       document.getElementById("fields-msg").innerText = msg;
//       setTimeout(() => { document.getElementById("fields-msg").innerText = ""; }, 3000);
//     })
//     .catch(err => {
//       document.getElementById("fields-msg").innerText = "Errore invio dati";
//       console.error(err);
//     });
// }

function setSettings(){

  const printToggle = document.getElementById("printToggle");
  const printEnabled = printToggle && printToggle.checked ? 1 : 0;

  const buzzerToggle = document.getElementById("buzzerToggle");
  const buzzerEnabled = buzzerToggle && buzzerToggle.checked ? 1 : 0;

  const stationName = document.getElementById("station-name-input").value;
  
  console.log(stationName);
  console.log(encodeURIComponent(stationName));
  
  const url = `/setAttribute?printEnabled=${encodeURIComponent(printEnabled)}&stationName=${encodeURIComponent(stationName)}&buzzerEnable=${encodeURIComponent(buzzerEnabled)}`;

  console.log(url);

  fetch(url)
    .then(response => response.text())
    .then(msg => {
      document.getElementById("settings-field").innerText = msg;
      setTimeout(() => { document.getElementById("settings-field").innerText = ""; }, 3000);
    })
    .catch(err => {
      document.getElementById("settings-field").innerText = t('main.error_send');
      console.error(err);
    });

}

let connectionLost = false;
let wifiConnecting = false;
let lastWifiStatus = 0;
const popup = document.getElementById("popup");

function showPopup() {
  if (!popup.classList.contains("show")) {
    popup.innerText = wifiConnecting
      ? t('main.wifi_connecting')
      : t('main.no_connection');
    popup.classList.remove("hidden");
    setTimeout(() => popup.classList.add("show"), 10);
  }
}

function hidePopup() {
  if (popup.classList.contains("show")) {
    popup.classList.remove("show");
    setTimeout(() => popup.classList.add("hidden"), 500); // attende dissolvenza
  }
}

function updateTimeOffset(){
  let tz = parseInt(document.getElementById("timezone-select").value);
  fetch(`/setOffset?offset=${tz}`)
    .then(res=>res.text())
    .then(msg=>console.log(msg));
}

// ======= LOCALSTORAGE: preferenze visualizzazione =======

const VIEW_PREFS_KEY = "chronofit_view_prefs";

// ── Athlete registry (read-only — caricato da stream/broadcast) ──
const ATHLETES_KEY = "chronofit_athletes";
const MQTT_ACQUIRE_KEY  = "mqttAcquireCompetitor";
const TABLE_ACQUIRE_KEY = "tableAcquireCompetitor";
const TABLE_ACQUIRE_LINES_KEY = "tableAcquireLines";
const TABLE_ACQUIRE_SOURCE_KEY = "tableAcquireSource";

// Linee che, se abilitato "Acquire from arrivals table", possono innescare l'acquisizione
function getTableAcquireLines() {
  const raw = localStorage.getItem(TABLE_ACQUIRE_LINES_KEY);
  if (!raw) return [1, 2, 3, 4];
  try { return JSON.parse(raw); } catch (e) { return [1, 2, 3, 4]; }
}

// Quale tabella arrivi alimenta l'acquisizione automatica. Con una sola
// card visibile (la maggior parte delle discipline) è sempre "event-table":
// la scelta ha senso solo quando entrambe le card sono attive (es. Enduro).
function getTableAcquireSource() {
  if (!isSecondArrivalsCardActive()) return 'event-table';
  return localStorage.getItem(TABLE_ACQUIRE_SOURCE_KEY) || 'event-table';
}

// Mostra/nasconde e sincronizza il selettore "tabella sorgente" in base a
// quante card Arrivi sono attualmente visibili.
function updateAutoAcquireSourceUI() {
  const row = document.getElementById('autoAcquireTableSource');
  if (!row) return;
  const dual = isSecondArrivalsCardActive();
  row.style.display = dual ? '' : 'none';
  const sel = document.getElementById('autoAcquireSourceSelect');
  if (sel) sel.value = getTableAcquireSource();
}

function onAutoAcquireSourceChange() {
  const sel = document.getElementById('autoAcquireSourceSelect');
  if (sel) localStorage.setItem(TABLE_ACQUIRE_SOURCE_KEY, sel.value);
}

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

let reverseOrder = false;
let sortCol = 'arrival';
let reverseOrder2 = false;
let sortCol2 = 'arrival';

function parseTimeMs(txt) {
  if (!txt || txt === '—' || txt.trim() === '') return Infinity;
  txt = txt.trim().replace(/[+\s]/g, '');
  const neg = txt.startsWith('-'); if (neg) txt = txt.slice(1);
  const parts = txt.split(':');
  let ms;
  if (parts.length === 3) ms = parseInt(parts[0]) * 3600000 + parseInt(parts[1]) * 60000 + parseFloat(parts[2]) * 1000;
  else if (parts.length === 2) ms = parseInt(parts[0]) * 60000 + parseFloat(parts[1]) * 1000;
  else ms = parseFloat(txt) * 1000;
  return neg ? -ms : ms;
}

function getRowSortVal(row, sc = sortCol) {
  switch (sc) {
    case 'arrival':      return Number(row.dataset.rowId || row.dataset.seq || 0);
    case 'line':         return Number(row.dataset.line) || 0;
    case 'competitor':   return Number(row.dataset.competitor) || 0;
    case 'name':         return (row.querySelector('.col-name')?.textContent  || '').toLowerCase();
    case 'surname':      return (row.querySelector('.col-surname')?.textContent || '').toLowerCase();
    case 'event-time':   return (Number(row.dataset.hour||0)*3600 + Number(row.dataset.minute||0)*60 + Number(row.dataset.seconds||0))*1000 + Number(row.dataset.msRaw||0);
    case 'race-time':    return parseTimeMs(row.querySelector('.race-time')?.textContent);
    case 'delta-time':   return parseTimeMs(row.querySelector('.delta-time')?.textContent);
    case 'elapsed-time': return parseTimeMs(row.querySelector('.elapsed-time')?.textContent);
    default:             return 0;
  }
}

function applyTableSort(tableId = 'event-table', sc = sortCol, rev = reverseOrder, splitsToggleId = 'toggle-splits') {
  const tbody = document.querySelector(`#${tableId} tbody`);
  if (!tbody) return;
  const splitsMode = document.getElementById(splitsToggleId)?.checked;
  // In splits mode ordina le diff-row visibili; altrimenti le righe normali
  const selector = splitsMode ? 'tr.diff-row' : 'tr:not(.diff-row)';
  const rows = Array.from(tbody.querySelectorAll(selector));
  // Per colonne temporali il verso naturale è crescente (tempo minore = rank migliore)
  const naturalAsc = ['race-time', 'delta-time', 'elapsed-time', 'event-time'].includes(sc);
  rows.sort((a, b) => {
    const av = getRowSortVal(a, sc);
    const bv = getRowSortVal(b, sc);
    let cmp = typeof av === 'string' ? av.localeCompare(bv) : (av - bv);
    // XOR: reverseOrder inverte il verso naturale della colonna
    return (!rev !== naturalAsc) ? cmp : -cmp;
  });
  rows.forEach(r => tbody.appendChild(r));
  updateRankColumn(tableId);
}

function applyTableSort2() {
  applyTableSort('event-table-2', sortCol2, reverseOrder2, 'toggle-splits-2');
}

function toggleColPanel() {
  const panel = document.getElementById('col-panel');
  const arrow = document.getElementById('col-arrow');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? '' : 'none';
  arrow.textContent   = open ? '▲' : '▼';
}

function toggleRowPanel() {
  const panel = document.getElementById('row-panel');
  const arrow = document.getElementById('row-arrow');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? '' : 'none';
  arrow.textContent   = open ? '▲' : '▼';
}

function toggleSortPanel() {
  const panel = document.getElementById('sort-panel');
  const arrow = document.getElementById('sort-arrow');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? '' : 'none';
  arrow.textContent   = open ? '▲' : '▼';
}

function onSortChange() {
  sortCol = document.getElementById('sort-col').value;
  applyTableSort();
  saveViewPrefs();
}

function onSortChange2() {
  sortCol2 = document.getElementById('sort-col-2').value;
  applyTableSort2();
  saveViewPrefs();
}

// Legge lo stato delle 6 checkbox linea di un tab "Lines" (main o secondaria).
function _readLinesPrefs(containerId) {
  const lines = {};
  document.querySelectorAll(`#${containerId} .line-vis-toggle`).forEach(el => {
    lines[el.dataset.line] = el.checked;
  });
  return lines;
}

function saveViewPrefs() {
  const prefs = {
    timestamp:     document.getElementById("toggle-timestamp").checked,
    deltaTime:     document.getElementById("toggle-delta-time").checked,
    elapsedTime:   document.getElementById("toggle-elapsed-time").checked,
    penality:      document.getElementById("toggle-penality").checked,
    showDisabled:  document.getElementById("toggle-disabled-rows").checked,
    reverseOrder:  document.getElementById("toggle-reverse-order").checked,
    showRank:      document.getElementById("toggle-rank").checked,
    showIndex:     document.getElementById("toggle-index").checked,
    showLine:      document.getElementById("toggle-line").checked,
    showName:      document.getElementById("toggle-name")?.checked    ?? false,
    showSurname:   document.getElementById("toggle-surname")?.checked ?? false,
    showCancelBtn: document.getElementById("toggle-cancel")?.checked ?? true,
    showSendBtn:   document.getElementById("toggle-send-btn").checked,
    showTest:    document.getElementById("toggle-test")?.checked ?? false,
    showTrigger:      document.getElementById("toggle-trigger")?.checked   ?? false,
    splitsMode:    document.getElementById("toggle-splits").checked,
    timePrecision: document.getElementById("time-precision").value,
    sortCol:       sortCol,
    showCompList:  document.getElementById('comp-list-card')?.style.display !== 'none',
    showSecondArrivalsCard: document.getElementById('secondArrivalsCard')?.style.display !== 'none',
    syncMode:        Number(document.getElementById('sync-method-select')?.value ?? 0),
    keepCompFocus:   document.getElementById('toggle-keep-comp-focus')?.checked ?? false,
    propagateCompetitor: document.getElementById('toggle-propagate-competitor')?.checked ?? false,
    lines: _readLinesPrefs('stab-lines'),
    secondary: {
      timestamp:     document.getElementById("toggle-timestamp-2")?.checked ?? true,
      deltaTime:     document.getElementById("toggle-delta-time-2")?.checked ?? true,
      elapsedTime:   document.getElementById("toggle-elapsed-time-2")?.checked ?? false,
      penality:      document.getElementById("toggle-penality-2")?.checked ?? false,
      showDisabled:  document.getElementById("toggle-disabled-rows-2")?.checked ?? true,
      reverseOrder:  document.getElementById("toggle-reverse-order-2")?.checked ?? false,
      showRank:      document.getElementById("toggle-rank-2")?.checked ?? false,
      showIndex:     document.getElementById("toggle-index-2")?.checked ?? true,
      showLine:      document.getElementById("toggle-line-2")?.checked ?? true,
      showName:      document.getElementById("toggle-name-2")?.checked ?? false,
      showSurname:   document.getElementById("toggle-surname-2")?.checked ?? false,
      showCancelBtn: document.getElementById("toggle-cancel-2")?.checked ?? true,
      showSendBtn:   document.getElementById("toggle-send-btn-2")?.checked ?? true,
      showTest:      document.getElementById("toggle-test-2")?.checked ?? false,
      showTrigger:   document.getElementById("toggle-trigger-2")?.checked ?? false,
      splitsMode:    document.getElementById("toggle-splits-2")?.checked ?? false,
      timePrecision: document.getElementById("time-precision-2")?.value ?? 3,
      sortCol:       sortCol2,
      lines: _readLinesPrefs('stab-lines-2')
    }
  };
  localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
}

function restoreViewPrefs() {
  const raw = localStorage.getItem(VIEW_PREFS_KEY);
  if (!raw) return;
  try {
    const prefs = JSON.parse(raw);

    const setChk = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.checked = val;
    };
    setChk("toggle-timestamp",     prefs.timestamp);
    setChk("toggle-delta-time",    prefs.deltaTime);
    setChk("toggle-elapsed-time",  prefs.elapsedTime);
    setChk("toggle-penality",      prefs.penality);
    setChk("toggle-disabled-rows", prefs.showDisabled);
    setChk("toggle-reverse-order", prefs.reverseOrder);
    setChk("toggle-rank",          prefs.showRank     ?? false);
    setChk("toggle-index",         prefs.showIndex    ?? true);
    setChk("toggle-line",          prefs.showLine     ?? true);
    setChk("toggle-name",          prefs.showName     ?? false);
    setChk("toggle-surname",       prefs.showSurname  ?? false);
    setChk("toggle-cancel",        prefs.showCancelBtn ?? true);
    setChk("toggle-send-btn",      prefs.showSendBtn  ?? true);
    setChk("toggle-test",        prefs.showTest   ?? false);
    setChk("toggle-trigger",          prefs.showTrigger     ?? false);
    setChk("toggle-splits",        prefs.splitsMode   ?? false);
    if (prefs.reverseOrder !== undefined) reverseOrder = prefs.reverseOrder;

    if (prefs.timePrecision !== undefined) {
      const val = Math.max(1, Math.min(3, parseInt(prefs.timePrecision) || 3));
      timePrecision = val;
      document.getElementById("time-precision").value = val;
    }

    if (prefs.lines) {
      document.querySelectorAll('#stab-lines .line-vis-toggle').forEach(el => {
        const active = prefs.lines[el.dataset.line];
        if (active !== undefined) el.checked = active;
      });
    }

    if (prefs.sortCol) { sortCol = prefs.sortCol; const el = document.getElementById('sort-col'); if (el) el.value = sortCol; }

    if (prefs.showCompList !== undefined) {
      const card = document.getElementById('comp-list-card');
      if (card) card.style.display = prefs.showCompList ? '' : 'none';
    }
    if (prefs.showSecondArrivalsCard !== undefined) {
      setSecondArrivalsCardVisible(prefs.showSecondArrivalsCard);
    }
    if (prefs.syncMode !== undefined) {
      const sel = document.getElementById('sync-method-select');
      if (sel) {
        sel.value = String(prefs.syncMode);
        if (typeof updateTimeSettingsVisibility === 'function') updateTimeSettingsVisibility();
      }
    }
    const kcf = document.getElementById('toggle-keep-comp-focus');
    if (kcf && prefs.keepCompFocus !== undefined) kcf.checked = prefs.keepCompFocus;
    const pc = document.getElementById('toggle-propagate-competitor');
    if (pc && prefs.propagateCompetitor !== undefined) pc.checked = prefs.propagateCompetitor;

    updateVisibleColumns();
    if (prefs.splitsMode) applyCompetitorSplits();
    else reorderTable();

    // ── Seconda card ──
    const sec = prefs.secondary;
    if (sec) {
      setChk("toggle-timestamp-2",     sec.timestamp);
      setChk("toggle-delta-time-2",    sec.deltaTime);
      setChk("toggle-elapsed-time-2",  sec.elapsedTime);
      setChk("toggle-penality-2",      sec.penality);
      setChk("toggle-disabled-rows-2", sec.showDisabled);
      setChk("toggle-reverse-order-2", sec.reverseOrder);
      setChk("toggle-rank-2",          sec.showRank     ?? false);
      setChk("toggle-index-2",         sec.showIndex    ?? true);
      setChk("toggle-line-2",          sec.showLine     ?? true);
      setChk("toggle-name-2",          sec.showName     ?? false);
      setChk("toggle-surname-2",       sec.showSurname  ?? false);
      setChk("toggle-cancel-2",        sec.showCancelBtn ?? true);
      setChk("toggle-send-btn-2",      sec.showSendBtn  ?? true);
      setChk("toggle-test-2",          sec.showTest   ?? false);
      setChk("toggle-trigger-2",       sec.showTrigger     ?? false);
      setChk("toggle-splits-2",        sec.splitsMode   ?? false);
      if (sec.reverseOrder !== undefined) reverseOrder2 = sec.reverseOrder;

      if (sec.timePrecision !== undefined) {
        const val = Math.max(1, Math.min(3, parseInt(sec.timePrecision) || 3));
        timePrecision2 = val;
        const el2 = document.getElementById("time-precision-2");
        if (el2) el2.value = val;
      }

      if (sec.lines) {
        document.querySelectorAll('#stab-lines-2 .line-vis-toggle').forEach(el => {
          const active = sec.lines[el.dataset.line];
          if (active !== undefined) el.checked = active;
        });
      }

      if (sec.sortCol) { sortCol2 = sec.sortCol; const el2 = document.getElementById('sort-col-2'); if (el2) el2.value = sortCol2; }

      updateVisibleColumns2();
      if (sec.splitsMode) applyCompetitorSplits2();
      else reorderTable2();
    }
  } catch(e) {
    console.warn("Errore ripristino preferenze:", e);
  }
}

// ── Discipline presets ────────────────────────────────────────────────────────

const DISCIPLINE_KEY  = 'chronofit_discipline';
const DISC_LOCK_KEY   = 'chronofit_disc_locked';
// Uniche discipline selezionabili dal percorso Cronometraggio (Regolarità/Sci/Enduro).
const STARTUP_DISCIPLINE_IDS = ['regularity', 'ski', 'enduro'];
let activeDisciplineId = localStorage.getItem(DISCIPLINE_KEY) || 'generic';

function isDisciplineLocked() {
  return localStorage.getItem(DISC_LOCK_KEY) === '1';
}

function updateDisciplineNavBtn() {
  const disc = DISCIPLINES.find(d => d.id === activeDisciplineId) ?? DISCIPLINES[0];
  const btn  = document.getElementById('discipline-btn');
  if (btn && disc) btn.dataset.emoji = disc.emoji;
  const span = document.getElementById('discipline-nav-emoji');
  if (span && disc) span.textContent = disc.emoji;
  if (disc?.prefs.bgColor) {
    document.documentElement.style.setProperty('--background-color', disc.prefs.bgColor);
  }
}

// Default di fabbrica (identico ai "checked" hardcoded in index.html): usato
// quando una disciplina non specifica "lines"/"linesSecondary", per evitare
// che restino le impostazioni "sporche" della disciplina selezionata prima.
const DEFAULT_LINE_VISIBILITY = { "1": true, "2": true, "3": true, "4": true, "5": false, "6": true };

// Applica un preset di visibilità linee (chiavi "1".."6") alle checkbox di un
// tab "Lines" (main o secondaria).
function _applyLinesPrefs(containerId, lines) {
  const effective = lines || DEFAULT_LINE_VISIBILITY;
  document.querySelectorAll(`#${containerId} .line-vis-toggle`).forEach(el => {
    const val = effective[el.dataset.line];
    if (val !== undefined) el.checked = val;
  });
}

function applyDisciplinePreset(prefs) {
  const setChk = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined) el.checked = val; };
  setChk("toggle-timestamp",     prefs.timestamp);
  setChk("toggle-delta-time",    prefs.deltaTime);
  setChk("toggle-elapsed-time",  prefs.elapsedTime);
  setChk("toggle-penality",      prefs.penality);
  setChk("toggle-disabled-rows", prefs.showDisabled);
  setChk("toggle-reverse-order", prefs.reverseOrder);
  setChk("toggle-rank",          prefs.showRank   ?? false);
  setChk("toggle-index",         prefs.showIndex  ?? true);
  setChk("toggle-line",          prefs.showLine   ?? true);
  setChk("toggle-name",          prefs.showName   ?? false);
  setChk("toggle-surname",       prefs.showSurname ?? false);
  setChk("toggle-cancel",        prefs.showCancelBtn ?? true);
  setChk("toggle-send-btn",      prefs.showSendBtn ?? true);
  setChk("toggle-test",        prefs.showTest  ?? false);
  setChk("toggle-trigger",          prefs.showTrigger    ?? false);
  setChk("toggle-splits",        prefs.splitsMode  ?? false);
  setChk("toggle-propagate-competitor", prefs.propagateCompetitor ?? false);
  if (prefs.reverseOrder !== undefined) reverseOrder = prefs.reverseOrder;
  if (prefs.timePrecision !== undefined) {
    const val = Math.max(1, Math.min(3, parseInt(prefs.timePrecision) || 3));
    timePrecision = val;
    document.getElementById("time-precision").value = val;
  }
  if (prefs.sortCol) {
    sortCol = prefs.sortCol;
    const el = document.getElementById('sort-col');
    if (el) el.value = sortCol;
  }
  // Competitor list card visibility
  if (prefs.showCompList !== undefined) {
    const card = document.getElementById('comp-list-card');
    if (card) card.style.display = prefs.showCompList ? '' : 'none';
  }

  // Acquisizione automatica competitor dagli arrivi in tabella
  if (prefs.tableAcquireCompetitor !== undefined) {
    localStorage.setItem(TABLE_ACQUIRE_KEY, prefs.tableAcquireCompetitor ? "1" : "0");
    const tableAcquireToggle = document.getElementById('autoAcquireTableToggle');
    if (tableAcquireToggle) {
      tableAcquireToggle.checked = prefs.tableAcquireCompetitor;
      if (typeof updateAutoAcquireLinesUI === 'function') updateAutoAcquireLinesUI();
    }
  }

  // Sync mode (aggiorna solo la UI — l'invio al device resta manuale)
  if (prefs.syncMode !== undefined) {
    const sel = document.getElementById('sync-method-select');
    if (sel) {
      sel.value = String(prefs.syncMode);
      if (typeof updateTimeSettingsVisibility === 'function') updateTimeSettingsVisibility();
    }
  }

  _applyLinesPrefs('stab-lines', prefs.lines);
  applyLineFilter();

  updateVisibleColumns();
  if (prefs.splitsMode) applyCompetitorSplits(); else { clearCompetitorSplits(); reorderTable(); }

  // Seconda card Arrivi: stessa visibilità e stessi default della prima
  // (sort/colonne/split), così le due card partono allineate — l'operatore
  // può poi personalizzarle indipendentemente dal proprio popup impostazioni.
  if (prefs.showSecondArrivalsCard !== undefined) {
    setSecondArrivalsCardVisible(prefs.showSecondArrivalsCard);
  }

  setChk("toggle-timestamp-2",     prefs.timestamp);
  setChk("toggle-delta-time-2",    prefs.deltaTime);
  setChk("toggle-elapsed-time-2",  prefs.elapsedTime);
  setChk("toggle-penality-2",      prefs.penality);
  setChk("toggle-disabled-rows-2", prefs.showDisabled);
  setChk("toggle-reverse-order-2", prefs.reverseOrder);
  setChk("toggle-rank-2",          prefs.showRank   ?? false);
  setChk("toggle-index-2",         prefs.showIndex  ?? true);
  setChk("toggle-line-2",          prefs.showLine   ?? true);
  setChk("toggle-name-2",          prefs.showName   ?? false);
  setChk("toggle-surname-2",       prefs.showSurname ?? false);
  setChk("toggle-cancel-2",        prefs.showCancelBtn ?? true);
  setChk("toggle-send-btn-2",      prefs.showSendBtn ?? true);
  setChk("toggle-test-2",          prefs.showTest  ?? false);
  setChk("toggle-trigger-2",       prefs.showTrigger    ?? false);
  setChk("toggle-splits-2",        prefs.splitsMode  ?? false);
  if (prefs.reverseOrder !== undefined) reverseOrder2 = prefs.reverseOrder;
  if (prefs.timePrecision !== undefined) {
    const val2 = Math.max(1, Math.min(3, parseInt(prefs.timePrecision) || 3));
    timePrecision2 = val2;
    const tp2 = document.getElementById("time-precision-2");
    if (tp2) tp2.value = val2;
  }
  if (prefs.sortCol) {
    sortCol2 = prefs.sortCol;
    const sc2 = document.getElementById('sort-col-2');
    if (sc2) sc2.value = sortCol2;
  }

  _applyLinesPrefs('stab-lines-2', prefs.linesSecondary);
  applyLineFilter2();

  updateVisibleColumns2();
  if (prefs.splitsMode) applyCompetitorSplits2(); else { clearCompetitorSplits2(); reorderTable2(); }

  updateArrivalsCardTitles();

  saveViewPrefs();
}

// Titoli delle due card Arrivi: "Arrivals" di default, personalizzabili per
// disciplina (es. Enduro → Partenze/Arrivi). Richiamata anche da
// applyTranslations() (i18n.js) ad ogni cambio lingua.
function updateArrivalsCardTitles() {
  const disc = DISCIPLINES.find(d => d.id === activeDisciplineId);
  const title1 = document.getElementById('arrivalsCardTitle');
  const title2 = document.getElementById('secondArrivalsCardTitle');
  if (title1) title1.textContent = t(disc?.prefs?.firstCardTitleKey  || 'card.arrivals');
  if (title2) title2.textContent = t(disc?.prefs?.secondCardTitleKey || 'card.arrivals');
}

function renderDisciplineCards() {
  const grid = document.getElementById('discipline-grid');
  if (!grid) return;
  const lang = currentLang();
  const selectable = DISCIPLINES.filter(d => STARTUP_DISCIPLINE_IDS.includes(d.id));
  grid.innerHTML = selectable.map(d => `
    <button class="discipline-card${d.id === activeDisciplineId ? ' active' : ''}"
            onclick="selectDiscipline('${d.id}')">
      <span class="disc-emoji">${d.emoji}</span>
      <span class="disc-label">${d.label[lang] ?? d.label.en}</span>
    </button>
  `).join('');
}

function openDisciplineOverlay() {
  try { renderDisciplineCards(); } catch(e) { console.error('renderDisciplineCards:', e); }
  document.getElementById('disciplineOverlay').style.display = 'flex';
}

function closeDisciplineOverlay() {
  document.getElementById('disciplineOverlay').style.display = 'none';
}

function onDisciplineBackClick() {
  closeDisciplineOverlay();
  showStartMenu();
}

function selectDiscipline(id) {
  const disc = DISCIPLINES.find(d => d.id === id);
  if (!disc) return;
  activeDisciplineId = id;
  localStorage.setItem(DISCIPLINE_KEY, id);
  localStorage.setItem(DISC_LOCK_KEY, '1');
  applyDisciplinePreset(disc.prefs);
  updateDisciplineNavBtn();
  // refresh active highlight without closing
  renderDisciplineCards();
  closeDisciplineOverlay();
  hideStartMenu();
}

// ── Start menu (Utilità / Cronometraggio) ──────────────────────────────────────

function showStartMenu() {
  document.getElementById('startMenuOverlay').style.display = 'flex';
}

function hideStartMenu() {
  document.getElementById('startMenuOverlay').style.display = 'none';
}

function goToUtility() {
  window.location.href = '/gps.html';
}

function goToTiming() {
  hideStartMenu();
  openDisciplineOverlay();
}

// ── Uscita dalla disciplina (icona navbar) ─────────────────────────────────────
// Una volta scelta la disciplina non è possibile cambiarla se non uscendo
// esplicitamente da questa schermata di conferma, che cancella anche la sessione.

function onDisciplineIconClick() {
  if (isDisciplineLocked()) {
    openExitDisciplineConfirm();
  } else {
    openDisciplineOverlay();
  }
}

function openExitDisciplineConfirm() {
  const overlay = document.getElementById('exitDisciplineOverlay');
  overlay.style.display = 'flex';

  document.getElementById('exitDisciplineCancel').onclick = () => {
    overlay.style.display = 'none';
  };

  document.getElementById('exitDisciplineConfirm').onclick = () => {
    overlay.style.display = 'none';
    fetch('/clearSession').catch(err => console.error('Errore clearSession:', err));
    localStorage.removeItem(DISC_LOCK_KEY);
    localStorage.removeItem(DISCIPLINE_KEY);
    activeDisciplineId = 'generic';
    openDisciplineOverlay();
  };
}

// ── Line edit overlay ─────────────────────────────────────────────────────────

const LINE_TIPO_KEY = 'chronofit_line_tipo';
let lineTipoConfig  = JSON.parse(localStorage.getItem(LINE_TIPO_KEY) || '{}');

// i18n key maps for tipo values (keys are numeric)
const TEST_I18N = { 0: 'cp.tipo1_fpc', 1: 'cp.tipo1_none' };
const TRIGGER_I18N = { 0: 'cp.tipo2_auto', 1: 'cp.tipo2_manual' };

function translateTest(v) {
  // Campo testo libero: vuoto → "Non gestita", altrimenti il testo così com'è.
  if (!v) return t(TEST_I18N[1]);
  return String(v);
}

// Per le linee virtuali 5 e 6 la colonna "Test" mostra un'etichetta fissa
// invece del device tradotto, per semplificare la lettura in tabella.
function testColumnLabel(lineNumber, test) {
  if (Number(lineNumber) === 5) return 'Sync-Test';
  if (Number(lineNumber) === 6) return 'F.P.';
  return translateTest(test);
}
function translateTrigger(v)   { return t(TRIGGER_I18N[Number(v)] ?? '') || String(v); }

let _lineEditTarget = null;

// ── Competitor direct-input on main card ───────────────────────────────────

let activeCompLine = null;   // quale input comp è attivo/focused
let _compBlurTimer = null;

function onCompInputFocus(n) {
  if (_compBlurTimer) { clearTimeout(_compBlurTimer); _compBlurTimer = null; }
  activeCompLine = n;
  document.querySelectorAll('.comp-input').forEach(el => el.classList.remove('comp-active'));
  document.getElementById(`c${n}`)?.classList.add('comp-active');
}

function onCompInputBlur(n) {
  // Con keep-focus ON: stesso delay da 200ms, ma alla scadenza controlliamo
  // document.activeElement. Se un altro elemento focusable ha preso il focus
  // (l'utente ha cliccato intenzionalmente altrove: un input MQTT, un select, ecc.)
  // disattiviamo normalmente. Se invece nulla ha il focus (blur involontario da
  // reflow DOM) oppure il focus è tornato sul competitor input (click lista),
  // ripristiniamo comp-active.
  if (document.getElementById('toggle-keep-comp-focus')?.checked && activeCompLine === n) {
    _compBlurTimer = setTimeout(() => {
      _compBlurTimer = null;
      if (activeCompLine !== n) return;
      const el = document.getElementById(`c${n}`);
      const active = document.activeElement;
      const movedAway = active && active !== document.body && active !== el;
      if (movedAway) {
        // L'utente ha cliccato su un altro campo — disattiva normalmente
        activeCompLine = null;
        el?.classList.remove('comp-active');
      } else {
        // Blur involontario — ripristina
        if (el) { el.classList.add('comp-active'); el.focus(); }
      }
    }, 200);
    return;
  }
  // Comportamento normale (impostazione disattivata):
  // piccolo delay in modo che il click sulla lista arrivi prima del blur
  _compBlurTimer = setTimeout(() => {
    if (activeCompLine === n) {
      activeCompLine = null;
      document.getElementById(`c${n}`)?.classList.remove('comp-active');
    }
    _compBlurTimer = null;
  }, 200);
}

function fillCompFromList(num) {
  // Se nessun input è attivo, non fare niente
  if (!activeCompLine) return;
  const n = activeCompLine;
  const cEl = document.getElementById(`c${n}`);
  if (!cEl) return;
  cEl.value = num;
  cEl.dispatchEvent(new Event('change'));   // salva sul server
  cEl.focus();                              // mantiene l'attivazione
}

// Flag per bloccare il click normale dopo un long press
let _compListLongPressed = false;

function fillCompFromListGuarded(competitor) {
  if (_compListLongPressed) { _compListLongPressed = false; return; }
  fillCompFromList(competitor);
}

function openAthleteFromList(competitor) {
  _compListLongPressed = true;
  // Cerca i dati nel registry
  const a = athleteRegistry.find(x => Number(x.competitor) === Number(competitor));
  // Pre-popola il tab manual con i dati del competitor
  document.getElementById('manual-num').value     = a?.competitor ?? competitor;
  document.getElementById('manual-name').value    = a?.name    ?? '-';
  document.getElementById('manual-surname').value = a?.surname ?? '-';
  document.getElementById('manual-team').value    = a?.team    ?? '-';
  document.getElementById('athlete-manual-status').textContent = '';
  // Apri l'overlay sul tab manual
  switchAthleteTab('manual');
  document.getElementById('athleteOverlay').style.display = 'flex';
}

function renderCompQuickList(scrollToCompetitor = null) {
  const container = document.getElementById('comp-quick-list');
  if (!container) return;
  if (!athleteRegistry || athleteRegistry.length === 0) {
    container.innerHTML = '<p class="comp-list-empty">—</p>';
    return;
  }
  const sorted = [...athleteRegistry].sort((a, b) => Number(a.competitor) - Number(b.competitor));
  container.innerHTML = sorted.map(a => {
    const nameParts = [a.name, a.surname].filter(s => s && s !== '-').join(' ');
    return `<div class="comp-list-item" data-competitor="${a.competitor}"
      onmousedown="event.preventDefault()" onclick="fillCompFromListGuarded(${a.competitor})">
      <span class="comp-list-num">${a.competitor}</span>${nameParts ? `<span class="comp-list-name">${nameParts}</span>` : ''}
    </div>`;
  }).join('');
  container.querySelectorAll('.comp-list-item').forEach(item => {
    const competitor = Number(item.dataset.competitor);
    addLongPress(item, () => openAthleteFromList(competitor));
  });
  if (scrollToCompetitor !== null) {
    const target = container.querySelector(`[data-competitor="${scrollToCompetitor}"]`);
    if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// Aggiunge il competitor al registro se non è già presente (usato dalle fonti di auto-acquisizione)
function maybeAutoAcquireCompetitor(compNum) {
  if (compNum > 0 && !athleteRegistry.find(a => Number(a.competitor) === compNum)) {
    athleteRegistry.push({ competitor: compNum, name: '-', surname: '-', team: '-' });
    localStorage.setItem(ATHLETES_KEY, JSON.stringify(athleteRegistry));
    renderCompQuickList(compNum);
  }
}

function getLineTipo(line) {
  return lineTipoConfig[line] ?? { tipo1: '', tipo2: 0 };
}

function updateTipoDisplays(line) {
  const cfg = getLineTipo(line);
  const el1 = document.getElementById(`tipo1-display-${line}`);
  const el2 = document.getElementById(`tipo2-display-${line}`);
  if (el1) el1.textContent = translateTest(cfg.tipo1);
  if (el2) el2.textContent = t(TRIGGER_I18N[cfg.tipo2] ?? cfg.tipo2);
}

function updateCompDisplay(line) {
  const el = document.getElementById(`comp-display-${line}`);
  if (el) el.textContent = document.getElementById(`c${line}`)?.value ?? '—';
}

function updateDelayDisplay(line) {
  const el = document.getElementById(`delay-display-${line}`);
  if (el) el.textContent = document.getElementById(`d${line}`)?.value ?? '0';
}

function updateAllLineDisplays() {
  for (let n = 1; n <= 4; n++) {
    updateTipoDisplays(n);
    updateCompDisplay(n);
    updateDelayDisplay(n);
  }
}

// ── Line edit overlay helpers ─────────────────────────────────────────

function _syncLeEnable(n) {
  const actual = document.querySelector(`.line-enable-btn[data-line="${n}"]`);
  const btn    = document.getElementById(`le-enbl-${n}`);
  if (!actual || !btn) return;
  const color   = lineColors[n] || '#e0e0e0';
  const enabled = (actual.dataset.enabled ?? '1') !== '0';
  btn.style.backgroundColor = enabled ? color : '#888';
  btn.style.opacity          = enabled ? '1'  : '0.5';
}

function leEnable(n) {
  toggleLineEnable(n);
  _syncLeEnable(n);
}

function leSend(n) {
  sendCheckPoint(n);
}

// ── open / close / save ───────────────────────────────────────────────

let _lineEditSnapshot = {};

function openLineEdit(line, focusField) {
  _lineEditTarget = line;
  _lineEditSnapshot = {};

  // Populate all 4 rows from hidden inputs + tipo config
  for (let n = 1; n <= 4; n++) {
    document.getElementById(`le-d-${n}`).value  = document.getElementById(`d${n}`)?.value ?? '0';
    const tipo = getLineTipo(n);
    document.getElementById(`le-t1-${n}`).value = tipo.tipo1;
    document.getElementById(`le-t2-${n}`).value = tipo.tipo2;
    // Stato prima della modifica, per stampare in automatico solo le linee toccate al salvataggio
    _lineEditSnapshot[n] = {
      tipo1: tipo.tipo1,
      tipo2: Number(tipo.tipo2),
      delay: Number(document.getElementById(`d${n}`)?.value) || 0
    };
    // Sync send button color
    const snd = document.getElementById(`le-snd-${n}`);
    if (snd) snd.style.backgroundColor = lineColors[n] || '#e0e0e0';
    _syncLeEnable(n);
  }

  const tkField = document.getElementById('timekeepers-field');
  if (tkField) tkField.value = localStorage.getItem(TIMEKEEPERS_KEY) || '';
  _lineEditSnapshot.timekeepers = tkField?.value ?? '';

  document.getElementById('lineEditOverlay').style.display = 'flex';

  // Focus the field in the row that was clicked
  const focusMap = {
    tipo1:  `le-t1-${line}`,
    tipo2:  `le-t2-${line}`,
    delay:  `le-d-${line}`
  };
  const focusId = focusMap[focusField];
  if (focusId) setTimeout(() => {
    const el = document.getElementById(focusId);
    if (!el) return;
    el.focus();
    if (el.tagName === 'INPUT' && typeof el.select === 'function') el.select();
  }, 80);
}

function closeLineEdit() {
  document.getElementById('lineEditOverlay').style.display = 'none';
  _lineEditTarget = null;
}

// Salva le 4 linee + cronometristi, senza stampare né chiudere il popup.
// Ritorna quali linee sono realmente cambiate rispetto all'apertura del
// popup (_lineEditSnapshot), per permettere una stampa mirata al salvataggio.
function _saveAllLineSettings() {
  const changedLines = [];

  for (let line = 1; line <= 4; line++) {
    const cEl = document.getElementById(`c${line}`);
    const dEl = document.getElementById(`d${line}`);
    if (dEl) dEl.value = document.getElementById(`le-d-${line}`).value;

    lineTipoConfig[line] = {
      tipo1: document.getElementById(`le-t1-${line}`).value.trim(),
      tipo2: Number(document.getElementById(`le-t2-${line}`).value)
    };
    const newDelay = Number(dEl?.value) || 0;

    updateTipoDisplays(line);
    updateCompDisplay(line);
    updateDelayDisplay(line);

    const enableBtn = document.querySelector(`.line-enable-btn[data-line="${line}"]`);
    sendSettingsRowData({
      l:  Number(line),
      c:  Number(cEl?.value) || 0,
      d:  newDelay,
      e:  Number(enableBtn?.dataset.enabled ?? 1),
      t1: lineTipoConfig[line].tipo1,
      t2: lineTipoConfig[line].tipo2
    });

    const before = _lineEditSnapshot[line] || {};
    const changed = before.tipo1 !== lineTipoConfig[line].tipo1 ||
                    before.tipo2 !== lineTipoConfig[line].tipo2 ||
                    before.delay !== newDelay;
    if (changed) changedLines.push(line);
  }

  localStorage.setItem(LINE_TIPO_KEY, JSON.stringify(lineTipoConfig));
  const tkField = document.getElementById('timekeepers-field');
  const newTimekeepers = tkField?.value ?? '';
  const timekeepersChanged = newTimekeepers !== (_lineEditSnapshot.timekeepers ?? '');
  if (tkField) localStorage.setItem(TIMEKEEPERS_KEY, newTimekeepers);

  return { changedLines, timekeepersChanged };
}

// "Salva e stampa": salva tutte le linee e stampa lo scontrino completo.
async function saveAndPrintLineEdit() {
  _saveAllLineSettings();
  await printLineSettingsReceipt();
  closeLineEdit();
}

// "Salva e chiudi": salva tutte le linee e stampa (stesso template dello
// scontrino completo) solo le linee/impostazioni realmente cambiate.
async function saveAndCloseLineEdit() {
  const { changedLines, timekeepersChanged } = _saveAllLineSettings();
  if (changedLines.length || timekeepersChanged) {
    await printLineSettingsReceipt(changedLines, timekeepersChanged);
  }
  closeLineEdit();
}

// ── Stampa scontrino impostazioni linee ────────────────────────────────
const TIMEKEEPERS_KEY = 'chronofit_timekeepers';
const RECEIPT_SEP = '------------------------------';

function _lineModeLabel(tipo2) {
  return Number(tipo2) === 1 ? 'RIL.MANUALE' : 'RIL.AUTOMATICO';
}

function _formatDelayMs(delayMs) {
  return (Number(delayMs) / 1000).toFixed(3);
}

// Righe della sezione "NOME E TIPO RILEVAMENTO LINEE" — usata sia dallo
// scontrino completo sia (per la singola linea) dalla notifica di modifica.
function _lineSettingsLine(n, tipo1, tipo2) {
  const dev = tipo1?.trim();
  return dev ? `L${n} ${dev} ${_lineModeLabel(tipo2)}` : `L${n} NON ASSEGNATA`;
}

// lineNumbers: quali linee includere nelle sezioni "NOME E TIPO"/"TEMPORIZZAZIONE"
// (default: tutte e 4, per lo scontrino completo; un sottoinsieme per la
// stampa mirata di "Salva e chiudi"). includeTimekeepers: se includere la
// sezione cronometristi (sempre per lo scontrino completo; solo se cambiati
// per la stampa mirata).
function _buildLineSettingsReceiptLines(lineNumbers = [1, 2, 3, 4], includeTimekeepers = true) {
  const disc = DISCIPLINES.find(d => d.id === activeDisciplineId);
  const discName = (disc?.label?.it ?? 'GENERICO').toUpperCase();

  const lines = [discName, RECEIPT_SEP];

  if (lineNumbers.length) {
    // Riepilogo dei dispositivi in uso: concatenazione dei nomi distinti
    // assegnati alle linee incluse, es. "FPC01 – FPC02".
    const devices = [];
    for (const n of lineNumbers) {
      const dev = getLineTipo(n).tipo1?.trim();
      if (dev && !devices.includes(dev)) devices.push(dev);
    }
    if (devices.length) {
      lines.push(devices.join(' – '));
      lines.push(RECEIPT_SEP);
    }

    lines.push('NOME E TIPO RILEVAMENTO LINEE:');
    for (const n of lineNumbers) {
      const tipo = getLineTipo(n);
      lines.push(_lineSettingsLine(n, tipo.tipo1, tipo.tipo2));
    }
    lines.push(RECEIPT_SEP);

    lines.push('TEMPORIZZAZIONE LINEE:');
    for (const n of lineNumbers) {
      const delay = document.getElementById(`d${n}`)?.value ?? 0;
      lines.push(`L${n} ${_formatDelayMs(delay)} ms`);
    }
    lines.push(RECEIPT_SEP);
  }

  if (includeTimekeepers) {
    const timekeepers = (document.getElementById('timekeepers-field')?.value ?? '')
      .split('\n').map(s => s.trim()).filter(Boolean);
    if (timekeepers.length) {
      lines.push('CRONOMETRISTI:');
      timekeepers.forEach(t => lines.push(t));
      lines.push(RECEIPT_SEP);
    }
  }

  return lines;
}

async function printLineSettingsReceipt(lineNumbers = [1, 2, 3, 4], includeTimekeepers = true) {
  const lines = _buildLineSettingsReceiptLines(lineNumbers, includeTimekeepers);
  for (let i = 0; i < lines.length; i++) {
    await _sendToPrinterAsync(lines[i], 1);
    if (i < lines.length - 1) await sleep(300);
  }
}

// ======= FINE LOCALSTORAGE =======

function updateParams() {
fetch('/allSettings')
  .then(res => {
    if (!res.ok) throw new Error("Errore nella fetch");
    return res.json();
  })
  .then(data => {
    console.log("Parametri ricevuti:");
    console.log(data);
    fillSettingsFields(data);
  })
  .catch(err => console.error("Errore:", err));
}

function fillSettingsFields(data){
  console.log("Aggiorno settings...")
  console.log(data);
  document.getElementById("c1").value = data.c1 ?? "";
  document.getElementById("c2").value = data.c2 ?? "";
  document.getElementById("c3").value = data.c3 ?? "";
  document.getElementById("c4").value = data.c4 ?? "";

  document.getElementById("d1").value = data.d1 ?? 0;
  document.getElementById("d2").value = data.d2 ?? 0;
  document.getElementById("d3").value = data.d3 ?? 0;
  document.getElementById("d4").value = data.d4 ?? 0;

  for (let n = 1; n <= 4; n++) {
    if (data[`e${n}`] !== undefined) {
      const btn = document.querySelector(`.line-enable-btn[data-line="${n}"]`);
      if (btn) applyLineEnableState(btn, data[`e${n}`]);
    }
  }

  
  document.getElementById("timezone-select").value = data.utc ?? 0;
  document.getElementById("station-name-input").value = data.sn;
  //document.getElementById("gpsToggle").checked = data.gps ?? 0;

  document.getElementById("sync-method-select").value = data.sm;
  document.getElementById("sync-method-select").dispatchEvent(new Event("change"));
  document.getElementById("sync-interval-select").value = data.si ?? 0

  const printToggle = document.getElementById("printToggle");
  printToggle.checked = (data.print == 1);

  const buzzerToggle = document.getElementById("buzzerToggle");
  buzzerToggle.checked = (data.bz == 1);

  if (data.mqttAcquireRow    !== undefined) mqttCfg.acquireRow    = (data.mqttAcquireRow    == 1);
  if (data.mqttImmediateMode !== undefined) mqttCfg.immediateMode = (data.mqttImmediateMode == 1);

  // Leggi tipo config dal server e aggiorna localStorage + display
  for (let n = 1; n <= 4; n++) {
    const t1 = data[`lt1_${n}`];
    const t2 = data[`lt2_${n}`];
    if (t1 !== undefined || t2 !== undefined) {
      lineTipoConfig[n] = {
        tipo1: t1 ?? lineTipoConfig[n]?.tipo1 ?? '',
        tipo2: t2 ?? lineTipoConfig[n]?.tipo2 ?? 0
      };
    }
  }
  localStorage.setItem(LINE_TIPO_KEY, JSON.stringify(lineTipoConfig));
  updateAllLineDisplays();

  // Riapplica preferenze visive — il server non deve sovrascriverle
  restoreViewPrefs();

  //handlePowerUpdate(data);
}

function setElapsedTimemode(){
  let url = `/setTime?mode=${encodeURIComponent(3)}`;
  console.log(url);
  
  fetch(url)
  .then(res=>res.text())
  .then(msg=>
    document.getElementById("settings-field").innerText = msg,
    setTimeout(() => { document.getElementById("settings-field").innerText = ""; }, 3000)
  )
  .catch(err => console.error("Error fetching JSON:", err));
}

function setTimeSyncMode(){
  let h = document.getElementById("hour").value;
  let m = document.getElementById("minute").value;
  let s = document.getElementById("second").value;
  let mode = document.getElementById("sync-method-select").value;
  let gpsInterval = document.getElementById("sync-interval-select").value;
  //utcOffset=${encodeURIComponent(document.getElementById("timezone-select").value)
  let utcOffset= document.getElementById("timezone-select").value;
  let stationName = document.getElementById("station-name-input").value;

  document.getElementById("hour").value = "";
  document.getElementById("minute").value = "";
  document.getElementById("second").value = "";
  
  let url = `/setTime?hour=${encodeURIComponent(h)}&minute=${encodeURIComponent(m)}&second=${encodeURIComponent(s)}&mode=${encodeURIComponent(mode)}&gpsInterval=${encodeURIComponent(gpsInterval)}&utcOffset=${encodeURIComponent(utcOffset)}`;
  console.log(url);

  fetch(url)
    .then(res=>res.text())
    .then(msg=>
      document.getElementById("settings-field").innerText = msg,
      setTimeout(() => { document.getElementById("settings-field").innerText = ""; }, 3000)
    )
    .catch(err => console.error("Error fetching JSON:", err));
  
  closeGlobalSettings();
}

function sendCheckPoint(lineNumber, competitor) {
  // Invia la richiesta al server aggiungendo il numero della linea come query
  let url = `/checkPoint?lineNumber=${lineNumber-1}`;
  if (competitor !== undefined) url += `&competitor=${competitor}`;
  fetch(url)
    .then(res => res.text())
    .then(data => {
      //const output = document.getElementById("json-output");
      //output.innerText = data;

      // Dopo 3 secondi svuota il contenuto
      //setTimeout(() => {
      //  output.innerText = "";
      //}, 3000);
    })
    .catch(err => console.error("Error fetching JSON:", err));
}

// ── Linea virtuale 6 "Fuori pressostato" — long press (1s) sugli header 1-4 ──
// addLongPress() non blocca il click nativo che scatta comunque al rilascio:
// stesso guard-flag già usato per comp-list-item/fillCompFromListGuarded.
const _outOfSensorLongPressLines = new Set();

function sendCheckPointGuarded(lineNumber) {
  if (_outOfSensorLongPressLines.has(lineNumber)) {
    _outOfSensorLongPressLines.delete(lineNumber);
    return;
  }
  sendCheckPoint(lineNumber);
}

function triggerOutOfSensorCheckpoint(lineNumber) {
  _outOfSensorLongPressLines.add(lineNumber);
  const competitor = Number(document.getElementById(`c${lineNumber}`)?.value) || 0;
  sendCheckPoint(6, competitor);
  resetLineCompetitor(lineNumber);
}


/* function clearSession() {
  if (confirm("Sei sicuro di voler cancellare tutti i checkpoint?")) {
    fetch("/clearSession")
      .then(response => response.text())
      .then(msg => alert(msg))
      .catch(err => alert("Errore: " + err));
  }
} */


function clearSession() {
  closeTableActions(); // chiude il menu prima di aprire il popup di conferma
  document.getElementById("clearSessionOverlay").style.display = "flex";

  // tasti
  const btnConfirm = document.getElementById("clearSessionConfirm");
  const btnCancel = document.getElementById("clearSessionCancel");

  btnCancel.onclick = () => {
    document.getElementById("clearSessionOverlay").style.display = "none";
  };

  btnConfirm.onclick = () => {
    document.getElementById("clearSessionOverlay").style.display = "none";

    fetch("/clearSession")
      .then(response => response.text())
      .catch(err => alert("Errore: " + err));
  };
}

let wakeLock = null;

async function keepScreenOn() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      console.log("✅ Screen Wake Lock attivato");

      // Rinnova il lock se il documento perde/riacquista visibilità
      document.addEventListener("visibilitychange", async () => {
        if (wakeLock !== null && document.visibilityState === "visible") {
          try {
            wakeLock = await navigator.wakeLock.request("screen");
            console.log("🔄 Screen Wake Lock riattivato");
          } catch (err) {
            console.error("Errore nel riattivare il wake lock:", err);
          }
        }
      });
    } else {
      console.warn("⚠️ Screen Wake Lock API non supportata su questo browser");
    }
  } catch (err) {
    console.error("❌ Errore nel richiedere il wake lock:", err);
  }
}


// Riattiva il wake lock se la pagina torna in foreground
document.addEventListener("visibilitychange", async () => {
  if (wakeLock !== null && document.visibilityState === "visible") {
    keepScreenOn();
  }
});



// Seleziona tutti gli input di tipo testo e numero
document.querySelectorAll("input[type=text], input[type=number]").forEach(input => {
  input.addEventListener("focus", function() {
    this.select();  // seleziona il contenuto quando l’utente entra nel campo
  });
});


let ws;
let lastMessageTime = 0;
let watchdogTimer;

let wsConnecting = false;
let reconnectTimer = null;

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    console.log("🔁 WebSocket già attivo, skip");
    return;
  }

  if (wsConnecting) return;
  wsConnecting = true;

  try{
  ws = new WebSocket(`ws://${window.location.host}/ws`);

  ws.onopen = () => {
    console.log("✅ WebSocket connected");
    wsConnecting = false;
    connectionLost = false;
    wifiConnecting = false;
    hidePopup();
    lastMessageTime = Date.now();
    startWatchdog();
  };

  ws.onmessage = (event) => {
    lastMessageTime = Date.now();
    if (connectionLost) {
      connectionLost = false;
      hidePopup();
    }

    try {
      const data = JSON.parse(event.data);
      console.log("📩 Received:", data);
      handleMessage(data);
    } catch (e) {
      console.error("Errore JSON:", e);
    }
  };

  ws.onclose = () => {
    console.warn("⚠️ WebSocket closed");
    wsConnecting = false;
    connectionLost = true;
    if (!wifiConnecting) showPopup();  // non mostrare il popup durante il reconnect WiFi
    stopWatchdog();

    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWebSocket();
      }, 1000);
    }
  };

  }
  catch(e){
    console.log("❌ WebSocket connection error");
  }
}

const TYPE_CHECKPOINT = 0;
const TYPE_TIME_UPDATE = 1;
const TYPE_SESSION_CLEARED = 2;
const TYPE_PARAMS_UPDATED = 3;
const TYPE_ROW_UPDATED = 4;
const TYPE_GENERIC_MESSAGE = 5;
const TYPE_EMAIL_SENT = 6;
const TYPE_WIFI_CONNECTING = 7;
const TYPE_WIFI_ERROR      = 8;
const TYPE_MQTT_NOTIFICATION = 9;
const TYPE_MQTT_PENDING      = 10;
const TYPE_LINE_UPDATED      = 11;

function handleMessage(data) {
  switch (data.t) {
    case TYPE_CHECKPOINT:
      if (data.ln !== 5) resetLineCompetitor(data.ln);
      addEventToTableFromCheckpoint({ ...data, x: 0 });
      reorderTable();
      if (document.getElementById("toggle-splits").checked) applyCompetitorSplits();
      if (isSecondArrivalsCardActive()) {
        reorderTable2();
        if (document.getElementById("toggle-splits-2")?.checked) applyCompetitorSplits2();
      }
      if ([netTimesStartLine, netTimesFinishLine, netTimesStartLine2, netTimesFinishLine2].includes(Number(data.ln))) rebuildNetTimesTable();
      break;

    case TYPE_TIME_UPDATE:
      updateClockFromData(data);
      break;

    case TYPE_SESSION_CLEARED:
      console.log("🧹 Session cleared signal!");
      clearEventTableRows();
      break;

    case TYPE_PARAMS_UPDATED:
      console.log("⚙️ Params update!");
      fillSettingsFields(data);
      break;

    case TYPE_ROW_UPDATED:
      console.log("⚙️ Row update!");
      updateRowFromBroadcas(data);
      break;

    case TYPE_GENERIC_MESSAGE:
      console.log("⚙️ Generic message received:", data);
      showGeneralPopup(data.msg, "#3b55ffff", 3000 );
      break;

    case TYPE_EMAIL_SENT:
      console.log("📧 Email sent confirmation:", data)
      showGeneralPopup("Email sent successfully!", "rgb(9, 139, 0)", 3000 );
      break;

    case TYPE_WIFI_CONNECTING:
      wifiConnecting = true;
      break;

    case TYPE_MQTT_NOTIFICATION:
    case TYPE_MQTT_PENDING:
      handleMqttIncoming(data.topic, data.data, data.pendingId);
      break;

    case TYPE_LINE_UPDATED:
      applyLineUpdate(data);
      break;

    case TYPE_WIFI_ERROR:
      wifiConnecting = false;
      const statusField = document.getElementById("wifi-status-field");
      if (statusField) {
        statusField.innerText = data.msg ? "❌ " + data.msg : t('wifi.conn_error');
        statusField.style.color = "#c0392b";
      }
      openGlobalSettings('wifi');
      break;
  }
}

window.addEventListener("beforeunload", () => {
  if (ws) {
    ws.close();
    ws = null;
  }
});


function startWatchdog() {
  stopWatchdog(); // evita doppioni

  watchdogTimer = setInterval(() => {
    const now = Date.now();
    // se non ricevi messaggi da più di 5s, considera la connessione persa
    if (now - lastMessageTime > 6000) {
      if (!connectionLost) {
        console.warn("⏱️ Watchdog: connessione inattiva, riavvio socket...");
        connectionLost = true;
        showPopup();
      }
      try { ws.close(); } catch (e) {}
      stopWatchdog();
      setTimeout(connectWebSocket, 500);
    }
  }, 2000); // controlla ogni 2s
}

// Mostra la messagebox
function showOkMessage(message) {
  document.getElementById("okMessageText").innerText = message;
  document.getElementById("okMessageOverlay").style.display = "flex";
}

// Chiude la messagebox
document.getElementById("okMessageButton").addEventListener("click", function () {
  document.getElementById("okMessageOverlay").style.display = "none";
});


function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}


const generalPopup = document.getElementById("generalPopup");
const generalPopupText = document.getElementById("generalPopupText");

function showGeneralPopup(message, bgColor = "#3b55ffff", duration = 3000) {
  generalPopupText.innerText = message;
  generalPopup.style.backgroundColor = bgColor;

  if (!generalPopup.classList.contains("show")) {
    generalPopup.classList.remove("hidden");
    setTimeout(() => generalPopup.classList.add("show"), 5); // fade-in
  }

  // Nascondi il popup dopo 'duration' millisecondi
  setTimeout(() => {
    generalPopup.classList.remove("show");
    // opzionale: dopo la transizione, aggiungi di nuovo hidden
    setTimeout(() => generalPopup.classList.add("hidden"), 1000); // 300ms dipende dalla durata della transizione CSS
  }, duration);
}

function hideGeneralPopup() {
  if (generalPopup.classList.contains("show")) {
    generalPopup.classList.remove("show"); // fade-out
    setTimeout(() => generalPopup.classList.add("hidden"), 500); // nasconde dopo transizione
  }
}


function updateClockFromData(data) {

    let hourAdj = (data.h + timeOffset + 24) % 24;

    document.getElementById("time").innerText =
        String(hourAdj).padStart(2,'0') + ":" 
        + String(data.m).padStart(2,'0') + ":" 
        + String(data.s).padStart(2,'0') + ".000" //+ data.millis; 


    let statusElem = document.getElementById("status");
    let wifiNavBar = document.getElementById("wifiStatus");
    let gpsNavBar = document.getElementById("gpsStatus");
    let mqttNavBar = document.getElementById("mqttStatus");
    let clientNavBar = document.getElementById("clientStatus");
    //let timezoneElem = document.getElementById("timezone");

    const fixFlags = data.f; // esempio: 7

    const syncEnabled = (fixFlags & FLAG_SYNC_ENABLED) !== 0;
    const timeValid = (fixFlags & FLAG_TIME_VALID) !== 0;
    const locationValid = (fixFlags & FLAG_LOCATION_VALID) !== 0;
    const ppsDetected = (fixFlags & FLAG_PPS_DETECTED) !== 0;


    const syncStatus = data.sy; 
    const wifiStatus = data.w; // 0=disconnected, 1=connecting, 2=connected

    //handlePowerUpdate(data);

    let syncTestIcon = document.getElementById("incon-sync-test");
    //syncTestIcon.style.display = "none";
    syncTestIcon.classList.add("disabled");

    const elapsedTimeControls = document.getElementById("elapsedTimeControls");
    elapsedTimeControls.classList.add("hidden");
    
    //document.getElementById("sendEmailBtn").disabled = true;

    const btn = document.getElementById("sendEmailBtn");
    btn.disabled = true;
    btn.classList.add("disabled");

    const hasRows = document.querySelectorAll('#event-table tbody tr').length > 0;

    clientNavBar.innerText = data.cl;

    lastWifiStatus = wifiStatus;
    const stopBtn = document.getElementById("stopReconnectBtn");
    if (wifiStatus == WIFI_STATUS_INTERNET_OK) {
      wifiNavBar.innerText = "🟢";
      wifiConnecting = false;
      if (stopBtn) stopBtn.style.display = "none";
      if (hasRows) { btn.disabled = false; btn.classList.remove("disabled"); }
    } else if (wifiStatus == WIFI_STATUS_CONNECTED) {
      wifiNavBar.innerText = "🟡";
      wifiConnecting = false;
      if (stopBtn) stopBtn.style.display = "none";
    } else if (wifiStatus == WIFI_STATUS_CONNECING) {
      wifiNavBar.innerText = "🔄";
      wifiConnecting = true;
      if (stopBtn) stopBtn.style.display = "none";  // primo tentativo: no Stop
    } else if (wifiStatus == WIFI_STATUS_RECONNECTING) {
      wifiNavBar.innerText = "🔁";
      wifiConnecting = true;
      if (stopBtn) stopBtn.style.display = "block";  // caduta: mostra Stop
    } else if (wifiStatus == WIFI_STATUS_DISCONNECTED) {
      wifiNavBar.innerText = "🔴";
      wifiConnecting = false;
      if (stopBtn) stopBtn.style.display = "none";
    }

    if(syncStatus === SYNC_NONE){
      document.getElementById("time").innerText = "00:00:00.000";
      statusElem.innerText = t('status.manual_not_set');
    }
    if(syncStatus === SYNC_MANUAL_SET){
      statusElem.innerText = t('status.manual_ok');
    }
    if(syncStatus === SYNC_WAIT_LINE_SIGNAL){
      document.getElementById("time").innerText = "00:00:00.000";
      statusElem.innerText = t('status.line_waiting');
    }
    if(syncStatus === SYNC_SET_BY_LINE_SIGNAL){
      statusElem.innerText = t('status.line_synced');
    }
    if(syncStatus === SYNC_FIRST_GPS_SYNC || syncStatus === SYNC_WAIT_GPS){
      statusElem.innerText = t('status.gps_waiting');
    }if(syncStatus === SYNC_GPS_SYNCED && ppsDetected){
      const lastSync = data.ls;
      const GPSRefreshInterval = data.lg;
      const nextSync = data.lg - data.ls;
      syncTestIcon.classList.remove("disabled");

      if(data.ts == GPS_TEST_DONE) {
        if(data.lg != 0){
          if(nextSync > 86400) {
            statusElem.innerText = t('status.gps_one_shot');
          } else if(nextSync < 60) {
            statusElem.innerText = t('status.gps_synced_s', nextSync);
          } else {
            statusElem.innerText = t('status.gps_synced_m', Math.trunc(nextSync/60));
          }
        } else {
          statusElem.innerText = t('status.gps_synced_1s');
        }
      } else {
        statusElem.innerText = t('status.sync_test');
      }
    }
    if(syncStatus == ELAPSED_WAITING_START){
      elapsedTimeControls.classList.remove("hidden");
      const startButton = document.getElementById("startButton");
      startButton.innerText = t('btn.start');
      document.getElementById("time").innerText = "00:00:00.000";
      statusElem.innerText = t('status.elapsed_waiting');
    }if(syncStatus == ELAPSED_TIME_STARTED){
      elapsedTimeControls.classList.remove("hidden");
      const startButton = document.getElementById("startButton");
      startButton.innerText = t('btn.stop');
      statusElem.innerText = t('status.elapsed_running');
    }
    
  
  if(timeValid && locationValid && ppsDetected){
    let tzOffsetAuto = Math.round(data.ln / 15); 
    let offsetString =  "UTC" + (tzOffsetAuto >=0 ? "+" : "") + tzOffsetAuto;
    document.getElementById("pos").innerText = "🟢 " + "Lat: " 
      + data.lt.toFixed(6) + ", Lng: " + data.ln.toFixed(6) + ", Sat: " + data.st + " [" + offsetString +"]";

    gpsNavBar.innerText = "🟢";
      //timezoneElem.innerText = "Estimated timezone: UTC" + (tzOffsetAuto >=0 ? "+" : "") + tzOffsetAuto;
  } else if(timeValid || locationValid){
    // GPS in attesa segnale
    document.getElementById("pos").innerText = "🟡 " +  "Lat:--, Lng:--, Sat: 0, Fix:--" ;   
    gpsNavBar.innerText = "🟡";
  } else {
    // GPS disabilitato
    document.getElementById("pos").innerText = "🔴 " + "Lat:--, Lng:--, Sat: 0, Fix:--" ;
    gpsNavBar.innerText = "🔴";
  }

  if (mqttNavBar) {
    if (data.mq === 1)                              mqttNavBar.innerText = "🟢";
    else if (lastWifiStatus === WIFI_STATUS_INTERNET_OK) mqttNavBar.innerText = "🔴";
    else                                             mqttNavBar.innerText = "⚫";
  }
}

let eventRows = []; // esempio

function clearEventTableRows() {
  document.querySelector("#event-table tbody").innerHTML = "";
  const tbody2 = document.querySelector("#event-table-2 tbody");
  if (tbody2) tbody2.innerHTML = "";
  eventRows = []; // reset array interno
}

async function populateTableFromSaved() {
  try {
    const response = await fetch("/getCheckpoints");
    const text = await response.text(); // ricevi tutto come testo

    const lines = text.trim().split("\n"); // dividi per riga
    lines.forEach(line => {
      if (line.trim().length > 0) {
        try {
          const checkpoint = JSON.parse(line);
          addEventToTableFromCheckpoint(checkpoint);
        } catch (err) {
          console.warn("Errore parsing JSON:", err, line);
        }
      }
    });

    reorderTable();
    if (isSecondArrivalsCardActive()) reorderTable2();
    rebuildNetTimesTable();

  } catch (err) {
    console.error("Errore caricamento checkpoint:", err);
  }
}
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function printFixInfos() {
  const fixInfos = document
    .getElementById("pos")
    .innerText
    .substring(2)
    .split(",");

  sendToPrinter("GPS FIX INFOS:", 1);

  for (const element of fixInfos) {
    sendToPrinter(element, 1);
    await sleep(100);   // ⏳ vero delay
  }
}


function sendToPrinter(text, cr) {
  const encodedText = encodeURIComponent(text);
  const url = `/print?text=${encodedText}&cr=${cr}`;

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error("Errore durante la stampa");
      console.log(`Stampa inviata -> ${encodedText}`);
    })
    .catch(error => {
      console.error("Errore:", error);
    });
}

// Overload compatibile: accetta un oggetto checkpoint
function addEventToTableFromCheckpoint(checkpoint) {
  // checkpoint deve avere: index, lineNumber, competitor, hour, minute, millis
  const rowIndex = checkpoint.id;
  const lineNumber = checkpoint.ln;
  const competitor = checkpoint.c;
  const hour = checkpoint.h;
  const minute = checkpoint.m;
  const second = checkpoint.s;
  const millis = checkpoint.ms;
  const penality = checkpoint.x;
  const enabled = checkpoint.e ?? 1;
  const test    = checkpoint.p ?? '';
  const trigger = checkpoint.r ?? '';
  const cancelled = checkpoint.an ?? 0;
  const edited = checkpoint.ed ?? 0;

  // Suono di notifica: una sola volta per checkpoint, indipendentemente da
  // quante card (tabelle) riceveranno la riga.
  if (lineNumber != 5 && lineNumber != 6 && isLineVisible('event-table', lineNumber)) {
    playSound("/sound" + lineNumber + ".mp3");
  }

  addEventToTable(rowIndex, lineNumber, competitor, hour, minute, second, millis, penality, enabled, test, trigger, cancelled, edited, 'event-table', timePrecision);

  if (isSecondArrivalsCardActive()) {
    addEventToTable(rowIndex, lineNumber, competitor, hour, minute, second, millis, penality, enabled, test, trigger, cancelled, edited, 'event-table-2', timePrecision2);
  }
}


function addEventToTable(rowIndex, lineNumber, competitor, hour, minute, seconds, millis, penality, enabled = 1, test = '', trigger = '', cancelled = 0, edited = 0, tableId = 'event-table', precision = timePrecision) {
  console.log(rowIndex, lineNumber, competitor, hour, minute, seconds, millis, penality, enabled);

  // Auto-acquisizione competitor da tabella: solo dalla card scelta come
  // sorgente (Partenze/Arrivi se entrambe visibili, altrimenti l'unica presente).
  if (tableId === getTableAcquireSource() && localStorage.getItem(TABLE_ACQUIRE_KEY) === "1" && getTableAcquireLines().includes(Number(lineNumber))) {
    maybeAutoAcquireCompetitor(Number(competitor));
  }

  const tbody = document.querySelector(`#${tableId} tbody`);
  const row = document.createElement("tr");

  row.classList.add("row-enter");
  if (!enabled) row.classList.add("row-disabled");
  if (Number(cancelled)) row.classList.add("row-cancelled");

  const timestamp = formatTime(hour, minute, seconds, millis, precision);
  const index = rowIndex;

  // Crea la riga HTML
  row.setAttribute("data-line", lineNumber);
  row.setAttribute("data-competitor", competitor);
  row.setAttribute("data-hour", hour);
  row.setAttribute("data-minute", minute);
  row.setAttribute("data-seconds", seconds);
  row.setAttribute("data-ms-raw", millis);
  row.setAttribute("data-penality", 0);
  row.setAttribute("data-enabled", enabled ? "1" : "0");
  row.setAttribute("data-row-id", rowIndex);
  row.setAttribute("data-test", test);
  row.setAttribute("data-trigger", trigger);
  row.setAttribute("data-cancelled", Number(cancelled) ? "1" : "0");
  row.setAttribute("data-edited", Number(edited) ? "1" : "0");

  row.innerHTML = `
    <td class="col-rank"></td>
    <td class="col-index">${index}</td>
    <td style="background-color: ${lineColors[lineNumber] || "#f5f5f5"}" class="col-line">${lineNumber}</td>
    <td class="col-competitor">${competitor > 0 ? competitor : ''}</td>
    <td class="col-test">${testColumnLabel(lineNumber, test)}</td>
    <td class="col-trigger">${translateTrigger(trigger)}</td>
    <td class="col-name">${getAthleteName(competitor)}</td>
    <td class="col-surname">${getAthleteSurname(competitor)}</td>
    <td class="timestamp">${timestamp}</td>
    <td class="race-time">—</td>
    <td class="delta-time"></td>
    <td class="elapsed-time"></td>
    <td><button class="penality penality-btn">${penality}</button></td>
    <td><button class="cancel-btn${Number(cancelled) ? ' active' : ''}" title="Annulla">🚫</button></td>
    <td><button class="send-btn">➡</button></td>
  `;

  

  const sendBtn = row.querySelector('.send-btn');
  sendBtn.onclick = () => sendRow(sendBtn);
  addLongPress(row, () => editRow(row));

  tbody.appendChild(row);

  updateRankColumn(tableId);

  // forza reflow (FONDAMENTALE per animazione)
  row.offsetHeight;
  row.classList.add("row-enter-active");
  setTimeout(() => {
    row.classList.remove("row-enter");
    row.classList.remove("row-enter-active");
  }, 1500);
}

function timestampToMs(ts) {
  // "19:16:04.770"
  const [time, ms] = ts.split(".");
  const [h, m, s] = time.split(":").map(Number);
  return ((h * 3600 + m * 60 + s) * 1000) + Number(ms);
}

function formatDelta(ms, signed) {

  if (ms > 0) {
    return "—";
  }

  let sign = "";
  if (signed) sign = "+";

  ms = truncateMs(Math.abs(ms));

  const hours   = Math.floor(ms / 3600000);
  ms %= 3600000;
  const minutes = Math.floor(ms / 60000);
  ms %= 60000;
  const seconds = Math.floor(ms / 1000);
  const millis  = ms % 1000;

  const msStr = timePrecision === 1
    ? String(Math.floor(millis / 100))
    : timePrecision === 2
      ? String(Math.floor(millis / 10)).padStart(2, "0")
      : String(millis).padStart(3, "0");

  return (
    sign +
    String(hours).padStart(2, "0") + ":" +
    String(minutes).padStart(2, "0") + ":" +
    String(seconds).padStart(2, "0") + "." +
    msStr
  );
}



function recalcElapsedTimes(tableId = "event-table", precision = timePrecision) {
  // Ordine cronologico (dal più vecchio al più nuovo) indipendente dalla visualizzazione
  const rows = Array.from(
    document.querySelectorAll(`#${tableId} tbody tr`)
  ).filter(row => row.style.display !== "none")
   .sort((a, b) => (Number(a.dataset.rowId) || 0) - (Number(b.dataset.rowId) || 0));

  const firstTimeMs = rows.length > 0 ? rowToMs(rows[0], precision) : null;

  rows.forEach(row => {
    const deltaCell = row.querySelector(".elapsed-time");
    if (!deltaCell) return;
    const delta = firstTimeMs - rowToMs(row, precision);
    deltaCell.textContent = formatDelta(delta, false);
  });
}

function recalcElapsedTimes2() {
  recalcElapsedTimes("event-table-2", timePrecision2);
}

function recalcDeltaTimes(tableId = "event-table", precision = timePrecision) {
  // Ordine cronologico (dal più vecchio al più nuovo) indipendente dalla visualizzazione
  const rows = Array.from(
    document.querySelectorAll(`#${tableId} tbody tr`)
  ).filter(row => row.style.display !== "none")
   .sort((a, b) => (Number(a.dataset.rowId) || 0) - (Number(b.dataset.rowId) || 0));

  let prevTime = null;

  rows.forEach(row => {
    const tsCell    = row.querySelector(".timestamp");
    const deltaCell = row.querySelector(".delta-time");
    if (!tsCell || !deltaCell) return;

    row.classList.remove("negative-row");

    const timestamp = tsCell.textContent.trim();
    if (timestamp === "00:00:00.000" || timestamp === "00:00:00.00" || timestamp === "00:00:00.0") {
      row.classList.add("negative-row");
    }

    const currentMs = rowToMs(row, precision);

    if (prevTime === null) {
      deltaCell.textContent = "—";
    } else {
      const delta = currentMs - prevTime;
      if (delta < 0) {
        deltaCell.textContent = "—";
        row.classList.add("negative-row");
      } else {
        deltaCell.textContent = formatDelta(-delta, false);
      }
    }
    prevTime = currentMs;
  });
}

function recalcDeltaTimes2() {
  recalcDeltaTimes("event-table-2", timePrecision2);
}

// Ritorna se una linea (1-6) è selezionata nel tab "Lines" della tabella
// indicata (default true se, per qualche motivo, il checkbox non esiste).
function isLineVisible(tableId, lineNumber) {
  const containerId = tableId === 'event-table-2' ? 'stab-lines-2' : 'stab-lines';
  const el = document.querySelector(`#${containerId} .line-vis-toggle[data-line="${lineNumber}"]`);
  return el ? el.checked : true;
}

function isSecondArrivalsCardActive() {
  const card = document.getElementById('secondArrivalsCard');
  return !!card && card.style.display !== 'none';
}

// Mostra/nasconde insieme la seconda card Arrivi e la card Tempi netti
// (entrambe fanno parte dello stesso concetto "doppia linea", es. Enduro).
// Quando attive, .has-net-times fa passare la riga arrivi ad altezza fissa
// e i tempi netti a riempire il resto fino a pari con la card Utilità.
function setSecondArrivalsCardVisible(visible) {
  const card2 = document.getElementById('secondArrivalsCard');
  if (card2) card2.style.display = visible ? '' : 'none';
  const area = document.querySelector('.arrivals-area');
  if (area) area.classList.toggle('has-net-times', visible);
  if (typeof updateAutoAcquireSourceUI === 'function') updateAutoAcquireSourceUI();
}

function applyLineFilter(tableId = 'event-table', linesContainerId = 'stab-lines', disabledToggleId = 'toggle-disabled-rows') {
  const activeLines = Array.from(document.querySelectorAll(`#${linesContainerId} .line-vis-toggle`))
    .filter(el => el.checked)
    .map(el => el.dataset.line);

  const showDisabled = document.getElementById(disabledToggleId)?.checked ?? true;

  const rows = document.querySelectorAll(`#${tableId} tbody tr`);

  rows.forEach(row => {
    if (row.classList.contains("diff-row")) return; // gestite da applyCompetitorSplits
    if (row.classList.contains("diff-hidden")) { row.style.display = "none"; return; } // in splits mode restano nascoste
    const line    = String(row.getAttribute("data-line"));
    const enabled = row.getAttribute("data-enabled") !== "0";
    const lineOk     = activeLines.includes(line);
    const disabledOk = enabled || showDisabled;
    row.style.display = (lineOk && disabledOk) ? "" : "none";
  });

  // 🔥 ricalcolo intertempi DOPO il filtro
  const precision = tableId === 'event-table-2' ? timePrecision2 : timePrecision;
  recalcDeltaTimes(tableId, precision);
  recalcElapsedTimes(tableId, precision);
  if (tableId === 'event-table-2') updateVisibleColumns2(); else updateVisibleColumns();
  updateRankColumn(tableId);
}

function applyLineFilter2() {
  applyLineFilter('event-table-2', 'stab-lines-2', 'toggle-disabled-rows-2');
}

function editRow(row) {
  if (row.classList.contains('row-editing')) return;
  row.classList.add('row-editing');

  const editableCells = row.querySelectorAll('.col-competitor, .timestamp');
  editableCells.forEach(cell => {
    const value = cell.textContent.trim();
    if (cell.classList.contains('timestamp')) {
      cell.innerHTML = `<input type="text" value="${value}" style="width:90%" maxlength="12" placeholder="hh:mm:ss.mmm" oninput="maskTimeInput(this)">`;
    } else {
      cell.innerHTML = `<input type="text" value="${value}" style="width:90%">`;
    }
    cell.querySelector('input').addEventListener('blur', () => {
      setTimeout(() => {
        if (!row.contains(document.activeElement)) saveRow(row);
      }, 80);
    });
  });

  row.querySelector('input')?.focus();
}


// Funzione di mascheratura oraria hh:mm:ss.mmm
function maskTimeInput(input) {
  let v = input.value.replace(/\D/g, ""); // rimuove tutto tranne i numeri
  if (v.length > 9) v = v.slice(0, 9);    // hhmmssmmm → massimo 9 cifre

  let formatted = "";
  if (v.length >= 2) formatted += v.slice(0, 2) + ":";
  else formatted += v;
  if (v.length >= 4) formatted += v.slice(2, 4) + ":";
  else if (v.length > 2) formatted += v.slice(2);
  if (v.length >= 6) formatted += v.slice(4, 6) + ".";
  else if (v.length > 4) formatted += v.slice(4);
  if (v.length > 6) formatted += v.slice(6);

  input.value = formatted;
}

function saveRow(row) {
  if (!row.classList.contains('row-editing')) return;
  row.classList.remove('row-editing');

  const inputs = row.querySelectorAll('input');
  inputs.forEach((input, i) => {
    const newValue = input.value.trim();
    const cell = input.parentElement;
    switch (i) {
      case 0:
        row.dataset.competitor = newValue;
        cell.textContent = Number(newValue) > 0 ? newValue : '';
        break;
      case 1: {
        cell.textContent = newValue;
        const [hms, ms] = newValue.split('.');
        const [h, m, s] = (hms || '0:0:0').split(':');
        row.dataset.hour    = Number(h);
        row.dataset.minute  = Number(m);
        row.dataset.seconds = Number(s);
        let msVal = Number(ms ?? 0);
        if (ms && ms.length === 1) msVal *= 100;
        else if (ms && ms.length === 2) msVal *= 10;
        row.dataset.msRaw = msVal;
        break;
      }
      default: cell.textContent = newValue; break;
    }
  });

  const penalityBtn = row.querySelector('.penality-btn');
  if (penalityBtn) row.dataset.penality = Number(penalityBtn.textContent.trim());

  const sendBtn = row.querySelector('.send-btn');
  if (sendBtn) sendBtn.onclick = () => sendRow(sendBtn);

  sendUpdatedCheckPointRow(row);
  recalcDeltaTimes();
}

function sendUpdatedCheckPointRow(row) {
  const index      = parseInt(row.dataset.rowId ?? 0);
  const lineNumber = parseInt(row.dataset.line  ?? 0);
  const competitor = parseInt(row.dataset.competitor ?? 0);
  const penality   = Number(row.dataset.penality) || 0;

  // Il firmware marca sempre la riga come modificata su /updateCheckPointRow:
  // rispecchiamo subito lo stesso stato lato client (usato es. dall'export CSV).
  row.dataset.edited = "1";

  const messageObj = {
    index,
    lineNumber,
    competitor,
    hour:   parseInt(row.dataset.hour    ?? 0),
    minute: parseInt(row.dataset.minute  ?? 0),
    second: parseInt(row.dataset.seconds ?? 0),
    millis: parseInt(row.dataset.msRaw   ?? 0),
    penality,
    cancelled: Number(row.dataset.cancelled) || 0
  };

  console.log("Invio aggiornamento riga:", messageObj);

  fetch("/updateCheckPointRow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messageObj)
  })
    .then(res => res.text())
    .then(resp => console.log("ESP response:", resp))
    .catch(err => console.error("Error sending JSON to ESP:", err));
}

function sendRow(button) {
  const row = button.closest("tr");

  // 🔹 Legge i dati dal dataset della riga (robusto al cambio di colonne visibili)
  const index      = parseInt(row.dataset.rowId      ?? 0);
  const lineNumber = parseInt(row.dataset.line       ?? 0);
  const competitor = parseInt(row.dataset.competitor ?? 0);

  // 🔹 Crea l'oggetto messaggio
  const messageObj = {
    index,
    lineNumber,
    competitor,
    hour:   parseInt(row.dataset.hour    ?? 0),
    minute: parseInt(row.dataset.minute  ?? 0),
    second: parseInt(row.dataset.seconds ?? 0),
    millis: parseInt(row.dataset.msRaw   ?? 0)
  };

  console.log("Invio:", messageObj);

  // 🔹 Invia al server
  sendCheckPointRow(messageObj);
}

// Funzione di invio al backend (ESP)
function sendCheckPointRow(data) {
  fetch("/sendCheckPointRow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  })
    .then(res => res.text())
    .then(resp => console.log("ESP response:", resp))
    .catch(err => console.error("Error sending JSON to ESP:", err));
}

document.querySelectorAll('#stab-lines .line-vis-toggle').forEach(el => {
  el.addEventListener('change', () => { applyLineFilter(); saveViewPrefs(); });
});

document.querySelectorAll('#stab-lines-2 .line-vis-toggle').forEach(el => {
  el.addEventListener('change', () => { applyLineFilter2(); saveViewPrefs(); });
});



document.querySelectorAll('.line-enable-btn').forEach(el => {
  if (el.tagName === "BUTTON") {
    const color = el.dataset.color; // colore originale
    el.style.backgroundColor = color;
  } 
});

async function downloadSession() {
  try {
    const response = await fetch('/downloadSession');
    if (!response.ok) {
      //alert("Errore nel download del file");
      showOkMessage("No session data available to download.");
      return;
    }

    // Leggi tutto come testo
    const text = await response.text();
    // Rimuove eventuali BOM iniziali
    const cleanText = text.replace(/^\uFEFF/, '').trim();

    // Dividi in righe (ogni riga = un JSON)
    const lines = cleanText.split(/\r?\n/);

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g,'-');

    // Converti tutte le righe in CSV
    const arrayJson = lines.map(line => JSON.parse(line));
    //const csv = jsonToCsv(arrayJson);
    const csv = jsonToCsvTimeStamp(arrayJson);
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `session_${timestamp}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);

  } catch (err) {
    console.error(err);
    alert("Errore durante il download o la conversione: " + err.message);
  }
}

function jsonToCsv(array) {
  if (!array.length) return '';
 
  // Ottieni tutte le chiavi presenti nel primo oggetto
  const keys = Object.keys(array[0]);

  // Crea intestazione CSV
  const header = keys.join(';');

  // Crea righe CSV
  const rows = array.map(obj => {
    return keys.map(k => {
      let val = obj[k];
      if (typeof val === 'string') {
        // Se ci sono virgole o doppi apici, racchiudi tra doppi apici
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(';');
  });

  return [header, ...rows].join('\r\n');
}

function jsonToCsvTimeStamp(array) {
  if (!array.length) return '';

  const keys = Object.keys(array[0]);

  // Header CSV: prime 3 colonne + timestamp
  const header = `ID;Line number;Competitor;Timestamp`;

  const rows = array.map(obj => {
    
    // Prime 4 colonne normalmente
    const fixedCols = keys.slice(0, 4).map(k => {
      let val = obj[k];
      if (typeof val === 'string') {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(';');

    // Colonne 4–7 → timestamp
    const h   = obj[keys[4]];
    const min = obj[keys[5]];
    const sec = obj[keys[6]];
    const ms  = obj[keys[7]];

    const timestamp = `${h}:${min}:${sec}:${ms}`;

    return `${fixedCols};${timestamp}`;
  });

  return [header, ...rows].join('\r\n');
}

// Aggiunge il listener a tutti gli input
document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
  // previene duplicazione listener
  input.removeEventListener('change', handleInputUpdate);
  // aggiunge solo il necessario
  input.addEventListener('change', handleInputUpdate);
});

function resetLineCompetitor(lineNumber) {
  const cEl = document.getElementById(`c${lineNumber}`);
  if (!cEl) return;
  const wasActive = (activeCompLine === lineNumber);
  cEl.value = 0;
  updateCompDisplay(lineNumber);
  const enableBtn = document.querySelector(`.line-enable-btn[data-line="${lineNumber}"]`);
  sendSettingsRowData({
    l:  lineNumber,
    c:  0,
    d:  Number(document.getElementById(`d${lineNumber}`)?.value) || 0,
    e:  Number(enableBtn?.dataset.enabled ?? 1)
  });
}


function handleInputUpdate(e) {
  const lineNumber = e.target.dataset.line;
  if (!lineNumber) return;

  const enableBtn = document.querySelector(`.line-enable-btn[data-line="${lineNumber}"]`);
  const data = {
    l:  Number(lineNumber),
    c:  Number(document.querySelector(`#c${lineNumber}`).value),
    d:  Number(document.querySelector(`#d${lineNumber}`).value) || 0,
    e:  Number(enableBtn?.dataset.enabled ?? 1)
  };

  sendSettingsRowData(data);

  if (e.target.classList.contains('comp-input') && data.c) {
    propagateCompetitorIfNeeded(data.l, data.c);
  }
}

// Se attivo, riporta il numero competitor appena assegnato su tutte le altre
// linee gestite (device non vuoto) ma ancora prive di competitor (0).
function propagateCompetitorIfNeeded(sourceLine, competitor) {
  if (!document.getElementById('toggle-propagate-competitor')?.checked) return;
  for (let n = 1; n <= 4; n++) {
    if (n === Number(sourceLine)) continue;
    if (!getLineTipo(n).tipo1?.trim()) continue; // linea non gestita
    const cEl = document.getElementById(`c${n}`);
    if (!cEl || Number(cEl.value) !== 0) continue; // già assegnata
    cEl.value = competitor;
    updateCompDisplay(n);
    const enableBtn = document.querySelector(`.line-enable-btn[data-line="${n}"]`);
    sendSettingsRowData({
      l: n,
      c: competitor,
      d: Number(document.getElementById(`d${n}`)?.value) || 0,
      e: Number(enableBtn?.dataset.enabled ?? 1)
    });
  }
}

function applyLineEnableState(btn, enabled) {
  btn.dataset.enabled = enabled ? "1" : "0";
  btn.style.backgroundColor = enabled ? (btn.dataset.color || "#ccc") : "#888";
}

function applyLineUpdate(data) {
  const n = data.l;
  const cEl = document.getElementById(`c${n}`);
  const dEl = document.getElementById(`d${n}`);
  const btn = document.querySelector(`.line-enable-btn[data-line="${n}"]`);
  if (cEl) cEl.value = data.c  ?? cEl.value;
  if (dEl) dEl.value = data.d  ?? dEl.value;
  if (btn && data.e !== undefined) applyLineEnableState(btn, data.e);
  if (data.t1 !== undefined || data.t2 !== undefined) {
    lineTipoConfig[n] = {
      tipo1: data.t1 ?? lineTipoConfig[n]?.tipo1 ?? '',
      tipo2: data.t2 ?? lineTipoConfig[n]?.tipo2 ?? 0
    };
    localStorage.setItem(LINE_TIPO_KEY, JSON.stringify(lineTipoConfig));
  }
  updateTipoDisplays(n);
  updateCompDisplay(n);
  updateDelayDisplay(n);
}

function toggleLineEnable(line) {
  const btn = document.querySelector(`.line-enable-btn[data-line="${line}"]`);
  const currentEnabled = (btn.dataset.enabled ?? "1") !== "0";
  const newEnabled = currentEnabled ? 0 : 1;
  const data = {
    l:  line,
    c:  Number(document.querySelector(`#c${line}`).value),
    d:  Number(document.querySelector(`#d${line}`).value) || 0,
    e:  newEnabled
  };
  applyLineEnableState(btn, newEnabled); // aggiornamento ottimistico
  sendSettingsRowData(data);
}

function sendSettingsRowData(data) {
  console.log("Invio dati al server:", data);
  fetch('/checkPointFields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(res => res.ok ? console.log(`✅ Riga ${data.l} aggiornata`) : console.error(`❌ Errore aggiornando linea ${data.l}`))
  .catch(err => console.error('Errore di rete:', err));
}

function toggleFullscreen(checkbox) {
  if (checkbox.checked) {
    // Entra in fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) { // Safari
      document.documentElement.webkitRequestFullscreen();
    }
  } else {
    // Esci da fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) { // Safari
      document.webkitExitFullscreen();
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {

    // Apply translations immediately so the UI starts in the saved language
    applyTranslations();

    // Connessione WebSocket immediata, appena il DOM è pronto
    console.log("Connetto webSocket...");
    connectWebSocket();

    // Esegui altre inizializzazioni
    console.log("Carico parametri...");
    updateParams();

    // Popola la tabella con i checkpoint già salvati
    console.log("Carico checkpoint salvati...");
    populateTableFromSaved();

    console.log("Richiedo always on display...");
    keepScreenOn();

    console.log("Timposto toggle delta time a default...")
    const chk = document.getElementById("toggle-delta-time");
    toggleDeltaTimeColumn(chk.checked);

    console.log("Ripristino preferenze visualizzazione...");
    restoreViewPrefs();
    restoreNetTimesLines();
    updateDisciplineNavBtn();
    updateAllLineDisplays();

    updateTableCorners();

    // Long press su comp-input (card principale) → apre il form di caricamento competitor
    for (let n = 1; n <= 4; n++) {
      const el = document.getElementById(`c${n}`);
      if (el) addLongPress(el, () => {
        athleteTargetLine = n;
        switchAthleteTab('load');
        document.getElementById('athleteOverlay').style.display = 'flex';
      });
    }

    // Long press (1s) sugli header delle linee 1-4 → checkpoint manuale su linea virtuale 6 "Fuori pressostato"
    document.querySelectorAll('.cp-line-send').forEach(el => {
      const n = Number(el.dataset.line);
      if (n) addLongPress(el, () => triggerOutOfSensorCheckpoint(n), 1000);
    });

    // Render lista competitor iniziale (da localStorage)
    renderCompQuickList();
});


// Gestione pulsanti
document.getElementById('yesFullscreen').addEventListener('click', async () => {
  try {
    await document.documentElement.requestFullscreen();
  } catch (err) {
    console.error('Errore fullscreen:', err);
  }
  document.getElementById('fullscreenOverlay').style.display = 'none';
});

document.getElementById('noFullscreen').addEventListener('click', () => {
  document.getElementById('fullscreenOverlay').style.display = 'none';
});

function preloadLineAudio() {
  const params = new URLSearchParams(window.location.search);
  const line = params.get("line");
  if (line && line >= 1 && line <= 4) {
    const name = `/sound${line}.mp3`;
    if (!audioCache[name]) {
      // delay casuale 0-3s → i 6 dispositivi non scaricano tutti insieme
      const delay = Math.random() * 3000;
      setTimeout(() => {
        const audio = new Audio();
        audio.preload = "auto";
        audio.src = name;
        audio.load();
        audioCache[name] = audio;
        console.log(`Audio precaricato per linea ${line} (dopo ${Math.round(delay)}ms)`);
      }, delay);
    }
  }
}

function playSound(name) {
  if (!audioCache[name]) {
    const audio = new Audio();
    audio.preload = "none";  // non scaricare finché non serve
    audio.src = name;
    audioCache[name] = audio;
  }
  audioCache[name].currentTime = 0;
  audioCache[name].play();
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('✅ Service Worker registrato:', reg))
    .catch(err => console.error('❌ Registrazione SW fallita:', err));
}

// Su "Invio" (tastiera fisica) o "Vai" (tastiera Android) togli il focus dal campo.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const el = e.target;
  if (!el.matches('input, textarea')) return;
  // Uscita esplicita: annulla il "keep focus" del competitor input, altrimenti
  // onCompInputBlur() lo ririfocalizza 200ms dopo credendo sia un blur involontario.
  if (el.classList.contains('comp-input') && activeCompLine === Number(el.dataset.line)) {
    activeCompLine = null;
    el.classList.remove('comp-active');
  }
  el.blur();
});

window.addEventListener("load", () => {
  const splash = document.getElementById("splash");

  // Inizia la dissolvenza dopo 1 secondo (o subito)
  setTimeout(() => {
    splash.classList.add("finished");
    // Se non è ancora stata bloccata una disciplina, mostra la schermata
    // Utilità/Cronometraggio invece di lasciare visibile l'app principale.
    if (!isDisciplineLocked()) showStartMenu();
  },1000);

  // Rimuove l'elemento dal DOM dopo 3 secondi (durata della transizione CSS)
  setTimeout(() => {
    splash.remove();
  }, 1000 + 1000); // 1s attesa + 3s dissolvenza
  
  setTimeout(() => {
    console.log("Richiedo Full-screen popup..."); 
    document.getElementById('fullscreenOverlay').style.display = 'flex';
  }, 1000 + 1000 + 500); // 1s attesa + 3s dissolvenza
});

// Apri popup premendo sull'orario
document.getElementById("time").addEventListener("click", () => {
  document.getElementById("timeChoiceOverlay").style.display = "flex";
});



function onTimeSettingsAction(){
  updateParams();
  document.getElementById("timeChoiceOverlay").style.display = "none"
  openGlobalSettings('sync');
}

function onSyncTestAction(){
  document.getElementById("timeChoiceOverlay").style.display = "none"
  
  const url = `/syncTest`;

  console.log(url);

  fetch(url)
    .then(response => response.text())
    .then(msg => {
      document.getElementById("settings-field").innerText = msg;
      setTimeout(() => { document.getElementById("settings-field").innerText = ""; }, 3000);
    })
    .catch(err => {
      document.getElementById("settings-field").innerText = t('main.error_send');
      console.error(err);
    });

}

function onGoHomeAction(){
  document.getElementById("timeChoiceOverlay").style.display = "none"
}

// Funzione per inviare al dispositivo o aggiornare l'orario
function setTimeManualPopup(hh, mm, ss) {
  console.log("Imposto tempo:", hh, mm, ss);
}


function updateTimeSettingsVisibility() {
  const method = document.getElementById("sync-method-select").value;

  // Nasconde tutto
  document.querySelectorAll('.manual-sync, .gps-sync')
          .forEach(el => el.classList.add('hidden'));

  // Mostra solo quelli corretti
  if (method === "1") {   
    document.querySelectorAll('.manual-sync').forEach(el => el.classList.remove('hidden'));
    document.querySelector('.time-set-fields').textContent = t('time.time_to_sync');
  } else if (method === "2") {
    document.querySelectorAll('.gps-sync').forEach(el => el.classList.remove('hidden'));
    const message = document.getElementById("time-settings-field");
    message.textContent = "";
  } else if (method === "0") {
    document.querySelectorAll('.manual-sync').forEach(el => el.classList.remove('hidden'));
    document.querySelector('.time-set-fields').textContent = t('time.time_to_set');
  }
}


function onApplyClick() {
  const hour = document.getElementById("hour");
  const minute = document.getElementById("minute");
  const message = document.getElementById("time-settings-field");
  const manualSyncRow = document.querySelector(".toggle-row.manual-sync");

  console.log("Apply!");
  
  // se non è visibile → ok, lascia procedere
  if (manualSyncRow.classList.contains("hidden")) {
    console.log("Controlli hidden!");
    setTimeSyncMode();
    return;
  }

  const validHour = hour.value !== "" && hour.value >= 0 && hour.value <= 23;
  const validMinute = minute.value !== "" && minute.value >= 0 && minute.value <= 59;
  console.log(validHour);
  console.log(validMinute);

  if (validHour && validMinute) {
    console.log("Sincronizzo!");
    // pulisci messaggio ed esegui realmente l'Apply
    message.textContent = "";
    setTimeSyncMode();
  } else {
    console.log("Tempo non impostato!");
    // mostra messaggio di errore
    message.textContent = t('status.valid_time');
    message.style.color = "red";
  }
}

function toggleDeltaTimeColumn(show, tableId = 'event-table') {
  const display = show ? "table-cell" : "none"; // usa table-cell per rimuovere problemi di layout
  document.querySelectorAll(`#${tableId} th.delta-time-col`).forEach(th => th.style.display = display);
  document.querySelectorAll(`#${tableId} td.delta-time`).forEach(td => td.style.display = display);

  // se la mostri, ricalcola i delta
  if (show) {
    const precision = tableId === 'event-table-2' ? timePrecision2 : timePrecision;
    recalcDeltaTimes(tableId, precision);
    recalcElapsedTimes(tableId, precision);
  }
}
function toggleDeltaTimeColumn2(show) { toggleDeltaTimeColumn(show, 'event-table-2'); }

function toggleTimestampColumn(show, tableId = 'event-table') {
  const display = show ? "table-cell" : "none"; // usa table-cell per rimuovere problemi di layout
  document.querySelectorAll(`#${tableId} th.timestamp-col`).forEach(th => th.style.display = display);
  document.querySelectorAll(`#${tableId} td.timestamp`).forEach(td => td.style.display = display);
}
function toggleTimestampColumn2(show) { toggleTimestampColumn(show, 'event-table-2'); }

function toggleElapsedTimeColumn(show, tableId = 'event-table') {
  const display = show ? "table-cell" : "none"; // usa table-cell per rimuovere problemi di layout
  document.querySelectorAll(`#${tableId} th.elapsed-time-col`).forEach(th => th.style.display = display);
  document.querySelectorAll(`#${tableId} td.elapsed-time`).forEach(td => td.style.display = display);

  // se la mostri, ricalcola i delta
  if (show) {
    const precision = tableId === 'event-table-2' ? timePrecision2 : timePrecision;
    recalcElapsedTimes(tableId, precision);
  }
}
function toggleElapsedTimeColumn2(show) { toggleElapsedTimeColumn(show, 'event-table-2'); }

function togglePenalityColumn(show, tableId = 'event-table') {
  const display = show ? "table-cell" : "none"; // usa table-cell per rimuovere problemi di layout
  document.querySelectorAll(`#${tableId} th.penality-col`).forEach(th => th.style.display = display);
  document.querySelectorAll(`#${tableId} td:has(.penality)`).forEach(td => td.style.display = display);

  // se la mostri, ricalcola i delta
  if (show) {
    const precision = tableId === 'event-table-2' ? timePrecision2 : timePrecision;
    recalcElapsedTimes(tableId, precision);
  }
}
function togglePenalityColumn2(show) { togglePenalityColumn(show, 'event-table-2'); }


function reorderTable() {
  applyTableSort();
  applyLineFilter();
}

function reorderTable2() {
  applyTableSort2();
  applyLineFilter2();
}

function toggleIndexColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.col-index-col, #${tableId} td.col-index`).forEach(el => el.style.display = d);
}
function toggleIndexColumn2(show) { toggleIndexColumn(show, 'event-table-2'); }

function toggleRankColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.col-rank-col, #${tableId} td.col-rank`).forEach(el => el.style.display = d);
}
function toggleRankColumn2(show) { toggleRankColumn(show, 'event-table-2'); }

function updateRankColumn(tableId = 'event-table') {
  const rows = Array.from(document.querySelectorAll(`#${tableId} tbody tr`));
  let rank = 0;
  rows.forEach(row => {
    const td = row.querySelector("td.col-rank");
    if (!td) return;
    td.textContent = row.style.display === "none" ? "" : ++rank;
  });
}

function updateRankColumn2() { updateRankColumn('event-table-2'); }

function toggleLineColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.col-line-col, #${tableId} td.col-line`).forEach(el => el.style.display = d);
}
function toggleLineColumn2(show) { toggleLineColumn(show, 'event-table-2'); }


function toggleRaceTimeColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.race-time-col, #${tableId} td.race-time`).forEach(el => el.style.display = d);
}
function toggleRaceTimeColumn2(show) { toggleRaceTimeColumn(show, 'event-table-2'); }

function toggleEditColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.col-edit-col`).forEach(el => el.style.display = d);
  document.querySelectorAll(`#${tableId} td:has(.edit-btn)`).forEach(el => el.style.display = d);
}

function toggleSendColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.col-send-col`).forEach(el => el.style.display = d);
  document.querySelectorAll(`#${tableId} td:has(.send-btn)`).forEach(el => el.style.display = d);
}
function toggleSendColumn2(show) { toggleSendColumn(show, 'event-table-2'); }

function toggleCancelColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.cancel-col`).forEach(el => el.style.display = d);
  document.querySelectorAll(`#${tableId} td:has(.cancel-btn)`).forEach(el => el.style.display = d);
}
function toggleCancelColumn2(show) { toggleCancelColumn(show, 'event-table-2'); }

function updateTableCorners(tableId = 'event-table') {
  // angoli sempre netti — nessun border-radius inline
  const ths = document.querySelectorAll(`#${tableId} thead th`);
  ths.forEach(th => {
    th.style.borderTopLeftRadius = "0";
    th.style.borderTopRightRadius = "0";
  });
}

function updateTableCorners2() { updateTableCorners('event-table-2'); }

function toggleNameColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.col-name-col`).forEach(el => el.style.display = d);
  document.querySelectorAll(`#${tableId} td.col-name`).forEach(el => el.style.display = d);
  updateTableCorners(tableId);
}
function toggleNameColumn2(show) { toggleNameColumn(show, 'event-table-2'); }

function toggleSurnameColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.col-surname-col`).forEach(el => el.style.display = d);
  document.querySelectorAll(`#${tableId} td.col-surname`).forEach(el => el.style.display = d);
  updateTableCorners(tableId);
}
function toggleSurnameColumn2(show) { toggleSurnameColumn(show, 'event-table-2'); }

function toggleTestColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.col-test-col, #${tableId} td.col-test`).forEach(el => el.style.display = d);
}
function toggleTestColumn2(show) { toggleTestColumn(show, 'event-table-2'); }

function toggleTriggerColumn(show, tableId = 'event-table') {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll(`#${tableId} th.col-trigger-col, #${tableId} td.col-trigger`).forEach(el => el.style.display = d);
}
function toggleTriggerColumn2(show) { toggleTriggerColumn(show, 'event-table-2'); }

function updateVisibleColumns(){
  toggleTimestampColumn(document.getElementById("toggle-timestamp").checked);
  toggleElapsedTimeColumn(document.getElementById("toggle-elapsed-time").checked);
  toggleDeltaTimeColumn(document.getElementById("toggle-delta-time").checked);
  togglePenalityColumn(document.getElementById("toggle-penality").checked);
  toggleIndexColumn(document.getElementById("toggle-index").checked);
  toggleLineColumn(document.getElementById("toggle-line").checked);
  toggleRaceTimeColumn(document.getElementById("toggle-splits").checked);
  toggleRankColumn(document.getElementById("toggle-rank").checked);
  toggleNameColumn(document.getElementById("toggle-name")?.checked ?? false);
  toggleSurnameColumn(document.getElementById("toggle-surname")?.checked ?? false);
  toggleCancelColumn(document.getElementById("toggle-cancel")?.checked ?? true);
  toggleSendColumn(document.getElementById("toggle-send-btn").checked);
  toggleTestColumn(document.getElementById("toggle-test")?.checked ?? false);
  toggleTriggerColumn(document.getElementById("toggle-trigger")?.checked ?? false);
  updateTableCorners();
}

function updateVisibleColumns2(){
  toggleTimestampColumn2(document.getElementById("toggle-timestamp-2").checked);
  toggleElapsedTimeColumn2(document.getElementById("toggle-elapsed-time-2").checked);
  toggleDeltaTimeColumn2(document.getElementById("toggle-delta-time-2").checked);
  togglePenalityColumn2(document.getElementById("toggle-penality-2").checked);
  toggleIndexColumn2(document.getElementById("toggle-index-2").checked);
  toggleLineColumn2(document.getElementById("toggle-line-2").checked);
  toggleRaceTimeColumn2(document.getElementById("toggle-splits-2").checked);
  toggleRankColumn2(document.getElementById("toggle-rank-2").checked);
  toggleNameColumn2(document.getElementById("toggle-name-2")?.checked ?? false);
  toggleSurnameColumn2(document.getElementById("toggle-surname-2")?.checked ?? false);
  toggleCancelColumn2(document.getElementById("toggle-cancel-2")?.checked ?? true);
  toggleSendColumn2(document.getElementById("toggle-send-btn-2").checked);
  toggleTestColumn2(document.getElementById("toggle-test-2")?.checked ?? false);
  toggleTriggerColumn2(document.getElementById("toggle-trigger-2")?.checked ?? false);
  updateTableCorners2();
}

// ── Competitor splits ─────────────────────────────────────────
function rowToMsExact(row) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return ((h * 3600 + m * 60 + s) * 1000) + ms;
}

// ── Tempi netti (terza card) ──────────────────────────────────────────────
// Calcola, per ogni concorrente, il tempo netto tra una linea di partenza e
// una di arrivo scelte liberamente dall'operatore. Legge sempre da
// #event-table (che riceve ogni checkpoint indipendentemente da filtri di
// visibilità/seconda card), quindi non dipende da quali linee sono mostrate
// nelle due card sopra.

const NET_TIMES_KEY = 'chronofit_net_times_lines';
let netTimesStartLine = 1;
let netTimesFinishLine = 3;
let netTimesStartLine2 = 2;
let netTimesFinishLine2 = 4;

function _rowAbsoluteTimeText(row) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return formatTime(h, m, s, ms, 3);
}

// Prima riga (cronologicamente) per ogni concorrente su una data linea,
// escludendo le diff-row sintetiche dello split-mode e le righe senza
// concorrente assegnato.
function _firstRowPerCompetitor(lineNumber) {
  const rows = Array.from(document.querySelectorAll('#event-table tbody tr:not(.diff-row)'))
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

// Testo (Start/Finish/Net) per una singola coppia di linee, dato il set di
// righe-per-competitor già calcolato per ciascuna linea.
function _netPairText(startByComp, finishByComp, comp) {
  const sRow = startByComp[comp];
  const fRow = finishByComp[comp];

  const sText = sRow ? _rowAbsoluteTimeText(sRow) : '—';
  const fText = fRow ? _rowAbsoluteTimeText(fRow) : '—';

  let netText = '—';
  if (sRow && fRow) {
    const diffMs = rowToMsExact(fRow) - rowToMsExact(sRow);
    if (diffMs >= 0) {
      const dH  = Math.floor(diffMs / 3600000);
      const dM  = Math.floor((diffMs % 3600000) / 60000);
      const dS  = Math.floor((diffMs % 60000) / 1000);
      const dMs = diffMs % 1000;
      netText = formatTime(dH, dM, dS, dMs, 3);
    }
  }
  return { sText, fText, netText };
}

// Righe di un singolo gruppo (coppia di linee) da appendere alla tabella,
// una riga per competitor, etichettate con le linee usate (es. "L1→L3").
function _netGroupRows(tbody, startLine, finishLine) {
  const startByComp  = _firstRowPerCompetitor(startLine);
  const finishByComp = _firstRowPerCompetitor(finishLine);
  const comps = new Set([...Object.keys(startByComp), ...Object.keys(finishByComp)]);
  const pairLabel = `L${startLine}→L${finishLine}`;

  Array.from(comps)
    .sort((a, b) => Number(a) - Number(b))
    .forEach(comp => {
      const p = _netPairText(startByComp, finishByComp, comp);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${comp}</td><td>${pairLabel}</td><td>${p.sText}</td><td>${p.fText}</td><td>${p.netText}</td>`;
      tbody.appendChild(tr);
    });
}

function rebuildNetTimesTable() {
  const tbody = document.querySelector('#net-times-table tbody');
  if (!tbody) return;

  tbody.innerHTML = '';
  _netGroupRows(tbody, netTimesStartLine,  netTimesFinishLine);
  _netGroupRows(tbody, netTimesStartLine2, netTimesFinishLine2);
}

function onNetTimesLinesChange() {
  netTimesStartLine   = Number(document.getElementById('net-line-start')?.value    ?? 1);
  netTimesFinishLine  = Number(document.getElementById('net-line-finish')?.value   ?? 3);
  netTimesStartLine2  = Number(document.getElementById('net-line-start-2')?.value  ?? 2);
  netTimesFinishLine2 = Number(document.getElementById('net-line-finish-2')?.value ?? 4);
  localStorage.setItem(NET_TIMES_KEY, JSON.stringify({
    start: netTimesStartLine, finish: netTimesFinishLine,
    start2: netTimesStartLine2, finish2: netTimesFinishLine2
  }));
  rebuildNetTimesTable();
}

function restoreNetTimesLines() {
  try {
    const raw = localStorage.getItem(NET_TIMES_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.start)   { netTimesStartLine   = saved.start;   const el = document.getElementById('net-line-start');    if (el) el.value = saved.start; }
    if (saved.finish)  { netTimesFinishLine  = saved.finish;  const el = document.getElementById('net-line-finish');   if (el) el.value = saved.finish; }
    if (saved.start2)  { netTimesStartLine2  = saved.start2;  const el = document.getElementById('net-line-start-2');  if (el) el.value = saved.start2; }
    if (saved.finish2) { netTimesFinishLine2 = saved.finish2; const el = document.getElementById('net-line-finish-2'); if (el) el.value = saved.finish2; }
  } catch(e) {
    console.warn('Errore ripristino linee tempi netti:', e);
  }
}

function applyCompetitorSplits(tableId = 'event-table') {
  clearCompetitorSplits(tableId);
  const tbody = document.querySelector(`#${tableId} tbody`);
  const allRows = Array.from(tbody.querySelectorAll("tr:not(.diff-row)"));

  // Raggruppa per competitor (tutte le righe, indipendentemente dalla visibilità)
  const groups = {};
  allRows.forEach(row => {
    const comp = (row.dataset.competitor ?? "").trim();
    if (!comp || comp === "0") return;
    if (!groups[comp]) groups[comp] = [];
    groups[comp].push(row);
  });

  Object.values(groups).forEach(compRows => {
    // Ordina cronologicamente (crescente per tempo assoluto)
    compRows.sort((a, b) => rowToMsExact(a) - rowToMsExact(b));

    if (compRows.length >= 2) {
      // Coppie CONSECUTIVE: (0,1), (1,2), (2,3), ...  → N righe = N-1 diff
      for (let i = 0; i < compRows.length - 1; i++) {
        const r1 = compRows[i];      // evento precedente
        const r2 = compRows[i + 1]; // evento successivo

        const diffMs = rowToMsExact(r2) - rowToMsExact(r1);
        const dH  = Math.floor(diffMs / 3600000);
        const dM  = Math.floor((diffMs % 3600000) / 60000);
        const dS  = Math.floor((diffMs % 60000) / 1000);
        const dMs = diffMs % 1000;

        const line1 = r1.dataset.line;
        const line2 = r2.dataset.line;
        const comp  = r1.dataset.competitor;

        const diffRow = document.createElement("tr");
        diffRow.className = "diff-row";
        diffRow.dataset.competitor = comp;
        diffRow.innerHTML = `
          <td class="col-rank"></td>
          <td class="col-index">—</td>
          <td class="col-line">L${line1}→L${line2}</td>
          <td class="col-competitor">${Number(comp) > 0 ? comp : ''}</td>
          <td class="col-name">${getAthleteName(comp)}</td>
          <td class="col-surname">${getAthleteSurname(comp)}</td>
          <td class="timestamp">—</td>
          <td class="race-time diff-time">${formatTime(dH, dM, dS, dMs, tableId === 'event-table-2' ? timePrecision2 : timePrecision)}</td>
          <td class="delta-time">—</td>
          <td class="elapsed-time">—</td>
          <td></td><td></td><td></td>
        `;

        // r2 è il più recente → appare prima nel DOM (newest-first)
        // Inserisce la diff-row prima di r2 nel DOM
        tbody.insertBefore(diffRow, r2);
      }
    }

    // Nasconde TUTTE le righe originali del competitor (incluse le singole senza coppia)
    compRows.forEach(r => {
      r.classList.add("diff-hidden");
      r.style.display = "none";
    });
  });

  // Nasconde anche le righe senza competitor in splits mode
  allRows.forEach(row => {
    const comp = (row.dataset.competitor ?? "").trim();
    if (!comp || comp === "0") {
      row.classList.add("diff-hidden");
      row.style.display = "none";
    }
  });

  if (tableId === 'event-table-2') { updateVisibleColumns2(); applyTableSort2(); }
  else { updateVisibleColumns(); applyTableSort(); }   // applica l'ordinamento corrente sulle diff-row appena create
}

function applyCompetitorSplits2() {
  applyCompetitorSplits('event-table-2');
}

function clearCompetitorSplits(tableId = 'event-table') {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.querySelectorAll(".diff-row").forEach(r => r.remove());
  tbody.querySelectorAll(".diff-hidden").forEach(r => {
    r.classList.remove("diff-hidden");
    r.style.display = "";
  });
  if (tableId === 'event-table-2') applyLineFilter2(); else applyLineFilter();
}

function clearCompetitorSplits2() {
  clearCompetitorSplits('event-table-2');
}

document
.getElementById("toggle-delta-time")
.addEventListener("change", e => {
  toggleDeltaTimeColumn(e.target.checked);
  saveViewPrefs();
});

document
.getElementById("toggle-timestamp")
.addEventListener("change", e => {
  toggleTimestampColumn(e.target.checked);
  saveViewPrefs();
});

document
.getElementById("toggle-elapsed-time")
.addEventListener("change", e => {
  toggleElapsedTimeColumn(e.target.checked);
  saveViewPrefs();
});

document
.getElementById("toggle-penality")
.addEventListener("change", e => {
  togglePenalityColumn(e.target.checked);
  saveViewPrefs();
});

document
.getElementById("toggle-disabled-rows")
.addEventListener("change", () => {
  applyLineFilter();
  saveViewPrefs();
});

document
.getElementById("toggle-reverse-order")
.addEventListener("change", e => {
  reverseOrder = e.target.checked;
  reorderTable();
  saveViewPrefs();
});

document.getElementById("toggle-rank")
.addEventListener("change", e => { toggleRankColumn(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-index")
.addEventListener("change", e => { toggleIndexColumn(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-line")
.addEventListener("change", e => { toggleLineColumn(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-splits")
.addEventListener("change", e => {
  toggleRaceTimeColumn(e.target.checked);
  if (e.target.checked) applyCompetitorSplits();
  else clearCompetitorSplits();
  saveViewPrefs();
});

document.getElementById("toggle-keep-comp-focus")
.addEventListener("change", () => saveViewPrefs());

document.getElementById("toggle-name")
.addEventListener("change", e => { toggleNameColumn(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-surname")
.addEventListener("change", e => { toggleSurnameColumn(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-send-btn")
.addEventListener("change", e => { toggleSendColumn(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-cancel")
.addEventListener("change", e => { toggleCancelColumn(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-test")
.addEventListener("change", e => { toggleTestColumn(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-trigger")
.addEventListener("change", e => { toggleTriggerColumn(e.target.checked); saveViewPrefs(); });

// ── Stessi listener per la seconda card Arrivi ──

document.getElementById("toggle-delta-time-2")
.addEventListener("change", e => { toggleDeltaTimeColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-timestamp-2")
.addEventListener("change", e => { toggleTimestampColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-elapsed-time-2")
.addEventListener("change", e => { toggleElapsedTimeColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-penality-2")
.addEventListener("change", e => { togglePenalityColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-disabled-rows-2")
.addEventListener("change", () => { applyLineFilter2(); saveViewPrefs(); });

document.getElementById("toggle-reverse-order-2")
.addEventListener("change", e => {
  reverseOrder2 = e.target.checked;
  reorderTable2();
  saveViewPrefs();
});

document.getElementById("toggle-rank-2")
.addEventListener("change", e => { toggleRankColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-index-2")
.addEventListener("change", e => { toggleIndexColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-line-2")
.addEventListener("change", e => { toggleLineColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-splits-2")
.addEventListener("change", e => {
  toggleRaceTimeColumn2(e.target.checked);
  if (e.target.checked) applyCompetitorSplits2();
  else clearCompetitorSplits2();
  saveViewPrefs();
});

document.getElementById("toggle-name-2")
.addEventListener("change", e => { toggleNameColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-surname-2")
.addEventListener("change", e => { toggleSurnameColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-send-btn-2")
.addEventListener("change", e => { toggleSendColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-cancel-2")
.addEventListener("change", e => { toggleCancelColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-test-2")
.addEventListener("change", e => { toggleTestColumn2(e.target.checked); saveViewPrefs(); });

document.getElementById("toggle-trigger-2")
.addEventListener("change", e => { toggleTriggerColumn2(e.target.checked); saveViewPrefs(); });



// seleziona l'intera riga dell'header
const headerRow = document.querySelector("#event-table thead tr");

// cambia cursore per tutta la riga
headerRow.style.cursor = "pointer";

// aggiungi click listener alla riga
headerRow.addEventListener("click", () => {
  document.getElementById("tableSettingsOverlay").style.display = "flex";
});

// chiudi il popup con il bottone Close
document.getElementById("closeTablePopup").addEventListener("click", () => {
  document.getElementById("tableSettingsOverlay").style.display = "none";
});

// Stessa cosa per la seconda card Arrivi (se presente in pagina).
const headerRow2 = document.querySelector("#event-table-2 thead tr");
if (headerRow2) {
  headerRow2.style.cursor = "pointer";
  headerRow2.addEventListener("click", () => {
    document.getElementById("tableSettingsOverlay2").style.display = "flex";
  });
}

document.getElementById("closeTablePopup2")?.addEventListener("click", () => {
  document.getElementById("tableSettingsOverlay2").style.display = "none";
});


// Aggiorna, in TUTTE le tabelle attive (main + seconda se presente), la riga
// con quell'indice. Un checkpoint può avere una riga indipendente in ciascuna
// card (stesso data-row-id), quindi un solo edit va rispecchiato in entrambe.
function updateRowFromBroadcas(data) {
  const index = Number(data.id);
  if (isNaN(index)) return;

  const tableIds = ['event-table'];
  if (isSecondArrivalsCardActive()) tableIds.push('event-table-2');

  tableIds.forEach(tableId => {
    const table = document.getElementById(tableId);
    const tbody = table?.querySelector("tbody");
    if (!tbody) return;

    // trova la riga tramite la colonna # (indice), non la prima <td> in assoluto:
    // quando la colonna rank è visibile è lei la prima cella, non l'indice.
    const row = [...tbody.rows].find(r =>
      Number(r.querySelector("td.col-index")?.textContent) === index
    );

    if (!row) {
      console.warn("Row not found:", index, "in", tableId);
      return;
    }

    // se la riga è in edit, evita overwrite
    if (row.querySelector("input")) {
      console.warn("Row in edit, skipped:", index);
      return;
    }

    // aggiorna competitor
    const competitorCell = row.querySelector(".col-competitor");
    if (competitorCell && data.c !== undefined) {
      competitorCell.textContent = data.c > 0 ? data.c : '';
      row.dataset.competitor = data.c;
      const nc = row.querySelector(".col-name");
      const sc = row.querySelector(".col-surname");
      if (nc) nc.textContent = getAthleteName(data.c);
      if (sc) sc.textContent = getAthleteSurname(data.c);
    }

    // aggiorna event time
    const timeCell = row.querySelector(".timestamp");
    if (timeCell) {
      row.dataset.hour    = data.h ?? row.dataset.hour;
      row.dataset.minute  = data.m ?? row.dataset.minute;
      row.dataset.seconds = data.s ?? row.dataset.seconds;
      row.dataset.msRaw   = data.ms ?? row.dataset.msRaw;
      const precision = tableId === 'event-table-2' ? timePrecision2 : timePrecision;
      timeCell.textContent = formatTime(
        parseInt(row.dataset.hour),
        parseInt(row.dataset.minute),
        parseInt(row.dataset.seconds),
        parseInt(row.dataset.msRaw),
        precision
      );
    }

    const penalityBtn = row.querySelector(".penality");
    if (penalityBtn) {
      penalityBtn.textContent = data.x;
    }

    if (data.an !== undefined) {
      const cancelled = Number(data.an) ? "1" : "0";
      row.dataset.cancelled = cancelled;
      row.querySelector(".cancel-btn")?.classList.toggle("active", cancelled === "1");
      row.classList.toggle("row-cancelled", cancelled === "1");
    }
    if (data.ed !== undefined) {
      row.dataset.edited = Number(data.ed) ? "1" : "0";
    }

    if (tableId === 'event-table-2') { recalcDeltaTimes2(); recalcElapsedTimes2(); }
    else { recalcDeltaTimes(); recalcElapsedTimes(); }
  });

  showGeneralPopup(`Row ${index} has been updated`,  lineColors[data.ln]);
  rebuildNetTimesTable();
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

let currentPenaltyButton = null;

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("penality-btn")) {

    currentPenaltyButton = e.target;

    // valore attuale nel popup
    const currentValue = currentPenaltyButton.textContent.trim();
    document.getElementById("penalty-input").value = currentValue || 0;

    // mostra popup
    document.getElementById("assingPenality").style.display = "flex";
  }

  if (e.target.classList.contains("cancel-btn")) {
    const row = e.target.closest("tr");
    if (!row) return;
    const cancelled = row.dataset.cancelled === "1" ? "0" : "1";
    row.dataset.cancelled = cancelled;
    e.target.classList.toggle("active", cancelled === "1");
    row.classList.toggle("row-cancelled", cancelled === "1");
    sendUpdatedCheckPointRow(row);
  }
});


document.getElementById("confirmPenalityButton").addEventListener("click", () => {
  if (!currentPenaltyButton) return;

  const value = Number(document.getElementById("penalty-input").value) || 0;

  // aggiorna bottone (UI)
  currentPenaltyButton.textContent = value;

  // 🔹 salva il valore sul <tr>
  const row = currentPenaltyButton.closest("tr");
  row.dataset.penality = value;

  console.log("Valore del dataset", value);

  // chiudi popup
  document.getElementById("assingPenality").style.display = "none";
  currentPenaltyButton = null;
  
  sendUpdatedCheckPointRow(row);
});

function normalizeHeader(text) {
  return text
    .replace(/❌/g, "penality")
    .replace(/⏱️/g, "time")
    .replace(/\s+/g, " ")
    .replace("Δ", "Delta")
    .trim();
}

function downloadActualView(tableId = 'event-table') {

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g,'-');

  filename = `table_view_${timestamp}.csv`;

  const table = document.getElementById(tableId);
  if (!table) return;

  const isVisible = (el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  };

  const rows = [];

  // --- HEADER ---
  const headerCells = Array.from(table.querySelectorAll("thead th"));
  const visibleIndexes = [];

  const headerRow = [];

  headerCells.forEach((th, i) => {
    const text = normalizeHeader(th.innerText);;

    // ❌ escludi Edit, Send e Annulla (pulsanti azione, non dati: il loro
    // simbolo/emoji non è un valore utile nel CSV)
    if (["edit", "send"].includes(text.toLowerCase())) return;
    if (th.classList.contains("cancel-col")) return;

    if (isVisible(th)) {
      visibleIndexes.push(i);
      headerRow.push(text);
    }
  });

  // "ed"/"an" non sono colonne visibili in tabella (solo dataset sulla riga):
  // le aggiungiamo sempre in coda, indipendentemente dai toggle di visibilità.
  headerRow.push("ed", "an");

  rows.push(headerRow.join(";"));

  // --- BODY ---
  const bodyRows = table.querySelectorAll("tbody tr");

  bodyRows.forEach(tr => {
    // ❌ riga nascosta
    if (!isVisible(tr)) return;

    const cells = tr.querySelectorAll("td");

    // ❌ riga incompleta / template
    if (cells.length < Math.max(...visibleIndexes) + 1) return;

    const row = [];

    visibleIndexes.forEach(i => {
      let text = cells[i].innerText || "";
      text = text.replace(/\n/g, " ").replace(/;/g, ",");
      row.push(text);
    });

    // ❌ evita righe completamente vuote
    if (row.every(v => v === "")) return;

    row.push(tr.dataset.edited === "1" ? "1" : "0");
    row.push(tr.dataset.cancelled === "1" ? "1" : "0");

    rows.push(row.join(";"));
  });

  // --- DOWNLOAD ---
  const csvContent = rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadActualView2() {
  downloadActualView('event-table-2');
}

function clearWifiError() {
  const f = document.getElementById("wifi-status-field");
  if (f) { f.innerText = ""; f.style.color = ""; }
}

function connectWiFi() {
  clearWifiError();
  const ssid = document.getElementById("wifi-ssid").value;
  const pw   = document.getElementById("wifi-password").value;

  const url = `/wifiConnect?ssid=${encodeURIComponent(ssid)}&pw=${encodeURIComponent(pw)}`;

  fetch(url)
    .then(r => r.text())
    .then(t => console.log(t))
    .catch(e => console.error(e));

  closeGlobalSettings();
}

// Aggiorna il tab WiFi con SSID, password e IP corrente (se connesso come STA)
function refreshWifiTab() {
  fetch('/wifiCredential')
    .then(res => {
      if (!res.ok) throw new Error("Errore nella fetch");
      return res.json();
    })
    .then(data => {
      document.getElementById("wifi-ssid").value = data.ssid ?? '';
      document.getElementById("wifi-password").value = data.pw ?? '';
      const ipRow = document.getElementById("sta-ip-row");
      const ipVal = document.getElementById("sta-ip-value");
      if (data.staConnected && data.staIp && data.staIp !== "0.0.0.0") {
        ipVal.textContent = data.staIp;
        ipRow.style.display = "block";
      } else {
        ipRow.style.display = "none";
      }
    })
    .catch(err => console.error("refreshWifiTab:", err));
}

// Apri popup premendo sull'icona WiFi
document.getElementById("wifi-notify").addEventListener("click", () => {
  clearWifiError();
  refreshWifiTab();
  openGlobalSettings('wifi');
});

function closeWiFiPopup(){
  closeGlobalSettings();
}

function stopWifiReconnect() {
  fetch('/wifiStop').catch(e => console.error(e));
  document.getElementById("stopReconnectBtn").style.display = "none";
  closeGlobalSettings();
}

function disconnectWifi() {
  fetch('/wifiStop').catch(e => console.error(e));
  document.getElementById("sta-ip-row").style.display = "none";
  closeGlobalSettings();
}

// ── MQTT notifications ───────────────────────────────────────
function updateCloseAllBtn() {
  const cards = document.getElementById("mqtt-cards");
  const btn   = document.getElementById("mqtt-close-all");
  if (btn) btn.style.display = cards.children.length >= 2 ? "block" : "none";
}

document.getElementById("mqtt-close-all").addEventListener("click", () => {
  document.getElementById("mqtt-cards").innerHTML = "";
  updateCloseAllBtn();
});

function handleMqttIncoming(topic, d, pendingId) {
  const acquireRow        = mqttCfg.acquireRow;
  const acquireCompetitor = localStorage.getItem(MQTT_ACQUIRE_KEY) === "1";
  const mode              = mqttCfg.immediateMode ? "immediate" : (localStorage.getItem("mqttAcqMode") || "manual");
  const showInfo          = localStorage.getItem("mqttShowInfo")          !== "0";
  const timeout           = parseInt(localStorage.getItem("mqttTimeout")  || "5", 10);
  const onTimeout         = localStorage.getItem("mqttOnTimeout")         || "accept";

  const competitor = String(d?.c ?? "");

  function doAcquire() {
    if (acquireCompetitor) {
      maybeAutoAcquireCompetitor(Number(competitor));
    }
    if (pendingId !== undefined) {
      fetch("/mqttConfirmPending?id=" + pendingId).catch(e => console.error(e));
    }
    // pendingId assente = immediate mode, l'ESP32 ha già scritto in session.json
  }

  function doDiscard() {
    if (pendingId !== undefined) {
      fetch("/mqttDiscardPending?id=" + pendingId).catch(e => console.error(e));
    }
  }

  if (mode === "immediate") {
    doAcquire();
    if (mqttCfg.showPopup && showInfo)
      showMqttCard(topic, d, null, null, null, null, acquireRow, acquireCompetitor, true);
    return;
  }

  if (mqttCfg.showPopup) {
    showMqttCard(topic, d, doAcquire, doDiscard,
      mode === "timed" ? timeout   : null,
      mode === "timed" ? onTimeout : null,
      acquireRow, acquireCompetitor, false);
  } else {
    // Notifiche disabilitate: in manual/timed non c'è conferma utente,
    // quindi eseguiamo l'acquisizione direttamente come in immediate mode
    doAcquire();
  }
}

function showMqttCard(topic, d, doAcquire, onDiscard, timeoutSec, onTimeout, acquireRow, acquireCompetitor, immediateMode) {
  const parts      = (topic || "").split("/");
  const source     = parts.length >= 3 ? parts[1] + " / " + parts[2] : topic;
  const lineNum    = d?.ln;
  const competitor = String(d?.c ?? "");

  const hh = String(d?.h  ?? "--").padStart(2, "0");
  const mm = String(d?.m  ?? "--").padStart(2, "0");
  const ss = String(d?.s  ?? "--").padStart(2, "0");
  const ms = String(d?.ms ?? "--").padStart(3, "0");

  const parts2 = [];
  if (acquireRow)        parts2.push(`row L${lineNum ?? "?"}`);
  if (acquireCompetitor) parts2.push(`competitor <strong>${competitor || "—"}</strong>`);
  const verb = immediateMode ? "Acquired" : "Will acquire";
  const desc = parts2.length > 0 ? `${verb}: ${parts2.join(" + ")}` : "(info only)";

  const hasTimed       = timeoutSec !== null;
  const countdownSpan  = `<span class="mqtt-countdown">(${timeoutSec})</span>`;
  const timeoutOnClose = hasTimed && onTimeout !== "accept";
  const acceptLabel    = hasTimed && !timeoutOnClose ? `✓ Accept ${countdownSpan}` : "✓ Accept";
  const closeLabel     = timeoutOnClose ? `✕ Close ${countdownSpan}` : "✕ Close";
  const actionsHtml = doAcquire
    ? `<button class="mqtt-notif-btn mqtt-notif-accept">${acceptLabel}</button>
       <button class="mqtt-notif-btn mqtt-notif-close">${closeLabel}</button>`
    : `<button class="mqtt-notif-btn mqtt-notif-close">${closeLabel}</button>`;

  const card = document.createElement("div");
  card.className = "mqtt-notif";
  card.innerHTML = `
    <div class="mqtt-notif-header">
      <span class="mqtt-notif-source">📡 ${source}</span>
    </div>
    <div class="mqtt-notif-row">L${lineNum ?? "?"}&nbsp;·&nbsp;#${competitor || "—"}</div>
    <div class="mqtt-notif-time">${hh}:${mm}:${ss}.${ms}</div>
    <div class="mqtt-notif-accept-desc">${desc}</div>
    <div class="mqtt-notif-actions">${actionsHtml}</div>
  `;

  let autoTimer = null;

  function accept() {
    if (autoTimer) clearInterval(autoTimer);
    if (doAcquire) doAcquire();
    card.remove();
    updateCloseAllBtn();
  }

  function discard() {
    if (autoTimer) clearInterval(autoTimer);
    if (onDiscard) onDiscard();
    card.remove();
    updateCloseAllBtn();
  }

  const acceptBtn = card.querySelector(".mqtt-notif-accept");
  if (acceptBtn) acceptBtn.addEventListener("click", accept);
  card.querySelector(".mqtt-notif-close").addEventListener("click", discard);

  if (hasTimed) {
    let remaining = timeoutSec;
    autoTimer = setInterval(() => {
      remaining--;
      const span = card.querySelector(".mqtt-countdown");
      if (span) span.textContent = `(${remaining})`;
      if (remaining <= 0) {
        if (onTimeout === "accept") accept();
        else discard();
      }
    }, 1000);
  }

  document.getElementById("mqtt-cards").prepend(card);
  updateCloseAllBtn();
}

// ── MQTT popup ────────────────────────────────────────────────
let mqttStationName = "";
let mqttChipId      = "";
const mqttCfg       = { acquireRow: false, immediateMode: false, showPopup: true };

function updateMqttPreview() {
  const prefix  = document.getElementById("mqtt-prefix").value.trim() || "chronofit";
  const evt     = document.getElementById("mqtt-event").value.trim()  || "<event>";
  const station = mqttStationName || "<stationName>";
  const chip    = mqttChipId      || "<chipId>";
  document.getElementById("mqtt-pub-preview").innerText =
    "📤 " + prefix + "/" + evt + "/" + station + "/" + chip + "/checkpoint";
}

function updateMqttModeUI() {
  const mode = document.getElementById("mqttAcqModeSelect").value;
  document.getElementById("mqttShowInfoRow").style.display = mode === "immediate" ? "" : "none";
  document.getElementById("mqttTimedOpts").style.display   = mode === "timed"     ? "" : "none";
}

function refreshMqttTab() {
  fetch('/mqttSettings')
    .then(r => r.json())
    .then(data => {
      mqttStationName = data.stationName || "";
      mqttChipId      = data.chipId      || "";
      document.getElementById("mqtt-prefix").value         = data.prefix    || "chronofit";
      document.getElementById("mqtt-event").value          = data.eventName || "";
      document.getElementById("mqtt-sub").value            = data.subTopic  || "";
      document.getElementById("mqttShowPopupToggle").checked        = (data.showPopup    !== 0);
      document.getElementById("mqttAcquireRowToggle").checked       = (data.acquireRow   == 1);
      mqttCfg.acquireRow    = (data.acquireRow    == 1);
      mqttCfg.immediateMode = (data.immediateMode == 1);
      mqttCfg.showPopup     = (data.showPopup     !== 0);
      document.getElementById("mqttAcqModeSelect").value            = data.immediateMode == 1
          ? "immediate"
          : (localStorage.getItem("mqttAcqMode") || "manual");
      document.getElementById("mqttShowInfoToggle").checked         = localStorage.getItem("mqttShowInfo")   !== "0";
      document.getElementById("mqttTimeoutInput").value             = localStorage.getItem("mqttTimeout")    || "5";
      document.getElementById("mqttOnTimeoutSelect").value          = localStorage.getItem("mqttOnTimeout")  || "accept";
      document.getElementById("mqtt-status-field").innerText = "";
      // broker
      document.getElementById("mqtt-broker-host").value = data.brokerHost || "broker.hivemq.com";
      document.getElementById("mqtt-broker-port").value = data.brokerPort || 1883;
      const hasCreds = !!(data.brokerUser);
      document.getElementById("mqttUseCredentials").checked = hasCreds;
      document.getElementById("mqtt-broker-user").value = data.brokerUser || "";
      document.getElementById("mqtt-broker-pass").value = data.brokerPass || "";
      document.getElementById("broker-credentials").style.display = hasCreds ? "" : "none";
      document.getElementById("broker-status-field").innerText = "";
      updateMqttPreview();
      updateMqttModeUI();
    })
    .catch(e => console.error(e));
}

document.getElementById("mqtt-notify").addEventListener("click", () => {
  refreshMqttTab();
  openGlobalSettings('mqtt');
});

function saveMqttSettings() {
  const prefix    = encodeURIComponent(document.getElementById("mqtt-prefix").value.trim() || "chronofit");
  const evt       = encodeURIComponent(document.getElementById("mqtt-event").value.trim());
  const sub       = encodeURIComponent(document.getElementById("mqtt-sub").value.trim());
  const showPopup = document.getElementById("mqttShowPopupToggle").checked ? 1 : 0;

  localStorage.setItem("mqttAcqMode",           document.getElementById("mqttAcqModeSelect").value);
  localStorage.setItem("mqttShowInfo",          document.getElementById("mqttShowInfoToggle").checked          ? "1" : "0");
  localStorage.setItem("mqttTimeout",           document.getElementById("mqttTimeoutInput").value);
  localStorage.setItem("mqttOnTimeout",         document.getElementById("mqttOnTimeoutSelect").value);

  const acquireRow    = document.getElementById("mqttAcquireRowToggle").checked ? 1 : 0;
  const immediateMode = document.getElementById("mqttAcqModeSelect").value === "immediate" ? 1 : 0;
  // Aggiorna subito il flag client-side senza aspettare il prossimo refresh dal server
  mqttCfg.showPopup     = (showPopup === 1);
  mqttCfg.acquireRow    = (acquireRow === 1);
  mqttCfg.immediateMode = (immediateMode === 1);
  fetch(`/mqttSave?prefix=${prefix}&eventName=${evt}&subTopic=${sub}&showPopup=${showPopup}&acquireRow=${acquireRow}&immediateMode=${immediateMode}`)
    .then(r => r.text())
    .then(() => {
      const f = document.getElementById("mqtt-status-field");
      f.innerText = t('mqtt.saved');
      f.style.color = "green";
      setTimeout(() => { closeGlobalSettings(); }, 800);
    })
    .catch(() => {
      const f = document.getElementById("mqtt-status-field");
      f.innerText = t('mqtt.save_error');
      f.style.color = "#c0392b";
    });
}

function closeMqttPopup() {
  closeGlobalSettings();
}

function toggleBrokerPanel() {
  const panel = document.getElementById("broker-panel");
  const arrow = document.getElementById("broker-arrow");
  const open  = panel.style.display === "none";
  panel.style.display = open ? "" : "none";
  arrow.textContent   = open ? "▲" : "▼";
}

function updateBrokerCredentialsUI() {
  const show = document.getElementById("mqttUseCredentials").checked;
  document.getElementById("broker-credentials").style.display = show ? "" : "none";
}

function saveBrokerSettings() {
  const host = encodeURIComponent(document.getElementById("mqtt-broker-host").value.trim() || "broker.hivemq.com");
  const port = document.getElementById("mqtt-broker-port").value || 1883;
  const useCreds = document.getElementById("mqttUseCredentials").checked;
  const user = useCreds ? encodeURIComponent(document.getElementById("mqtt-broker-user").value.trim()) : "";
  const pass = useCreds ? encodeURIComponent(document.getElementById("mqtt-broker-pass").value) : "";
  const sf   = document.getElementById("broker-status-field");

  fetch(`/mqttBrokerSave?host=${host}&port=${port}&user=${user}&pass=${pass}`)
    .then(r => r.text())
    .then(() => {
      sf.style.color   = "green";
      sf.innerText     = t('mqtt.broker_saved');
      setTimeout(() => { sf.innerText = ""; }, 2500);
    })
    .catch(() => {
      sf.style.color = "#c62828";
      sf.innerText   = t('mqtt.save_error');
    });
}


function togglePassword() {
  const pwInput = document.getElementById("wifi-password");
  const toggle  = document.getElementById("show-password");

  pwInput.type = toggle.checked ? "text" : "password";
}

document.getElementById("gps-notify").addEventListener("click", () => {
  openGlobalSettings('sync');
});

document.getElementById("clinet-notify").addEventListener("click", () => {
  openGlobalSettings('sync');
});

function sendActualView(){
  openEmailPopup();
}


function openEmailPopup() {
  document.getElementById("emailOverlay").style.display = "flex";
}

function closeEmailPopup() {
  document.getElementById("emailOverlay").style.display = "none";
}

async function sendEmail(emailAddress) {

  const url = `/email?address=${encodeURIComponent(emailAddress)}`;

  console.log(url);
  // Richiesta GET
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Errore HTTP: ${response.status}`);
  }

  const text = await response.text();
  console.log("Richiesta di email inviata", text);

}

async function confirmEmail() {
  const email = document.getElementById("user-email").value.trim();
  const status = document.getElementById("email-status-field");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    status.textContent = t('email.invalid');
    status.style.color = "red";
    return;
  }

  status.textContent = t('email.confirmed');
  status.style.color = "green";
try {
    await sendEmail(email);   // 👈 aspetta
    status.textContent = t('email.sent');
    status.style.color = "green";
    setTimeout(closeEmailPopup, 1000);
  } catch (err) {
    status.textContent = t('email.error');
    status.style.color = "red";
  }
}

function downloadWifiFix() {
  const content = `@echo off

:: Controlla se è già amministratore
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :main
)

:: Non è amministratore — si rilancia con privilegi elevati
echo Richiedo privilegi amministratore...
powershell -Command "Start-Process '%~f0' -Verb RunAs"
exit

:main
REG ADD "HKLM\\SYSTEM\\CurrentControlSet\\Services\\NlaSvc\\Parameters\\Internet" /v EnableActiveProbing /t REG_DWORD /d 0 /f
echo Done! Restart required.
pause`;

  const blob = new Blob([content], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wifi_disconnect_fix.bat';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════
// ATHLETE REGISTRY
// ══════════════════════════════════════════════

let athleteRegistry = JSON.parse(localStorage.getItem("chronofit_athletes") || "[]");
let assignedCompetitorSet = new Set(JSON.parse(localStorage.getItem("chronofit_assigned") || "[]"));
let selectedAthlete  = null;
let athleteTargetLine = null;

// ── Auto-acquire toggles (tab "Auto" del registro competitori) ──
document.getElementById("autoAcquireMqttToggle").checked  = localStorage.getItem(MQTT_ACQUIRE_KEY)  === "1";
document.getElementById("autoAcquireTableToggle").checked = localStorage.getItem(TABLE_ACQUIRE_KEY) === "1";

document.getElementById("autoAcquireMqttToggle")
  .addEventListener("change", e => localStorage.setItem(MQTT_ACQUIRE_KEY, e.target.checked ? "1" : "0"));
document.getElementById("autoAcquireTableToggle")
  .addEventListener("change", e => {
    localStorage.setItem(TABLE_ACQUIRE_KEY, e.target.checked ? "1" : "0");
    updateAutoAcquireLinesUI();
  });

// ── Selezione linee che innescano l'acquisizione da tabella arrivi ──
const autoAcquireLineCbs = document.querySelectorAll(".auto-acquire-line-cb");
const savedAcquireLines  = getTableAcquireLines();
autoAcquireLineCbs.forEach(cb => {
  cb.checked = savedAcquireLines.includes(Number(cb.dataset.line));
  cb.addEventListener("change", () => {
    const selected = Array.from(autoAcquireLineCbs)
      .filter(c => c.checked)
      .map(c => Number(c.dataset.line));
    localStorage.setItem(TABLE_ACQUIRE_LINES_KEY, JSON.stringify(selected));
  });
});

function updateAutoAcquireLinesUI() {
  const enabled = document.getElementById("autoAcquireTableToggle").checked;
  const wrapper = document.getElementById("autoAcquireTableLines");
  wrapper.style.opacity = enabled ? "1" : "0.4";
  autoAcquireLineCbs.forEach(cb => cb.disabled = !enabled);
}
updateAutoAcquireLinesUI();
updateAutoAcquireSourceUI();

// ── Long press helper ──
function addLongPress(el, callback, ms = 600) {
  let timer = null;
  let moved = false;
  let startX = 0, startY = 0;

  el.style.userSelect = "none";
  el.style.webkitUserSelect = "none";
  el.style.webkitTouchCallout = "none";

  function startTimer(x, y) {
    moved = false;
    startX = x; startY = y;
    timer = setTimeout(() => { timer = null; if (!moved) callback(); }, ms);
  }
  function cancelTimer() { if (timer) { clearTimeout(timer); timer = null; } }
  function checkMove(x, y) {
    const dx = x - startX, dy = y - startY;
    if (dx * dx + dy * dy > 100) { moved = true; cancelTimer(); }
  }

  // Touch
  el.addEventListener("touchstart",  e => startTimer(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  el.addEventListener("touchmove",   e => checkMove(e.touches[0].clientX, e.touches[0].clientY),  { passive: true });
  el.addEventListener("touchend",    cancelTimer);
  el.addEventListener("touchcancel", cancelTimer);

  // Mouse
  el.addEventListener("mousedown",  e => { if (e.button === 0) startTimer(e.clientX, e.clientY); });
  el.addEventListener("mousemove",  e => checkMove(e.clientX, e.clientY));
  el.addEventListener("mouseup",    cancelTimer);
  el.addEventListener("mouseleave", cancelTimer);

  el.addEventListener("contextmenu", e => e.preventDefault());
}

// (registrazione long press spostata in DOMContentLoaded)

// ── Table actions popup ──
// Quale card ha aperto il popup azioni: decide su quale tabella agiscono
// "Download view" e "Send via email" (le altre azioni sono globali al device).
let tableActionsTarget = 'event-table';

function openTableActions() {
  tableActionsTarget = 'event-table';
  document.getElementById("tableActionsOverlay").style.display = "flex";
}
function openTableActions2() {
  tableActionsTarget = 'event-table-2';
  document.getElementById("tableActionsOverlay").style.display = "flex";
}
function closeTableActions() {
  document.getElementById("tableActionsOverlay").style.display = "none";
}
function downloadActualViewTarget() {
  if (tableActionsTarget === 'event-table-2') downloadActualView2();
  else downloadActualView();
}

// ── Modal open / close ──
function openAthleteModal(lineNumber) {
  athleteTargetLine = lineNumber;
  selectedAthlete   = null;
  document.getElementById("athleteAssignBtn").disabled = true;
  document.getElementById("athlete-search").value = "";
  document.getElementById("athlete-detail").innerHTML =
    '<p class="athlete-detail-empty">Select an athlete from the list</p>';
  document.getElementById("athlete-load-status").textContent = "";
  switchAthleteTab("select");
  renderAthleteList("");
  updateAutoAcquireSourceUI();
  document.getElementById("athleteOverlay").style.display = "flex";
}

function closeAthleteModal() {
  document.getElementById("athleteOverlay").style.display = "none";
  selectedAthlete   = null;
  athleteTargetLine = null;
}

// ── Tab switching ──
function switchAthleteTab(tab) {
  const overlay = document.getElementById("athleteOverlay");
  overlay.querySelectorAll(".tab-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.tab === tab));
  overlay.querySelectorAll(".tab-content").forEach(c =>
    c.style.display = "none");
  document.getElementById(`tab-${tab}`).style.display = "";
  if (tab === 'manual') {
    setTimeout(() => document.getElementById('manual-num')?.focus(), 80);
  }
}

// ── Print overlay ────────────────────────────────────────────────────────────
const PRINT_PREFS_KEY = 'printPrefs';
let _printAbort = false;
let _printRunning = false;

function openPrintOverlay() {
  _printLoadPrefs();
  updatePrintPreview();
  document.getElementById('printOverlay').style.display = 'flex';
}

function closePrintOverlay() {
  _printAbort = true;
  document.getElementById('printOverlay').style.display = 'none';
}

/* Numero di righe attualmente presenti in tabella (esclude le righe degli split) */
function _currentTableRowCount() {
  return document.querySelectorAll('#event-table tbody tr:not(.splits-row)').length;
}

function _printLoadPrefs() {
  const p = JSON.parse(localStorage.getItem(PRINT_PREFS_KEY) || '{}');
  const s = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  // From/To riflettono sempre lo stato attuale della tabella — non vengono
  // persistiti, altrimenti un range usato una volta (es. "fino a 10") resterebbe
  // come default anche quando la tabella ha un numero diverso di righe.
  s('print-from', 1);
  s('print-to',   _currentTableRowCount() || '');
  s('print-row-format', p.format    ?? '#{index} L{line} C{competitor} {name} {surname}  {time}');
  s('print-separator',  p.separator ?? '');
}

function _printSavePrefs() {
  const g = id => document.getElementById(id)?.value ?? '';
  localStorage.setItem(PRINT_PREFS_KEY, JSON.stringify({
    format:    g('print-row-format'),
    separator: g('print-separator'),
  }));
}

function togglePrintFields() {
  const grid  = document.getElementById('print-fields-grid');
  const arrow = document.getElementById('print-fields-arrow');
  if (!grid) return;
  const open = grid.style.display === 'none';
  grid.style.display  = open ? 'grid' : 'none';
  if (arrow) arrow.textContent = open ? '▾' : '▸';
}

/* Restituisce le righe della tabella filtrate per posizione visiva (1-based).
   Non usa data-row-id perché quell'ID dipende dal server e può iniziare da 0
   o da valori arbitrari; la posizione nella lista è più intuitiva per l'utente. */
function _getPrintRows() {
  const fromRaw = document.getElementById('print-from')?.value ?? '';
  const toRaw   = document.getElementById('print-to')?.value   ?? '';
  const from = fromRaw !== '' ? (parseInt(fromRaw) || 1) : 1;
  const to   = toRaw   !== '' ? parseInt(toRaw)         : Infinity;
  return Array.from(document.querySelectorAll('#event-table tbody tr'))
    .filter(r => !r.classList.contains('splits-row'))
    .filter((_, i) => {
      const pos = i + 1;   // posizione 1-based nella vista corrente
      return pos >= from && pos <= to;
    });
}

/* Sostituisce {token} nella stringa di riga con i dati della row */
function _applyRowFormat(fmt, row) {
  const q  = sel => row.querySelector(sel)?.textContent?.trim() ?? '';
  return fmt
    .replace(/\{index\}/g,      row.dataset.rowId      ?? '')
    .replace(/\{line\}/g,       row.dataset.line       ?? '')
    .replace(/\{competitor\}/g, row.dataset.competitor ?? '')
    .replace(/\{name\}/g,       q('.col-name'))
    .replace(/\{surname\}/g,    q('.col-surname'))
    .replace(/\{time\}/g,       q('.timestamp'))
    .replace(/\{race\}/g,       q('.race-time'))
    .replace(/\{delta\}/g,      q('.delta-time'))
    .replace(/\{elapsed\}/g,    q('.elapsed-time'))
    .replace(/\{penality\}/g,   q('.penality-btn'))
    .replace(/\{test\}/g,        q('.col-test'))
    .replace(/\{trigger\}/g,     q('.col-trigger'));
}

/* Costruisce la sequenza di stringhe da stampare */
function _buildPrintLines(rows) {
  const fmt = document.getElementById('print-row-format')?.value ?? '';
  const sep = document.getElementById('print-separator')?.value ?? '';
  const lines = [];
  rows.forEach((r, i) => {
    lines.push(_applyRowFormat(fmt, r));
    if (sep && i < rows.length - 1) lines.push(sep);
  });
  return lines;
}

/* Aggiorna il pannello di anteprima e salva le preferenze */
function updatePrintPreview() {
  _printSavePrefs();
  const rows      = _getPrintRows();
  const previewEl = document.getElementById('print-preview');
  const countEl   = document.getElementById('print-row-count');

  if (rows.length === 0) {
    if (previewEl) previewEl.textContent = '(no rows in range)';
    if (countEl)   countEl.textContent   = 'No rows in range';
    return;
  }

  const lines = _buildPrintLines(rows.slice(0, 3));
  const more  = rows.length > 3 ? `\n… (+${rows.length - 3} more)` : '';
  if (previewEl) previewEl.textContent = lines.join('\n') + more;
  if (countEl)   countEl.textContent   = `${rows.length} row${rows.length !== 1 ? 's' : ''} selected`;
}

/* Inserisce un tag {field} alla posizione del cursore senza togliere il focus all'input
   (funziona perché i bottoni usano onmousedown="event.preventDefault()") */
function insertPrintTag(inputId, tag) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  el.value = el.value.slice(0, start) + tag + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + tag.length;
  updatePrintPreview();
}

/* Invia una riga alla stampante — restituisce Promise */
function _sendToPrinterAsync(text, cr) {
  return fetch(`/print?text=${encodeURIComponent(text)}&cr=${cr}`)
    .then(r => { if (!r.ok) console.error('Print error', r.status); })
    .catch(e  => console.error('Print network error:', e));
}

/* Avvia il job di stampa (500 ms tra una riga e la successiva) */
async function startPrintJob() {
  if (_printRunning) return;
  _printSavePrefs();
  _printAbort   = false;
  _printRunning = true;

  const rows  = _getPrintRows();
  const lines = _buildPrintLines(rows);

  const btn      = document.getElementById('print-start-btn');
  const progress = document.getElementById('print-progress');
  const bar      = document.getElementById('print-progress-bar');
  const txt      = document.getElementById('print-progress-text');

  if (btn)      { btn.disabled = true; btn.textContent = '⏳ …'; }
  if (progress) { progress.style.display = 'block'; }
  if (bar)      { bar.style.width = '0%'; }
  if (txt)      { txt.textContent = `0 / ${lines.length}`; }

  for (let i = 0; i < lines.length; i++) {
    if (_printAbort) break;
    if (bar) bar.style.width = `${Math.round((i / lines.length) * 100)}%`;
    if (txt) txt.textContent = `${i + 1} / ${lines.length}`;
    await _sendToPrinterAsync(lines[i], 1);
    if (i < lines.length - 1) await sleep(500);
  }

  if (bar) bar.style.width = '100%';
  if (txt) txt.textContent = _printAbort ? '⛔ Aborted' : '✅ Done!';
  if (btn) { btn.disabled = false; btn.textContent = '🖨 Print'; }
  _printRunning = false;
  setTimeout(() => { if (progress) progress.style.display = 'none'; }, 2500);
}

function openGlobalSettings(tab) {
  switchGlobalSettingsTab(tab);
  document.getElementById('globalSettingsOverlay').style.display = 'flex';
}

function closeGlobalSettings() {
  document.getElementById('globalSettingsOverlay').style.display = 'none';
}

function switchGlobalSettingsTab(tab) {
  const overlay = document.getElementById('globalSettingsOverlay');
  overlay.querySelectorAll('.tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === tab));
  overlay.querySelectorAll('.gs-tab').forEach(c => c.style.display = 'none');
  const el = document.getElementById(`gs-tab-${tab}`);
  if (el) el.style.display = '';
  // Ogni volta che il tab WiFi o MQTT diventa visibile, aggiorna i dati dal server
  if (tab === 'wifi') refreshWifiTab();
  if (tab === 'mqtt') refreshMqttTab();
}

function switchSettingsTab(tab) {
  const overlay = document.getElementById("tableSettingsOverlay");
  overlay.querySelectorAll(".tab-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.tab === tab));
  overlay.querySelectorAll(".tab-content").forEach(c =>
    c.style.display = "none");
  document.getElementById(`stab-${tab}`).style.display = "";
}

function switchSettingsTab2(tab) {
  const overlay = document.getElementById("tableSettingsOverlay2");
  overlay.querySelectorAll(".tab-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.tab === tab));
  overlay.querySelectorAll(".tab-content").forEach(c =>
    c.style.display = "none");
  document.getElementById(`stab-${tab}-2`).style.display = "";
}

// ── Athlete list rendering ──
function getAssignedCompetitors() {
  return assignedCompetitorSet;
}

function renderAthleteList(filter) {
  const list = document.getElementById("athlete-list");
  const q = filter.trim().toLowerCase();
  const assigned = getAssignedCompetitors();

  const filtered = athleteRegistry.filter(a =>
    String(a.competitor).includes(q) ||
    (a.name    || "").toLowerCase().includes(q) ||
    (a.surname || "").toLowerCase().includes(q)
  );

  if (filtered.length === 0) {
    list.innerHTML = `<p class="athlete-empty">${
      athleteRegistry.length === 0 ? t('athlete.none_loaded') : t('athlete.no_results')
    }</p>`;
    return;
  }

  list.innerHTML = filtered.map(a => {
    const isAssigned = assigned.has(Number(a.competitor));
    return `
    <div class="athlete-item${isAssigned ? " athlete-assigned" : ""}" data-competitor="${a.competitor}">
      <span class="athlete-bib">${a.competitor}</span>
      <span class="athlete-name">${a.name ?? ""} ${a.surname ?? ""}</span>
    </div>`;
  }).join("");

  list.querySelectorAll(".athlete-item").forEach(item =>
    item.addEventListener("click", () => selectAthlete(Number(item.dataset.competitor)))
  );
}

// ── Select athlete from list ──
function selectAthlete(competitor) {
  selectedAthlete = athleteRegistry.find(a => a.competitor === competitor) ?? null;
  if (!selectedAthlete) return;

  document.querySelectorAll(".athlete-item").forEach(el =>
    el.classList.toggle("selected", Number(el.dataset.competitor) === competitor));

  const detail = document.getElementById("athlete-detail");
  const rows = Object.entries(selectedAthlete).map(([k, v]) => `
    <div class="athlete-field">
      <span class="athlete-field-key">${k}</span>
      <span class="athlete-field-val">${v}</span>
    </div>`).join("");
  detail.innerHTML = `<div class="athlete-fields">${rows}</div>`;

  document.getElementById("athleteAssignBtn").disabled = false;
}

// ── Assign selected athlete to textbox ──
function assignAthlete() {
  if (!selectedAthlete || !athleteTargetLine) return;
  const n = athleteTargetLine;
  const val = selectedAthlete.competitor;

  // Aggiorna il campo visibile nell'overlay line-edit (se aperto)
  const leInput = document.getElementById(`le-c-${n}`);
  if (leInput) leInput.value = val;

  // Aggiorna il backing store nascosto e invia al server
  const cEl = document.getElementById(`c${n}`);
  if (cEl) {
    cEl.value = val;
    cEl.dispatchEvent(new Event("change")); // triggers handleInputUpdate → server save
  }

  assignedCompetitorSet.add(Number(val));
  localStorage.setItem("chronofit_assigned", JSON.stringify([...assignedCompetitorSet]));
  closeAthleteModal();
}

// ── Load registry from textarea ──
function resetAssignedAthletes() {
  assignedCompetitorSet.clear();
  localStorage.removeItem("chronofit_assigned");
  renderAthleteList(document.getElementById("athlete-search").value);
}

function clearAthleteRegistry() {
  athleteRegistry = [];
  assignedCompetitorSet.clear();
  localStorage.removeItem("chronofit_athletes");
  localStorage.removeItem("chronofit_assigned");
  document.getElementById("athlete-json-input").value = "";
  const status = document.getElementById("athlete-load-status");
  status.style.color = "#888";
  status.textContent = t('athlete.cleared');
  renderAthleteList(document.getElementById("athlete-search").value);
}

// ── Manual single-athlete add ──
function addAthleteManual() {
  const numEl     = document.getElementById("manual-num");
  const nameEl    = document.getElementById("manual-name");
  const surnameEl = document.getElementById("manual-surname");
  const teamEl    = document.getElementById("manual-team");
  const status    = document.getElementById("athlete-manual-status");

  const num = parseInt(numEl.value);
  if (!num || num < 1) {
    status.style.color = "red";
    status.textContent = "❌ " + t('athlete.manual_err_num');
    numEl.focus();
    return;
  }

  const entry = {
    competitor: num,
    name:    nameEl.value.trim()    || "-",
    surname: surnameEl.value.trim() || "-",
    team:    teamEl.value.trim()    || "-"
  };

  const existingIdx = athleteRegistry.findIndex(a => Number(a.competitor) === num);
  if (existingIdx >= 0) {
    athleteRegistry[existingIdx] = entry;   // aggiorna se già presente
  } else {
    athleteRegistry.push(entry);             // aggiunge al fondo
  }

  localStorage.setItem(ATHLETES_KEY, JSON.stringify(athleteRegistry));
  renderCompQuickList(num);

  status.style.color = "green";
  status.textContent = t('athlete.manual_added', num);

  // Reset form per prossima inserzione
  numEl.value     = "";
  nameEl.value    = "-";
  surnameEl.value = "-";
  teamEl.value    = "-";

  numEl.focus();
  renderAthleteList(document.getElementById("athlete-search")?.value ?? "");
}

function loadAthleteRegistry() {
  const raw = document.getElementById("athlete-json-input").value.trim();
  const status = document.getElementById("athlete-load-status");
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error("Root must be a JSON array");
    if (data.length > 0 && data[0].competitor === undefined)
      throw new Error('Each entry must have a "competitor" field');
    athleteRegistry = data;
    localStorage.setItem("chronofit_athletes", JSON.stringify(athleteRegistry));
    renderCompQuickList();
    status.style.color = "green";
    status.textContent = t('athlete.loaded', athleteRegistry.length);
    renderAthleteList(document.getElementById("athlete-search").value);
  } catch (e) {
    status.style.color = "red";
    status.textContent = `❌ ${e.message}`;
  }
}

// ── CSV parser ──
function parseCsvRegistry(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

  const headers = lines[0].split(";").map(h => h.trim());
  if (!headers.includes("competitor")) throw new Error('CSV must have a "competitor" column');

  return lines.slice(1).map(line => {
    const values = line.split(";").map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => {
      const v = values[i] ?? "";
      obj[h] = h === "competitor" ? Number(v) : v;
    });
    return obj;
  });
}

// ── File picker ──
document.getElementById("athlete-file-input").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const status = document.getElementById("athlete-load-status");
  const reader = new FileReader();
  reader.onload = ev => {
    const text = ev.target.result;
    e.target.value = "";
    if (file.name.toLowerCase().endsWith(".csv")) {
      try {
        const data = parseCsvRegistry(text);
        athleteRegistry = data;
        localStorage.setItem("chronofit_athletes", JSON.stringify(athleteRegistry));
        renderCompQuickList();
        status.style.color = "green";
        status.textContent = t('athlete.loaded_csv', athleteRegistry.length);
        renderAthleteList(document.getElementById("athlete-search").value);
      } catch (err) {
        status.style.color = "red";
        status.textContent = `❌ ${err.message}`;
      }
    } else {
      document.getElementById("athlete-json-input").value = text;
    }
  };
  reader.readAsText(file);
});