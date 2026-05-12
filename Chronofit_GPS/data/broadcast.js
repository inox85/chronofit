// ── Message type constants ────────────────────────────────────
const TYPE_CHECKPOINT      = 0;
const TYPE_TIME_UPDATE     = 1;
const TYPE_SESSION_CLEARED = 2;
const TYPE_PARAMS_UPDATED  = 3;
const TYPE_ROW_UPDATED     = 4;
const TYPE_GENERIC_MESSAGE = 5;
const TYPE_EMAIL_SENT      = 6;
const TYPE_LINE_UPDATED    = 11;

// ── Line colors ───────────────────────────────────────────────
const lineColors = {
  1: "#ffcccc", 2: "#ccffcc", 3: "#ccccff", 4: "#fff5cc", 5: "#808080"
};

// ── Theme ─────────────────────────────────────────────────────
let currentTheme = "dark";

function applyTheme(theme) {
  currentTheme = theme;
  document.body.classList.toggle("theme-dark",  theme === "dark");
  document.body.classList.toggle("theme-light", theme === "light");
  const chk = document.getElementById("themeCheck");
  if (chk) chk.checked = (theme === "light");
}

function onThemeCheckChange(chk) {
  applyTheme(chk.checked ? "light" : "dark");
}

// ── View mode ─────────────────────────────────────────────────
// anagrafica | griglia | entrambi | nascosto
let currentViewMode = "anagrafica";

function applyViewMode(mode) {
  currentViewMode = mode;
  document.body.classList.remove(
    "view-anagrafica", "view-griglia", "view-entrambi", "view-nascosto"
  );
  document.body.classList.add("view-" + mode);

  const sel = document.getElementById("viewModeSelect");
  if (sel) sel.value = mode;

  // Tabella arrivi: visibile in griglia / entrambi
  const ap = document.getElementById("arrivalsPanel");
  if (mode === "griglia" || mode === "entrambi") {
    ap.classList.add("arr-visible");
  } else {
    ap.classList.remove("arr-visible");
  }

  // Lower-third: se la modalità la esclude, nascondila (lt-visible resta per ripristino)
  if (mode === "griglia" || mode === "nascosto") {
    document.getElementById("lowerThird").classList.remove("lt-visible");
  }
}

// ── Time precision ────────────────────────────────────────────
let timePrecision = 3;

function truncateMs(ms) {
  if (timePrecision === 1) return Math.floor(ms / 100) * 100;
  if (timePrecision === 2) return Math.floor(ms / 10)  * 10;
  return ms;
}

function rowToMs(row) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return ((h * 3600 + m * 60 + s) * 1000) + truncateMs(ms);
}

function formatTime(h, m, s, ms) {
  const msT = truncateMs(ms);
  const msStr = timePrecision === 1
    ? String(Math.floor(msT / 100))
    : timePrecision === 2
      ? String(Math.floor(msT / 10)).padStart(2, "0")
      : String(msT).padStart(3, "0");
  return (
    String(h).padStart(2, "0") + ":" +
    String(m).padStart(2, "0") + ":" +
    String(s).padStart(2, "0") + "." + msStr
  );
}

function formatDelta(ms, signed) {
  if (ms > 0) return "—";
  const sign = signed ? "+" : "";
  ms = truncateMs(Math.abs(ms));
  const hours   = Math.floor(ms / 3600000); ms %= 3600000;
  const minutes = Math.floor(ms / 60000);   ms %= 60000;
  const seconds = Math.floor(ms / 1000);
  const millis  = ms % 1000;
  const msStr = timePrecision === 1
    ? String(Math.floor(millis / 100))
    : timePrecision === 2
      ? String(Math.floor(millis / 10)).padStart(2, "0")
      : String(millis).padStart(3, "0");
  return sign +
    String(hours).padStart(2, "0") + ":" +
    String(minutes).padStart(2, "0") + ":" +
    String(seconds).padStart(2, "0") + "." + msStr;
}

// ── Arrival table ─────────────────────────────────────────────
function clearEventTableRows() {
  document.querySelector("#event-table tbody").innerHTML = "";
}

