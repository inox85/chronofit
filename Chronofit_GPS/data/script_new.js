// ─── Costanti di stato (bitmask flags) ───────────────────────────────────────
const FLAG_SYNC_ENABLED          = 1; // 0001
const FLAG_TIME_VALID            = 2; // 0010
const FLAG_LOCATION_VALID        = 4; // 0100
const FLAG_TIMEBASE_CALIBRATION  = 8; // 1000

// ─── Costanti di sincronizzazione ────────────────────────────────────────────
const SYNC_NONE                = 0;
const SYNC_MANUAL_SET          = 1;  // Tempo settato manualmente
const SYNC_WAIT_LINE_SIGNAL    = 2;  // In attesa del segnale di sincronismo (esterno)
const SYNC_SET_BY_LINE_SIGNAL  = 3;  // Tempo impostato tramite segnale esterno
const SYNC_FIRST_GPS_SYNC      = 4;  // Prima sincronizzazione GPS in attesa
const SYNC_WAIT_GPS            = 5;  // In attesa della sincronizzazione GPS
const SYNC_GPS_SYNCED          = 6;  // Sincronizzato tramite GPS
const ELAPSED_WAITING_START    = 7;  // In attesa di un segnale di inizio cronometraggio
const ELAPSED_TIME_STARTED     = 8;  // Cronometraggio avviato

// ─── Costanti GPS ────────────────────────────────────────────────────────────
const GPS_TEST_REQUESTED = 1;  // FIX: era GPS_TEST_REQESTED (typo)
const GPS_TEST_DONE      = 0;

// ─── Costanti WiFi ───────────────────────────────────────────────────────────
const WIFI_STATUS_DISCONNECTED = 0;
const WIFI_STATUS_CONNECTING   = 1;  // FIX: era WIFI_STATUS_CONNECING (typo)
const WIFI_STATUS_CONNECTED    = 2;
const WIFI_STATUS_INTERNET_OK  = 3;

// ─── Costanti alimentazione ──────────────────────────────────────────────────
const POWER_MODE_NONE    = 0;  // Alimentatore esterno non collegato
const POWER_MODE_USB     = 1;  // Dispositivo alimentato da POWER BANK
const POWER_MODE_BATTERY = 2;  // Dispositivo alimentato a 12V

// ─── Variabili globali ───────────────────────────────────────────────────────
let prevPowerSource = 1;
let timeOffset = 0;

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
  5: "#808080ff"
};

const audioCache = {};

// ─── Helpers generici ────────────────────────────────────────────────────────

// FIX: rimosso parametro `url` inutilizzato
async function cacheAudioFiles() {
  for (const file of audioFiles) {
    const audio = new Audio();
    audio.src = file;
    await audio.load();
    audioCache[file] = audio;
  }
  console.log("Audio precaricati:", Object.keys(audioCache));
}

// FIX: estratta funzione helper per evitare il pattern ripetuto
//      fetch → mostra messaggio → cancella dopo N ms
function fetchAndShowMessage(url, elementId, duration = 3000) {
  fetch(url)
    .then(response => response.text())
    .then(msg => {
      document.getElementById(elementId).innerText = msg;
      setTimeout(() => { document.getElementById(elementId).innerText = ""; }, duration);
    })
    .catch(err => {
      document.getElementById(elementId).innerText = "Errore invio dati";
      console.error(err);
    });
}

// FIX: estratta funzione helper per evitare la duplicazione tra uploadFW/uploadFS
function uploadFile(fileInput, fieldName, endpoint, msgId) {
  const formData = new FormData();
  formData.append(fieldName, fileInput.files[0]);
  fetch(endpoint, { method: "POST", body: formData })
    .then(res => res.text())
    .then(msg => document.getElementById(msgId).innerText = msg)
    .catch(err => console.error(err));
}

function uploadFW() {
  const fileInput = document.getElementById("fw-file");
  if (fileInput.files.length === 0) { alert("Select a file first!"); return; }
  if (!fileInput.files[0].name.endsWith(".bin")) { alert("Firmware must be a .bin file!"); return; }
  uploadFile(fileInput, "fw", "/update", "fw-msg");
}

function uploadFS() {
  const fileInput = document.getElementById("fs-file");
  if (fileInput.files.length === 0) { alert("Select a file first!"); return; }
  uploadFile(fileInput, "fs", "/uploadFS", "fs-msg");
}

// ─── Helper ricaliolo tempi ──────────────────────────────────────────────────

// FIX: aggiunta funzione helper per evitare di chiamare sempre le due insieme
function recalcAll() {
  recalcDeltaTimes();
  recalcElapsedTimes();
}

// ─── Impostazioni campi checkpoint ───────────────────────────────────────────

function setCheckPointFields() {
  const l1         = document.getElementById("l1").value;
  const l2         = document.getElementById("l2").value;
  const l3         = document.getElementById("l3").value;
  const l4         = document.getElementById("l4").value;
  const competitor = document.getElementById("competitor").value;
  const lag1       = document.getElementById("lag1").value;
  const lag2       = document.getElementById("lag2").value;
  const lag3       = document.getElementById("lag3").value;
  const lag4       = document.getElementById("lag4").value;

  const url = `/setCheckPointFields?l1=${encodeURIComponent(l1)}&l2=${encodeURIComponent(l2)}&l3=${encodeURIComponent(l3)}&l4=${encodeURIComponent(l4)}&competitor=${encodeURIComponent(competitor)}&lag1=${encodeURIComponent(lag1)}&lag2=${encodeURIComponent(lag2)}&lag3=${encodeURIComponent(lag3)}&lag4=${encodeURIComponent(lag4)}`;

  console.log(url);
  fetchAndShowMessage(url, "fields-msg");
}

