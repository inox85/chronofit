// ── Chronofit Cell — UI di configurazione ───────────────────────────────────
const TOKEN_KEY = 'chronofit_cell_token';
const RTT_WARN_US = 20000;   // oltre questo l'incertezza del sync supera ~10 ms

const $ = id => document.getElementById(id);

function authHeaders() {
  const tok = $('auth-token').value;
  return tok ? { 'X-Token': tok } : {};
}

$('auth-token').value = localStorage.getItem(TOKEN_KEY) || '';
$('auth-token').addEventListener('input', e => localStorage.setItem(TOKEN_KEY, e.target.value));

let toastTimer;
function showToast(msg, type = 'ok') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.className = '', 2800);
}

// navigator.clipboard richiede https: la cella si apre in http://192.168.11.1,
// quindi serve il ripiego con execCommand.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* ripiego sotto */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed; top:-1000px; opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

function setBadge(el, text, cls) {
  el.textContent = text;
  el.className = 'badge' + (cls ? ' ' + cls : '');
}

function fmtUs(us) {
  const abs = Math.abs(us);
  if (abs >= 1000) return (us / 1000).toFixed(2) + ' ms';
  return us + ' µs';
}

// ── Stato live ──────────────────────────────────────────────────────────────
async function refreshStatus() {
  try {
    const res = await fetch('/cellStatus', { cache: 'no-store' });
    const s = await res.json();

    $('fw').textContent = 'FW ' + s.fw + ' · ' + s.chipId;

    setBadge($('st-link'), s.sta.connected ? 'Collegata' : 'Non collegata', s.sta.connected ? 'ok' : 'bad');
    const net = $('st-net');
    const netKey = s.sta.connected ? s.sta.ssid + '|' + s.sta.ip : '';
    if (!s.sta.connected) {
      net.dataset.k = '';
      net.textContent = s.sta.ssid || 'nessun SSID configurato';
    } else if (net.dataset.k !== netKey) {
      // l'IP è un link che lo copia: si ricostruisce solo se cambia (il polling non deve mangiarsi il tocco)
      net.dataset.k = netKey;
      net.textContent = s.sta.ssid + ' · ';
      const ipEl = document.createElement('a');
      ipEl.className = 'copy-ip';
      ipEl.textContent = s.sta.ip + ' 📋';
      ipEl.title = "Tocca per copiare l'IP";
      ipEl.onclick = async () => {
        const ok = await copyText(s.sta.ip);
        showToast(ok ? 'IP copiato: ' + s.sta.ip : 'Copia non riuscita', ok ? 'ok' : 'err');
      };
      net.appendChild(ipEl);
    }
    $('st-rssi').textContent = s.sta.connected ? (s.sta.rssi + ' dBm') : '—';

    if (!s.sta.connected) {
      setBadge($('st-sync'), 'No', 'bad');
    } else {
      setBadge($('st-sync'), s.sync.valid ? 'Sì' : 'In corso…', s.sync.valid ? 'ok' : 'warn');
    }
    if (s.sync.samples > 0) {
      const warn = s.sync.rttUs > RTT_WARN_US ? ' ⚠ rete lenta' : '';
      $('st-offset').textContent = fmtUs(s.sync.offsetUs) + ' / RTT ' + fmtUs(s.sync.rttUs) + warn;
      $('st-age').textContent = (s.sync.ageMs / 1000).toFixed(1) + ' s fa (' + s.sync.samples + ' campioni)';
    } else {
      $('st-offset').textContent = '—';
      $('st-age').textContent = '—';
    }

    setBadge($('st-input'), s.inputActive ? 'ATTIVO' : 'libero', s.inputActive ? 'warn' : 'ok');
    $('st-line').textContent = 'Linea ' + s.line;
    const e = s.events;
    $('st-events').textContent = e.sent + ' inviati · ' + e.pending + ' in coda · '
      + e.duplicates + ' dup · ' + e.rejected + ' rifiutati · ' + e.dropped + ' scartati';
    $('st-error').textContent = s.lastError || '—';
    $('st-clients').textContent = s.apClients;
  } catch (err) {
    setBadge($('st-link'), 'Cella non raggiungibile', 'bad');
  }
}

async function sendTest() {
  $('btn-test').disabled = true;
  try {
    const res = await fetch('/cellTest', { headers: authHeaders() });
    if (res.ok) showToast('Evento di test accodato', 'ok');
    else if (res.status === 401) showToast('Non autorizzato (401)', 'err');
    else showToast('Errore: ' + res.status, 'err');
  } catch (e) {
    showToast('Errore di rete', 'err');
  } finally {
    $('btn-test').disabled = false;
  }
}

