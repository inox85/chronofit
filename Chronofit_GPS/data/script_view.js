const FLAG_SYNC_ENABLED = 1; // 0001
const FLAG_TIME_VALID = 2; // 0010
const FLAG_LOCATION_VALID = 4; // 0100
const FLAG_TIMEBASE_CALIBRATION = 8; // 1000

const SYNC_NONE = 0;
const SYNC_MANUAL_SET = 1;
const SYNC_WAIT_LINE_SIGNAL = 2;
const SYNC_SET_BY_LINE_SIGNAL = 3;
const SYNC_FIRST_GPS_SYNC = 4;
const SYNC_WAIT_GPS = 5;
const SYNC_GPS_SYNCED = 6;
const ELAPSED_WAITING_START = 7;
const ELAPSED_TIME_STARTED = 8;

const GPS_TEST_REQESTED = 1;
const GPS_TEST_DONE = 0;

const WIFI_STATUS_DISCONNECTED = 0;
const WIFI_STATUS_CONNECING = 1;
const WIFI_STATUS_CONNECTED = 2;
const WIFI_STATUS_INTERNET_OK = 3;

const POWER_MODE_NONE = 0;
const POWER_MODE_USB = 1;
const POWER_MODE_BATTERY = 2;

let prevPowerSource = 1;
let timeOffset = 0;

const audioFiles = [
  "/sound1.mp3",
  "/sound2.mp3",
  "/sound3.mp3",
  "/sound4.mp3"
];

const lineColors = {
  1: "#ffcccc",
  2: "#ccffcc",
  3: "#ccccff",
  4: "#fff5cc",
  5: "#808080ff"
};

const audioCache = {};

// ── Precisione temporale ──────────────────────────────────────
// 1 = decimi, 2 = centesimi, 3 = millisecondi
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

function refreshAllTimestamps() {
  document.querySelectorAll("#event-table tbody tr").forEach(row => {
    const tsCell = row.querySelector(".timestamp");
    if (!tsCell || tsCell.querySelector("input")) return;
    const h  = parseInt(row.dataset.hour    ?? 0);
    const m  = parseInt(row.dataset.minute  ?? 0);
    const s  = parseInt(row.dataset.seconds ?? 0);
    const ms = parseInt(row.dataset.msRaw   ?? 0);
    tsCell.textContent = formatTime(h, m, s, ms);
  });
}

function onTimePrecisionChange(val) {
  val = Math.max(1, Math.min(3, parseInt(val) || 3));
  timePrecision = val;
  document.getElementById("time-precision").value = val;
  refreshAllTimestamps();
  recalcDeltaTimes();
  recalcElapsedTimes();
  saveViewPrefs();
}

// ── LocalStorage preferenze visualizzazione ───────────────────
const VIEW_PREFS_KEY = "chronofit_view_prefs"; // stessa chiave di index → prefs condivise

// ── Athlete registry (read-only) ──────────────────────────────
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

function saveViewPrefs() {
  const prefs = {
    timestamp:     document.getElementById("toggle-timestamp").checked,
    deltaTime:     document.getElementById("toggle-delta-time").checked,
    elapsedTime:   document.getElementById("toggle-elapsed-time").checked,
    penality:      document.getElementById("toggle-penality").checked,
    timePrecision: timePrecision,
    showIndex:     document.getElementById("toggle-index")?.checked    ?? true,
    showLine:      document.getElementById("toggle-line")?.checked     ?? true,
    showLineId:    document.getElementById("toggle-line-id")?.checked  ?? true,
    showRaceTime:  document.getElementById("toggle-race-time")?.checked ?? false,
    showName:      document.getElementById("toggle-name")?.checked     ?? false,
    showSurname:   document.getElementById("toggle-surname")?.checked  ?? false,
    splitsMode:    document.getElementById("toggle-splits")?.checked   ?? false,
    lines: {}
  };
  document.querySelectorAll(".toggle-btn[data-line]").forEach(btn => {
    if (btn.tagName === "INPUT" && btn.type === "checkbox") {
      prefs.lines[btn.dataset.line] = btn.checked;
    }
  });
  localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
}

function restoreViewPrefs() {
  const raw = localStorage.getItem(VIEW_PREFS_KEY);
  if (!raw) { updateTableCorners(); return; }
  try {
    const prefs = JSON.parse(raw);

    const setChk = (id, val) => {
      const el = document.getElementById(id);
      if (el && val !== undefined) el.checked = val;
    };
    setChk("toggle-timestamp",    prefs.timestamp);
    setChk("toggle-delta-time",   prefs.deltaTime);
    setChk("toggle-elapsed-time", prefs.elapsedTime);
    setChk("toggle-penality",     prefs.penality);
    setChk("toggle-index",        prefs.showIndex    ?? true);
    setChk("toggle-line",         prefs.showLine     ?? true);
    setChk("toggle-line-id",      prefs.showLineId   ?? true);
    setChk("toggle-race-time",    prefs.showRaceTime ?? false);
    setChk("toggle-name",         prefs.showName     ?? false);
    setChk("toggle-surname",      prefs.showSurname  ?? false);
    setChk("toggle-splits",       prefs.splitsMode   ?? false);

    if (prefs.timePrecision !== undefined) {
      timePrecision = Math.max(1, Math.min(3, parseInt(prefs.timePrecision) || 3));
      const sel = document.getElementById("time-precision");
      if (sel) sel.value = timePrecision;
    }

    if (prefs.lines) {
      document.querySelectorAll(".toggle-btn[data-line]").forEach(btn => {
        const active = prefs.lines[btn.dataset.line];
        if (active === undefined) return;
        if (btn.tagName === "INPUT" && btn.type === "checkbox") {
          btn.checked = active;
        }
      });
    }

    updateVisibleColumns();
    applyLineFilter();
    if (prefs.splitsMode) applyCompetitorSplits();
  } catch(e) {
    console.warn("Errore ripristino preferenze:", e);
  }
}