function setSettings() {
  const printToggle   = document.getElementById("printToggle");
  const printEnabled  = printToggle && printToggle.checked ? 1 : 0;
  const stationName   = document.getElementById("station-name-input").value;

  const url = `/setAttribute?printEnabled=${encodeURIComponent(printEnabled)}&stationName=${encodeURIComponent(stationName)}`;

  console.log(url);
  fetchAndShowMessage(url, "settings-field");
}

// ─── Popup connessione ────────────────────────────────────────────────────────

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

// ─── Timezone ─────────────────────────────────────────────────────────────────

function updateTimeOffset() {
  const tz = parseInt(document.getElementById("timezone-select").value);
  fetch(`/setOffset?offset=${tz}`)
    .then(res => res.text())
    .then(msg => console.log(msg));
}

// ─── Parametri / Settings ─────────────────────────────────────────────────────

function updateParams() {
  fetch('/allSettings')
    .then(res => {
      if (!res.ok) throw new Error("Errore nella fetch");
      return res.json();
    })
    .then(data => {
      console.log("Parametri ricevuti:", data);
      fillSettingsFields(data);
    })
    .catch(err => console.error("Errore:", err));
}

function fillSettingsFields(data) {
  console.log("Aggiorno settings...", data);

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
}

// ─── Modalità tempo ───────────────────────────────────────────────────────────

function setElapsedTimemode() {
  const url = `/setTime?mode=${encodeURIComponent(3)}`;
  console.log(url);
  fetchAndShowMessage(url, "settings-field");
}

function setTimeSyncMode() {
  const h           = document.getElementById("hour").value;
  const m           = document.getElementById("minute").value;
  const s           = document.getElementById("second").value;
  const mode        = document.getElementById("sync-method-select").value;
  const gpsInterval = document.getElementById("sync-interval-select").value;
  const utcOffset   = document.getElementById("timezone-select").value;
  // FIX: rimossa variabile stationName che veniva letta ma non inclusa nell'URL

  document.getElementById("hour").value   = "";
  document.getElementById("minute").value = "";
  document.getElementById("second").value = "";

  const url = `/setTime?hour=${encodeURIComponent(h)}&minute=${encodeURIComponent(m)}&second=${encodeURIComponent(s)}&mode=${encodeURIComponent(mode)}&gpsInterval=${encodeURIComponent(gpsInterval)}&utcOffset=${encodeURIComponent(utcOffset)}`;
  console.log(url);

  fetchAndShowMessage(url, "settings-field");
  document.getElementById("settingsOverlay").style.display = "none";
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function sendCheckPoint(lineNumber) {
  fetch(`/checkPoint?lineNumber=${lineNumber - 1}`)
    .then(res => res.text())
    .catch(err => console.error("Error fetching JSON:", err));
}

function clearSession() {
  document.getElementById("clearSessionOverlay").style.display = "flex";

  const btnConfirm = document.getElementById("clearSessionConfirm");
  const btnCancel  = document.getElementById("clearSessionCancel");

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

// ─── Wake Lock ────────────────────────────────────────────────────────────────

let wakeLock = null;

async function keepScreenOn() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      console.log("✅ Screen Wake Lock attivato");

      // FIX: rimosso il listener visibilitychange duplicato a livello globale;
      //      questo è l'unico posto corretto dove registrarlo
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

// ─── Input focus → seleziona tutto ───────────────────────────────────────────

document.querySelectorAll("input[type=text], input[type=number]").forEach(input => {
  input.addEventListener("focus", function () {
    this.select();
  });
});

// ─── WebSocket ───────────────────────────────────────────────────────────────

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

  try {
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
      showPopup();
      stopWatchdog();

      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectWebSocket();
        }, 1000);
      }
    };
  } catch (e) {
    console.log("❌ WebSocket connection error");
    wsConnecting = false;
  }
}

// ─── Tipi di messaggio WebSocket ─────────────────────────────────────────────

const TYPE_CHECKPOINT       = 0;
const TYPE_TIME_UPDATE      = 1;
const TYPE_SESSION_CLEARED  = 2;
const TYPE_PARAMS_UPDATED   = 3;
const TYPE_ROW_UPDATED      = 4;
const TYPE_GENERIC_MESSAGE  = 5;
const TYPE_EMAIL_SENT       = 6;

function handleMessage(data) {
  switch (data.t) {
    case TYPE_CHECKPOINT:
      addEventToTable(
        data.id, data.ln, data.lId, data.c,
        data.h, data.m, data.s, data.ms, 0
      );
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
      updateRowFromBroadcast(data);  // FIX: era updateRowFromBroadcas (typo)
      break;

    case TYPE_GENERIC_MESSAGE:
      console.log("⚙️ Generic message received:", data);
      showGeneralPopup(data.msg, "#3b55ffff", 3000);
      break;

    case TYPE_EMAIL_SENT:
      console.log("📧 Email sent confirmation:", data);
      showGeneralPopup("Email sent successfully!", "rgb(9, 139, 0)", 3000);
      break;
  }
}

window.addEventListener("beforeunload", () => {
  if (ws) {
    ws.close();
    ws = null;
  }
});

// ─── Watchdog WebSocket ───────────────────────────────────────────────────────