// ── Configurazione ──────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await fetch('/cellSettings', { cache: 'no-store' });
    const c = await res.json();
    $('base-ssid').value = c.baseSsid;
    $('base-host').value = c.baseHost;
    $('base-pass-hint').textContent = c.hasBasePass ? '(salvata)' : '(nessuna)';
    $('base-token-hint').textContent = c.hasBaseToken ? '(salvato)' : '(nessuno)';
    $('cfg-line').value = c.line;
    $('cfg-input').value = c.input;
    $('cfg-lockout').value = c.lockoutMs;
    $('cfg-buzzer').checked = !!c.buzzer;
    $('api-token-hint').textContent = c.authRequired ? '(attivo; vuoto = invariato)' : '(non impostato)';
  } catch (e) {
    showToast('Impossibile leggere la configurazione', 'err');
  }
}

async function scanNetworks() {
  const btn = $('btn-scan');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    for (let i = 0; i < 20; i++) {
      let d = null;
      try {
        const res = await fetch('/wifiScan', { cache: 'no-store' });
        d = await res.json();
      } catch (e) {
        // durante la scansione l'AP della cella può sparire un istante: si riprova
      }
      if (d && d.error) {
        showToast('La radio non riesce ad avviare la scansione, riprova', 'err');
        return;
      }
      if (d && !d.scanning) {
        const list = $('scan-list');
        list.innerHTML = '';
        const first = document.createElement('option');
        first.value = '';
        first.textContent = d.networks.some(n => n.ssid) ? 'Seleziona una rete…' : 'Nessuna rete trovata';
        list.appendChild(first);
        const best = new Map();   // una riga per SSID (il più forte), niente reti nascoste
        d.networks.forEach(n => {
          if (n.ssid && (!best.has(n.ssid) || n.rssi > best.get(n.ssid).rssi)) best.set(n.ssid, n);
        });
        [...best.values()].sort((a, b) => b.rssi - a.rssi).forEach(n => {
          const o = document.createElement('option');
          o.value = n.ssid;
          o.textContent = (n.secure ? '🔒 ' : '') + n.ssid + ' (' + n.rssi + ' dBm, ch ' + n.channel + ')';
          list.appendChild(o);
        });
        list.style.display = '';
        return;
      }
      await new Promise(r => setTimeout(r, 700));
    }
    showToast('Scansione non completata', 'err');
  } catch (e) {
    showToast('Errore di rete durante la scansione', 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Cerca';
  }
}

function pickNetwork(ssid) {
  if (ssid) $('base-ssid').value = ssid;
}

function setSaveError(msg) {
  const el = $('save-error');
  el.textContent = msg;
  el.classList.toggle('visible', !!msg);
}

async function saveSettings() {
  setSaveError('');
  const apPass = $('cfg-ap-pass').value;
  if (apPass && apPass.length < 8) {
    setSaveError('La password della AP deve avere almeno 8 caratteri.');
    return;
  }

  const params = new URLSearchParams({
    baseSsid: $('base-ssid').value.trim(),
    baseHost: $('base-host').value.trim(),
    line: $('cfg-line').value,
    input: $('cfg-input').value,
    lockoutMs: $('cfg-lockout').value || '200',
    buzzer: $('cfg-buzzer').checked ? '1' : '0'
  });
  if ($('base-pass').value) params.set('basePass', $('base-pass').value);
  if ($('base-token').value) params.set('baseToken', $('base-token').value);
  if (apPass) params.set('apPassword', apPass);
  if ($('cfg-api-token').value) params.set('apiToken', $('cfg-api-token').value);

  $('btn-save').disabled = true;
  try {
    const res = await fetch('/cellSave?' + params.toString(), { headers: authHeaders() });
    if (res.ok) {
      showToast('Salvato — riavvio in corso…', 'ok');
      setTimeout(() => location.reload(), 6000);
    } else if (res.status === 401) {
      setSaveError('Token non valido o mancante.');
      $('btn-save').disabled = false;
    } else {
      setSaveError('Errore: ' + res.status);
      $('btn-save').disabled = false;
    }
  } catch (e) {
    setSaveError('Errore di rete.');
    $('btn-save').disabled = false;
  }
}

loadSettings();
refreshStatus();
setInterval(refreshStatus, 1000);