function addEventToTable(rowIndex, lineNumber, competitor, h, m, s, ms) {
  const tbody = document.querySelector("#event-table tbody");
  const row   = document.createElement("tr");
  row.classList.add("row-new");

  const ri   = rowIndex   ?? "?";
  const ln   = lineNumber ?? 0;
  const comp = (competitor !== null && competitor !== undefined) ? competitor : "—";
  const fh   = h  ?? 0;
  const fm   = m  ?? 0;
  const fs   = s  ?? 0;
  const fms  = ms ?? 0;

  row.setAttribute("data-line",       ln);
  row.setAttribute("data-competitor", comp);
  row.setAttribute("data-hour",       fh);
  row.setAttribute("data-minute",     fm);
  row.setAttribute("data-seconds",    fs);
  row.setAttribute("data-ms-raw",     fms);

  const lineColor = lineColors[ln] || "#555";

  row.innerHTML =
    `<td class="col-index">${ri}</td>` +
    `<td class="col-line" style="background:${lineColor};color:#000">${ln}</td>` +
    `<td class="col-comp">${comp}</td>` +
    `<td class="timestamp">${formatTime(fh, fm, fs, fms)}</td>` +
    `<td class="delta-time"></td>` +
    `<td class="elapsed-time"></td>`;

  tbody.insertBefore(row, tbody.firstChild);
  setTimeout(() => row.classList.remove("row-new"), 600);

  recalcDeltaTimes();
  recalcElapsedTimes();
  updateVisibleColumns();
}

async function populateTableFromSaved() {
  try {
    const response = await fetch("/getCheckpoints");
    if (!response.ok) return;
    const text = await response.text();
    text.trim().split("\n").forEach(line => {
      if (!line.trim()) return;
      try {
        const cp = JSON.parse(line);
        if (!cp || typeof cp !== "object" || cp.id === undefined || cp.ln === undefined) return;
        addEventToTable(
          cp.id, cp.ln, cp.c ?? 0,
          cp.h ?? 0, cp.m ?? 0, cp.s ?? 0, cp.ms ?? 0
        );
      } catch (err) { console.warn("Errore parsing checkpoint:", err); }
    });
  } catch (err) { console.error("Errore caricamento checkpoint:", err); }
}

function recalcDeltaTimes() {
  const rows = Array.from(document.querySelectorAll("#event-table tbody tr"))
    .filter(r => r.style.display !== "none");
  let nextTime = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const tsCell    = rows[i].querySelector(".timestamp");
    const deltaCell = rows[i].querySelector(".delta-time");
    if (!tsCell || !deltaCell) continue;
    const currentMs = rowToMs(rows[i]);
    if (nextTime === null) {
      deltaCell.textContent = "—";
      nextTime = currentMs;
      continue;
    }
    const delta = nextTime - currentMs;
    deltaCell.textContent = delta > 0 ? "—" : formatDelta(delta, true);
    nextTime = currentMs;
  }
}

function recalcElapsedTimes() {
  const rows = Array.from(document.querySelectorAll("#event-table tbody tr"))
    .filter(r => r.style.display !== "none");
  const firstRow    = rows[rows.length - 1];
  const firstTimeMs = firstRow ? rowToMs(firstRow) : null;
  rows.forEach(r => {
    const cell = r.querySelector(".elapsed-time");
    if (!cell) return;
    cell.textContent = firstTimeMs !== null
      ? formatDelta(firstTimeMs - rowToMs(r), false)
      : "—";
  });
}

// ── Column visibility ─────────────────────────────────────────
function updateVisibleColumns() {
  const showTs = document.getElementById("toggle-timestamp")?.checked ?? true;
  const showDt = document.getElementById("toggle-delta")?.checked     ?? true;
  const showEl = document.getElementById("toggle-elapsed")?.checked   ?? false;

  const setCol = (thClass, tdClass, show) => {
    const d = show ? "" : "none";
    document.querySelectorAll("th." + thClass).forEach(el => el.style.display = d);
    document.querySelectorAll("td." + tdClass).forEach(el => el.style.display = d);
  };
  setCol("timestamp-col", "timestamp",    showTs);
  setCol("delta-col",     "delta-time",   showDt);
  setCol("elapsed-col",   "elapsed-time", showEl);
}

