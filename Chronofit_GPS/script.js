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
  5: "#808080ff" // giallo tenue
};


// ── Precisione temporale ──────────────────────────────────────
// 1 = decimi, 2 = centesimi, 3 = millisecondi
let timePrecision = 3;

function onTimePrecisionChange(val) {
  val = Math.max(1, Math.min(3, parseInt(val) || 3));
  timePrecision = val;
  document.getElementById("time-precision").value = val;
  refreshAllTimestamps();
  recalcDeltaTimes();
  recalcElapsedTimes();
  saveViewPrefs();
}

function truncateMs(ms) {
  if (timePrecision === 1) return Math.floor(ms / 100) * 100;
  if (timePrecision === 2) return Math.floor(ms / 10)  * 10;
  return ms;
}

function refreshAllTimestamps() {
  document.querySelectorAll("#event-table tbody tr").forEach(row => {
    const tsCell = row.querySelector(".timestamp");
    if (!tsCell || tsCell.querySelector("input")) return;
    const h  = parseInt(row.dataset.hour     ?? 0);
    const m  = parseInt(row.dataset.minute   ?? 0);
    const s  = parseInt(row.dataset.seconds  ?? 0);
    const ms = parseInt(row.dataset.msRaw    ?? 0);
    tsCell.textContent = formatTime(h, m, s, ms);
  });
}

// Converte i data-* raw di una riga in ms (con troncamento precisione)
function rowToMs(row) {
  const h  = parseInt(row.dataset.hour    ?? 0);
  const m  = parseInt(row.dataset.minute  ?? 0);
  const s  = parseInt(row.dataset.seconds ?? 0);
  const ms = parseInt(row.dataset.msRaw   ?? 0);
  return ((h * 3600 + m * 60 + s) * 1000) + truncateMs(ms);
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

function setCheckPointFields() {

  const l1 = document.getElementById("l1").value;
  const l2 = document.getElementById("l2").value;
  const l3 = document.getElementById("l3").value;
  const l4 = document.getElementById("l4").value;
  const competitor = document.getElementById("competitor").value;
  const lag1 = document.getElementById("lag1").value;
  const lag2 = document.getElementById("lag2").value;
  const lag3 = document.getElementById("lag3").value;
  const lag4 = document.getElementById("lag4").value;

  const url = `/setCheckPointFields?l1=${encodeURIComponent(l1)}&l2=${encodeURIComponent(l2)}&l3=${encodeURIComponent(l3)}&l4=${encodeURIComponent(l4)}&competitor=${encodeURIComponent(competitor)}&lag1=${encodeURIComponent(lag1)}&lag2=${encodeURIComponent(lag2)}&lag3=${encodeURIComponent(lag3)}&lag4=${encodeURIComponent(lag4)}`;

  console.log(url);

  fetch(url)
    .then(response => response.text())
    .then(msg => {
      document.getElementById("fields-msg").innerText = msg;
      setTimeout(() => { document.getElementById("fields-msg").innerText = ""; }, 3000);
    })
    .catch(err => {
      document.getElementById("fields-msg").innerText = "Errore invio dati";
      console.error(err);
    });
}

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
      document.getElementById("settings-field").innerText = "Errore invio dati";
      console.error(err);
    });

}

let connectionLost = false;
let wifiConnecting = false;
const popup = document.getElementById("popup");