function startWatchdog() {
  stopWatchdog(); // evita doppioni

  watchdogTimer = setInterval(() => {
    const now = Date.now();
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

function stopWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

// ─── Messagebox OK ────────────────────────────────────────────────────────────

function showOkMessage(message) {
  document.getElementById("okMessageText").innerText = message;
  document.getElementById("okMessageOverlay").style.display = "flex";
}

document.getElementById("okMessageButton").addEventListener("click", function () {
  document.getElementById("okMessageOverlay").style.display = "none";
});

// ─── Popup generico ───────────────────────────────────────────────────────────

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

// ─── Alimentazione ────────────────────────────────────────────────────────────

function handlePowerUpdate(data) {
  if (prevPowerSource !== data.pw) {
    const printToggle = document.getElementById("printToggle");
    prevPowerSource = data.pw;

    if (prevPowerSource === POWER_MODE_NONE) {
      console.log("Switching to low power config");
      printToggle.checked  = 0;
      printToggle.disabled = 1;
    } else if (prevPowerSource === POWER_MODE_USB) {
      console.log("Switching to power bank power config");
      printToggle.checked  = 1;
      printToggle.disabled = 0;
    } else if (prevPowerSource === POWER_MODE_BATTERY) {
      console.log("Switching to battery bank power config");
      printToggle.checked  = 1;
      printToggle.disabled = 0;
    }
  }
}

// ─── Aggiornamento orologio da dati WebSocket ─────────────────────────────────

function updateClockFromData(data) {
  const hourAdj = (data.h + timeOffset + 24) % 24;

  document.getElementById("time").innerText =
    String(hourAdj).padStart(2, '0') + ":" +
    String(data.m).padStart(2, '0') + ":" +
    String(data.s).padStart(2, '0') + ".000";

  const statusElem = document.getElementById("status");
  const wifiNavBar = document.getElementById("wifiStatus");
  const gpsNavBar  = document.getElementById("gpsStatus");

  const fixFlags       = data.f;
  const syncEnabled    = (fixFlags & FLAG_SYNC_ENABLED) !== 0;
  const timeValid      = (fixFlags & FLAG_TIME_VALID) !== 0;
  const locationValid  = (fixFlags & FLAG_LOCATION_VALID) !== 0;
  const calRunning     = (fixFlags & FLAG_TIMEBASE_CALIBRATION) !== 0;

  if (calRunning) {
    showGeneralPopup("Timebase calibration running...", "#ff9800", 5000);
  }

  const syncStatus = data.sy;
  const wifiStatus = data.w;

  handlePowerUpdate(data);

  const syncTestIcon = document.getElementById("incon-sync-test");
  syncTestIcon.classList.add("disabled");

  const elapsedTimeControls = document.getElementById("elapsedTimeControls");
  elapsedTimeControls.classList.add("hidden");

  const btn = document.getElementById("sendEmailBtn");
  btn.disabled = true;
  btn.classList.add("disabled");

  const hasRows = document.querySelectorAll('#event-table tbody tr').length > 0;

  // FIX: uso WIFI_STATUS_CONNECTING (era WIFI_STATUS_CONNECING)
  if (wifiStatus === WIFI_STATUS_CONNECTED) {
    wifiNavBar.innerText = "🟡";
  } else if (wifiStatus === WIFI_STATUS_CONNECTING) {
    wifiNavBar.innerText = "🔄";
  } else if (wifiStatus === WIFI_STATUS_INTERNET_OK && hasRows) {
    wifiNavBar.innerText = "🟢";
    btn.disabled = false;
    btn.classList.remove("disabled");
  } else if (wifiStatus === WIFI_STATUS_DISCONNECTED) {
    wifiNavBar.innerText = "🔴";
  }

  // FIX: convertito da if...if...if a if/else if per efficienza e chiarezza
  if (syncStatus === SYNC_NONE) {
    document.getElementById("time").innerText = "00:00:00.000";
    statusElem.innerText = "Sync mode: Manual — Status: 🔴 not set";
  } else if (syncStatus === SYNC_MANUAL_SET) {
    statusElem.innerText = "Sync mode: Manual — Status: 🟢 OK";
  } else if (syncStatus === SYNC_WAIT_LINE_SIGNAL) {
    document.getElementById("time").innerText = "00:00:00.000";
    statusElem.innerText = "Sync mode: Line — Status: ⏳ waiting for trigger...";
  } else if (syncStatus === SYNC_SET_BY_LINE_SIGNAL) {
    statusElem.innerText = "Sync mode: Line — Status: 🟢 synced";
  } else if (syncStatus === SYNC_FIRST_GPS_SYNC || syncStatus === SYNC_WAIT_GPS) {
    statusElem.innerText = "Sync mode: GPS — Status: ⏳ waiting for signal...";
  } else if (syncStatus === SYNC_GPS_SYNCED) {
    const nextSync = data.lg - data.ls;
    syncTestIcon.classList.remove("disabled");

    if (data.ts === GPS_TEST_DONE) {
      if (data.lg !== 0) {
        if (nextSync > 86400) {
          statusElem.innerText = "Sync mode: GPS — Status: 🟢 One shot-sync";
        } else if (nextSync < 60) {
          statusElem.innerText = "Sync mode: GPS — Status: 🟢 synced (resync " + String(nextSync) + "s)";
        } else {
          statusElem.innerText = "Sync mode: GPS — Status: 🟢 synced (resync " + String(Math.trunc(nextSync / 60)) + "m)";
        }
      } else {
        statusElem.innerText = "Sync mode: GPS — Status: 🟢 synced (resync 1s)";
      }
    } else {
      statusElem.innerText = "Sync test: ⏱️ Waiting for the next minute to start... ";
    }
  } else if (syncStatus === ELAPSED_WAITING_START) {
    elapsedTimeControls.classList.remove("hidden");
    document.getElementById("startButton").innerText = "Start";
    document.getElementById("time").innerText = "00:00:00.000";
    statusElem.innerText = "🟢 Waiting for timing start...";
  } else if (syncStatus === ELAPSED_TIME_STARTED) {
    elapsedTimeControls.classList.remove("hidden");
    document.getElementById("startButton").innerText = "Stop";
    statusElem.innerText = "⏱️ Timing started! ";
  }

  if (timeValid && locationValid) {
    const tzOffsetAuto = Math.round(data.ln / 15);
    const offsetString = "UTC" + (tzOffsetAuto >= 0 ? "+" : "") + tzOffsetAuto;
    document.getElementById("pos").innerText =
      "🟢 Lat: " + data.lt.toFixed(6) + ", Lng: " + data.ln.toFixed(6) +
      ", Sat: " + data.st + " [" + offsetString + "]";
    gpsNavBar.innerText = "🟢 Lt: " + data.lt.toFixed(6) + ", Ln: " + data.ln.toFixed(6);
  } else if (timeValid || locationValid) {
    document.getElementById("pos").innerText = "🟡 Lat:--, Lng:--, Sat: 0, Fix:--";
    gpsNavBar.innerText = "🟡";
  } else {
    document.getElementById("pos").innerText = "🔴 Lat:--, Lng:--, Sat: 0, Fix:--";
    gpsNavBar.innerText = "🔴";
  }
}

// ─── Tabella eventi ───────────────────────────────────────────────────────────

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
        } catch (err) {
          console.warn("Errore parsing JSON:", err, line);
        }
      }
    });
  } catch (err) {
    console.error("Errore caricamento checkpoint:", err);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function printFixInfos() {
  const fixInfos = document.getElementById("pos").innerText.substring(2).split(",");
  sendToPrinter("GPS FIX INFOS:", 1);
  for (const element of fixInfos) {
    sendToPrinter(element, 1);
    await sleep(100);
  }
}

function sendToPrinter(text, cr) {
  const encodedText = encodeURIComponent(text);
  fetch(`/print?text=${encodedText}&${cr}`)
    .then(response => {
      if (!response.ok) throw new Error("Errore durante la stampa");
      console.log(`Stampa inviata -> ${encodedText}`);
    })
    .catch(error => console.error("Errore:", error));
}

// Accetta un oggetto checkpoint e richiama addEventToTable
function addEventToTableFromCheckpoint(checkpoint) {
  addEventToTable(
    checkpoint.id,
    checkpoint.ln,
    checkpoint.lId,
    checkpoint.c,
    checkpoint.h,
    checkpoint.m,
    checkpoint.s,
    checkpoint.ms,
    checkpoint.x
  );
}

function addEventToTable(rowIndex, lineNumber, lineId, competitor, hour, minute, seconds, millis, penality) {
  console.log(rowIndex, lineNumber, lineId, competitor, hour, minute, seconds, millis, penality);
  const tbody = document.querySelector("#event-table tbody");
  const row   = document.createElement("tr");

  row.classList.add("row-enter");

  const timestamp = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;

  const activeLines = Array.from(document.querySelectorAll(".toggle-btn:not(.inactive)"))
    .map(btn => btn.dataset.line);

  if (lineNumber !== 5 && activeLines.map(Number).includes(Number(lineNumber))) {
    playSound("/sound" + lineNumber + ".mp3");
  }

  row.setAttribute("data-line",       lineNumber);
  row.setAttribute("data-lineId",     lineId);
  row.setAttribute("data-competitor", competitor);
  row.setAttribute("data-hour",       hour);
  row.setAttribute("data-minute",     minute);
  row.setAttribute("data-millis",     millis);
  row.setAttribute("data-penality",   0);

  row.innerHTML = `
    <td class="col-index">${rowIndex}</td>
    <td style="background-color: ${lineColors[lineNumber] || "#f5f5f5"}" class="col-line">${lineNumber}</td>
    <td class="col-id">${lineId}</td>
    <td class="col-competitor">${competitor}</td>
    <td class="timestamp">${timestamp}</td>
    <td class="delta-time"></td>
    <td class="elapsed-time"></td>
    <td><button class="penality penality-btn">${penality}</button></td>
    <td><button class="edit-btn">✎</button></td>
    <td><button class="send-btn">➡</button></td>
  `;

  row.querySelector(".edit-btn").onclick = () => editRow(row.querySelector(".edit-btn"));
  row.querySelector(".send-btn").onclick = () => sendRow(row.querySelector(".send-btn"));

  tbody.insertBefore(row, tbody.firstChild);

  // forza reflow (FONDAMENTALE per l'animazione)
  row.offsetHeight;
  row.classList.add("row-enter-active");

  setTimeout(() => {
    row.classList.remove("row-enter");
    row.classList.remove("row-enter-active");
  }, 1500);

  applyLineFilter();
}

// ─── Calcolo tempi ────────────────────────────────────────────────────────────

function timestampToMs(ts) {
  const [time, ms] = ts.split(".");
  const [h, m, s]  = time.split(":").map(Number);
  return ((h * 3600 + m * 60 + s) * 1000) + Number(ms);
}

function formatDelta(ms, signed) {
  if (ms > 0) return "—";

  const sign = signed ? "+" : "";
  ms = Math.abs(ms);

  const hours   = Math.floor(ms / 3600000);
  ms %= 3600000;
  const minutes = Math.floor(ms / 60000);
  ms %= 60000;
  const seconds = Math.floor(ms / 1000);
  const millis  = ms % 1000;

  return (
    sign +
    String(hours).padStart(2, "0") + ":" +
    String(minutes).padStart(2, "0") + ":" +
    String(seconds).padStart(2, "0") + "." +
    String(millis).padStart(3, "0")
  );
}

function recalcElapsedTimes() {
  const rows = Array.from(
    document.querySelectorAll("#event-table tbody tr")
  ).filter(row => row.style.display !== "none");

  const firstRow    = rows[rows.length - 1];
  const firstTsCell = firstRow ? firstRow.querySelector(".timestamp") : null;
  const firstTimeMs = firstTsCell ? timestampToMs(firstTsCell.textContent.trim()) : null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const row       = rows[i];
    const tsCell    = row.querySelector(".timestamp");
    const deltaCell = row.querySelector(".elapsed-time");
    if (!tsCell || !deltaCell) continue;

    const currentMs = timestampToMs(tsCell.textContent.trim());
    deltaCell.textContent = formatDelta(firstTimeMs - currentMs, false);
  }
}