// ── Table column overlay ──────────────────────────────────────
function openTableColOverlay() {
  document.getElementById("tco-timestamp").checked = document.getElementById("toggle-timestamp")?.checked ?? true;
  document.getElementById("tco-delta").checked     = document.getElementById("toggle-delta")?.checked     ?? true;
  document.getElementById("tco-elapsed").checked   = document.getElementById("toggle-elapsed")?.checked   ?? false;
  document.getElementById("tco-precision").value   = timePrecision;
  document.getElementById("tableColOverlay").style.display = "flex";
}

function closeTableColOverlay() {
  document.getElementById("tableColOverlay").style.display = "none";
}

function onTcoChange() {
  document.getElementById("toggle-timestamp").checked = document.getElementById("tco-timestamp").checked;
  document.getElementById("toggle-delta").checked     = document.getElementById("tco-delta").checked;
  document.getElementById("toggle-elapsed").checked   = document.getElementById("tco-elapsed").checked;

  const prec = Math.max(1, Math.min(3, parseInt(document.getElementById("tco-precision").value) || 3));
  timePrecision = prec;
  document.getElementById("time-precision").value = prec;

  document.querySelectorAll("#event-table tbody tr").forEach(row => {
    const tsCell = row.querySelector(".timestamp");
    if (!tsCell) return;
    tsCell.textContent = formatTime(
      parseInt(row.dataset.hour    ?? 0),
      parseInt(row.dataset.minute  ?? 0),
      parseInt(row.dataset.seconds ?? 0),
      parseInt(row.dataset.msRaw   ?? 0)
    );
  });
  recalcDeltaTimes();
  recalcElapsedTimes();
  updateVisibleColumns();
  saveBroadcastPrefs();
}

// ── Prefs ─────────────────────────────────────────────────────
const BROADCAST_PREFS_KEY = "chronofit_broadcast_prefs";
let activeStreamUrl  = "";
let activeStreamType = "auto";

function saveBroadcastPrefs() {
  const prefs = {
    streamUrl:     document.getElementById("streamUrl").value,
    streamType:    document.getElementById("streamType").value,
    monitorLine:   document.getElementById("lineSelect").value,
    theme:         currentTheme,
    viewMode:      currentViewMode,
    timePrecision: timePrecision,
    colTimestamp:  document.getElementById("toggle-timestamp")?.checked  ?? true,
    colDelta:      document.getElementById("toggle-delta")?.checked      ?? true,
    colElapsed:    document.getElementById("toggle-elapsed")?.checked    ?? false,
  };
  localStorage.setItem(BROADCAST_PREFS_KEY, JSON.stringify(prefs));
}

function restoreBroadcastPrefs() {
  const raw = localStorage.getItem(BROADCAST_PREFS_KEY);
  if (!raw) return;
  try {
    const prefs = JSON.parse(raw);

    if (prefs.theme)    applyTheme(prefs.theme);
    if (prefs.viewMode) applyViewMode(prefs.viewMode);

    if (prefs.streamUrl)  document.getElementById("streamUrl").value  = prefs.streamUrl;
    if (prefs.streamType) document.getElementById("streamType").value = prefs.streamType;

    if (prefs.monitorLine) {
      document.getElementById("lineSelect").value = prefs.monitorLine;
      updateLtLineColor(parseInt(prefs.monitorLine));
    }

    if (prefs.timePrecision !== undefined) {
      timePrecision = Math.max(1, Math.min(3, parseInt(prefs.timePrecision) || 3));
      const sel = document.getElementById("time-precision");
      if (sel) sel.value = timePrecision;
    }

    const setChk = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.checked = val;
    };
    setChk("toggle-timestamp", prefs.colTimestamp);
    setChk("toggle-delta",     prefs.colDelta);
    setChk("toggle-elapsed",   prefs.colElapsed);
    updateVisibleColumns();

    if (prefs.streamUrl) {
      activeStreamUrl  = prefs.streamUrl;
      activeStreamType = prefs.streamType || "auto";
      showPlayHint(prefs.streamUrl);
    }
  } catch (e) { console.warn("Errore ripristino prefs:", e); }
}