// ── Audio lazy ────────────────────────────────────────────────
function playSound(name) {
  if (!audioCache[name]) {
    const audio = new Audio();
    audio.preload = "none";
    audio.src = name;
    audioCache[name] = audio;
  }
  audioCache[name].currentTime = 0;
  audioCache[name].play();
}

// ── Upload FW / FS ────────────────────────────────────────────
function uploadFW() {
  let fileInput = document.getElementById("fw-file");
  if (fileInput.files.length == 0) { alert("Select a file first!"); return; }
  let file = fileInput.files[0];
  if (!file.name.endsWith(".bin")) { alert("Firmware must be a .bin file!"); return; }
  let formData = new FormData();
  formData.append("fw", file);
  fetch("/update", { method: "POST", body: formData })
    .then(res => res.text())
    .then(msg => document.getElementById("fw-msg").innerText = msg)
    .catch(err => console.error(err));
}

function uploadFS() {
  let fileInput = document.getElementById("fs-file");
  if (fileInput.files.length == 0) { alert("Select a file first!"); return; }
  let file = fileInput.files[0];
  let formData = new FormData();
  formData.append("fs", file);
  fetch("/uploadFS", { method: "POST", body: formData })
    .then(res => res.text())
    .then(msg => document.getElementById("fs-msg").innerText = msg)
    .catch(err => console.error(err));
}

function setSettings() {
  const printToggle = document.getElementById("printToggle");
  const printEnabled = printToggle && printToggle.checked ? 1 : 0;
  const stationName = document.getElementById("station-name-input").value;
  const url = `/setAttribute?printEnabled=${encodeURIComponent(printEnabled)}&stationName=${encodeURIComponent(stationName)}`;
  fetch(url)
    .then(response => response.text())
    .then(msg => {
      document.getElementById("settings-field").innerText = msg;
      setTimeout(() => { document.getElementById("settings-field").innerText = ""; }, 3000);
    })
    .catch(err => {
      document.getElementById("settings-field").innerText = "Errore invio dati";
      console.error(err);
    });
}

let connectionLost = false;
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

function updateTimeOffset() {
  let tz = parseInt(document.getElementById("timezone-select").value);
  fetch(`/setOffset?offset=${tz}`).then(res => res.text()).then(msg => console.log(msg));
}

function updateParams() {
  fetch('/allSettings')
    .then(res => { if (!res.ok) throw new Error("Errore nella fetch"); return res.json(); })
    .then(data => { console.log("Parametri ricevuti:", data); fillSettingsFields(data); })
    .catch(err => console.error("Errore:", err));
}

function fillSettingsFields(data) {
  document.getElementById("c1").value = data.c1 ?? "";
  document.getElementById("c2").value = data.c2 ?? "";
  document.getElementById("c3").value = data.c3 ?? "";
  document.getElementById("c4").value = data.c4 ?? "";
  document.getElementById("l1").value = data.l1 ?? "";
  document.getElementById("l2").value = data.l2 ?? "";
  document.getElementById("l3").value = data.l3 ?? "";
  document.getElementById("l4").value = data.l4 ?? "";
  document.getElementById("d1").value = data.d1 ?? 0;
  document.getElementById("d2").value = data.d2 ?? 0;
  document.getElementById("d3").value = data.d3 ?? 0;
  document.getElementById("d4").value = data.d4 ?? 0;
  document.getElementById("timezone-select").value = data.utc ?? 0;
  document.getElementById("station-name-input").value = data.sn;
  document.getElementById("sync-method-select").value = data.sm;
  document.getElementById("sync-method-select").dispatchEvent(new Event("change"));
  document.getElementById("sync-interval-select").value = data.si ?? 0;
  handlePowerUpdate(data);
  // Riapplica preferenze visive — il server non deve sovrascriverle
  restoreViewPrefs();
}

function setElapsedTimemode() {
  let url = `/setTime?mode=${encodeURIComponent(3)}`;
  fetch(url).then(res => res.text()).then(msg => {
    document.getElementById("settings-field").innerText = msg;
    setTimeout(() => { document.getElementById("settings-field").innerText = ""; }, 3000);
  }).catch(err => console.error("Error fetching JSON:", err));
}

function setTimeSyncMode() {
  let h = document.getElementById("hour").value;
  let m = document.getElementById("minute").value;
  let s = document.getElementById("second").value;
  let mode = document.getElementById("sync-method-select").value;
  let gpsInterval = document.getElementById("sync-interval-select").value;
  let utcOffset = document.getElementById("timezone-select").value;
  document.getElementById("hour").value = "";
  document.getElementById("minute").value = "";
  document.getElementById("second").value = "";
  let url = `/setTime?hour=${encodeURIComponent(h)}&minute=${encodeURIComponent(m)}&second=${encodeURIComponent(s)}&mode=${encodeURIComponent(mode)}&gpsInterval=${encodeURIComponent(gpsInterval)}&utcOffset=${encodeURIComponent(utcOffset)}`;
  fetch(url).then(res => res.text()).then(msg => {
    document.getElementById("settings-field").innerText = msg;
    setTimeout(() => { document.getElementById("settings-field").innerText = ""; }, 3000);
  }).catch(err => console.error("Error fetching JSON:", err));
  document.getElementById("settingsOverlay").style.display = "none";
}