function recalcDeltaTimes() {
  const rows = Array.from(
    document.querySelectorAll("#event-table tbody tr")
  ).filter(row => row.style.display !== "none");

  let nextTime = null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const row       = rows[i];
    const tsCell    = row.querySelector(".timestamp");
    const deltaCell = row.querySelector(".delta-time");
    if (!tsCell || !deltaCell) continue;

    row.classList.remove("negative-row");

    const timestamp = tsCell.textContent.trim();
    const currentMs = timestampToMs(timestamp);

    if (timestamp === "00:00:00.000") {
      row.classList.add("negative-row");
    }

    if (nextTime === null) {
      deltaCell.textContent = "—";
      nextTime = currentMs;
      continue;
    }

    const delta = nextTime - currentMs;
    if (delta > 0) {
      deltaCell.textContent = "—";
      row.classList.add("negative-row");
    } else {
      deltaCell.textContent = formatDelta(delta, true);
    }

    nextTime = currentMs;
  }
}

// ─── Filtro linee ─────────────────────────────────────────────────────────────

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

  recalcAll(); // FIX: sostituisce le due chiamate separate
  updateVisibleColumns();
}

// ─── Edit / Save / Send riga ──────────────────────────────────────────────────

function editRow(button) {
  const row = button.closest("tr");

  row.querySelectorAll(".col-id, .col-competitor, .timestamp").forEach(cell => {
    if (cell.querySelector("input")) return;

    const value = cell.textContent.trim();

    if (cell.classList.contains("col-id")) {
      cell.innerHTML = `<input type="number" value="${value}" style="width:90%">`;
    } else if (cell.classList.contains("timestamp")) {
      cell.innerHTML = `
        <input type="text" value="${value}" style="width:90%"
          maxlength="12"
          placeholder="hh:mm:ss.mmm"
          oninput="maskTimeInput(this)">
      `;
    } else if (
      cell.classList.contains("delta-time-col") ||
      cell.classList.contains("elapsed-time-col")
    ) {
      cell.innerHTML = `<input type="number" step="any" value="${value}" style="width:90%">`;
    } else {
      cell.innerHTML = `<input type="text" value="${value}" style="width:90%">`;
    }
  });

  button.textContent = "💾";
  button.onclick = () => saveRow(button);
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

function saveRow(button) {
  const row = button.closest("tr");

  row.querySelectorAll("input").forEach((input, i) => {
    const newValue = input.value.trim();
    input.parentElement.textContent = newValue;

    switch (i) {
      case 0: row.dataset.lineId = Number(newValue); break;
      case 1: row.dataset.competitor = newValue; break;
      case 2: {
        const [hms, ms] = newValue.split(".");
        const [h, m, s] = hms.split(":");
        row.dataset.hour   = Number(h);
        row.dataset.minute = Number(m);
        row.dataset.millis = Number(ms);
        break;
      }
    }
  });

  const penalityBtn = row.querySelector(".penality-btn");
  if (penalityBtn) row.dataset.penality = Number(penalityBtn.textContent.trim());

  button.textContent = "✎";
  button.onclick = () => editRow(button);

  const editBtn = row.querySelector(".edit-btn");
  const sendBtn = row.querySelector(".send-btn");
  if (editBtn) editBtn.onclick = () => editRow(editBtn);
  if (sendBtn) sendBtn.onclick = () => sendRow(sendBtn);

  sendUpdatedCheckPointRow(row);
  recalcDeltaTimes();
}

function sendUpdatedCheckPointRow(row) {
  const index     = parseInt(row.cells[0].textContent.trim());
  const cells     = row.querySelectorAll("td");
  const timestamp = cells[4].textContent.trim();
  const [timePart, millisPart] = timestamp.split(".");
  const [hour, minute, second] = timePart.split(":");
  const penality  = Number(row.dataset.penality) || 0;

  const messageObj = {
    index,
    lineNumber:  parseInt(cells[1].textContent.trim()),
    lineId:      parseInt(cells[2].textContent.trim()),
    competitor:  parseInt(cells[3].textContent.trim()),
    hour:        parseInt(hour),
    minute:      parseInt(minute),
    second:      parseInt(second),
    millis:      parseInt(millisPart),
    penality
  };

  console.log("Invio aggiornamento riga:", messageObj);

  fetch("/updateCheckPointRow", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(messageObj)
  })
    .then(res => res.text())
    .then(resp => console.log("ESP response:", resp))
    .catch(err => console.error("Error sending JSON to ESP:", err));
}