// ── Athlete registry ──────────────────────────────────────────
const ATHLETES_KEY = "chronofit_athletes";

function loadAthleteRegistry() {
  const raw = localStorage.getItem(ATHLETES_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (e) { return []; }
}

function saveAthleteRegistry(data) {
  localStorage.setItem(ATHLETES_KEY, JSON.stringify(data));
  updateRegistryStatus();
}

function findAthlete(competitorNum) {
  return loadAthleteRegistry().find(a => String(a.competitor) === String(competitorNum)) ?? null;
}

function updateRegistryStatus() {
  const registry = loadAthleteRegistry();
  const el = document.getElementById("registryStatus");
  if (!el) return;
  if (registry.length === 0) {
    el.textContent = "Registro non caricato";
    el.style.color = "";
  } else {
    el.textContent = `✅ ${registry.length} atleti`;
    el.style.color = "#3a8";
  }
}

function parseCsvRegistry(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("CSV vuoto o senza dati");
  const headers = lines[0].split(";").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1)
    .filter(l => l.trim().length > 0)
    .map(line => {
      const values = line.split(";").map(v => v.trim().replace(/^"|"$/g, ""));
      const obj = {};
      headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
      return obj;
    });
}

// ── Video player ──────────────────────────────────────────────
let hlsInstance = null;

function detectStreamType(url) {
  const lower = url.toLowerCase();
  if (lower.endsWith(".m3u8"))                                        return "hls";
  if (lower.includes("mjpeg") || lower.includes(".mjpg") ||
      lower.endsWith("/stream") || lower.includes("?action=stream")) return "mjpeg";
  return "direct";
}

function showPlayHint(url) {
  const ph = document.getElementById("videoPlaceholder");
  ph.style.display = "flex";
  const short = url.length > 42 ? url.slice(0, 39) + "…" : url;
  ph.querySelector(".placeholder-icon").textContent = "▶️";
  ph.querySelector(".placeholder-text").textContent = "Tocca per avviare lo stream";
  ph.querySelector(".placeholder-sub").textContent  = short;
}

function loadStream(url, type) {
  if (!url || !url.trim()) return;
  url = url.trim();

  const video       = document.getElementById("streamVideo");
  const img         = document.getElementById("streamImg");
  const placeholder = document.getElementById("videoPlaceholder");
  const resolved    = (type === "auto") ? detectStreamType(url) : type;

  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
  video.pause();
  video.removeAttribute("src");
  video.load();
  img.src = "";

  placeholder.style.display = "none";
  video.style.display = "none";
  img.style.display   = "none";

  if (resolved === "mjpeg") {
    img.style.display = "block";
    img.src = url;
    img.onerror = () => showStreamError("Impossibile caricare il flusso MJPEG");
  } else if (resolved === "hls") {
    video.style.display = "block";
    if (typeof Hls !== "undefined" && Hls.isSupported()) {
      hlsInstance = new Hls({ enableWorker: false });
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () =>
        video.play().catch(e => console.warn("Autoplay bloccato:", e)));
      hlsInstance.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) showStreamError("Errore HLS: " + d.type);
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url; video.load();
      video.play().catch(e => console.warn("Autoplay bloccato:", e));
    } else {
      showStreamError("HLS non supportato");
    }
  } else {
    video.style.display = "block";
    video.src = url; video.load();
    video.play().catch(e => console.warn("Autoplay bloccato:", e));
    video.onerror = () => showStreamError("Impossibile caricare il video");
  }
}

function showStreamError(msg) {
  const ph = document.getElementById("videoPlaceholder");
  ph.style.display = "flex";
  ph.querySelector(".placeholder-text").textContent = msg;
  ph.querySelector(".placeholder-sub").textContent  = "Apri ⚙️ per riconfigurare";
  document.getElementById("streamVideo").style.display = "none";
  document.getElementById("streamImg").style.display   = "none";
}

// ── Settings overlay ──────────────────────────────────────────
function openSettings() {
  document.getElementById("themeCheck").checked     = (currentTheme === "light");
  document.getElementById("viewModeSelect").value   = currentViewMode;
  document.getElementById("time-precision").value   = timePrecision;
  document.getElementById("athleteJson").value      = "";
  document.getElementById("athleteFile").value      = "";
  document.getElementById("settingsOverlay").style.display = "flex";
}

