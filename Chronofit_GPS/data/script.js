let timeOffset = 0;


const audioFiles = [
  "/sound1.mp3",
  "/sound2.mp3",
  "/sound3.mp3",
  "/sound4.mp3"
];

const audioCache = {};

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

  const stationName = document.getElementById("station-name-input").value;
  
  console.log(stationName);
  console.log(encodeURIComponent(stationName));
  
  const url = `/setAttribute?printEnabled=${encodeURIComponent(printEnabled)}&stationName=${encodeURIComponent(stationName)}`;

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
    setTimeout(() => popup.classList.add("hidden"), 500); // attende dissolvenza
  }
}

function updateTimeOffset(){
  let tz = parseInt(document.getElementById("timezone-select").value);
  fetch(`/setOffset?offset=${tz}`)
    .then(res=>res.text())
    .then(msg=>console.log(msg));
}

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
  document.getElementById("printToggle").checked = data.print ?? 0;
  document.getElementById("station-name-input").value = data.sn;
  //document.getElementById("gpsToggle").checked = data.gps ?? 0;

  document.getElementById("sync-method-select").value = data.sm;
  document.getElementById("sync-method-select").dispatchEvent(new Event("change"));
  document.getElementById("sync-interval-select").value = data.si ?? 0
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
}

const TYPE_CHECKPOINT = 0;
const TYPE_TIME_UPDATE = 1;
const TYPE_SESSION_CLEARED = 2;
const TYPE_PARAMS_UPDATED = 3;
const TYPE_ROW_UPDATED = 4;