function sendCheckPoint(lineNumber) {
  fetch(`/checkPoint?lineNumber=${lineNumber - 1}`)
    .then(res => res.text())
    .catch(err => console.error("Error fetching JSON:", err));
}

function clearSession() {
  document.getElementById("clearSessionOverlay").style.display = "flex";
  const btnConfirm = document.getElementById("clearSessionConfirm");
  const btnCancel  = document.getElementById("clearSessionCancel");
  btnCancel.onclick  = () => { document.getElementById("clearSessionOverlay").style.display = "none"; };
  btnConfirm.onclick = () => {
    document.getElementById("clearSessionOverlay").style.display = "none";
    fetch("/clearSession").then(response => response.text()).catch(err => alert("Errore: " + err));
  };
}

let wakeLock = null;

async function keepScreenOn() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      console.log("✅ Screen Wake Lock attivato");
      document.addEventListener("visibilitychange", async () => {
        if (wakeLock !== null && document.visibilityState === "visible") {
          try { wakeLock = await navigator.wakeLock.request("screen"); } catch (err) { console.error(err); }
        }
      });
    }
  } catch (err) { console.error("❌ Errore wake lock:", err); }
}

document.addEventListener("visibilitychange", async () => {
  if (wakeLock !== null && document.visibilityState === "visible") keepScreenOn();
});

document.querySelectorAll("input[type=text], input[type=number]").forEach(input => {
  input.addEventListener("focus", function() { this.select(); });
});

// ── WebSocket ─────────────────────────────────────────────────
let ws;
let lastMessageTime = 0;
let watchdogTimer;
let wsConnecting = false;
let reconnectTimer = null;

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  if (wsConnecting) return;
  wsConnecting = true;

  ws = new WebSocket(`ws://${window.location.host}/ws`);

  ws.onopen = () => {
    console.log("✅ WebSocket connected");
    wsConnecting = false;
    connectionLost = false;
    hidePopup();
    lastMessageTime = Date.now();
    startWatchdog();
  };

  ws.onmessage = (event) => {
    lastMessageTime = Date.now();
    if (connectionLost) { connectionLost = false; hidePopup(); }
    try {
      const data = JSON.parse(event.data);
      console.log("📩 Received:", data);
      handleMessage(data);
    } catch (e) { console.error("Errore JSON:", e); }
  };

  ws.onclose = () => {
    console.warn("⚠️ WebSocket closed");
    wsConnecting = false;
    connectionLost = true;
    showPopup();
    stopWatchdog();
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connectWebSocket(); }, 1000);
    }
  };
}

const TYPE_CHECKPOINT      = 0;
const TYPE_TIME_UPDATE     = 1;
const TYPE_SESSION_CLEARED = 2;
const TYPE_PARAMS_UPDATED  = 3;
const TYPE_ROW_UPDATED     = 4;
const TYPE_GENERIC_MESSAGE = 5;
const TYPE_EMAIL_SENT      = 6;

function handleMessage(data) {
  switch (data.t) {
    case TYPE_CHECKPOINT:
      addEventToTable(data.id, data.ln, data.lId, data.c, data.h, data.m, data.s, data.ms, 0);
      if (document.getElementById("toggle-splits")?.checked) applyCompetitorSplits();
      break;
    case TYPE_TIME_UPDATE:      updateClockFromData(data); break;
    case TYPE_SESSION_CLEARED:  console.log("🧹 Session cleared!"); clearEventTableRows(); break;
    case TYPE_PARAMS_UPDATED:   console.log("⚙️ Params update!"); fillSettingsFields(data); break;
    case TYPE_ROW_UPDATED:      console.log("⚙️ Row update!"); updateRowFromBroadcas(data); break;
    case TYPE_GENERIC_MESSAGE:  showGeneralPopup(data.msg, "#3b55ffff", 3000); break;
    case TYPE_EMAIL_SENT:       showGeneralPopup("Email sent successfully!", "rgb(9, 139, 0)", 3000); break;
  }
}

window.addEventListener("beforeunload", () => { if (ws) { ws.close(); ws = null; } });