function sendRow(button) {
  const row   = button.closest("tr");
  const index = parseInt(row.cells[0].textContent.trim());
  const cells = row.querySelectorAll("td");

  const timestamp = cells[4].textContent.trim();
  const [timePart, millisPart] = timestamp.split(".");
  const [hour, minute, second] = timePart.split(":");

  const messageObj = {
    index,
    lineNumber: parseInt(cells[1].textContent.trim()),
    lineId:     cells[2].textContent.trim(),
    competitor: cells[3].textContent.trim(),
    hour:       parseInt(hour),
    minute:     parseInt(minute),
    second:     parseInt(second),
    millis:     parseInt(millisPart)
  };

  console.log("Invio:", messageObj);
  sendCheckPointRow(messageObj);
}

function sendCheckPointRow(data) {
  fetch("/sendCheckPointRow", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(data)
  })
    .then(res => res.text())
    .then(resp => console.log("ESP response:", resp))
    .catch(err => console.error("Error sending JSON to ESP:", err));
}

// ─── Toggle filtri linea ──────────────────────────────────────────────────────

document.querySelectorAll('.toggle-btn').forEach(el => {
  if (el.tagName === "BUTTON") {
    const color = el.dataset.color;
    el.style.backgroundColor = color;

    el.addEventListener('click', () => {
      if (el.classList.contains('inactive')) {
        el.classList.remove('inactive');
        el.style.backgroundColor = color;
      } else {
        el.classList.add('inactive');
        el.style.backgroundColor = '#ccc';
      }
      el.classList.toggle('active');
      applyLineFilter();
    });
  } else if (el.tagName === "INPUT" && el.type === "checkbox") {
    el.addEventListener('change', applyLineFilter);
  }
});