function closeSettings() {
  document.getElementById("settingsOverlay").style.display = "none";
}

function applySettings() {
  const newUrl  = document.getElementById("streamUrl").value.trim();
  const newType = document.getElementById("streamType").value;
  if (newUrl) {
    activeStreamUrl  = newUrl;
    activeStreamType = newType;
    loadStream(newUrl, newType);
  }

  const newLine = parseInt(document.getElementById("lineSelect").value);
  updateLtLineColor(newLine);
  resetToWaiting();

  applyViewMode(document.getElementById("viewModeSelect").value);

  const prec = Math.max(1, Math.min(3, parseInt(document.getElementById("time-precision").value) || 3));
  timePrecision = prec;
  document.querySelectorAll("#event-table tbody tr").forEach(row => {
    const tsCell = row.querySelector(".timestamp");
    if (!tsCell) return;
    tsCell.textContent = formatTime(
      parseInt(row.dataset.hour ?? 0), parseInt(row.dataset.minute ?? 0),
      parseInt(row.dataset.seconds ?? 0), parseInt(row.dataset.msRaw ?? 0)
    );
  });
  recalcDeltaTimes();
  recalcElapsedTimes();
  updateVisibleColumns();

  const raw = document.getElementById("athleteJson").value.trim();
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) throw new Error("Il JSON deve essere un array");
      saveAthleteRegistry(data);
      showGeneralPopup(`✅ ${data.length} atleti caricati`, "#2a8c4a", 2500);
    } catch (err) {
      alert("Errore nel JSON: " + err.message);
      return;
    }
  }

  saveBroadcastPrefs();
  closeSettings();
}

document.getElementById("athleteFile").addEventListener("change", function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    try {
      const data = file.name.toLowerCase().endsWith(".csv")
        ? parseCsvRegistry(text)
        : JSON.parse(text);
      document.getElementById("athleteJson").value = JSON.stringify(data, null, 2);
    } catch (err) { alert("Errore nel file: " + err.message); }
    this.value = "";
  };
  reader.readAsText(file);
});

document.getElementById("videoSection").addEventListener("click", () => {
  const videoOn = document.getElementById("streamVideo").style.display === "block" ||
                  document.getElementById("streamImg").style.display   === "block";
  if (!videoOn && activeStreamUrl) loadStream(activeStreamUrl, activeStreamType);
});

document.getElementById("openSettings").addEventListener("click", openSettings);
document.getElementById("cancelSettings").addEventListener("click", closeSettings);
document.getElementById("confirmSettings").addEventListener("click", applySettings);

document.getElementById("clearAthleteRegistry").addEventListener("click", () => {
  if (!confirm("Svuotare il registro atleti?")) return;
  saveAthleteRegistry([]);
  document.getElementById("athleteJson").value = "";
  showGeneralPopup("Registro atleti svuotato", "#c0392b", 2000);
});

// ── Competitor display ─ lower-third ─────────────────────────
let clearArrivedTimer = null;

function updateLtLineColor(lineNum) {
  const color = lineColors[lineNum] || "#ccc";
  const header = document.getElementById("ltHeader");
  header.style.background = color;
  document.getElementById("ltLineLabel").textContent = "LINE " + lineNum;
}

function resetToWaiting() {
  const lt = document.getElementById("lowerThird");
  lt.classList.remove("lt-visible", "lt-flash");
  const statusEl = document.getElementById("ltStatus");
  statusEl.textContent = "IN ATTESA";
  statusEl.classList.remove("status-prossimo");
  if (clearArrivedTimer) { clearTimeout(clearArrivedTimer); clearArrivedTimer = null; }
}