function showPopup() {
  if (!popup.classList.contains("show")) {
    popup.innerText = wifiConnecting
      ? "⏳ Connecting to WiFi, please wait..."
      : "No connection to Chronofit device";
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

function saveViewPrefs() {
  const prefs = {
    timestamp:     document.getElementById("toggle-timestamp").checked,
    deltaTime:     document.getElementById("toggle-delta-time").checked,
    elapsedTime:   document.getElementById("toggle-elapsed-time").checked,
    penality:      document.getElementById("toggle-penality").checked,
    timePrecision: document.getElementById("time-precision").value,
    lines: {}
  };
  document.querySelectorAll(".toggle-btn[data-line]").forEach(btn => {
    if (btn.tagName === "BUTTON") {
      prefs.lines[btn.dataset.line] = !btn.classList.contains("inactive");
    } else if (btn.tagName === "INPUT" && btn.type === "checkbox") {
      prefs.lines[btn.dataset.line] = btn.checked;
    }
  });
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
    setChk("toggle-timestamp",    prefs.timestamp);
    setChk("toggle-delta-time",   prefs.deltaTime);
    setChk("toggle-elapsed-time", prefs.elapsedTime);
    setChk("toggle-penality",     prefs.penality);

    if (prefs.timePrecision !== undefined) {
      const val = Math.max(1, Math.min(3, parseInt(prefs.timePrecision) || 3));
      timePrecision = val;
      document.getElementById("time-precision").value = val;
    }

    if (prefs.lines) {
      document.querySelectorAll(".toggle-btn[data-line]").forEach(btn => {
        const active = prefs.lines[btn.dataset.line];
        if (active === undefined) return;
        if (btn.tagName === "BUTTON") {
          const color = btn.dataset.color;
          if (active) {
            btn.classList.remove("inactive");
            btn.style.backgroundColor = color;
          } else {
            btn.classList.add("inactive");
            btn.style.backgroundColor = "#ccc";
          }
        } else if (btn.tagName === "INPUT" && btn.type === "checkbox") {
          btn.checked = active;
        }
      });
    }

    updateVisibleColumns();
    applyLineFilter();
  } catch(e) {
    console.warn("Errore ripristino preferenze:", e);
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
  //document.getElementById("gpsToggle").checked = data.gps ?? 0;

  document.getElementById("sync-method-select").value = data.sm;
  document.getElementById("sync-method-select").dispatchEvent(new Event("change"));
  document.getElementById("sync-interval-select").value = data.si ?? 0

  const printToggle = document.getElementById("printToggle");
  printToggle.checked = (data.print == 1);

  const buzzerToggle = document.getElementById("buzzerToggle");
  buzzerToggle.checked = (data.bz == 1);

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
  
  document.getElementById("settingsOverlay").style.display = "none"
}

function sendCheckPoint(lineNumber) {
  // Invia la richiesta al server aggiungendo il numero della linea come query
  fetch(`/checkPoint?lineNumber=${lineNumber-1}`)
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


/* function clearSession() {
  if (confirm("Sei sicuro di voler cancellare tutti i checkpoint?")) {
    fetch("/clearSession")
      .then(response => response.text())
      .then(msg => alert(msg))
      .catch(err => alert("Errore: " + err));
  }
} */


function clearSession() {
  // mostra popup
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
    showPopup();
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

function handleMessage(data) {
  switch (data.t) {
    case TYPE_CHECKPOINT:
      addEventToTable(
        data.id,
        data.ln,
        data.lId,
        data.c,
        data.h,
        data.m,
        data.s,
        data.ms,
        0
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
      // Quando il WebSocket si riapre, resettiamo il flag
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

    if(wifiStatus == WIFI_STATUS_CONNECTED){
      wifiNavBar.innerText =  "🟡";
    }else if(wifiStatus == WIFI_STATUS_CONNECING){
      wifiNavBar.innerText =  "🔄";
    }else if(wifiStatus == WIFI_STATUS_INTERNET_OK && hasRows){
      wifiNavBar.innerText =  "🟢";
      btn.disabled = false;
      btn.classList.remove("disabled");
    }else if(wifiStatus == WIFI_STATUS_DISCONNECTED){
      wifiNavBar.innerText =  "🔴";
    }

    if(syncStatus === SYNC_NONE){
      document.getElementById("time").innerText = "00:00:00.000";
      statusElem.innerText = "Sync mode: Manual — Status: 🔴 not set";
    }
    if(syncStatus === SYNC_MANUAL_SET){
      statusElem.innerText = "Sync mode: Manual — Status: 🟢 OK"
    }
    if(syncStatus === SYNC_WAIT_LINE_SIGNAL){
      document.getElementById("time").innerText = "00:00:00.000";
      statusElem.innerText = "Sync mode: Line — Status: ⏳ waiting for trigger..."
    }
    if(syncStatus === SYNC_SET_BY_LINE_SIGNAL){
      statusElem.innerText = "Sync mode: Line — Status: 🟢 synced";
    }
    if(syncStatus === SYNC_FIRST_GPS_SYNC || syncStatus === SYNC_WAIT_GPS){
      statusElem.innerText = "Sync mode: GPS — Status: ⏳ waiting for signal..."
    }if(syncStatus === SYNC_GPS_SYNCED && ppsDetected){
      const lastSync = data.ls;
      const GPSRefreshInterval = data.lg;
      const nextSync = data.lg - data.ls;
      syncTestIcon.classList.remove("disabled");

      if(data.ts == GPS_TEST_DONE)
      {
        if(data.lg != 0){
          
          if(nextSync > 86400)
          {
            statusElem.innerText = "Sync mode: GPS — Status: 🟢 One shot-sync";
          }
          else if(nextSync < 60)
          {
            statusElem.innerText = "Sync mode: GPS — Status: 🟢 synced (resync " + String(nextSync) + "s)";
          }
          else
          {
            statusElem.innerText = "Sync mode: GPS — Status: 🟢 synced (resync " + String(Math.trunc(nextSync/60)) + "m)";
          }

        }else{
          statusElem.innerText = "Sync mode: GPS — Status: 🟢 synced (resync 1s)";
        }
      }else{
        statusElem.innerText = "Sync test: ⏱️ Waiting for the next minute to start... ";
      }

    }
    if(syncStatus == ELAPSED_WAITING_START){
      elapsedTimeControls.classList.remove("hidden");
      const startButton = document.getElementById("startButton");
      startButton.innerText = "Start";
      document.getElementById("time").innerText = "00:00:00.000";
      statusElem.innerText = "🟢 Waiting for timing start...";
    }if(syncStatus == ELAPSED_TIME_STARTED){
      elapsedTimeControls.classList.remove("hidden");
      const startButton = document.getElementById("startButton");
      startButton.innerText = "Stop";
      statusElem.innerText = "⏱️ Timing started! ";
    }
    
  
  if(timeValid && locationValid && ppsDetected){
    let tzOffsetAuto = Math.round(data.ln / 15); 
    let offsetString =  "UTC" + (tzOffsetAuto >=0 ? "+" : "") + tzOffsetAuto;
    document.getElementById("pos").innerText = "🟢 " + "Lat: " 
      + data.lt.toFixed(6) + ", Lng: " + data.ln.toFixed(6) + ", Sat: " + data.st + " [" + offsetString +"]";

    gpsNavBar.innerText = "🟢 Lt: " + data.lt.toFixed(6) + ", Ln: " + data.ln.toFixed(6);
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
}

let eventRows = []; // esempio

function clearEventTableRows() {
  document.querySelector("#event-table tbody").innerHTML = "";
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
  const url = `/print?text=${encodedText}&${cr}`;

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
  // checkpoint deve avere: index, lineNumber, lineId, competitor, hour, minute, millis
  const rowIndex = checkpoint.id;
  const lineNumber = checkpoint.ln;
  const lineId = checkpoint.lId; // correggiamo qui: "lineId", non "line"
  const competitor = checkpoint.c;
  const hour = checkpoint.h;
  const minute = checkpoint.m;
  const second = checkpoint.s;
  const millis = checkpoint.ms;
  const penality = checkpoint.x;

  // Richiama la funzione originale
  addEventToTable(rowIndex, lineNumber, lineId, competitor, hour, minute, second, millis, penality);
}


function addEventToTable(rowIndex, lineNumber, lineId, competitor, hour, minute, seconds, millis, penality) {
  console.log(rowIndex, lineNumber, lineId, competitor, hour, minute, seconds, millis, penality);
  const tbody = document.querySelector("#event-table tbody");
  const row = document.createElement("tr");

  // subito dopo: const row = document.createElement("tr");
  row.classList.add("row-enter");

  const timestamp = formatTime(hour, minute, seconds, millis);
  const index = rowIndex;

  const activeLines = Array.from(document.querySelectorAll(".toggle-btn:not(.inactive)"))
  .map(btn => btn.dataset.line);
  
  if(lineNumber != 5 && activeLines.map(Number).includes(Number(lineNumber))){
    playSound("/sound"+lineNumber+".mp3");
  }
  
  // Crea la riga HTML
  row.setAttribute("data-line", lineNumber);
  row.setAttribute("data-lineId", lineId);
  row.setAttribute("data-competitor", competitor);
  row.setAttribute("data-hour", hour);
  row.setAttribute("data-minute", minute);
  row.setAttribute("data-seconds", seconds);
  row.setAttribute("data-ms-raw", millis);
  row.setAttribute("data-penality", 0);

  row.innerHTML = `
    <td class="col-index">${index}</td>
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

  

  // Aggiungi gli eventi ai pulsanti della riga
  const editBtn = row.querySelector(".edit-btn");
  const sendBtn = row.querySelector(".send-btn");

  editBtn.onclick = () => editRow(editBtn);
  sendBtn.onclick = () => sendRow(sendBtn);

  //tbody.appendChild(row);

  tbody.insertBefore(row, tbody.firstChild);

  // forza reflow (FONDAMENTALE)
  row.offsetHeight;

  // attiva animazione
  row.classList.add("row-enter-active");

  // (opzionale) rimuovi highlight dopo 1.5s
  setTimeout(() => {
    row.classList.remove("row-enter");
    row.classList.remove("row-enter-active");
  }, 1500);

  // Applica subito il filtro
  applyLineFilter();

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



function recalcElapsedTimes() {
  const rows = Array.from(
    document.querySelectorAll("#event-table tbody tr")
  ).filter(row => row.style.display !== "none");

  const firstRow = rows[rows.length - 1];
  const firstTimeMs = firstRow ? rowToMs(firstRow) : null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const deltaCell = row.querySelector(".elapsed-time");
    if (!deltaCell) continue;

    const currentMs = rowToMs(row);
    const delta = firstTimeMs - currentMs;
    deltaCell.textContent = formatDelta(delta, false);
  }
}

function recalcDeltaTimes() {
  const rows = Array.from(
    document.querySelectorAll("#event-table tbody tr")
  ).filter(row => row.style.display !== "none");

  let nextTime = null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const tsCell = row.querySelector(".timestamp");
    const deltaCell = row.querySelector(".delta-time");

    if (!tsCell || !deltaCell) continue;

    row.classList.remove("negative-row");

    const timestamp = tsCell.textContent.trim();

    if (timestamp === "00:00:00.000" || timestamp === "00:00:00.00" || timestamp === "00:00:00.0") {
      row.classList.add("negative-row");
    }

    const currentMs = rowToMs(row);

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


function applyLineFilter() {
  const activeLines = Array.from(document.querySelectorAll(".toggle-btn"))
    .filter(el => {
      if (el.tagName === "BUTTON") return !el.classList.contains("inactive");
      if (el.tagName === "INPUT" && el.type === "checkbox") return el.checked;
      return false;
    })
    .map(el => el.dataset.line);

  const rows = document.querySelectorAll("#event-table tbody tr");

  rows.forEach(row => {
    const line = String(row.getAttribute("data-line"));
    row.style.display = activeLines.includes(line) ? "" : "none";
  });

  // 🔥 ricalcolo intertempi DOPO il filtro
  recalcDeltaTimes();
  recalcElapsedTimes();
  updateVisibleColumns();
}

function editRow(button) {
  const row = button.closest("tr");

  // colonne editabili
  const editableCells = row.querySelectorAll(
    ".col-id, .col-competitor, .timestamp"
  );

  editableCells.forEach(cell => {
    if (cell.querySelector("input")) return;

    const value = cell.textContent.trim();

    // ID → numero
    if (cell.classList.contains("col-id")) {
      cell.innerHTML = `<input type="number" value="${value}" style="width:90%">`;
    }

    // Event Time → orario mascherato
    else if (cell.classList.contains("timestamp")) {
      cell.innerHTML = `
        <input type="text" value="${value}" style="width:90%"
          maxlength="12"
          placeholder="hh:mm:ss.mmm"
          oninput="maskTimeInput(this)">
      `;
    }

    // Δ e Elapsed → numerici (o testo se preferisci)
    else if (
      cell.classList.contains("delta-time-col") ||
      cell.classList.contains("elapsed-time-col")
    ) {
      cell.innerHTML = `<input type="number" step="any" value="${value}" style="width:90%">`;
    }

    // Competitor → testo
    else {
      cell.innerHTML = `<input type="text" value="${value}" style="width:90%">`;
    }
  });

  button.textContent = "💾";
  button.onclick = () => saveRow(button);
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

function saveRow(button) {
  const row = button.closest("tr");
  const inputs = row.querySelectorAll("input");

  // Salva valori input
  inputs.forEach((input, i) => {
    const newValue = input.value.trim();
    const cell = input.parentElement;
    cell.textContent = newValue;

    switch(i) {
      case 0: row.dataset.lineId = Number(newValue); break;
      case 1: row.dataset.competitor = newValue; break;
      case 2: {
        // timestamp → hh:mm:ss.mmm
        const [hms, ms] = newValue.split(".");
        const [h, m, s] = hms.split(":");
        row.dataset.hour     = Number(h);
        row.dataset.minute   = Number(m);
        row.dataset.seconds  = Number(s);
        // normalizza sempre a ms interi (il testo può avere 1-3 cifre decimali)
        let msVal = Number(ms ?? 0);
        if (ms && ms.length === 1) msVal *= 100;
        else if (ms && ms.length === 2) msVal *= 10;
        row.dataset.msRaw = msVal;
        break;
      }
    }
  });

  // 🔹 SALVA PENALITY DAL BUTTON
  const penalityBtn = row.querySelector(".penality-btn");
  if (penalityBtn) {
    row.dataset.penality = Number(penalityBtn.textContent.trim());
  }

  // Ripristina pulsante Edit
  button.textContent = "✎";
  button.onclick = () => editRow(button);

  // Riassegna listener
  const editBtn = row.querySelector(".edit-btn");
  const sendBtn = row.querySelector(".send-btn");
  if (editBtn) editBtn.onclick = () => editRow(editBtn);
  if (sendBtn) sendBtn.onclick = () => sendRow(sendBtn);

  sendUpdatedCheckPointRow(row);
  recalcDeltaTimes();
}

function sendUpdatedCheckPointRow(row) {
  // Usa il numero effettivo della prima cella come indice
  const index = parseInt(row.cells[0].textContent.trim());

  const cells = row.querySelectorAll("td");
  const lineNumber = cells[1].textContent.trim();
  const lineId = cells[2].textContent.trim();
  const competitor = cells[3].textContent.trim();
  const timestamp = cells[4].textContent.trim();
  const [timePart, millisPart] = timestamp.split(".");
  const [hour, minute, second] = timePart.split(":");
   // ✅ valore reale
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
  const tbody = document.querySelector("#event-table tbody");

  // 🔹 Usa il numero effettivo della prima cella come indice
  const index = parseInt(row.cells[0].textContent.trim());

  // 🔹 Legge i valori visibili nella tabella (così funziona anche dopo edit)
  const cells = row.querySelectorAll("td");
  const lineNumber = cells[1].textContent.trim();
  const lineId = cells[2].textContent.trim();
  const competitor = cells[3].textContent.trim();
  const timestamp = cells[4].textContent.trim();

  // Estrai hour, minute, millis dal timestamp (es. "10:23.456")
  const [timePart, millisPart] = timestamp.split(".");
  const [hour, minute, second] = timePart.split(":");

  // const INDEX_FIELD = "id";
  // const LINE_NUMBER_FIELD = "ln";
  // const LINE_ID_FIELD = "lId";
  // const COMPETITOR_FIELD = "c";
  // const HOUR_FIELD = "h";
  // const MINUTE_FIELD = "m";
  // const SECOND_FIELD = "s";
  // const MILLIS_FIELD = "ms";

  // 🔹 Crea l'oggetto messaggio
  const messageObj = {
    index,
    lineNumber: parseInt(lineNumber),
    lineId,
    competitor,
    hour: parseInt(hour),
    minute: parseInt(minute),
    second: parseInt(second),
    millis: parseInt(millisPart)
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

document.querySelectorAll('.toggle-btn').forEach(el => {
  if (el.tagName === "BUTTON") {
    const color = el.dataset.color; // colore originale
    el.style.backgroundColor = color;

    el.addEventListener('click', () => {
      if (el.classList.contains('inactive')) {
        el.classList.remove('inactive');
        el.style.backgroundColor = color;
      } else {
        el.classList.add('inactive');
        el.style.backgroundColor = '#ccc';
      }

      // Aggiorna lo stato active
      el.classList.toggle('active');

      // Aggiorna il filtro
      applyLineFilter();
      saveViewPrefs();
    });
  } 
  else if (el.tagName === "INPUT" && el.type === "checkbox") {
    // checkbox: basta monitorare il cambio
    el.addEventListener('change', () => { applyLineFilter(); saveViewPrefs(); });
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

  // Header CSV: prime 4 colonne + timestamp
  const header = `ID;Line number;Line ID;Competitor;Timestamp`;

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

function handleInputUpdate(e) {
  const lineNumber = e.target.dataset.line;
  if (!lineNumber) return;

  const data = {
    l: Number(lineNumber),
    ld: String(document.querySelector(`#l${lineNumber}`).value),
    c: Number(document.querySelector(`#c${lineNumber}`).value),
    d: Number(document.querySelector(`#d${lineNumber}`).value) || 0
  };

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

window.addEventListener("load", () => {
  const splash = document.getElementById("splash");

  // Inizia la dissolvenza dopo 1 secondo (o subito)
  setTimeout(() => {
    splash.classList.add("finished");
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
  document.getElementById("settingsOverlay").style.display = "flex";
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
      document.getElementById("settings-field").innerText = "Errore invio dati";
      console.error(err);
    });

}

function onGoHomeAction(){
  document.getElementById("timeChoiceOverlay").style.display = "none"
}

// Chiudi popup
document.getElementById("closeTimePopup").addEventListener("click", () => {
  document.getElementById("settingsOverlay").style.display = "none";
});

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
    document.querySelector('.time-set-fields').textContent = "Time to sync";
  } else if (method === "2") {
    document.querySelectorAll('.gps-sync').forEach(el => el.classList.remove('hidden'));
    const message = document.getElementById("time-settings-field");
    message.textContent = "";
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
    message.textContent = "Enter a valid hour and minute.";
    message.style.color = "red";
  }
}

function toggleDeltaTimeColumn(show) {
  const display = show ? "table-cell" : "none"; // usa table-cell per rimuovere problemi di layout

  // header
  document.querySelectorAll("th.delta-time-col").forEach(th => {
    th.style.display = display;
  });

  // celle
  document.querySelectorAll("td.delta-time").forEach(td => {
    td.style.display = display;
  });

  // se la mostri, ricalcola i delta
  if (show) recalcDeltaTimes();
  if (show) recalcElapsedTimes();
}

function toggleTimestampColumn(show) {
  const display = show ? "table-cell" : "none"; // usa table-cell per rimuovere problemi di layout

  // header
  document.querySelectorAll("th.timestamp-col").forEach(th => {
    th.style.display = display;
  });

  // celle
  document.querySelectorAll("td.timestamp").forEach(td => {
    td.style.display = display;
  });

}

function toggleElapsedTimeColumn(show) {
  const display = show ? "table-cell" : "none"; // usa table-cell per rimuovere problemi di layout

  // header
  document.querySelectorAll("th.elapsed-time-col").forEach(th => {
    th.style.display = display;
  });

  // celle
  document.querySelectorAll("td.elapsed-time").forEach(td => {
    td.style.display = display;
  });

  // se la mostri, ricalcola i delta

  if (show) recalcElapsedTimes();
}


function togglePenalityColumn(show) {
  const display = show ? "table-cell" : "none"; // usa table-cell per rimuovere problemi di layout

  // header
  document.querySelectorAll("th.penality-col").forEach(th => {
    th.style.display = display;
  });

  // celle
  document.querySelectorAll("td:has(.penality)").forEach(td => {
    td.style.display = display;
  });

  // se la mostri, ricalcola i delta

  if (show) recalcElapsedTimes();
}


function updateVisibleColumns(){
  let absoluteTimeVisible = document.getElementById("toggle-timestamp").checked;
  toggleTimestampColumn(absoluteTimeVisible); 
  let elapsedTimeVisible = document.getElementById("toggle-elapsed-time").checked;
  toggleElapsedTimeColumn(elapsedTimeVisible);
  let deltaTimeVisible = document.getElementById("toggle-delta-time").checked;
  toggleDeltaTimeColumn(deltaTimeVisible);
  let penalityVisible = document.getElementById("toggle-penality").checked;
  togglePenalityColumn(penalityVisible);
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


function updateRowFromBroadcas(data) {
  const table = document.getElementById("event-table");
  const tbody = table.querySelector("tbody");

  console.log("Aggiorno riga da broadcast:", data);

  const index = Number(data.id);
  if (isNaN(index)) return;

  // trova la riga tramite la colonna #
  const row = [...tbody.rows].find(r =>
    Number(r.querySelector("td")?.textContent) === index
  );

  if (!row) {
    console.warn("Row not found:", index);
    return;
  }

  // se la riga è in edit, evita overwrite
  if (row.querySelector("input")) {
    console.warn("Row in edit, skipped:", index);
    return;
  }

  // aggiorna ID
  const idCell = row.querySelector(".col-id");
  if (idCell && data.lId !== undefined) {
    idCell.textContent = data.lId;
  }

  // aggiorna competitor
  const competitorCell = row.querySelector(".col-competitor");
  if (competitorCell && data.c !== undefined) {
    competitorCell.textContent = data.c;
  }

  // aggiorna event time
  const timeCell = row.querySelector(".timestamp");
  if (timeCell) {
    row.dataset.hour    = data.h ?? row.dataset.hour;
    row.dataset.minute  = data.m ?? row.dataset.minute;
    row.dataset.seconds = data.s ?? row.dataset.seconds;
    row.dataset.msRaw   = data.ms ?? row.dataset.msRaw;
    timeCell.textContent = formatTime(
      parseInt(row.dataset.hour),
      parseInt(row.dataset.minute),
      parseInt(row.dataset.seconds),
      parseInt(row.dataset.msRaw)
    );
  }

  const penalityBtn = row.querySelector(".penality");
  if (penalityBtn) {
    penalityBtn.textContent = data.x;
  }

  showGeneralPopup(`Row ${index} has been updated`,  lineColors[data.ln]);
  recalcDeltaTimes();
  recalcElapsedTimes();
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

function downloadActualView() {

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g,'-');

  filename = `table_view_${timestamp}.csv`;

  const table = document.getElementById("event-table");
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

    // ❌ escludi Edit e Send
    if (["edit", "send"].includes(text.toLowerCase())) return;

    if (isVisible(th)) {
      visibleIndexes.push(i);
      headerRow.push(text);
    }
  });

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

function connectWiFi() {
  const ssid = document.getElementById("wifi-ssid").value;
  const pw   = document.getElementById("wifi-password").value;

  const url = `/wifiConnect?ssid=${encodeURIComponent(ssid)}&pw=${encodeURIComponent(pw)}`;

  fetch(url)
    .then(r => r.text())
    .then(t => console.log(t))
    .catch(e => console.error(e));

  document.getElementById("wifiOverlay").style.display = "none";
}

// Apri popup premendo sull'orario
document.getElementById("wifi-notify").addEventListener("click", () => {

  fetch('/wifiCredential')
    .then(res => {
      if (!res.ok) throw new Error("Errore nella fetch");
      return res.json();
    })
    .then(data => {
      console.log("Credenziali ricevute:");
      console.log(data);
      document.getElementById("wifi-ssid").value = data.ssid;
      document.getElementById("wifi-password").value = data.pw;
    })
  .catch(err => console.error("Errore:", err));

  document.getElementById("wifiOverlay").style.display = "flex";
});

function closeWiFiPopup(){
  document.getElementById("wifiOverlay").style.display = "none";
}

function togglePassword() {
  const pwInput = document.getElementById("wifi-password");
  const toggle  = document.getElementById("show-password");

  pwInput.type = toggle.checked ? "text" : "password";
}

// Apri popup premendo sull'orario
document.getElementById("gps-notify").addEventListener("click", () => {
  document.getElementById("settingsOverlay").style.display = "flex";
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
    status.textContent = "Invalid email format";
    status.style.color = "red";
    return;
  }

  status.textContent = "Email confirmed ✔";
  status.style.color = "green";
try {
    await sendEmail(email);   // 👈 aspetta
    status.textContent = "Request sent ✔";
    status.style.color = "green";
    setTimeout(closeEmailPopup, 1000);
  } catch (err) {
    status.textContent = "Error request sending email";
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