// ─── Download sessione ────────────────────────────────────────────────────────

async function downloadSession() {
  try {
    const response = await fetch('/downloadSession');
    if (!response.ok) {
      showOkMessage("No session data available to download.");
      return;
    }

    const text      = await response.text();
    const cleanText = text.replace(/^\uFEFF/, '').trim();
    const lines     = cleanText.split(/\r?\n/);

    const now       = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');

    const arrayJson = lines.map(line => JSON.parse(line));
    const csv       = jsonToCsvTimeStamp(arrayJson);

    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
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
  const keys   = Object.keys(array[0]);
  const header = keys.join(';');
  const rows   = array.map(obj =>
    keys.map(k => {
      let val = obj[k];
      if (typeof val === 'string') val = '"' + val.replace(/"/g, '""') + '"';
      return val;
    }).join(';')
  );
  return [header, ...rows].join('\r\n');
}

function jsonToCsvTimeStamp(array) {
  if (!array.length) return '';
  const keys   = Object.keys(array[0]);
  const header = `ID;Line number;Line ID;Competitor;Timestamp`;

  const rows = array.map(obj => {
    const fixedCols = keys.slice(0, 4).map(k => {
      let val = obj[k];
      if (typeof val === 'string') val = '"' + val.replace(/"/g, '""') + '"';
      return val;
    }).join(';');

    const h   = obj[keys[4]];
    const min = obj[keys[5]];
    const sec = obj[keys[6]];
    const ms  = obj[keys[7]];
    const timestamp = `${h}:${min}:${sec}:${ms}`;

    return `${fixedCols};${timestamp}`;
  });

  return [header, ...rows].join('\r\n');
}

// ─── Listener input dinamici ──────────────────────────────────────────────────

document.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
  input.removeEventListener('change', handleInputUpdate);
  input.addEventListener('change', handleInputUpdate);
});

function handleInputUpdate(e) {
  const lineNumber = e.target.dataset.line;
  if (!lineNumber) return;

  const data = {
    l:  Number(lineNumber),
    ld: String(document.querySelector(`#l${lineNumber}`).value),
    c:  Number(document.querySelector(`#c${lineNumber}`).value),
    d:  Number(document.querySelector(`#d${lineNumber}`).value) || 0
  };

  sendSettingsRowData(data);
}

function sendSettingsRowData(data) {
  console.log("Invio dati al server:", data);
  fetch('/checkPointFields', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data)
  })
    .then(res => res.ok
      ? console.log(`✅ Riga ${data.l} aggiornata`)
      : console.error(`❌ Errore aggiornando linea ${data.l}`)
    )
    .catch(err => console.error('Errore di rete:', err));
}

// ─── Fullscreen ───────────────────────────────────────────────────────────────

function toggleFullscreen(checkbox) {
  if (checkbox.checked) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
  }
}

// ─── Inizializzazione DOM ─────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  console.log("Connetto webSocket...");
  connectWebSocket();

  console.log("Carico parametri...");
  updateParams();

  console.log("Carico checkpoint salvati...");
  populateTableFromSaved();

  console.log("Richiedo always on display...");
  keepScreenOn();

  console.log("Carica audio files nella cache...");
  cacheAudioFiles();

  console.log("Imposto toggle delta time a default...");
  const chk = document.getElementById("toggle-delta-time");
  toggleDeltaTimeColumn(chk.checked);
});

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

// ─── Audio ────────────────────────────────────────────────────────────────────

function playSound(name) {
  audioCache[name].currentTime = 0;
  audioCache[name].play();
}

// ─── Service Worker ───────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('✅ Service Worker registrato:', reg))
    .catch(err => console.error('❌ Registrazione SW fallita:', err));
}

// ─── Splash screen ────────────────────────────────────────────────────────────

window.addEventListener("load", () => {
  const splash = document.getElementById("splash");

  setTimeout(() => { splash.classList.add("finished"); }, 1000);
  setTimeout(() => { splash.remove(); }, 2000);
  setTimeout(() => {
    console.log("Richiedo Full-screen popup...");
    document.getElementById('fullscreenOverlay').style.display = 'flex';
  }, 2500);
});

// ─── Popup orario ─────────────────────────────────────────────────────────────