function startWatchdog() {
  stopWatchdog();
  watchdogTimer = setInterval(() => {
    const now = Date.now();
    if (now - lastMessageTime > 6000) {
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

function showOkMessage(message) {
  document.getElementById("okMessageText").innerText = message;
  document.getElementById("okMessageOverlay").style.display = "flex";
}

document.getElementById("okMessageButton").addEventListener("click", function () {
  document.getElementById("okMessageOverlay").style.display = "none";
});

const generalPopup     = document.getElementById("generalPopup");
const generalPopupText = document.getElementById("generalPopupText");

function showGeneralPopup(message, bgColor = "#3b55ffff", duration = 3000) {
  generalPopupText.innerText = message;
  generalPopup.style.backgroundColor = bgColor;
  if (!generalPopup.classList.contains("show")) {
    generalPopup.classList.remove("hidden");
    setTimeout(() => generalPopup.classList.add("show"), 5);
  }
  setTimeout(() => {
    generalPopup.classList.remove("show");
    setTimeout(() => generalPopup.classList.add("hidden"), 1000);
  }, duration);
}

function hideGeneralPopup() {
  if (generalPopup.classList.contains("show")) {
    generalPopup.classList.remove("show");
    setTimeout(() => generalPopup.classList.add("hidden"), 500);
  }
}

function handlePowerUpdate(data) {
  if (prevPowerSource !== data.pw) {
    const printToggle = document.getElementById("printToggle");
    prevPowerSource = data.pw;
    if (prevPowerSource === POWER_MODE_NONE) {
      printToggle.checked = 0; printToggle.disabled = 1;
    } else {
      printToggle.checked = 1; printToggle.disabled = 0;
    }
  }
}

function updateClockFromData(data) {
  let hourAdj = (data.h + timeOffset + 24) % 24;
  document.getElementById("time").innerText =
    String(hourAdj).padStart(2, '0') + ":" +
    String(data.m).padStart(2, '0') + ":" +
    String(data.s).padStart(2, '0') + ".000";

  const syncStatus = data.sy;
  const elapsedTimeControls = document.getElementById("elapsedTimeControls");
  elapsedTimeControls.classList.add("hidden");

  if (syncStatus == ELAPSED_WAITING_START) {
    elapsedTimeControls.classList.remove("hidden");
    document.getElementById("startButton").innerText = "Start";
    document.getElementById("time").innerText = "00:00:00.000";
  }
  if (syncStatus == ELAPSED_TIME_STARTED) {
    elapsedTimeControls.classList.remove("hidden");
    document.getElementById("startButton").innerText = "Stop";
  }
}

let eventRows = [];

function clearEventTableRows() {
  document.querySelector("#event-table tbody").innerHTML = "";
  eventRows = [];
}

async function populateTableFromSaved() {
  try {
    const response = await fetch("/getCheckpoints");
    const text = await response.text();
    const lines = text.trim().split("\n");
    lines.forEach(line => {
      if (line.trim().length > 0) {
        try {
          const checkpoint = JSON.parse(line);
          addEventToTableFromCheckpoint(checkpoint);
        } catch (err) { console.warn("Errore parsing JSON:", err, line); }
      }
    });
  } catch (err) { console.error("Errore caricamento checkpoint:", err); }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function sendToPrinter(text, cr) {
  const encodedText = encodeURIComponent(text);
  fetch(`/print?text=${encodedText}&${cr}`)
    .then(response => { if (!response.ok) throw new Error("Errore durante la stampa"); })
    .catch(error => { console.error("Errore:", error); });
}

function addEventToTableFromCheckpoint(checkpoint) {
  addEventToTable(
    checkpoint.id, checkpoint.ln, checkpoint.lId,
    checkpoint.c, checkpoint.h, checkpoint.m,
    checkpoint.s, checkpoint.ms, checkpoint.x
  );
}

function addEventToTable(rowIndex, lineNumber, lineId, competitor, hour, minute, seconds, millis, penality) {
  const tbody = document.querySelector("#event-table tbody");
  const row = document.createElement("tr");
  row.classList.add("row-enter");

  const timestamp = formatTime(hour, minute, seconds, millis);

  const activeLines = Array.from(document.querySelectorAll(".toggle-btn:not(.inactive)"))
    .map(btn => btn.dataset.line);
  if (lineNumber != 5 && activeLines.map(Number).includes(Number(lineNumber))) {
    playSound("/sound" + lineNumber + ".mp3");
  }

  row.setAttribute("data-line",       lineNumber);
  row.setAttribute("data-lineId",     lineId);
  row.setAttribute("data-competitor", competitor);
  row.setAttribute("data-hour",       hour);
  row.setAttribute("data-minute",     minute);
  row.setAttribute("data-seconds",    seconds);
  row.setAttribute("data-ms-raw",     millis);
  row.setAttribute("data-penality",   0);

  row.innerHTML = `
    <td class="col-index">${rowIndex}</td>
    <td style="background-color: ${lineColors[lineNumber] || "#f5f5f5"}" class="col-line">${lineNumber}</td>
    <td class="col-id">${lineId}</td>
    <td class="col-competitor">${competitor}</td>
    <td class="col-name">${getAthleteName(competitor)}</td>
    <td class="col-surname">${getAthleteSurname(competitor)}</td>
    <td class="timestamp">${timestamp}</td>
    <td class="race-time">—</td>
    <td class="delta-time"></td>
    <td class="elapsed-time"></td>
    <td><button class="penality penality-btn">${penality}</button></td>
  `;

  tbody.insertBefore(row, tbody.firstChild);
  row.offsetHeight;
  row.classList.add("row-enter-active");
  setTimeout(() => { row.classList.remove("row-enter", "row-enter-active"); }, 1500);
  applyLineFilter();
}

function timestampToMs(ts) {
  const [time, ms] = ts.split(".");
  const [h, m, s] = time.split(":").map(Number);
  return ((h * 3600 + m * 60 + s) * 1000) + Number(ms);
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
    String(s).padStart(2, "0") + "." +
    msStr
  );
}

function formatDelta(ms, signed) {
  if (ms > 0) return "—";
  let sign = signed ? "+" : "";
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

function recalcElapsedTimes() {
  const rows = Array.from(document.querySelectorAll("#event-table tbody tr"))
    .filter(row => row.style.display !== "none");
  const firstRow = rows[rows.length - 1];
  const firstTimeMs = firstRow ? rowToMs(firstRow) : null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const deltaCell = rows[i].querySelector(".elapsed-time");
    if (!deltaCell) continue;
    deltaCell.textContent = formatDelta(firstTimeMs - rowToMs(rows[i]), false);
  }
}

function recalcDeltaTimes() {
  const rows = Array.from(document.querySelectorAll("#event-table tbody tr"))
    .filter(row => row.style.display !== "none");
  let nextTime = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const tsCell    = row.querySelector(".timestamp");
    const deltaCell = row.querySelector(".delta-time");
    if (!tsCell || !deltaCell) continue;
    row.classList.remove("negative-row");
    const timestamp = tsCell.textContent.trim();
    if (["00:00:00.000", "00:00:00.00", "00:00:00.0"].includes(timestamp))
      row.classList.add("negative-row");
    const currentMs = rowToMs(row);
    if (nextTime === null) { deltaCell.textContent = "—"; nextTime = currentMs; continue; }
    const delta = nextTime - currentMs;
    if (delta > 0) { deltaCell.textContent = "—"; row.classList.add("negative-row"); }
    else { deltaCell.textContent = formatDelta(delta, true); }
    nextTime = currentMs;
  }
}

function applyLineFilter() {
  const activeLines = Array.from(document.querySelectorAll(".toggle-btn"))
    .filter(el => {
      if (el.tagName === "BUTTON") return !el.classList.contains("inactive");
      if (el.tagName === "INPUT" && el.type === "checkbox") return el.checked;
      return false;
    })
    .map(el => el.dataset.line);
  document.querySelectorAll("#event-table tbody tr").forEach(row => {
    const line = String(row.getAttribute("data-line"));
    row.style.display = activeLines.includes(line) ? "" : "none";
  });
  recalcDeltaTimes();
  recalcElapsedTimes();
  updateVisibleColumns();
}

function maskTimeInput(input) {
  let v = input.value.replace(/\D/g, "");
  if (v.length > 9) v = v.slice(0, 9);
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

function sendUpdatedCheckPointRow(row) {
  const index = parseInt(row.cells[0].textContent.trim());
  const cells = row.querySelectorAll("td");
  const lineNumber = cells[1].textContent.trim();
  const lineId     = cells[2].textContent.trim();
  const competitor = cells[3].textContent.trim();
  const timestamp  = cells[4].textContent.trim();
  const [timePart, millisPart] = timestamp.split(".");
  const [hour, minute, second] = timePart.split(":");
  const penality = Number(row.dataset.penality) || 0;
  const messageObj = {
    index,
    lineNumber: parseInt(lineNumber),
    lineId: parseInt(lineId),
    competitor: parseInt(competitor),
    hour: parseInt(hour),
    minute: parseInt(minute),
    second: parseInt(second),
    millis: parseInt(millisPart),
    penality
  };
  fetch("/updateCheckPointRow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messageObj)
  }).then(res => res.text()).then(resp => console.log("ESP response:", resp))
    .catch(err => console.error("Error sending JSON to ESP:", err));
}

document.querySelectorAll('.toggle-btn').forEach(el => {
  if (el.tagName === "BUTTON") {
    const color = el.dataset.color;
    el.style.backgroundColor = color;
    el.addEventListener('click', () => {
      if (el.classList.contains('inactive')) { el.classList.remove('inactive'); el.style.backgroundColor = color; }
      else { el.classList.add('inactive'); el.style.backgroundColor = '#ccc'; }
      el.classList.toggle('active');
      applyLineFilter();
      saveViewPrefs();
    });
  } else if (el.tagName === "INPUT" && el.type === "checkbox") {
    el.addEventListener('change', () => { applyLineFilter(); saveViewPrefs(); });
  }
});

async function downloadSession() {
  try {
    const response = await fetch('/downloadSession');
    if (!response.ok) { showOkMessage("No session data available to download."); return; }
    const text = await response.text();
    const cleanText = text.replace(/^\uFEFF/, '').trim();
    const lines = cleanText.split(/\r?\n/);
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const arrayJson = lines.map(line => JSON.parse(line));
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

function jsonToCsvTimeStamp(array) {
  if (!array.length) return '';
  const keys = Object.keys(array[0]);
  const header = `ID;Line number;Line ID;Competitor;Timestamp`;
  const rows = array.map(obj => {
    const fixedCols = keys.slice(0, 4).map(k => {
      let val = obj[k];
      if (typeof val === 'string') val = '"' + val.replace(/"/g, '""') + '"';
      return val;
    }).join(';');
    const h = obj[keys[4]], min = obj[keys[5]], sec = obj[keys[6]], ms = obj[keys[7]];
    return `${fixedCols};${h}:${min}:${sec}:${ms}`;
  });
  return [header, ...rows].join('\r\n');
}

document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
  input.removeEventListener('change', handleInputUpdate);
  input.addEventListener('change', handleInputUpdate);
});

function handleInputUpdate(e) {
  const lineNumber = e.target.dataset.line;
  if (!lineNumber) return;
  const data = {
    l: Number(lineNumber),
    ld: String(document.querySelector(`#l${lineNumber}`).value),
    c: Number(document.querySelector(`#c${lineNumber}`).value),
    d: Number(document.querySelector(`#d${lineNumber}`).value) || 0
  };
  fetch('/checkPointFields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(res => res.ok ? console.log(`✅ Riga ${data.l} aggiornata`) : console.error(`❌ Errore linea ${data.l}`))
    .catch(err => console.error('Errore di rete:', err));
}

function toggleFullscreen(checkbox) {
  if (checkbox.checked) {
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
    else if (document.documentElement.webkitRequestFullscreen) document.documentElement.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

// ── rowToMsExact (senza troncamento per calcolo diff preciso) ─
function rowToMsExact(row) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return ((h * 3600 + m * 60 + s) * 1000) + ms;
}

// ── Rounded corners sulle TH visibili ────────────────────────
function updateTableCorners() {
  const ths = Array.from(document.querySelectorAll("#event-table thead th"));
  ths.forEach(th => { th.style.borderTopLeftRadius = ""; th.style.borderTopRightRadius = ""; });
  const visible = ths.filter(th => getComputedStyle(th).display !== "none");
  if (visible.length > 0) {
    visible[0].style.borderTopLeftRadius = "8px";
    visible[visible.length - 1].style.borderTopRightRadius = "8px";
  }
}

// ── Competitor splits ─────────────────────────────────────────
function clearCompetitorSplits() {
  document.querySelectorAll("#event-table tbody .diff-row").forEach(r => r.remove());
  document.querySelectorAll("#event-table tbody .diff-hidden").forEach(r => {
    r.classList.remove("diff-hidden");
    r.style.display = "";
  });
  applyLineFilter();
}

function applyCompetitorSplits() {
  clearCompetitorSplits();
  const tbody = document.querySelector("#event-table tbody");
  const allRows = Array.from(tbody.querySelectorAll("tr:not(.diff-row)"));
  const groups = {};
  allRows.forEach(row => {
    const comp = (row.dataset.competitor ?? "").trim();
    if (!comp || comp === "0") return;
    if (!groups[comp]) groups[comp] = [];
    groups[comp].push(row);
  });
  Object.values(groups).forEach(compRows => {
    compRows.sort((a, b) => rowToMsExact(a) - rowToMsExact(b));
    if (compRows.length >= 2) {
      for (let i = 0; i < compRows.length - 1; i++) {
        const r1 = compRows[i];
        const r2 = compRows[i + 1];
        const diffMs = rowToMsExact(r2) - rowToMsExact(r1);
        const dH  = Math.floor(diffMs / 3600000);
        const dM  = Math.floor((diffMs % 3600000) / 60000);
        const dS  = Math.floor((diffMs % 60000) / 1000);
        const dMs = diffMs % 1000;
        const diffRow = document.createElement("tr");
        diffRow.className = "diff-row";
        diffRow.dataset.competitor = r1.dataset.competitor;
        diffRow.innerHTML = `
          <td class="col-index">—</td>
          <td class="col-line">L${r1.dataset.line}→L${r2.dataset.line}</td>
          <td class="col-id">—</td>
          <td class="col-competitor">${r1.dataset.competitor}</td>
          <td class="col-name">${getAthleteName(r1.dataset.competitor)}</td>
          <td class="col-surname">${getAthleteSurname(r1.dataset.competitor)}</td>
          <td class="timestamp">—</td>
          <td class="race-time diff-time">${formatTime(dH, dM, dS, dMs)}</td>
          <td class="delta-time">—</td>
          <td class="elapsed-time">—</td>
          <td></td>
        `;
        tbody.insertBefore(diffRow, r2);
      }
    }
    compRows.forEach(r => { r.classList.add("diff-hidden"); r.style.display = "none"; });
  });
  allRows.forEach(row => {
    const comp = (row.dataset.competitor ?? "").trim();
    if (!comp || comp === "0") { row.classList.add("diff-hidden"); row.style.display = "none"; }
  });
  updateVisibleColumns();
}

// ── Toggle colonne ────────────────────────────────────────────
function toggleDeltaTimeColumn(show) {
  const display = show ? "table-cell" : "none";
  document.querySelectorAll("th.delta-time-col").forEach(th => th.style.display = display);
  document.querySelectorAll("td.delta-time").forEach(td => td.style.display = display);
  if (show) { recalcDeltaTimes(); recalcElapsedTimes(); }
}

function toggleTimestampColumn(show) {
  const display = show ? "table-cell" : "none";
  document.querySelectorAll("th.timestamp-col").forEach(th => th.style.display = display);
  document.querySelectorAll("td.timestamp").forEach(td => td.style.display = display);
}

function toggleElapsedTimeColumn(show) {
  const display = show ? "table-cell" : "none";
  document.querySelectorAll("th.elapsed-time-col").forEach(th => th.style.display = display);
  document.querySelectorAll("td.elapsed-time").forEach(td => td.style.display = display);
  if (show) recalcElapsedTimes();
}

function togglePenalityColumn(show) {
  const display = show ? "table-cell" : "none";
  document.querySelectorAll("th.penality-col").forEach(th => th.style.display = display);
  document.querySelectorAll("td:has(.penality)").forEach(td => td.style.display = display);
  if (show) recalcElapsedTimes();
}

function toggleIndexColumn(show) {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll("th.col-index-col").forEach(el => el.style.display = d);
  document.querySelectorAll("td.col-index").forEach(el => el.style.display = d);
  updateTableCorners();
}

function toggleLineColumn(show) {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll("th.col-line-col").forEach(el => el.style.display = d);
  document.querySelectorAll("td.col-line").forEach(el => el.style.display = d);
  updateTableCorners();
}

function toggleLineIdColumn(show) {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll("th.col-id-col").forEach(el => el.style.display = d);
  document.querySelectorAll("td.col-id").forEach(el => el.style.display = d);
  updateTableCorners();
}

function toggleRaceTimeColumn(show) {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll("th.race-time-col").forEach(el => el.style.display = d);
  document.querySelectorAll("td.race-time").forEach(el => el.style.display = d);
  updateTableCorners();
}

function toggleNameColumn(show) {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll("th.col-name-col").forEach(el => el.style.display = d);
  document.querySelectorAll("td.col-name").forEach(el => el.style.display = d);
  updateTableCorners();
}

function toggleSurnameColumn(show) {
  const d = show ? "table-cell" : "none";
  document.querySelectorAll("th.col-surname-col").forEach(el => el.style.display = d);
  document.querySelectorAll("td.col-surname").forEach(el => el.style.display = d);
  updateTableCorners();
}

function updateVisibleColumns() {
  toggleIndexColumn(document.getElementById("toggle-index")?.checked ?? true);
  toggleLineColumn(document.getElementById("toggle-line")?.checked ?? true);
  toggleLineIdColumn(document.getElementById("toggle-line-id")?.checked ?? true);
  toggleTimestampColumn(document.getElementById("toggle-timestamp").checked);
  toggleRaceTimeColumn(document.getElementById("toggle-race-time")?.checked ?? false);
  toggleNameColumn(document.getElementById("toggle-name")?.checked ?? false);
  toggleSurnameColumn(document.getElementById("toggle-surname")?.checked ?? false);
  toggleElapsedTimeColumn(document.getElementById("toggle-elapsed-time").checked);
  toggleDeltaTimeColumn(document.getElementById("toggle-delta-time").checked);
  togglePenalityColumn(document.getElementById("toggle-penality").checked);
  updateTableCorners();
}

document.getElementById("toggle-index").addEventListener("change", e => {
  toggleIndexColumn(e.target.checked); saveViewPrefs();
});
document.getElementById("toggle-line").addEventListener("change", e => {
  toggleLineColumn(e.target.checked); saveViewPrefs();
});
document.getElementById("toggle-line-id").addEventListener("change", e => {
  toggleLineIdColumn(e.target.checked); saveViewPrefs();
});
document.getElementById("toggle-timestamp").addEventListener("change", e => {
  toggleTimestampColumn(e.target.checked); saveViewPrefs();
});
document.getElementById("toggle-race-time").addEventListener("change", e => {
  toggleRaceTimeColumn(e.target.checked); saveViewPrefs();
});
document.getElementById("toggle-name").addEventListener("change", e => {
  toggleNameColumn(e.target.checked); saveViewPrefs();
});
document.getElementById("toggle-surname").addEventListener("change", e => {
  toggleSurnameColumn(e.target.checked); saveViewPrefs();
});
document.getElementById("toggle-delta-time").addEventListener("change", e => {
  toggleDeltaTimeColumn(e.target.checked); saveViewPrefs();
});
document.getElementById("toggle-elapsed-time").addEventListener("change", e => {
  toggleElapsedTimeColumn(e.target.checked); saveViewPrefs();
});
document.getElementById("toggle-penality").addEventListener("change", e => {
  togglePenalityColumn(e.target.checked); saveViewPrefs();
});
document.getElementById("toggle-splits").addEventListener("change", e => {
  if (e.target.checked) applyCompetitorSplits();
  else clearCompetitorSplits();
  saveViewPrefs();
});

// ── Header click → tableSettingsOverlay ──────────────────────
const headerRow = document.querySelector("#event-table thead tr");
headerRow.style.cursor = "pointer";
headerRow.addEventListener("click", () => {
  document.getElementById("tableSettingsOverlay").style.display = "flex";
});
document.getElementById("closeTablePopup").addEventListener("click", () => {
  document.getElementById("tableSettingsOverlay").style.display = "none";
});

// ── updateRowFromBroadcas ─────────────────────────────────────
function updateRowFromBroadcas(data) {
  const tbody = document.getElementById("event-table").querySelector("tbody");
  const index = Number(data.id);
  if (isNaN(index)) return;
  const row = [...tbody.rows].find(r => Number(r.querySelector("td")?.textContent) === index);
  if (!row) { console.warn("Row not found:", index); return; }
  if (row.querySelector("input")) { console.warn("Row in edit, skipped:", index); return; }
  const idCell = row.querySelector(".col-id");
  if (idCell && data.lId !== undefined) idCell.textContent = data.lId;
  const competitorCell = row.querySelector(".col-competitor");
  if (competitorCell && data.c !== undefined) {
    competitorCell.textContent = data.c;
    const nc = row.querySelector(".col-name");
    const sc = row.querySelector(".col-surname");
    if (nc) nc.textContent = getAthleteName(data.c);
    if (sc) sc.textContent = getAthleteSurname(data.c);
  }
  const timeCell = row.querySelector(".timestamp");
  if (timeCell) {
    row.dataset.hour    = data.h  ?? row.dataset.hour;
    row.dataset.minute  = data.m  ?? row.dataset.minute;
    row.dataset.seconds = data.s  ?? row.dataset.seconds;
    row.dataset.msRaw   = data.ms ?? row.dataset.msRaw;
    timeCell.textContent = formatTime(
      parseInt(row.dataset.hour), parseInt(row.dataset.minute),
      parseInt(row.dataset.seconds), parseInt(row.dataset.msRaw)
    );
  }
  const penalityBtn = row.querySelector(".penality");
  if (penalityBtn) penalityBtn.textContent = data.x;
  showGeneralPopup(`Row ${index} has been updated`, lineColors[data.ln]);
  recalcDeltaTimes();
  recalcElapsedTimes();
}

// ── Penality popup ────────────────────────────────────────────
let currentPenaltyButton = null;

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("penality-btn")) {
    currentPenaltyButton = e.target;
    document.getElementById("penalty-input").value = currentPenaltyButton.textContent.trim() || 0;
    document.getElementById("assingPenality").style.display = "flex";
  }
});

document.getElementById("confirmPenalityButton").addEventListener("click", () => {
  if (!currentPenaltyButton) return;
  const value = Number(document.getElementById("penalty-input").value) || 0;
  currentPenaltyButton.textContent = value;
  const row = currentPenaltyButton.closest("tr");
  row.dataset.penality = value;
  document.getElementById("assingPenality").style.display = "none";
  currentPenaltyButton = null;
  sendUpdatedCheckPointRow(row);
});

// ── downloadActualView ────────────────────────────────────────
function normalizeHeader(text) {
  return text.replace(/❌/g, "penality").replace(/⏱️/g, "time")
             .replace(/\s+/g, " ").replace("Δ", "Delta").trim();
}

function downloadActualView() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filename = `table_view_${timestamp}.csv`;
  const table = document.getElementById("event-table");
  if (!table) return;
  const isVisible = el => {
    const s = window.getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  };
  const rows = [];
  const headerCells = Array.from(table.querySelectorAll("thead th"));
  const visibleIndexes = [];
  const headerRow = [];
  headerCells.forEach((th, i) => {
    const text = normalizeHeader(th.innerText);
    if (["edit", "send"].includes(text.toLowerCase())) return;
    if (isVisible(th)) { visibleIndexes.push(i); headerRow.push(text); }
  });
  rows.push(headerRow.join(";"));
  table.querySelectorAll("tbody tr").forEach(tr => {
    if (!isVisible(tr)) return;
    const cells = tr.querySelectorAll("td");
    if (cells.length < Math.max(...visibleIndexes) + 1) return;
    const row = [];
    visibleIndexes.forEach(i => {
      let text = (cells[i].innerText || "").replace(/\n/g, " ").replace(/;/g, ",");
      row.push(text);
    });
    if (row.every(v => v === "")) return;
    rows.push(row.join(";"));
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ── DOMContentLoaded ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  console.log("Connetto webSocket...");
  connectWebSocket();

  console.log("Carico parametri...");
  updateParams();

  console.log("Carico checkpoint salvati...");
  populateTableFromSaved();

  console.log("Richiedo always on display...");
  keepScreenOn();

  console.log("Imposto toggle delta time a default...");
  toggleDeltaTimeColumn(document.getElementById("toggle-delta-time").checked);

  console.log("Ripristino preferenze visualizzazione...");
  restoreViewPrefs();

  updateTableCorners();
});

document.getElementById('yesFullscreen').addEventListener('click', async () => {
  try { await document.documentElement.requestFullscreen(); } catch (err) { console.error(err); }
  document.getElementById('fullscreenOverlay').style.display = 'none';
});
document.getElementById('noFullscreen').addEventListener('click', () => {
  document.getElementById('fullscreenOverlay').style.display = 'none';
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('✅ Service Worker registrato:', reg))
    .catch(err => console.error('❌ Registrazione SW fallita:', err));
}

window.addEventListener("load", () => {
  const splash = document.getElementById("splash");
  setTimeout(() => splash.classList.add("finished"), 1000);
  setTimeout(() => splash.remove(), 2000);
  setTimeout(() => { document.getElementById('fullscreenOverlay').style.display = 'flex'; }, 2500);
});

document.getElementById("time").addEventListener("click", () => {
  document.getElementById("timeChoiceOverlay").style.display = "flex";
});

function onTimeSettingsAction() {
  updateParams();
  document.getElementById("timeChoiceOverlay").style.display = "none";
  document.getElementById("settingsOverlay").style.display = "flex";
}

function onSyncTestAction() {
  document.getElementById("timeChoiceOverlay").style.display = "none";
  fetch(`/syncTest`).then(response => response.text()).then(msg => {
    document.getElementById("settings-field").innerText = msg;
    setTimeout(() => { document.getElementById("settings-field").innerText = ""; }, 3000);
  }).catch(err => {
    document.getElementById("settings-field").innerText = "Errore invio dati";
    console.error(err);
  });
}

function onGoHomeAction() {
  document.getElementById("timeChoiceOverlay").style.display = "none";
}

document.getElementById("closeTimePopup").addEventListener("click", () => {
  document.getElementById("settingsOverlay").style.display = "none";
});

function setTimeManualPopup(hh, mm, ss) { console.log("Imposto tempo:", hh, mm, ss); }

function updateTimeSettingsVisibility() {
  const method = document.getElementById("sync-method-select").value;
  document.querySelectorAll('.manual-sync, .gps-sync').forEach(el => el.classList.add('hidden'));
  if (method === "1") {
    document.querySelectorAll('.manual-sync').forEach(el => el.classList.remove('hidden'));
    document.querySelector('.time-set-fields').textContent = "Time to sync";
  } else if (method === "2") {
    document.querySelectorAll('.gps-sync').forEach(el => el.classList.remove('hidden'));
    document.getElementById("time-settings-field").textContent = "";
  } else if (method === "0") {
    document.querySelectorAll('.manual-sync').forEach(el => el.classList.remove('hidden'));
    document.querySelector('.time-set-fields').textContent = "Time to set";
  }
}

function onApplyClick() {
  const hour = document.getElementById("hour");
  const minute = document.getElementById("minute");
  const message = document.getElementById("time-settings-field");
  const manualSyncRow = document.querySelector(".toggle-row.manual-sync");
  if (manualSyncRow.classList.contains("hidden")) { setTimeSyncMode(); return; }
  const validHour   = hour.value !== "" && hour.value >= 0 && hour.value <= 23;
  const validMinute = minute.value !== "" && minute.value >= 0 && minute.value <= 59;
  if (validHour && validMinute) { message.textContent = ""; setTimeSyncMode(); }
  else { message.textContent = "Enter a valid hour and minute."; message.style.color = "red"; }
}