// status: "PROSSIMO" | "TRANSITO"
function displayAthlete(competitorNum, lineNum, data, status) {
  const lt      = document.getElementById("lowerThird");
  const athlete = findAthlete(competitorNum);

  // Colore linea nell'header
  updateLtLineColor(lineNum);

  // Status label
  const statusEl = document.getElementById("ltStatus");
  statusEl.textContent = status;
  statusEl.classList.toggle("status-prossimo", status === "PROSSIMO");

  // Numero competitor
  document.getElementById("ltNumber").textContent =
    (competitorNum !== null && competitorNum !== undefined && String(competitorNum) !== "0")
      ? String(competitorNum) : "—";

  // Dati anagrafica
  if (athlete) {
    const lname = athlete.surname     || athlete.lastname  || athlete.cognome || "";
    const fname = athlete.name        || athlete.firstname || athlete.nome    || "";
    const team  = athlete.team        || athlete.squadra   || athlete.club   || "";
    const cat   = athlete.category    || athlete.categoria || athlete.cat    || "";
    const extra = athlete.nationality || athlete.nazione   || athlete.nation || athlete.country || "";
    document.getElementById("ltSurname").textContent   = lname ? lname.toUpperCase() : (fname ? fname.toUpperCase() : "—");
    document.getElementById("ltFirstName").textContent = lname ? fname : "";
    document.getElementById("ltTeam").textContent      = team;
    document.getElementById("ltCategory").textContent  = cat;
    document.getElementById("ltExtra").textContent     = extra;
  } else {
    document.getElementById("ltSurname").textContent   = "—";
    document.getElementById("ltFirstName").textContent = "";
    document.getElementById("ltTeam").textContent      = "";
    document.getElementById("ltCategory").textContent  = "";
    document.getElementById("ltExtra").textContent     = "";
  }

  // Footer orario: visibile solo per TRANSITO
  const footer = document.getElementById("ltFooter");
  if (status === "TRANSITO" && data) {
    const h  = String(data.h  ?? 0).padStart(2, "0");
    const m  = String(data.m  ?? 0).padStart(2, "0");
    const s  = String(data.s  ?? 0).padStart(2, "0");
    const ms = String(data.ms ?? 0).padStart(3, "0");
    document.getElementById("ltTime").textContent = `${h}:${m}:${s}.${ms}`;
    footer.classList.remove("lt-footer-hidden");
  } else {
    document.getElementById("ltTime").textContent = "—";
    footer.classList.add("lt-footer-hidden");
  }

  // Mostra la lower-third (se il view mode lo permette)
  if (currentViewMode !== "griglia" && currentViewMode !== "nascosto") {
    lt.classList.add("lt-visible");
    if (status === "TRANSITO") {
      lt.classList.remove("lt-flash");
      void lt.offsetWidth;
      lt.classList.add("lt-flash");
      setTimeout(() => lt.classList.remove("lt-flash"), 800);
    }
  }

  // Auto-reset dopo 60 s solo per TRANSITO
  if (clearArrivedTimer) { clearTimeout(clearArrivedTimer); clearArrivedTimer = null; }
  if (status === "TRANSITO") {
    clearArrivedTimer = setTimeout(resetToWaiting, 60000);
  }
}

// ── WebSocket ─────────────────────────────────────────────────
let ws, lastMessageTime = 0, watchdogTimer;
let wsConnecting = false, reconnectTimer = null, connectionLost = false;

const popup = document.getElementById("popup");
function showPopup() {
  if (!popup.classList.contains("show")) {
    popup.classList.remove("hidden");
    setTimeout(() => popup.classList.add("show"), 10);
  }
}
function hidePopup() {
  if (popup.classList.contains("show")) {
    popup.classList.remove("show");
    setTimeout(() => popup.classList.add("hidden"), 500);
  }
}

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (wsConnecting) return;
  wsConnecting = true;
  ws = new WebSocket(`ws://${window.location.host}/ws`);
  ws.onopen = () => {
    wsConnecting = false; connectionLost = false;
    hidePopup(); lastMessageTime = Date.now(); startWatchdog();
  };
  ws.onmessage = (event) => {
    lastMessageTime = Date.now();
    if (connectionLost) { connectionLost = false; hidePopup(); }
    try { handleMessage(JSON.parse(event.data)); } catch (e) { console.error(e); }
  };
  ws.onclose = () => {
    wsConnecting = false; connectionLost = true; showPopup(); stopWatchdog();
    if (!reconnectTimer)
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connectWebSocket(); }, 1000);
  };
}