document.getElementById("time").addEventListener("click", () => {
  document.getElementById("timeChoiceOverlay").style.display = "flex";
});

function onTimeSettingsAction() {
  updateParams();
  document.getElementById("timeChoiceOverlay").style.display = "none";
  document.getElementById("settingsOverlay").style.display  = "flex";
}

function onSyncTestAction() {
  document.getElementById("timeChoiceOverlay").style.display = "none";
  const url = `/syncTest`;
  console.log(url);
  fetchAndShowMessage(url, "settings-field");
}

function onGoHomeAction() {
  document.getElementById("timeChoiceOverlay").style.display = "none";
}

document.getElementById("closeTimePopup").addEventListener("click", () => {
  document.getElementById("settingsOverlay").style.display = "none";
});

function setTimeManualPopup(hh, mm, ss) {
  console.log("Imposto tempo:", hh, mm, ss);
}

// ─── Visibilità impostazioni tempo ────────────────────────────────────────────

function updateTimeSettingsVisibility() {
  const method = document.getElementById("sync-method-select").value;

  document.querySelectorAll('.manual-sync, .gps-sync')
    .forEach(el => el.classList.add('hidden'));

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
  const hour          = document.getElementById("hour");
  const minute        = document.getElementById("minute");
  const message       = document.getElementById("time-settings-field");
  const manualSyncRow = document.querySelector(".toggle-row.manual-sync");

  console.log("Apply!");

  if (manualSyncRow.classList.contains("hidden")) {
    console.log("Controlli hidden!");
    setTimeSyncMode();
    return;
  }

  const validHour   = hour.value !== "" && hour.value >= 0 && hour.value <= 23;
  const validMinute = minute.value !== "" && minute.value >= 0 && minute.value <= 59;

  if (validHour && validMinute) {
    console.log("Sincronizzo!");
    message.textContent = "";
    setTimeSyncMode();
  } else {
    console.log("Tempo non impostato!");
    message.textContent  = "Enter a valid hour and minute.";
    message.style.color  = "red";
  }
}

// ─── Toggle colonne tabella ───────────────────────────────────────────────────

function toggleDeltaTimeColumn(show) {
  const display = show ? "table-cell" : "none";
  document.querySelectorAll("th.delta-time-col").forEach(th => { th.style.display = display; });
  document.querySelectorAll("td.delta-time").forEach(td => { td.style.display = display; });
  if (show) recalcAll(); // FIX: sostituisce le due chiamate separate
}

function toggleTimestampColumn(show) {
  const display = show ? "table-cell" : "none";
  document.querySelectorAll("th.timestamp-col").forEach(th => { th.style.display = display; });
  document.querySelectorAll("td.timestamp").forEach(td => { td.style.display = display; });
}

function toggleElapsedTimeColumn(show) {
  const display = show ? "table-cell" : "none";
  document.querySelectorAll("th.elapsed-time-col").forEach(th => { th.style.display = display; });
  document.querySelectorAll("td.elapsed-time").forEach(td => { td.style.display = display; });
  if (show) recalcElapsedTimes();
}

function togglePenalityColumn(show) {
  const display = show ? "table-cell" : "none";
  document.querySelectorAll("th.penality-col").forEach(th => { th.style.display = display; });
  document.querySelectorAll("td:has(.penality)").forEach(td => { td.style.display = display; });
  if (show) recalcElapsedTimes();
}

function updateVisibleColumns() {
  toggleTimestampColumn(document.getElementById("toggle-timestamp").checked);
  toggleElapsedTimeColumn(document.getElementById("toggle-elapsed-time").checked);
  toggleDeltaTimeColumn(document.getElementById("toggle-delta-time").checked);
  togglePenalityColumn(document.getElementById("toggle-penality").checked);
}

document.getElementById("toggle-delta-time").addEventListener("change", e => {
  toggleDeltaTimeColumn(e.target.checked);
});
document.getElementById("toggle-timestamp").addEventListener("change", e => {
  toggleTimestampColumn(e.target.checked);
});
document.getElementById("toggle-elapsed-time").addEventListener("change", e => {
  toggleElapsedTimeColumn(e.target.checked);
});
document.getElementById("toggle-penality").addEventListener("change", e => {
  togglePenalityColumn(e.target.checked);
});

// ─── Header tabella → popup impostazioni colonne ─────────────────────────────

const headerRow = document.querySelector("#event-table thead tr");
headerRow.style.cursor = "pointer";
headerRow.addEventListener("click", () => {
  document.getElementById("tableSettingsOverlay").style.display = "flex";
});
document.getElementById("closeTablePopup").addEventListener("click", () => {
  document.getElementById("tableSettingsOverlay").style.display = "none";
});

// ─── Aggiornamento riga da broadcast WebSocket ────────────────────────────────

// FIX: rinominata da updateRowFromBroadcas (typo) a updateRowFromBroadcast
function updateRowFromBroadcast(data) {
  const tbody = document.getElementById("event-table").querySelector("tbody");

  console.log("Aggiorno riga da broadcast:", data);

  const index = Number(data.id);
  if (isNaN(index)) return;

  const row = [...tbody.rows].find(r =>
    Number(r.querySelector("td")?.textContent) === index
  );

  if (!row) {
    console.warn("Row not found:", index);
    return;
  }

  if (row.querySelector("input")) {
    console.warn("Row in edit, skipped:", index);
    return;
  }

  const idCell = row.querySelector(".col-id");
  if (idCell && data.lId !== undefined) idCell.textContent = data.lId;

  const competitorCell = row.querySelector(".col-competitor");
  if (competitorCell && data.c !== undefined) competitorCell.textContent = data.c;

  const timeCell = row.querySelector(".timestamp");
  if (timeCell) timeCell.textContent = formatTime(data.h, data.m, data.s, data.ms);

  const penalityBtn = row.querySelector(".penality");
  if (penalityBtn) penalityBtn.textContent = data.x;

  showGeneralPopup(`Row ${index} has been updated`, lineColors[data.ln]);
  recalcAll(); // FIX: sostituisce le due chiamate separate
}