function handleMessage(data) {
  switch (data.t) {
    case TYPE_CHECKPOINT:
      addEventToTable(
        data.index,
        data.lineNumber,
        data.lineId,
        data.competitor,
        data.hour,
        data.minute,
        data.second,
        data.millis
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
      console.log("⚙️ Row updated!");
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
    if (now - lastMessageTime > 5000) {
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

function showGeneralPopup(message, bgColor = "#3b55ffff") {
  generalPopupText.innerText = message;
  generalPopup.style.backgroundColor = bgColor;

  if (!generalPopup.classList.contains("show")) {
    generalPopup.classList.remove("hidden");
    setTimeout(() => generalPopup.classList.add("show"), 10); // fade-in
  }
}

function hideGeneralPopup() {
  if (generalPopup.classList.contains("show")) {
    generalPopup.classList.remove("show"); // fade-out
    setTimeout(() => generalPopup.classList.add("hidden"), 500); // nasconde dopo transizione
  }
}


const FLAG_SYNC_ENABLED = 1; // 0001
const FLAG_TIME_VALID = 2; // 0010
const FLAG_LOCATION_VALID = 4; // 0100
const FLAG_TIMEBASE_CALIBRATION = 8; // 1000

const SYNC_NONE = 0;
const SYNC_MANUAL_SET = 1;  // Tempo settato manualmente
const SYNC_WAIT_LINE_SIGNAL = 2;  // In attesa del segnale di sincronismo (esterno)
const SYNC_SET_BY_LINE_SIGNAL =3;  // Tempo impostato tramite segnale esterno
const SYNC_FIRST_GPS_SYNC = 4;   // In attesa della sincronizzazione GPS
const SYNC_WAIT_GPS = 5;   // Sincronizzato tramite GPS
const SYNC_GPS_SYNCED = 6;   // Sincronizzato tramite GPS

const GPS_TEST_REQESTED = 1;
const GPS_TEST_DONE = 0;

const POWER_MODE_NONE = 0;   // Alimentatore esterno non collegato
const POWER_MODE_USB = 1;   // Dispositivo alimentato da POWER BANK
const POWER_MODE_BATTERY = 2;   // Dispositivo alimentato a 12V

let prevPowerSource = 1;

function handleUpdate(data) {
  if (prevPowerSource !== data.pw) {
    const printToggle = document.getElementById("printToggle");
    prevPowerSource = data.pw;

    if(prevPowerSource === POWER_MODE_NONE){
      console.log("Switching to low power config")
      printToggle.checked = 0;
      printToggle.disabled = 1;
    }else if(prevPowerSource === POWER_MODE_USB){
      console.log("Switching to power bank power config")
      printToggle.checked = 1;
      printToggle.disabled = 0;
    }
    else if(prevPowerSource === POWER_MODE_BATTERY){
      console.log("Switching to battery bank power config")
      printToggle.checked = 1;
      printToggle.disabled = 0;
    }

  }
}

function updateClockFromData(data) {

    let hourAdj = (data.h + timeOffset + 24) % 24;

    document.getElementById("time").innerText =
        String(hourAdj).padStart(2,'0') + ":" 
        + String(data.m).padStart(2,'0') + ":" 
        + String(data.s).padStart(2,'0') + ".000" //+ data.millis; 


    let statusElem = document.getElementById("status");
    //let timezoneElem = document.getElementById("timezone");

    const fixFlags = data.f; // esempio: 7

    const syncEnabled = (fixFlags & FLAG_SYNC_ENABLED) !== 0;
    const timeValid = (fixFlags & FLAG_TIME_VALID) !== 0;
    const locationValid = (fixFlags & FLAG_LOCATION_VALID) !== 0;
    const calRunning = (fixFlags & FLAG_TIMEBASE_CALIBRATION) !== 0;

    if (calRunning) {
      showGeneralPopup("Timebase calibration running...", "#ff9800"); // arancione per calibrazione
    } else {
      hideGeneralPopup();
    }

    const syncStatus = data.sy; 

    handleUpdate(data);

    let syncTestIcon = document.getElementById("incon-sync-test");
    //syncTestIcon.style.display = "none";
    syncTestIcon.classList.add("disabled");

    if(syncStatus === SYNC_NONE){
      statusElem.innerText = "Sync mode: Manual — Status: 🔴 not set";
    }
    if(syncStatus === SYNC_MANUAL_SET){
      statusElem.innerText = "Sync mode: Manual — Status: 🟢 OK"
    }
    if(syncStatus === SYNC_WAIT_LINE_SIGNAL){
      statusElem.innerText = "Sync mode: Line — Status: ⏳ waiting for trigger..."
    }
    if(syncStatus === SYNC_SET_BY_LINE_SIGNAL){
      statusElem.innerText = "Sync mode: Line — Status: 🟢 synced";
    }
    if(syncStatus === SYNC_FIRST_GPS_SYNC || syncStatus === SYNC_WAIT_GPS){
      statusElem.innerText = "Sync mode: GPS — Status: ⏳ waiting for signal..."
    }if(syncStatus === SYNC_GPS_SYNCED){
      const lastSync = data.ls;
      const GPSRefreshInterval = data.lg;
      const nextSync = data.lg - data.ls;
      syncTestIcon.classList.remove("disabled");

      if(data.ts == GPS_TEST_DONE)
      {
        if(data.lg != 0){
          if(nextSync < 60)
          {
            statusElem.innerText = "Sync mode: GPS — Status: 🟢 synced (resync " + String(nextSync) + "s)";
          }else{
            statusElem.innerText = "Sync mode: GPS — Status: 🟢 synced (resync " + String(Math.trunc(nextSync/60)) + "m)";
          }
        }else{
          statusElem.innerText = "Sync mode: GPS — Status: 🟢 synced (resync 1s)";
        }
      }else{
        statusElem.innerText = "Sync test: ⏱️ Waiting for the next minute to start... ";
      }

    }
  
  if(timeValid && locationValid){
    let tzOffsetAuto = Math.round(data.ln / 15); 
    let offsetString =  "UTC" + (tzOffsetAuto >=0 ? "+" : "") + tzOffsetAuto;
    document.getElementById("pos").innerText = "🟢 " + "Lat: " 
      + data.lt.toFixed(6) + ", Lng: " + data.ln.toFixed(6) + ", Sat: " + data.st + " [" + offsetString +"]";
  
      //timezoneElem.innerText = "Estimated timezone: UTC" + (tzOffsetAuto >=0 ? "+" : "") + tzOffsetAuto;
  } else if(syncEnabled && (!timeValid || !locationValid)){
      // GPS in attesa segnale
      document.getElementById("pos").innerText = "🟡 " +  "Lat:--" + ", Lng:--" +", Sat: 0" ;   
  } else {
      // GPS disabilitato
      document.getElementById("pos").innerText = "🔴 " + "Lat:--" + ", Lng:--" +", Sat: 0" ;
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

function sendToPrinter(text) {
  const encodedText = encodeURIComponent(text);
  const url = `/print?text=${encodedText}`;

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error("Errore durante la stampa");
      console.log("Comando di stampa inviato con successo");
    })
    .catch(error => {
      console.error("Errore:", error);
    });
}

// Overload compatibile: accetta un oggetto checkpoint
function addEventToTableFromCheckpoint(checkpoint) {
  // checkpoint deve avere: index, lineNumber, lineId, competitor, hour, minute, millis
  const rowIndex = checkpoint.index;
  const lineNumber = checkpoint.lineNumber;
  const lineId = checkpoint.lineId; // correggiamo qui: "lineId", non "line"
  const competitor = checkpoint.competitor;
  const hour = checkpoint.hour;
  const minute = checkpoint.minute;
  const second = checkpoint.second;
  const millis = checkpoint.millis;

  // Richiama la funzione originale
  addEventToTable(rowIndex, lineNumber, lineId, competitor, hour, minute, second, millis);
}


function addEventToTable(rowIndex, lineNumber, lineId, competitor, hour, minute, seconds, millis) {
  console.log(rowIndex, lineNumber, lineId, competitor, hour, minute, seconds, millis);
  const tbody = document.querySelector("#event-table tbody");
  const row = document.createElement("tr");

  // subito dopo: const row = document.createElement("tr");
  row.classList.add("row-enter");

  const timestamp = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  const index = rowIndex;

  const lineColors = {
    1: "#ffcccc", // rosso tenue
    2: "#ccffcc", // verde tenue
    3: "#ccccff", // blu tenue
    4: "#fff5cc", // giallo tenue
    5: "#808080ff" // giallo tenue
  };

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
  row.setAttribute("data-millis", millis);

  row.innerHTML = `
    <td class="col-index">${index}</td>
    <td style="background-color: ${lineColors[lineNumber] || "#f5f5f5"}" class="col-line">${lineNumber}</td>
    <td class="col-id">${lineId}</td>
    <td class="col-competitor">${competitor}</td>
    <td class="timestamp">${timestamp}</td>
    <td class="delta-time"></td>
    <td class="elapsed-time"></td>
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
  let sign = "";

  if (signed) {
    sign = ms <= 0 ? "+" : "-";
  }

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

  // partiamo dal basso (riga più vecchia)
  const firstRow = rows[rows.length - 1];
  const firstTsCell = firstRow ? firstRow.querySelector(".timestamp") : null;
  const firstTimeMs = firstTsCell ? timestampToMs(firstTsCell.textContent.trim()) : null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const tsCell = row.querySelector(".timestamp");
    const deltaCell = row.querySelector(".elapsed-time");

    if (!tsCell || !deltaCell) continue;

    const currentMs = timestampToMs(tsCell.textContent.trim());

    const delta = firstTimeMs - currentMs;
    deltaCell.textContent = formatDelta(delta, false);

  }
}

function recalcDeltaTimes() {
  const rows = Array.from(
    document.querySelectorAll("#event-table tbody tr")
  ).filter(row => row.style.display !== "none");

  // partiamo dal basso (riga più vecchia)
  let nextTime = null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const tsCell = row.querySelector(".timestamp");
    const deltaCell = row.querySelector(".delta-time");

    if (!tsCell || !deltaCell) continue;

    const currentMs = timestampToMs(tsCell.textContent.trim());

    // riga più in basso → niente delta
    if (nextTime === null) {
      deltaCell.textContent = "—";
      nextTime = currentMs;
      continue;
    }

    const delta = nextTime - currentMs;
    deltaCell.textContent = formatDelta(delta, true);
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
    else if (cell.classList.contains("timestamp-col")) {
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

  // Salva valori e aggiorna dataset
  inputs.forEach((input, i) => {
    const newValue = input.value.trim();
    const cell = input.parentElement;
    cell.textContent = newValue;

    switch(i) {
      case 0: row.dataset.lineNumber = Number(newValue); break;
      case 1: row.dataset.lineId = Number(newValue); break;
      case 2: row.dataset.competitor = Number(newValue); break;
      case 3: row.dataset.hour = Number(newValue); break;
      case 4: row.dataset.minute = Number(newValue); break;
      case 5: row.dataset.millis = Number(newValue); break;
    }
  });

  // Ripristina pulsante Edit
  button.textContent = "✎";
  button.onclick = () => editRow(button);

  // Riassegna listener
  const editBtn = row.querySelector(".edit-btn");
  const sendBtn = row.querySelector(".send-btn");
  if (editBtn) editBtn.onclick = () => editRow(editBtn);
  if (sendBtn) sendBtn.onclick = () => sendRow(sendBtn);

  // 🔹 Invia la riga aggiornata all’ESP
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

  const messageObj = {
    index,
    lineNumber: parseInt(lineNumber),
    lineId: parseInt(lineId),
    competitor: parseInt(competitor),
    hour: parseInt(hour),
    minute: parseInt(minute),
    second: parseInt(second),
    millis: parseInt(millisPart)
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
    });
  } 
  else if (el.tagName === "INPUT" && el.type === "checkbox") {
    // checkbox: basta monitorare il cambio
    el.addEventListener('change', applyLineFilter);
  }
});



// function applyLineFilter() {
//   // seleziona tutti gli elementi toggle attivi
//   const activeLines = Array.from(document.querySelectorAll(".toggle-btn"))
//     .filter(el => {
//       // button attivo se non ha classe 'inactive'
//       if (el.tagName === "BUTTON") return !el.classList.contains("inactive");
//       // checkbox attivo se checked
//       if (el.tagName === "INPUT" && el.type === "checkbox") return el.checked;
//       return false;
//     })
//     .map(el => el.dataset.line);

//   const rows = document.querySelectorAll("#event-table tbody tr");

//   rows.forEach(row => {
//     const line = String(row.getAttribute("data-line"));
//     row.style.display = activeLines.includes(line) ? "" : "none";
//   });
// }

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
  const header = `${keys[0]};${keys[1]};${keys[2]};${keys[3]};timestamp`;

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
    ld: Number(document.querySelector(`#l${lineNumber}`).value),
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

// Avvia connessione all’apertura pagina
//addEventListener("load", connectWebSocket);

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


    console.log("Carica audio files nella cache...")
    cacheAudioFiles();

    console.log("Timposto toggle delta time a default...")
    const chk = document.getElementById("toggle-delta-time");
    toggleDeltaTimeColumn(chk.checked);
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

function playSound(name) {
  audioCache[name].currentTime = 0; // riavvia da inizio
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

  // se la mostri, ricalcola i delta
  if (show) recalcDeltaTimes();
  if (show) recalcElapsedTimes();
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
  if (show) recalcDeltaTimes();
  if (show) recalcElapsedTimes();
}


function updateVisibleColumns(){
  let elapsedTimeVisible = document.getElementById("toggle-elapsed-time").checked;
  toggleElapsedTimeColumn(elapsedTimeVisible);
  let deltaTimeVisible = document.getElementById("toggle-delta-time").checked;
  toggleDeltaTimeColumn(deltaTimeVisible);
  let absoluteTimeVisible = document.getElementById("toggle-timestamp").checked;
  toggleTimestampColumn(absoluteTimeVisible); 
}

document
.getElementById("toggle-delta-time")
.addEventListener("change", e => {
  toggleDeltaTimeColumn(e.target.checked);
});

document
.getElementById("toggle-timestamp")
.addEventListener("change", e => {
  toggleTimestampColumn(e.target.checked);
});

document
.getElementById("toggle-elapsed-time")
.addEventListener("change", e => {
  toggleElapsedTimeColumn(e.target.checked);
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