function startWatchdog() {
  stopWatchdog();
  watchdogTimer = setInterval(() => {
    if (Date.now() - lastMessageTime > 6000) {
      if (!connectionLost) { connectionLost = true; showPopup(); }
      try { ws.close(); } catch (e) {}
      stopWatchdog();
      setTimeout(connectWebSocket, 500);
    }
  }, 2000);
}
function stopWatchdog() {
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
}

// ── Message handler ───────────────────────────────────────────
function handleMessage(data) {
  const sel = parseInt(document.getElementById("lineSelect").value);

  switch (data.t) {

    case TYPE_CHECKPOINT:
      if (parseInt(data.ln) === sel)
        displayAthlete(data.c, parseInt(data.ln), data, "TRANSITO");
      addEventToTable(data.id, data.ln, data.c, data.h, data.m, data.s, data.ms);
      break;

    case TYPE_LINE_UPDATED:
      if (parseInt(data.l) === sel) {
        if (data.e === 0) {
          resetToWaiting();
        } else if (parseInt(data.c) !== 0) {
          displayAthlete(data.c, parseInt(data.l), null, "PROSSIMO");
        }
        // competitor == 0: lascia visibile l'ultimo atleta
      }
      break;

    case TYPE_SESSION_CLEARED:
      clearEventTableRows();
      resetToWaiting();
      break;

    case TYPE_TIME_UPDATE:
      updateClock(data);
      break;

    case TYPE_GENERIC_MESSAGE:
      showGeneralPopup(data.msg, "#3b55ff", 3000);
      break;
  }
}

// ── Clock ─────────────────────────────────────────────────────
function updateClock(data) {
  const h = String(data.h ?? 0).padStart(2, "0");
  const m = String(data.m ?? 0).padStart(2, "0");
  const s = String(data.s ?? 0).padStart(2, "0");
  document.getElementById("bc-clock").textContent = `${h}:${m}:${s}.000`;
}

// ── General popup ─────────────────────────────────────────────
const generalPopup     = document.getElementById("generalPopup");
const generalPopupText = document.getElementById("generalPopupText");

function showGeneralPopup(message, bgColor, duration) {
  generalPopupText.innerText = message;
  generalPopup.style.backgroundColor = bgColor || "#3b55ff";
  if (!generalPopup.classList.contains("show")) {
    generalPopup.classList.remove("hidden");
    setTimeout(() => generalPopup.classList.add("show"), 5);
  }
  setTimeout(() => {
    generalPopup.classList.remove("show");
    setTimeout(() => generalPopup.classList.add("hidden"), 1000);
  }, duration || 3000);
}

// ── Wake lock ─────────────────────────────────────────────────
let wakeLock = null;
async function keepScreenOn() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      document.addEventListener("visibilitychange", async () => {
        if (wakeLock !== null && document.visibilityState === "visible")
          try { wakeLock = await navigator.wakeLock.request("screen"); } catch (e) {}
      });
    }
  } catch (e) { console.warn("Wake lock:", e); }
}

// ── Cleanup ───────────────────────────────────────────────────
window.addEventListener("beforeunload", () => {
  if (ws) { ws.close(); ws = null; }
  if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
});

// ── Init ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  restoreBroadcastPrefs();
  updateLtLineColor(parseInt(document.getElementById("lineSelect").value) || 1);
  connectWebSocket();
  keepScreenOn();
  populateTableFromSaved();

  // Header tabella → overlay colonne
  document.querySelector("#event-table thead tr")
    .addEventListener("click", openTableColOverlay);
  document.getElementById("closeTcoOverlay")
    .addEventListener("click", closeTableColOverlay);
  document.getElementById("tableColOverlay")
    .addEventListener("click", e => {
      if (e.target === document.getElementById("tableColOverlay")) closeTableColOverlay();
    });
  ["tco-timestamp", "tco-delta", "tco-elapsed", "tco-precision"].forEach(id => {
    document.getElementById(id).addEventListener("change", onTcoChange);
  });
});

window.addEventListener("load", () => {
  const splash = document.getElementById("splash");
  setTimeout(() => splash.classList.add("finished"), 800);
  setTimeout(() => splash.remove(), 1800);
});