function formatTime(h, m, s, ms) {
  return (
    String(h).padStart(2, "0") + ":" +
    String(m).padStart(2, "0") + ":" +
    String(s).padStart(2, "0") + "." +
    String(ms).padStart(3, "0")
  );
}

// ─── Penalità ─────────────────────────────────────────────────────────────────

let currentPenaltyButton = null;

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("penality-btn")) {
    currentPenaltyButton = e.target;
    document.getElementById("penalty-input").value =
      currentPenaltyButton.textContent.trim() || 0;
    document.getElementById("assingPenality").style.display = "flex";
  }
});

document.getElementById("confirmPenalityButton").addEventListener("click", () => {
  if (!currentPenaltyButton) return;

  const value = Number(document.getElementById("penalty-input").value) || 0;
  currentPenaltyButton.textContent = value;

  const row = currentPenaltyButton.closest("tr");
  row.dataset.penality = value;

  console.log("Valore del dataset", value);
  document.getElementById("assingPenality").style.display = "none";
  currentPenaltyButton = null;

  sendUpdatedCheckPointRow(row);
});

// ─── Download vista attuale ───────────────────────────────────────────────────

function normalizeHeader(text) {
  return text
    .replace(/❌/g, "penality")
    .replace(/⏱️/g, "time")
    .replace(/\s+/g, " ")
    .replace("Δ", "Delta")
    .trim();
}

function downloadActualView() {
  const now      = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const filename  = `table_view_${timestamp}.csv`; // FIX: aggiunto const (era variabile globale implicita)

  const table = document.getElementById("event-table");
  if (!table) return;

  const isVisible = (el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  };

  const rows            = [];
  const headerCells     = Array.from(table.querySelectorAll("thead th"));
  const visibleIndexes  = [];
  const headerRow       = [];

  headerCells.forEach((th, i) => {
    const text = normalizeHeader(th.innerText); // FIX: rimosso doppio punto e virgola
    if (["edit", "send"].includes(text.toLowerCase())) return;
    if (isVisible(th)) {
      visibleIndexes.push(i);
      headerRow.push(text);
    }
  });

  rows.push(headerRow.join(";"));

  table.querySelectorAll("tbody tr").forEach(tr => {
    if (!isVisible(tr)) return;

    const cells = tr.querySelectorAll("td");
    if (cells.length < Math.max(...visibleIndexes) + 1) return;

    const row = [];
    visibleIndexes.forEach(i => {
      let text = cells[i].innerText || "";
      text = text.replace(/\n/g, " ").replace(/;/g, ",");
      row.push(text);
    });

    if (row.every(v => v === "")) return;
    rows.push(row.join(";"));
  });

  const csvContent = rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── WiFi ─────────────────────────────────────────────────────────────────────

function connectWiFi() {
  const ssid = document.getElementById("wifi-ssid").value;
  const pw   = document.getElementById("wifi-password").value;

  fetch(`/wifiConnect?ssid=${encodeURIComponent(ssid)}&pw=${encodeURIComponent(pw)}`)
    .then(r => r.text())
    .then(t => console.log(t))
    .catch(e => console.error(e));

  document.getElementById("wifiOverlay").style.display = "none";
}

document.getElementById("wifi-notify").addEventListener("click", () => {
  fetch('/wifiCredential')
    .then(res => {
      if (!res.ok) throw new Error("Errore nella fetch");
      return res.json();
    })
    .then(data => {
      console.log("Credenziali ricevute:", data);
      document.getElementById("wifi-ssid").value      = data.ssid;
      document.getElementById("wifi-password").value  = data.pw;
    })
    .catch(err => console.error("Errore:", err));

  document.getElementById("wifiOverlay").style.display = "flex";
});

function closeWiFiPopup() {
  document.getElementById("wifiOverlay").style.display = "none";
}

function togglePassword() {
  const pwInput = document.getElementById("wifi-password");
  const toggle  = document.getElementById("show-password");
  pwInput.type  = toggle.checked ? "text" : "password";
}

document.getElementById("gps-notify").addEventListener("click", () => {
  document.getElementById("settingsOverlay").style.display = "flex";
});

// ─── Email ────────────────────────────────────────────────────────────────────

function sendActualView() {
  openEmailPopup();
}

function openEmailPopup() {
  document.getElementById("emailOverlay").style.display = "flex";
}

function closeEmailPopup() {
  document.getElementById("emailOverlay").style.display = "none";
}

async function sendEmail(emailAddress) {
  const url      = `/email?address=${encodeURIComponent(emailAddress)}`;
  console.log(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
  const text = await response.text();
  console.log("Richiesta di email inviata", text);
}

async function confirmEmail() {
  const email  = document.getElementById("user-email").value.trim();
  const status = document.getElementById("email-status-field");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    status.textContent = "Invalid email format";
    status.style.color = "red";
    return;
  }

  status.textContent = "Email confirmed ✔";
  status.style.color = "green";

  try {
    await sendEmail(email);
    status.textContent = "Request sent ✔";
    status.style.color = "green";
    setTimeout(closeEmailPopup, 1000);
  } catch (err) {
    status.textContent = "Error request sending email";
    status.style.color = "red";
  }
}