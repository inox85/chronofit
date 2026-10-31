// Equitazione (salto ostacoli): turno del cavaliere, campana, conto alla
// rovescia, penalità e classifica. Comune a console (index.html) e vista
// (view_equitazione.html). Il risultato di ogni turno lo calcola la Main
// (equestrian.cpp, route /eq, /eqCmd, /eqConfig, messaggi 20/21); qui si
// mostra, si comanda e si calcola la classifica.

// Console e viste senza ui_dialogs.js (Chronofit GPS): conferma e testo con i popup del browser
if (typeof uiConfirm !== 'function') window.uiConfirm = msg => Promise.resolve(window.confirm(msg));
if (typeof uiShowText !== 'function') window.uiShowText = (title, text) => { window.prompt(title, text); };

const EQ_TYPE_UPDATE = 20;
const EQ_TYPE_CONFIG = 21;

const EQ = {
  on: false,          // gara assistita accesa (dalla Main); spenta = cronometraggio standard
  cfg: null,          // { variants, course, taMs }
  rounds: [],
  rev: 0,
  cur: null,          // turno attivo, dall'ultimo messaggio
  curAt: 0,           // performance.now() alla ricezione di cur
  listeners: [],
  loading: false,
};

// ── Testi ────────────────────────────────────────────────────────────────────
const EQ_TEXT = {
  it: {
    title: 'Percorso', rank: 'Classifica', rider: 'Cavaliere', none_selected: 'Tocca un cavaliere nell\'elenco Attesi o scrivi il numero',
    ready: 'Pronto: suona la campana', countdown: 'Conto alla rovescia', running: 'In corso', paused: 'Interrotto',
    finished: 'Arrivato: controlla e conferma', confirmed: 'Confermato', cancelled: 'Annullato',
    bell: '🔔 Campana', stop: '🔔 Interrompi', resume: '🔔 Riprendi', start: '▶ Partenza', finish: '⏹ Arrivo',
    elim: 'Eliminato', ret: 'Ritirato', confirm: '✔ Conferma', cancel_round: 'Annulla turno', go: 'Pronto',
    phase: 'Fase', phase1: 'Percorso base', barrage: 'Barrage', phase1b: '1ª fase', phase2: '2ª fase', final: 'Classifica finale',
    time: 'Tempo', faults: 'Penalità percorso', timepen: 'Penalità tempo', total: 'Totale', pos: 'Pos.', ta: 'Tempo concesso', tl: 'Tempo limite',
    pts: 'pen.', sec_short: 's', auto: 'partenza automatica', pause_note: 'tempo fermo',
    elim_short: 'ELIM.', ret_short: 'RIT.', reason_time_limit: 'tempo limite superato', reason_refusals: 'rifiuti', reason_manual: 'eliminato',
    copy: '📋 Copia risultato', copied: 'Risultato copiato', csv: 'Esporta CSV', edit: 'Modifica turno',
    running_confirm: 'Il percorso di {0} è in corso: annullarlo e passare a {1}?', err: 'Errore: {0}',
    settings: 'Gara e regolamento', tab_course: 'Gara', tab_rules: 'Regolamento', variant: 'Tipo di gara',
    start_line: 'Linea di partenza', finish_line: 'Linea di arrivo', length: 'Lunghezza percorso (m)', speed: 'Velocità (m/min)',
    ta_override: 'Tempo concesso manuale (s, vuoto = calcolato)', ta_calc: 'Tempo concesso calcolato', default_phase: 'Fase del prossimo turno',
    save: 'Salva', close: 'Chiudi', saved: 'Salvato', name: 'Nome', countdown_s: 'Conto alla rovescia dopo la campana (s, 0 = no)',
    autostart: 'Partenza automatica allo scadere', warn: 'Beep negli ultimi 5 secondi',
    tp_mode: 'Penalità per il superamento del tempo concesso', tp_none: 'Nessuna', tp_points: 'Punti', tp_seconds: 'Secondi aggiunti',
    tp_every: 'Ogni (s)', tp_amount: 'Penalità', tp_commenced: 'Conta anche l\'intervallo iniziato',
    tl_factor: 'Tempo limite = tempo concesso × (0 = nessuno)', rank_mode: 'Classifica', rank0: 'Penalità, poi tempo', rank1: 'Tempo (con i secondi di penalità)', rank2: 'Solo penalità',
    final_mode: 'Formula', final0: 'Una fase', final1: 'Con barrage', final2: 'Due fasi',
    faults_list: 'Errori', f_label: 'Errore', f_pts: 'Pen.', f_sec: '+s', f_group: 'Gruppo', f_elimAt: 'Elimina a', f_elim: 'Elimina',
    add_fault: '+ Errore', dup_variant: 'Duplica', new_variant: 'Nuovo', del_variant: 'Elimina tipo', reset_defaults: 'Ripristina predefiniti',
    reset_confirm: 'Ripristinare il regolamento predefinito? Le modifiche al regolamento vanno perse.',
    rules_note: 'I valori predefiniti sono un punto di partenza: verificali con il regolamento della gara (FEI/FISE). "Gruppo" e "Elimina a" servono per esempio a eliminare al secondo rifiuto.',
    time_override: 'Tempo corretto (s)', apply: 'Applica', restore: 'Ripristina', status: 'Stato', normal: 'In gara',
    no_rounds: 'Nessun percorso concluso', in_track: 'In pista', next: 'Prossimo', result: 'Risultato',
    view_rows: 'Mostra anche la griglia dei passaggi',
    assisted: 'Gare',
    assisted_hint: 'Spenta: cronometraggio standard. Accesa: campana con conto alla rovescia, errori, penalità e classifica.',
    mid_line: 'Linea intermedia (arrivo 1ª fase)', none: 'Nessuna', mid: 'Intermedio',
    length2: 'Lunghezza 2ª fase / barrage (m, vuoto = come la 1ª)', ta2_override: 'Tempo concesso 2ª fase / barrage (s, vuoto = calcolato)',
    ta2_calc: 'Tempo concesso 2ª fase / barrage', consec: 'Fasi consecutive: all\'intermedio, se netto, parte subito la 2ª fase',
    mid_conflict: 'La linea intermedia deve essere diversa da partenza e arrivo: così non viene usata.',
    mid_needed: 'Per le fasi consecutive imposta la linea intermedia (arrivo della 1ª fase) nella scheda Gara.',
    phase1_res: '1ª fase', mid_hint: 'All\'intermedio (L{0}): se netto parte la 2ª fase',
    off_confirm: 'Un percorso è in corso: spegnendo la gara assistita il turno viene annullato (i passaggi restano registrati). Continuare?', rows: 'Passaggi',
  },
  en: {
    title: 'Round', rank: 'Ranking', rider: 'Rider', none_selected: 'Tap a rider in the waiting list or type the number',
    ready: 'Ready: ring the bell', countdown: 'Countdown', running: 'Running', paused: 'Interrupted',
    finished: 'Finished: check and confirm', confirmed: 'Confirmed', cancelled: 'Cancelled',
    bell: '🔔 Bell', stop: '🔔 Interrupt', resume: '🔔 Resume', start: '▶ Start', finish: '⏹ Finish',
    elim: 'Eliminated', ret: 'Retired', confirm: '✔ Confirm', cancel_round: 'Cancel round', go: 'Ready',
    phase: 'Phase', phase1: 'Round', barrage: 'Jump-off', phase1b: '1st phase', phase2: '2nd phase', final: 'Final ranking',
    time: 'Time', faults: 'Jumping faults', timepen: 'Time faults', total: 'Total', pos: 'Pos.', ta: 'Time allowed', tl: 'Time limit',
    pts: 'pen.', sec_short: 's', auto: 'automatic start', pause_note: 'clock stopped',
    elim_short: 'ELIM.', ret_short: 'RET.', reason_time_limit: 'time limit exceeded', reason_refusals: 'refusals', reason_manual: 'eliminated',
    copy: '📋 Copy result', copied: 'Result copied', csv: 'Export CSV', edit: 'Edit round',
    running_confirm: 'The round of {0} is running: cancel it and switch to {1}?', err: 'Error: {0}',
    settings: 'Competition and rules', tab_course: 'Competition', tab_rules: 'Rules', variant: 'Competition type',
    start_line: 'Start line', finish_line: 'Finish line', length: 'Course length (m)', speed: 'Speed (m/min)',
    ta_override: 'Manual time allowed (s, empty = computed)', ta_calc: 'Computed time allowed', default_phase: 'Phase of the next round',
    save: 'Save', close: 'Close', saved: 'Saved', name: 'Name', countdown_s: 'Countdown after the bell (s, 0 = none)',
    autostart: 'Automatic start when it expires', warn: 'Beep in the last 5 seconds',
    tp_mode: 'Penalty for exceeding the time allowed', tp_none: 'None', tp_points: 'Points', tp_seconds: 'Added seconds',
    tp_every: 'Every (s)', tp_amount: 'Penalty', tp_commenced: 'Count the commenced interval too',
    tl_factor: 'Time limit = time allowed × (0 = none)', rank_mode: 'Ranking', rank0: 'Penalties, then time', rank1: 'Time (with penalty seconds)', rank2: 'Penalties only',
    final_mode: 'Format', final0: 'One phase', final1: 'With jump-off', final2: 'Two phases',
    faults_list: 'Faults', f_label: 'Fault', f_pts: 'Pen.', f_sec: '+s', f_group: 'Group', f_elimAt: 'Elim. at', f_elim: 'Eliminates',
    add_fault: '+ Fault', dup_variant: 'Duplicate', new_variant: 'New', del_variant: 'Delete type', reset_defaults: 'Restore defaults',
    reset_confirm: 'Restore the default rules? Changes to the rules are lost.',
    rules_note: 'The defaults are a starting point: check them against the competition rules (FEI/national). "Group" and "Elim. at" are used, for example, to eliminate at the second refusal.',
    time_override: 'Corrected time (s)', apply: 'Apply', restore: 'Restore', status: 'Status', normal: 'Competing',
    no_rounds: 'No finished round yet', in_track: 'On course', next: 'Next', result: 'Result',
    view_rows: 'Also show the passages grid',
    assisted: 'Competitions',
    assisted_hint: 'Off: standard timing. On: bell with countdown, faults, penalties and ranking.',
    mid_line: 'Intermediate line (phase 1 finish)', none: 'None', mid: 'Intermediate',
    length2: 'Phase 2 / jump-off length (m, empty = same as phase 1)', ta2_override: 'Phase 2 / jump-off time allowed (s, empty = calculated)',
    ta2_calc: 'Phase 2 / jump-off time allowed', consec: 'Consecutive phases: at the intermediate line, if clear, phase 2 starts at once',
    mid_conflict: 'The intermediate line must differ from start and finish: as it is, it is not used.',
    mid_needed: 'For consecutive phases set the intermediate line (phase 1 finish) in the Competition tab.',
    phase1_res: 'Phase 1', mid_hint: 'At the intermediate (L{0}): if clear, phase 2 starts',
    off_confirm: 'A round is in progress: turning assisted mode off cancels it (the passages stay recorded). Continue?', rows: 'Passages',
  },
};

function eqT(key, ...args) {
  const lang = typeof currentLang === 'function' ? currentLang() : 'it';
  let s = (EQ_TEXT[lang] || EQ_TEXT.it)[key] ?? EQ_TEXT.it[key] ?? key;
  args.forEach((a, i) => { s = s.replace('{' + i + '}', a); });
  return s;
}

function eqEsc(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ── Dati dalla Main ──────────────────────────────────────────────────────────
function eqNotify() { EQ.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

async function eqLoad() {
  if (EQ.loading) return;
  EQ.loading = true;
  try {
    const d = await (await fetch('/eq', { cache: 'no-store' })).json();
    EQ.on = !!d.on;
    EQ.cfg = { variants: d.variants, course: d.course, taMs: d.taMs, taMs2: d.taMs2 };
    EQ.rounds = d.rounds || [];
    EQ.rev = d.rev;
    const c = EQ.rounds.find(r => r.id === d.cur);
    if (c && (!EQ.cur || EQ.cur.id !== c.id)) { EQ.cur = c; EQ.curAt = performance.now(); }
    if (!d.cur) EQ.cur = null;
  } catch (e) { /* Main non raggiungibile: si riprova al prossimo messaggio */ }
  EQ.loading = false;
  eqNotify();
}

let _eqReloadTimer = null;
function eqHandleMessage(data) {
  if (data.t === EQ_TYPE_CONFIG) { eqLoad(); return true; }
  if (data.t !== EQ_TYPE_UPDATE) return false;
  const prev = EQ.cur;
  EQ.cur = data.cur || null;
  EQ.curAt = performance.now();
  eqMaybeBell(prev, EQ.cur);
  if (EQ.cur) {   // il turno attivo aggiornato anche nell'elenco
    const i = EQ.rounds.findIndex(r => r.id === EQ.cur.id);
    if (i >= 0) EQ.rounds[i] = EQ.cur; else EQ.rounds.push(EQ.cur);
  }
  if (data.rev !== EQ.rev) {
    EQ.rev = data.rev;
    clearTimeout(_eqReloadTimer);
    _eqReloadTimer = setTimeout(eqLoad, 300);   // cambiato un altro turno (correzione, classifica)
  }
  eqNotify();
  return true;
}

async function eqCmd(c, params = {}) {
  const q = new URLSearchParams({ c, ...params });
  try {
    const res = await fetch('/eqCmd?' + q.toString());
    const d = await res.json();
    if (!d.ok) return d.error || 'error';
  } catch (e) { return 'network'; }
  return null;
}

function eqVariantOf(r) {
  const vs = EQ.cfg?.variants || [];
  return vs[r ? r.v : EQ.cfg?.course?.variant] || vs[0] || null;
}

// ── Formati ──────────────────────────────────────────────────────────────────
function eqSec(ms, dec = 2) {
  const neg = ms < 0;
  ms = Math.abs(ms);
  const div = dec === 1 ? 100 : dec === 2 ? 10 : 1;
  const v = Math.floor(ms / div);
  const s = Math.floor(v / (1000 / div));
  const f = String(v % (1000 / div)).padStart(dec, '0');
  return (neg ? '−' : '') + s + (dec ? ',' + f : '');
}
function eqPts(p) {
  if (p === undefined || p === null) return '';
  return Number.isInteger(p) ? String(p) : String(p).replace('.', ',');
}
function eqRiderName(comp) {
  const n = typeof getAthleteName === 'function' ? getAthleteName(comp) : '';
  const s = typeof getAthleteSurname === 'function' ? getAthleteSurname(comp) : '';
  return [s, n].filter(x => x && x !== '-').join(' ');
}
function eqPhaseLabel(phase, v) {
  const fm = v?.final || 0;
  if (fm === 1) return phase === 2 ? eqT('barrage') : eqT('phase1');
  if (fm === 2) return phase === 2 ? eqT('phase2') : eqT('phase1b');
  return eqT('phase1');
}
function eqReasonText(r) {
  if (r.ret) return eqT('ret');
  if (!r.elim) return '';
  if (r.reason === 'manual' || !r.reason) return eqT('elim');
  const why = r.reason === 'time_limit' ? eqT('reason_time_limit') : r.reason === 'refusals' ? eqT('reason_refusals') : r.reason;
  return `${eqT('elim')}: ${why}`;
}

// Tempo e conto alla rovescia dal vivo (dall'ultimo messaggio della Main)
function eqLiveMs(r) {
  if (!r) return 0;
  if (r.st === 'running' && r === EQ.cur) return r.t + (performance.now() - EQ.curAt);
  return r.t;
}
function eqCountdownMs(r) {
  if (!r || r.st !== 'countdown') return 0;
  return Math.max(0, (r.cd || 0) - (performance.now() - EQ.curAt));
}

// Penalità di tempo dal vivo (stessa regola della Main), per vederle salire durante il percorso
function eqLiveTimePen(r, ms) {
  const v = eqVariantOf(r);
  if (!v || !v.tp || !v.tp.mode || !r.ta || ms <= r.ta) return 0;
  const over = Math.floor(ms / 10) * 10 - r.ta, every = v.tp.every * 1000;
  const n = v.tp.commenced ? Math.ceil(over / every) : Math.floor(over / every);
  return n * v.tp.amount;
}

// ── Classifica ───────────────────────────────────────────────────────────────
function eqDone(r) { return r.st === 'finished' || r.st === 'confirmed'; }

// Ultimo turno concluso di ogni cavaliere in quella fase
function eqLatestByComp(phase) {
  const map = new Map();
  EQ.rounds.filter(r => eqDone(r) && r.phase === phase).forEach(r => {
    const p = map.get(r.comp);
    if (!p || r.id > p.id) map.set(r.comp, r);
  });
  return [...map.values()];
}

function eqKey(r, rankMode) {
  const status = r.elim ? 2 : r.ret ? 1 : 0;   // in gara, ritirati, eliminati
  if (rankMode === 1) return [status, r.tt];
  if (rankMode === 2) return [status, r.pts];
  return [status, r.pts, r.t];
}
function eqCmp(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

// which: 1 = prima fase, 2 = barrage/seconda fase, 'final' = classifica finale
function eqRanking(which) {
  const v = eqVariantOf(null);
  const rankMode = v?.rank || 0;
  const fm = v?.final || 0;
  let entries;
  if (which === 'final' && fm) {
    const p1 = new Map(eqLatestByComp(1).map(r => [r.comp, r]));
    const p2 = eqLatestByComp(2);
    const inP2 = new Set(p2.map(r => r.comp));
    const top = p2.map(r => {
      const first = p1.get(r.comp);
      // due fasi: penalità sommate, tempo della seconda; barrage: solo il barrage
      const key = fm === 2 ? [r.elim || first?.elim ? 2 : r.ret ? 1 : 0, (first?.pts || 0) + r.pts, r.t] : eqKey(r, rankMode);
      return { r, first, key: [0, ...key] };
    });
    const rest = [...p1.values()].filter(r => !inP2.has(r.comp)).map(r => ({ r, key: [1, ...eqKey(r, rankMode)] }));
    entries = [...top, ...rest];
  } else {
    entries = eqLatestByComp(which === 'final' ? 1 : which).map(r => ({ r, key: eqKey(r, rankMode) }));
  }
  entries.sort((a, b) => eqCmp(a.key, b.key));
  let pos = 0;
  entries.forEach((e, i) => {
    if (i === 0 || eqCmp(e.key, entries[i - 1].key) !== 0) pos = i + 1;
    e.pos = (e.r.elim || e.r.ret) ? null : pos;
  });
  return entries;
}

function eqPositionOf(r) {
  if (!r || !eqDone(r)) return null;
  const fm = eqVariantOf(r)?.final || 0;
  const e = eqRanking(fm === 2 ? 'final' : r.phase).find(x => x.r.id === r.id);
  return e ? e.pos : null;
}

// ── Suono della campana (WebAudio, nessun file) ──────────────────────────────
let _eqAudio = null;
function eqBell() {
  try {
    _eqAudio = _eqAudio || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _eqAudio, t0 = ctx.currentTime;
    [0, 0.45].forEach(dt => {
      [880, 1760, 2640].forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime([0.5, 0.2, 0.08][i], t0 + dt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 1.6);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + dt);
        o.stop(t0 + dt + 1.7);
      });
    });
  } catch (e) { /* audio non disponibile */ }
}
let eqSoundEnabled = true;
function eqMaybeBell(prev, cur) {
  if (!eqSoundEnabled || !cur || !prev || prev.id !== cur.id) return;
  const p = prev.st, c = cur.st;
  if ((p === 'ready' && c === 'countdown') || (p === 'running' && c === 'paused') || (p === 'paused' && c === 'running')) eqBell();
}

// ── Testo del risultato (per i giudici) ──────────────────────────────────────
function eqResultText(r) {
  if (!r) return '';
  const name = eqRiderName(r.comp);
  const parts = [`${r.comp}${name ? ' ' + name : ''}`];
  if (r.elim || r.ret) parts.push(eqReasonText(r).toUpperCase());
  else {
    parts.push(`${eqT('time')} ${eqSec(r.t)} ${eqT('sec_short')}`);
    if (r.fp) parts.push(`${eqT('faults')} ${eqPts(r.fp)}`);
    if (r.tp) parts.push(`${eqT('timepen')} ${eqPts(r.tp)}`);
    parts.push(`${eqT('total')} ${eqPts(r.pts)} ${eqT('pts')}`);
    const pos = eqPositionOf(r);
    if (pos) parts.push(`${pos}°`);
  }
  return parts.join(' · ');
}

// ── Animazione dei tempi dal vivo ────────────────────────────────────────────
const eqTickers = [];
// Timer fisso (non requestAnimationFrame, che si ferma con la pagina in secondo piano)
setInterval(() => { eqTickers.forEach(fn => { try { fn(); } catch (e) { /* niente */ } }); }, 50);

// ═════════════════════════════════════════════════════════════════════════════
// CONSOLE (index.html): pannello dell'operatore, classifica, impostazioni
// ═════════════════════════════════════════════════════════════════════════════

function eqConsoleLabels() {
  const set = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = eqT(key); };
  set('eqStartBtn', 'start'); set('eqFinishBtn', 'finish'); set('eqElimBtn', 'elim'); set('eqRetBtn', 'ret');
  set('eqConfirmBtn', 'confirm'); set('eqCancelBtn', 'cancel_round'); set('eqGoBtn', 'go'); set('eqRankTitle', 'rank');
  set('eqCsvBtn', 'csv'); set('eqShowRank', 'rank'); set('eqShowRows', 'rows'); set('eqSettingsTitle', 'settings'); set('eqTabCourse', 'tab_course'); set('eqTabRules', 'tab_rules');
  set('eqEnableLabel', 'assisted'); set('eqEnableHint', 'assisted_hint');
  set('eqSettingsClose', 'close'); set('eqSettingsSave', 'save'); set('eqEditTitle', 'edit'); set('eqEditClose', 'close');
  const head = document.getElementById('eqRankHead');
  if (head) head.innerHTML = [eqT('pos'), '#', eqT('rider'), eqT('time'), eqT('faults'), eqT('timepen'), eqT('total')].map(h => `<th>${eqEsc(h)}</th>`).join('');
  const inp = document.getElementById('eqCompInput');
  if (inp) inp.placeholder = eqT('rider') + ' #';
}

// Sotto il pannello: classifica (predefinita) o griglia dei passaggi
const EQ_ROWS_KEY = 'chronofit_eq_console_rows';
function eqShowRows(show) {
  document.querySelector('.arrivals-area')?.classList.toggle('eq-show-rows', show);
  document.getElementById('eqShowRank')?.classList.toggle('active', !show);
  document.getElementById('eqShowRows')?.classList.toggle('active', show);
  try { localStorage.setItem(EQ_ROWS_KEY, show ? '1' : '0'); } catch (e) { /* niente */ }
}

// Fase del prossimo turno: quella scelta nel selettore del pannello (visibile con barrage / due fasi),
// altrimenti la fase predefinita del percorso
function eqNextPhase() {
  const ps = document.getElementById('eqPhaseSel');
  const v = ps && ps.style.display !== 'none' ? Number(ps.value) : 0;
  return v || EQ.cfg?.course?.phase || 1;
}

// Elenco Attesi con le Gare accese: dipende dalla fase del prossimo turno e dai turni gia' conclusi.
// Fase 1: chi non l'ha ancora corsa. Fase 2 (barrage / seconda fase, anche nelle gare miste con rientro
// dopo l'ultimo cavallo): chi ha concluso la fase 1 senza essere eliminato o ritirato e non ha ancora
// corso la 2. Restituisce null (= regola standard con il flag "arrived") a Gare spente.
function eqWaitingFilter() {
  if (!eqActive()) return null;
  const p1 = new Map(eqLatestByComp(1).map(r => [r.comp, r]));
  if (eqNextPhase() === 2) {
    const p2 = new Set(eqLatestByComp(2).map(r => r.comp));
    return c => { const r = p1.get(Number(c)); return !!r && !r.elim && !r.ret && !p2.has(Number(c)); };
  }
  return c => !p1.has(Number(c));
}

// Ridisegna gli Attesi solo se e' cambiato qualcosa che li riguarda (gli aggiornamenti arrivano ogni secondo)
let eqWaitSig = '';
function eqRefreshWaiting() {
  const sig = eqActive()
    ? eqNextPhase() + ':' + EQ.rounds.filter(eqDone).map(r => r.id + (r.elim ? 'e' : r.ret ? 'r' : '')).join(',')
    : 'off';
  if (sig === eqWaitSig) return;
  eqWaitSig = sig;
  if (typeof renderCompQuickList === 'function') renderCompQuickList();
}

// Cavaliere che ha finito il percorso: esce dagli Attesi
let eqMarkedId = 0;
function eqMarkArrived() {
  const r = EQ.cur;
  if (!r || !eqDone(r) || r.id === eqMarkedId) return;
  eqMarkedId = r.id;
  if (typeof markAthleteArrived === 'function' && r.comp > 0) markAthleteArrived(r.comp);
}

// Le gare sono disponibili solo con la disciplina Equitazione: con le altre il
// toggle "Gare" non si vede e la console resta quella standard.
function eqDisciplineActive() {
  return typeof activeDisciplineId === 'undefined' || activeDisciplineId === 'equestrian';
}

// Gara assistita accesa/spenta: da spenta la console è quella standard
function eqApplyConsoleMode() {
  const active = eqDisciplineActive();
  document.querySelector('.arrivals-area')?.classList.toggle('eq-off', !(EQ.on && active));
  document.querySelectorAll('.eq-enable-row, .eq-enable-hint').forEach(el => { el.style.display = active ? '' : 'none'; });
  const tog = document.getElementById('eqEnableToggle');
  if (tog) tog.checked = EQ.on;
}

// Cambio di disciplina dalla console: uscendo dall'Equitazione le gare si spengono, così
// il cronometro delle altre discipline resta quello di sempre (linea di start compresa).
async function eqOnDisciplineChange() {
  if (!eqDisciplineActive() && EQ.on) {
    try { await fetch('/eqEnable?on=0'); } catch (e) { /* si riprova al prossimo cambio */ }
    await eqLoad();
  }
  eqApplyConsoleMode();
}

async function eqSetEnabled(on) {
  if (on === EQ.on) return;
  const r = EQ.cur;
  if (!on && r && ['countdown', 'running', 'paused'].includes(r.st) &&
      !(await uiConfirm(eqT('off_confirm')))) { eqApplyConsoleMode(); return; }
  try {
    const d = await (await fetch('/eqEnable?on=' + (on ? 1 : 0))).json();
    EQ.on = !!d.on;
  } catch (e) { eqToast(eqT('err', 'network')); }
  eqApplyConsoleMode();
  eqLoad();
}

function eqConsoleInit() {
  if (!document.getElementById('eqCard')) return;
  EQ.listeners.push(eqApplyConsoleMode);
  EQ.listeners.push(eqMarkArrived);
  EQ.listeners.push(eqRefreshWaiting);
  document.getElementById('eqPhaseSel')?.addEventListener('change', eqRefreshWaiting);
  let rows = false;
  try { rows = localStorage.getItem(EQ_ROWS_KEY) === '1'; } catch (e) { /* niente */ }
  eqShowRows(rows);
  EQ.listeners.push(eqRenderConsole);
  eqTickers.push(eqTickConsole);
  document.getElementById('eqCompInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') eqSelectFromInput(); });
  eqLoad();
}

function eqToast(msg) {
  if (typeof showGeneralPopup === 'function') showGeneralPopup(msg, '#455a64', 2500);
}

// source = 'list' | 'typed' (competitor scelto dall'elenco o scritto): le linee si riarmano solo con
// il toggle "Riarma la linea con un competitor scelto dall'elenco / digitato"; senza source sempre.
async function eqSelect(comp, phase, source) {
  comp = Number(comp);
  if (!comp) return;
  const params = { comp };
  phase = phase || eqNextPhase();   // lista, campo linea e campo Vai usano la stessa fase
  if (phase) params.phase = phase;
  const rearmId = source === 'list' ? 'toggle-rearm-list' : source === 'typed' ? 'toggle-rearm-typed' : '';
  if (rearmId && !document.getElementById(rearmId)?.checked) params.rearm = 0;
  let err = await eqCmd('select', params);
  if (err === 'running') {
    const c = EQ.cur;
    if (!(await uiConfirm(eqT('running_confirm', c ? c.comp : '', comp)))) return;
    err = await eqCmd('select', { ...params, force: 1 });
  }
  if (err) eqToast(eqT('err', err));
}

function eqSelectFromInput() {
  const el = document.getElementById('eqCompInput');
  const phase = Number(document.getElementById('eqPhaseSel')?.value) || undefined;
  eqSelect(el.value, phase, 'list');   // il campo numero vale come la scelta dall'elenco
  el.value = '';
}

function eqActive() {
  return EQ.on && (typeof eqDisciplineActive !== 'function' || eqDisciplineActive());
}

// Gare accese: un competitor scritto o scelto in un campo linea prepara il turno (campana attiva)
// come il tocco sulla lista; se il suo turno e' gia' pronto non ne crea un altro.
function eqOnCompetitorAssigned(comp, source) {
  if (!eqActive() || !Number(comp)) return;
  const c = EQ.cur;
  if (c && Number(c.comp) === Number(comp) && c.st === 'ready') return;
  eqSelect(comp, undefined, source);
}

// Pulsante Reset del tempo trascorso: il cavaliere attuale riparte con un turno pronto.
// Senza turno attivo ("no_round") resta il Reset standard.
async function eqReset() {
  if (!eqActive()) return;
  const rearm = document.getElementById('toggle-rearm-list')?.checked ? 1 : 0;
  const err = await eqCmd('reset', { rearm });
  if (err && err !== 'no_round') eqToast(eqT('err', err));
}

async function eqDo(c, params) {
  const err = await eqCmd(c, params);
  if (err) eqToast(eqT('err', err));
}

function eqCancelCurrent() {
  if (!EQ.cur) return;
  eqDo('cancel', { id: EQ.cur.id });
}

function eqCopyResult(id) {
  const r = EQ.rounds.find(x => x.id === id) || EQ.cur;
  const txt = eqResultText(r);
  (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => eqToast(eqT('copied'))).catch(() => uiShowText(eqT('copy'), txt));
}

// Turno concluso della 1ª fase dello stesso cavaliere (due fasi)
function eqPhase1Of(r) {
  return EQ.rounds.filter(x => x.comp === r.comp && x.phase === 1 && eqDone(x) && x.id < r.id).sort((a, b) => b.id - a.id)[0] || null;
}
function eqPhaseInfo(r) {
  if (!r) return '';
  const v = eqVariantOf(r);
  const parts = [];
  if (v?.final === 2 && r.phase === 2) {
    const p1 = eqPhase1Of(r);
    if (p1) parts.push(`${eqT('phase1_res')}: ${eqPts(p1.pts)} ${eqT('pts')} · ${eqSec(p1.t)} ${eqT('sec_short')}`);
  }
  if (r.mid) parts.push(`${eqT('mid')} ${eqSec(r.mid)} ${eqT('sec_short')}`);
  const mid = EQ.cfg?.course?.mid;
  if (v?.final === 2 && v.consec && mid && r.phase === 1 && ['ready', 'countdown', 'running', 'paused'].includes(r.st)) parts.push(eqT('mid_hint', mid));
  return parts.join(' · ');
}

function eqStateText(r) {
  if (!r) return eqT('none_selected');
  let s = eqT(r.st);
  if (r.st === 'running' && r.auto) s += ' (' + eqT('auto') + ')';
  if (r.elim || r.ret) s += ' · ' + eqReasonText(r);
  return s;
}

function eqRenderConsole() {
  const r = EQ.cur;
  const v = eqVariantOf(r);
  const course = EQ.cfg?.course || {};
  document.getElementById('eqRiderNum').textContent = r ? r.comp : '—';
  document.getElementById('eqRiderName').textContent = r ? eqRiderName(r.comp) : '';
  const ta = r ? r.ta : EQ.cfg?.taMs;
  document.getElementById('eqMeta').textContent = [
    v?.name, eqPhaseLabel(r ? r.phase : course.phase, v),
    ta ? `${eqT('ta')} ${eqSec(ta, 0)} ${eqT('sec_short')}` : '',
  ].filter(Boolean).join(' · ');
  const stEl = document.getElementById('eqState');
  stEl.textContent = eqStateText(r);
  const pi = document.getElementById('eqPhaseInfo');
  if (pi) pi.textContent = eqPhaseInfo(r);
  document.getElementById('eqCard').dataset.state = r ? r.st : 'none';

  // pulsanti secondo lo stato
  const st = r?.st;
  const bell = document.getElementById('eqBellBtn');
  bell.textContent = st === 'running' ? eqT('stop') : st === 'paused' ? eqT('resume') : eqT('bell');
  bell.disabled = !r || ['finished', 'confirmed', 'cancelled'].includes(st);
  document.getElementById('eqStartBtn').disabled = !(st === 'ready' || st === 'countdown');
  document.getElementById('eqFinishBtn').disabled = !(st === 'running' || st === 'paused');
  document.getElementById('eqConfirmBtn').disabled = st !== 'finished';
  const active = r && !['cancelled'].includes(st);
  ['eqElimBtn', 'eqRetBtn', 'eqCancelBtn'].forEach(id => { document.getElementById(id).disabled = !active; });
  document.getElementById('eqElimBtn').classList.toggle('on', !!r?.elim && r?.reason === 'manual');
  document.getElementById('eqRetBtn').classList.toggle('on', !!r?.ret);

  // errori: un pulsante per tipo, con il conteggio
  const fbox = document.getElementById('eqFaults');
  fbox.innerHTML = '';
  (v?.faults || []).forEach((f, k) => {
    const n = r?.faults?.[k] || 0;
    const wrap = document.createElement('div');
    wrap.className = 'eq-fault' + (n ? ' has' : '');
    const plus = document.createElement('button');
    plus.className = 'eq-fault-add';
    const detail = [f.pts ? `${eqPts(f.pts)} ${eqT('pts')}` : '', f.sec ? `+${eqPts(f.sec)} ${eqT('sec_short')}` : '', f.elim ? 'ELIM.' : ''].filter(Boolean).join(' · ');
    plus.innerHTML = `<span class="eq-fault-label">${eqEsc(f.label)}</span><span class="eq-fault-detail">${eqEsc(detail)}</span>${n ? `<span class="eq-fault-count">${n}</span>` : ''}`;
    plus.disabled = !r || !['running', 'paused', 'finished', 'confirmed'].includes(st);
    plus.onclick = () => eqDo('fault', { id: r.id, k, d: 1 });
    const minus = document.createElement('button');
    minus.className = 'eq-fault-minus';
    minus.textContent = '−';
    minus.disabled = !n;
    minus.onclick = () => eqDo('fault', { id: r.id, k, d: -1 });
    wrap.append(plus, minus);
    fbox.appendChild(wrap);
  });

  // risultato
  const res = document.getElementById('eqResult');
  if (!r || ['ready', 'countdown'].includes(st)) { res.innerHTML = ''; }
  else {
    const pos = eqPositionOf(r);
    res.innerHTML = r.elim || r.ret
      ? `<div class="eq-res-big eq-res-elim">${eqEsc(eqReasonText(r).toUpperCase())}</div>`
      : `<div class="eq-res-grid">
           <div><span>${eqT('faults')}</span><b id="eqResFp">${eqPts(r.fp)}</b></div>
           <div><span>${eqT('timepen')}</span><b id="eqResTp">${eqPts(r.tp)}</b></div>
           <div class="eq-res-total"><span>${eqT('total')}</span><b id="eqResPts">${eqPts(r.pts)}</b></div>
           <div><span>${eqT('pos')}</span><b>${pos ? pos + '°' : '—'}</b></div>
         </div>`;
    if (eqDone(r)) res.innerHTML += `<button class="eq-btn eq-copy" onclick="eqCopyResult(${r.id})">${eqT('copy')}</button>`;
  }

  // fase del prossimo turno
  const ps = document.getElementById('eqPhaseSel');
  if (ps) {
    const fm = v?.final || 0;
    const want = String(course.phase || 1);
    const keep = ps.value, unchanged = ps.dataset.want === want;   // la scelta dell'operatore resta finche' non cambia la fase predefinita
    ps.innerHTML = `<option value="1">${eqPhaseLabel(1, v)}</option>` + (fm ? `<option value="2">${eqPhaseLabel(2, v)}</option>` : '');
    ps.value = fm ? (unchanged && keep ? keep : want) : '1';
    ps.dataset.want = want;
    ps.style.display = fm ? '' : 'none';
  }
  eqRenderRanking();
}

function eqTickConsole() {
  const el = document.getElementById('eqClock');
  if (!el) return;
  const r = EQ.cur;
  el.classList.remove('cd', 'cd-warn', 'run', 'pause', 'over');
  if (!r) { el.textContent = '—'; return; }
  if (r.st === 'countdown') {
    const ms = eqCountdownMs(r);
    el.textContent = Math.ceil(ms / 1000);
    el.classList.add('cd');
    if (ms <= 10000) el.classList.add('cd-warn');
    return;
  }
  if (r.st === 'ready') { el.textContent = eqSec(0); return; }
  const ms = eqLiveMs(r);
  el.textContent = eqSec(ms);
  if (r.st === 'running') el.classList.add('run');
  if (r.st === 'paused') el.classList.add('pause');
  if (r.ta && ms > r.ta && !eqDone(r)) {
    el.classList.add('over');
    const tp = document.getElementById('eqResTp');
    const live = eqLiveTimePen(r, ms);
    if (tp && r.st === 'running') {
      tp.textContent = eqPts(live);
      const pts = document.getElementById('eqResPts');
      const v = eqVariantOf(r);
      if (pts && v?.tp?.mode === 1) pts.textContent = eqPts((r.fp || 0) + live);
    }
  }
}

let eqRankWhich = 1;
function eqRenderRanking() {
  const body = document.getElementById('eqRankBody');
  if (!body) return;
  const v = eqVariantOf(null);
  const sel = document.getElementById('eqRankSel');
  if (sel) {
    const fm = v?.final || 0;
    const opts = [['1', eqPhaseLabel(1, v)]];
    if (fm) opts.push(['2', eqPhaseLabel(2, v)], ['final', eqT('final')]);
    sel.innerHTML = opts.map(([val, lab]) => `<option value="${val}">${eqEsc(lab)}</option>`).join('');
    if (!opts.some(o => o[0] === String(eqRankWhich))) eqRankWhich = 1;
    sel.value = String(eqRankWhich);
    // percorso unico: c'è una sola classifica, il menu non serve
    sel.style.display = opts.length > 1 ? '' : 'none';
  }
  const rows = eqRanking(eqRankWhich);
  if (!rows.length) { body.innerHTML = `<tr><td colspan="7" class="eq-empty">${eqT('no_rounds')}</td></tr>`; return; }
  body.innerHTML = rows.map(e => {
    const r = e.r;
    const extra = e.first ? ` <small>(${eqPts(e.first.pts)} + ${eqPts(r.pts)})</small>` : '';
    const status = r.elim || r.ret ? `<span class="eq-tag">${eqEsc(r.ret ? eqT('ret_short') : eqT('elim_short'))}</span>` : '';
    return `<tr onclick="eqOpenEdit(${r.id})" class="${r.st === 'finished' ? 'eq-unconfirmed' : ''}">
      <td>${e.pos ?? '—'}</td><td>${r.comp}</td><td class="eq-name">${eqEsc(eqRiderName(r.comp))}</td>
      <td>${r.elim || r.ret ? '' : eqSec(r.t)}</td><td>${r.elim || r.ret ? '' : eqPts(r.fp)}</td>
      <td>${r.elim || r.ret ? '' : eqPts(r.tp)}</td><td><b>${r.elim || r.ret ? status : eqPts(r.pts) + extra}</b></td></tr>`;
  }).join('');
}

function eqRankChange(val) {
  eqRankWhich = val === 'final' ? 'final' : Number(val);
  eqRenderRanking();
}

function eqExportCsv() {
  const rows = eqRanking(eqRankWhich);
  const lines = [[eqT('pos'), '#', eqT('rider'), eqT('time'), eqT('mid'), eqT('faults'), eqT('timepen'), eqT('total'), eqT('status')].join(';')];
  rows.forEach(e => {
    const r = e.r;
    lines.push([e.pos ?? '', r.comp, eqRiderName(r.comp), r.elim || r.ret ? '' : eqSec(r.t), r.mid ? eqSec(r.mid) : '', eqPts(r.fp), eqPts(r.tp), eqPts(r.pts),
                r.elim || r.ret ? eqReasonText(r) : ''].join(';'));
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
  a.download = 'classifica_equitazione.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Modifica di un turno (correzioni dei giudici) ────────────────────────────
let eqEditId = null;
function eqOpenEdit(id) {
  eqEditId = id;
  document.getElementById('eqEditOverlay').style.display = 'flex';
  eqRenderEdit();
}
function eqCloseEdit() {
  eqEditId = null;
  document.getElementById('eqEditOverlay').style.display = 'none';
}
EQ.listeners.push(() => {
  // non ridisegnare mentre si scrive il tempo corretto
  if (eqEditId !== null && document.activeElement?.id !== 'eqEditTime') eqRenderEdit();
});

function eqRenderEdit() {
  const r = EQ.rounds.find(x => x.id === eqEditId);
  const box = document.getElementById('eqEditBody');
  if (!r || !box) return;
  const v = eqVariantOf(r);
  const fm = v?.final || 0;
  box.innerHTML = `
    <p class="eq-edit-head">${eqEsc(eqResultText(r))}</p>
    ${fm ? `<div class="toggle-row"><span>${eqT('phase')}</span><select onchange="eqDo('phase',{id:${r.id},p:this.value})">
        <option value="1" ${r.phase === 1 ? 'selected' : ''}>${eqPhaseLabel(1, v)}</option>
        <option value="2" ${r.phase === 2 ? 'selected' : ''}>${eqPhaseLabel(2, v)}</option></select></div>` : ''}
    <div class="eq-faults">${(v?.faults || []).map((f, k) => `
      <div class="eq-fault ${r.faults[k] ? 'has' : ''}">
        <button class="eq-fault-add" onclick="eqDo('fault',{id:${r.id},k:${k},d:1})"><span class="eq-fault-label">${eqEsc(f.label)}</span>${r.faults[k] ? `<span class="eq-fault-count">${r.faults[k]}</span>` : ''}</button>
        <button class="eq-fault-minus" ${r.faults[k] ? '' : 'disabled'} onclick="eqDo('fault',{id:${r.id},k:${k},d:-1})">−</button>
      </div>`).join('')}</div>
    <div class="toggle-row"><span>${eqT('status')}</span><select onchange="eqDo('status',{id:${r.id},s:this.value})">
      <option value="" ${!r.ret && !(r.elim && r.reason === 'manual') ? 'selected' : ''}>${eqT('normal')}</option>
      <option value="elim" ${r.elim && r.reason === 'manual' ? 'selected' : ''}>${eqT('elim')}</option>
      <option value="ret" ${r.ret ? 'selected' : ''}>${eqT('ret')}</option></select></div>
    <div class="toggle-row"><span>${eqT('time_override')}</span>
      <span class="eq-inline"><input type="text" id="eqEditTime" inputmode="decimal" value="${eqSec(r.t)}">
      <button class="eq-mini" onclick="eqApplyTime(${r.id})">${eqT('apply')}</button>
      ${r.ovr ? `<button class="eq-mini" onclick="eqDo('time',{id:${r.id},ms:-1})">${eqT('restore')}</button>` : ''}</span></div>
    <div class="button-row">
      ${fm && r.phase === 1 ? `<button class="big-button" onclick="eqCloseEdit(); eqSelect(${r.comp}, 2);">▶ ${eqEsc(eqPhaseLabel(2, v))}</button>` : ''}
      ${r.st === 'finished' ? `<button class="big-button" onclick="eqDo('confirm',{id:${r.id}})">${eqT('confirm')}</button>` : ''}
      <button class="big-button" onclick="uiConfirm('${eqT('cancel_round')}?').then(ok => { if (ok) { eqDo('cancel',{id:${r.id}}); eqCloseEdit(); } })">${eqT('cancel_round')}</button>
    </div>`;
}

function eqApplyTime(id) {
  const v = parseFloat(String(document.getElementById('eqEditTime').value).replace(',', '.'));
  if (!(v >= 0)) return;
  eqDo('time', { id, ms: Math.round(v * 1000) });
}

// ── Impostazioni: gara e regolamento ─────────────────────────────────────────
let eqDraft = null;     // copia modificabile del regolamento
let eqEditVariant = 0;
let eqSettingsTab = 'course';

function openEqSettings(tab = 'course') {
  if (!EQ.cfg) return;
  eqDraft = JSON.parse(JSON.stringify({ variants: EQ.cfg.variants, course: EQ.cfg.course }));
  eqEditVariant = eqDraft.course.variant || 0;
  eqSettingsTab = tab;
  document.getElementById('eqSettingsOverlay').style.display = 'flex';
  eqRenderSettings();
}
function closeEqSettings() {
  document.getElementById('eqSettingsOverlay').style.display = 'none';
  eqDraft = null;
}

function eqField(label, html) { return `<div class="toggle-row eq-set-row"><span>${label}</span>${html}</div>`; }
function eqLineSel(path, val, withNone = false) {
  const opts = (withNone ? [[0, eqT('none')]] : []).concat([1, 2, 3, 4].map(n => [n, 'L' + n]));
  return `<select onchange="eqSet('${path}', Number(this.value)); eqRenderSettings();">${opts.map(([n, lab]) => `<option value="${n}" ${val === n ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
}

function eqSet(path, value) {
  const parts = path.split('.');
  let o = eqDraft;
  parts.slice(0, -1).forEach(p => { o = o[p]; });
  o[parts[parts.length - 1]] = value;
  if (path.startsWith('course.length') || path.startsWith('course.speed') || path.startsWith('course.ta')) eqRenderSettings();
}

function eqCalcTa(c, phase = 1) {
  let fixed = c.ta, len = c.length;
  if (phase === 2 && (c.ta2 || c.length2)) { fixed = c.ta2; len = c.length2; }
  if (fixed) return fixed;
  if (!len || !c.speed) return 0;
  return Math.ceil(len * 60000 / c.speed / 1000) * 1000;
}

function eqRenderSettings() {
  const box = document.getElementById('eqSettingsBody');
  if (!box || !eqDraft) return;
  document.querySelectorAll('#eqSettingsOverlay .tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === eqSettingsTab));
  const c = eqDraft.course;
  if (eqSettingsTab === 'course') {
    const v = eqDraft.variants[c.variant] || eqDraft.variants[0];
    const ta = eqCalcTa(c);
    const tl = v?.tl && ta ? ta * v.tl : 0;
    box.innerHTML =
      eqField(eqT('variant'), `<select onchange="eqSet('course.variant', Number(this.value)); eqRenderSettings();">${eqDraft.variants.map((x, i) => `<option value="${i}" ${i === c.variant ? 'selected' : ''}>${eqEsc(x.name)}</option>`).join('')}</select>`) +
      eqField(eqT('start_line'), eqLineSel('course.start', c.start)) +
      eqField(eqT('finish_line'), eqLineSel('course.finish', c.finish)) +
      eqField(eqT('mid_line'), eqLineSel('course.mid', c.mid || 0, true)) +
      (c.mid && (c.mid === c.start || c.mid === c.finish) ? `<p class="eq-note">${eqT('mid_conflict')}</p>` : '') +
      (v?.final === 2 && v.consec && !c.mid ? `<p class="eq-note">${eqT('mid_needed')}</p>` : '') +
      eqField(eqT('length'), `<input type="number" min="0" value="${c.length || ''}" onchange="eqSet('course.length', Number(this.value)||0)">`) +
      eqField(eqT('speed'), `<input type="number" min="0" value="${c.speed || ''}" onchange="eqSet('course.speed', Number(this.value)||0)">`) +
      eqField(eqT('ta_override'), `<input type="text" inputmode="decimal" value="${c.ta ? eqSec(c.ta, 0) : ''}" onchange="eqSet('course.ta', Math.round((parseFloat(this.value.replace(',','.'))||0)*1000))">`) +
      `<p class="eq-calc">${eqT('ta_calc')}: <b>${ta ? eqSec(ta, 0) + ' ' + eqT('sec_short') : '—'}</b>${tl ? ` · ${eqT('tl')}: <b>${eqSec(tl, 0)} ${eqT('sec_short')}</b>` : ''}</p>` +
      ((v?.final || 0) ? eqField(eqT('length2'), `<input type="number" min="0" value="${c.length2 || ''}" onchange="eqSet('course.length2', Number(this.value)||0); eqRenderSettings();">`) +
        eqField(eqT('ta2_override'), `<input type="text" inputmode="decimal" value="${c.ta2 ? eqSec(c.ta2, 0) : ''}" onchange="eqSet('course.ta2', Math.round((parseFloat(this.value.replace(',','.'))||0)*1000)); eqRenderSettings();">`) +
        `<p class="eq-calc">${eqT('ta2_calc')}: <b>${eqCalcTa(c, 2) ? eqSec(eqCalcTa(c, 2), 0) + ' ' + eqT('sec_short') : '—'}</b></p>` : '') +
      ((v?.final || 0) ? eqField(eqT('default_phase'), `<select onchange="eqSet('course.phase', Number(this.value))"><option value="1" ${c.phase === 1 ? 'selected' : ''}>${eqPhaseLabel(1, v)}</option><option value="2" ${c.phase === 2 ? 'selected' : ''}>${eqPhaseLabel(2, v)}</option></select>`) : '');
    return;
  }
  // regolamento
  const v = eqDraft.variants[eqEditVariant];
  const p = `variants.${eqEditVariant}`;
  const chk = (path, val) => `<label class="switch"><input type="checkbox" ${val ? 'checked' : ''} onchange="eqSet('${path}', this.checked)"><span class="slider"></span></label>`;
  const num = (path, val, step = 1) => `<input type="number" step="${step}" value="${val}" onchange="eqSet('${path}', Number(this.value)||0)">`;
  const opt = (path, val, list) => `<select onchange="eqSet('${path}', Number(this.value))">${list.map((lab, i) => `<option value="${i}" ${val === i ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
  box.innerHTML =
    `<p class="eq-note">${eqT('rules_note')}</p>` +
    eqField(eqT('variant'), `<select onchange="eqEditVariant = Number(this.value); eqRenderSettings();">${eqDraft.variants.map((x, i) => `<option value="${i}" ${i === eqEditVariant ? 'selected' : ''}>${eqEsc(x.name)}</option>`).join('')}</select>`) +
    `<div class="button-row eq-var-actions"><button class="eq-mini" onclick="eqDupVariant()">${eqT('dup_variant')}</button>
       <button class="eq-mini" onclick="eqDelVariant()" ${eqDraft.variants.length < 2 ? 'disabled' : ''}>${eqT('del_variant')}</button>
       <button class="eq-mini" onclick="eqResetDefaults()">${eqT('reset_defaults')}</button></div>` +
    eqField(eqT('name'), `<input type="text" value="${eqEsc(v.name)}" onchange="eqSet('${p}.name', this.value); eqRenderSettings();">`) +
    eqField(eqT('countdown_s'), num(`${p}.cd`, v.cd)) +
    eqField(eqT('autostart'), chk(`${p}.auto`, v.auto)) +
    eqField(eqT('warn'), chk(`${p}.warn`, v.warn)) +
    eqField(eqT('tp_mode'), opt(`${p}.tp.mode`, v.tp.mode, [eqT('tp_none'), eqT('tp_points'), eqT('tp_seconds')])) +
    eqField(eqT('tp_every'), num(`${p}.tp.every`, v.tp.every)) +
    eqField(eqT('tp_amount'), num(`${p}.tp.amount`, v.tp.amount, 0.25)) +
    eqField(eqT('tp_commenced'), chk(`${p}.tp.commenced`, v.tp.commenced)) +
    eqField(eqT('tl_factor'), num(`${p}.tl`, v.tl, 0.5)) +
    eqField(eqT('rank_mode'), opt(`${p}.rank`, v.rank, [eqT('rank0'), eqT('rank1'), eqT('rank2')])) +
    eqField(eqT('final_mode'), `<select onchange="eqSet('${p}.final', Number(this.value)); eqRenderSettings();">${[eqT('final0'), eqT('final1'), eqT('final2')].map((lab, i) => `<option value="${i}" ${v.final === i ? 'selected' : ''}>${lab}</option>`).join('')}</select>`) +
    (v.final === 2 ? eqField(eqT('consec'), chk(`${p}.consec`, v.consec)) : '') +
    `<div class="card-title" style="margin-top:12px;">${eqT('faults_list')}</div>
     <div class="eq-fault-table-wrap"><table class="eq-fault-table"><thead><tr><th>${eqT('f_label')}</th><th>${eqT('f_pts')}</th><th>${eqT('f_sec')}</th><th>${eqT('f_group')}</th><th>${eqT('f_elimAt')}</th><th>${eqT('f_elim')}</th><th></th></tr></thead><tbody>
     ${v.faults.map((f, k) => `<tr>
        <td><input type="text" value="${eqEsc(f.label)}" onchange="eqSet('${p}.faults.${k}.label', this.value)"></td>
        <td><input type="number" step="0.25" value="${f.pts}" onchange="eqSet('${p}.faults.${k}.pts', Number(this.value)||0)"></td>
        <td><input type="number" step="0.5" value="${f.sec}" onchange="eqSet('${p}.faults.${k}.sec', Number(this.value)||0)"></td>
        <td><input type="number" min="0" max="9" value="${f.group}" onchange="eqSet('${p}.faults.${k}.group', Number(this.value)||0)"></td>
        <td><input type="number" min="0" value="${f.elimAt}" onchange="eqSet('${p}.faults.${k}.elimAt', Number(this.value)||0)"></td>
        <td><input type="checkbox" ${f.elim ? 'checked' : ''} onchange="eqSet('${p}.faults.${k}.elim', this.checked)"></td>
        <td><button class="eq-mini" onclick="eqDraft.variants[${eqEditVariant}].faults.splice(${k},1); eqRenderSettings();">✕</button></td></tr>`).join('')}
     </tbody></table></div>
     <button class="eq-mini" ${v.faults.length >= 8 ? 'disabled' : ''} onclick="eqDraft.variants[${eqEditVariant}].faults.push({label:'',pts:0,sec:0,group:0,elimAt:0,elim:false}); eqRenderSettings();">${eqT('add_fault')}</button>`;
}

function eqSwitchSettingsTab(tab) { eqSettingsTab = tab; eqRenderSettings(); }

function eqDupVariant() {
  if (eqDraft.variants.length >= 8) return;
  const copy = JSON.parse(JSON.stringify(eqDraft.variants[eqEditVariant]));
  copy.name += ' (2)';
  eqDraft.variants.push(copy);
  eqEditVariant = eqDraft.variants.length - 1;
  eqRenderSettings();
}
function eqDelVariant() {
  if (eqDraft.variants.length < 2) return;
  eqDraft.variants.splice(eqEditVariant, 1);
  if (eqDraft.course.variant >= eqDraft.variants.length) eqDraft.course.variant = 0;
  eqEditVariant = 0;
  eqRenderSettings();
}
async function eqResetDefaults() {
  if (!(await uiConfirm(eqT('reset_confirm')))) return;
  try {
    const d = await (await fetch('/eqConfig?reset=1')).json();
    eqDraft = { variants: d.variants, course: d.course };
    eqEditVariant = 0;
    eqRenderSettings();
    eqToast(eqT('saved'));
  } catch (e) { eqToast(eqT('err', 'network')); }
}

async function saveEqSettings() {
  try {
    const res = await fetch('/eqConfig', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: 1, ...eqDraft }) });
    if (!res.ok) throw new Error('config');
    eqToast(eqT('saved'));
    closeEqSettings();
    eqLoad();
  } catch (e) { eqToast(eqT('err', e.message || 'network')); }
}

// ═════════════════════════════════════════════════════════════════════════════
// VISTA (view_equitazione.html): cavaliere in pista, tempo, risultato, classifica
// ═════════════════════════════════════════════════════════════════════════════

const EQ_VIEW_ROWS_KEY = 'chronofit_eq_view_rows';
function eqViewRowsChanged(show) {
  try { localStorage.setItem(EQ_VIEW_ROWS_KEY, show ? '1' : '0'); } catch (e) { /* niente */ }
  const rows = document.getElementById('eqViewRows');
  if (rows) rows.style.display = (show || !EQ.on) ? '' : 'none';
}

function eqViewInit() {
  if (!document.getElementById('eqViewPanel')) return;
  let show = false;
  try { show = localStorage.getItem(EQ_VIEW_ROWS_KEY) === '1'; } catch (e) { /* niente */ }
  const tog = document.getElementById('eqViewRowsToggle');
  if (tog) tog.checked = show;
  eqViewRowsChanged(show);
  const lab = document.getElementById('eqViewRowsLabel');
  if (lab) lab.textContent = eqT('view_rows');
  const head = document.getElementById('eqViewRankHead');
  if (head) head.innerHTML = [eqT('pos'), '#', eqT('rider'), eqT('time'), eqT('total')].map(h => `<th>${eqEsc(h)}</th>`).join('');
  EQ.listeners.push(eqRenderView);
  eqTickers.push(eqTickView);
  eqLoad();
}

function eqRenderView() {
  const r = EQ.on ? EQ.cur : null;
  const clock = document.getElementById('time');   // orologio dei passaggi della vista
  if (clock) clock.style.display = r ? 'none' : '';
  // Gara assistita spenta: la vista è quella standard (griglia dei passaggi e orologio)
  const panel = document.getElementById('eqViewPanel');
  panel.style.display = EQ.on ? '' : 'none';
  document.getElementById('eqViewRankWrap').style.display = EQ.on ? '' : 'none';
  document.getElementById('eqViewRowsRow').style.display = EQ.on ? '' : 'none';
  const rowsEl = document.getElementById('eqViewRows');
  if (rowsEl) rowsEl.style.display = (!EQ.on || document.getElementById('eqViewRowsToggle')?.checked) ? '' : 'none';
  if (!EQ.on) return;
  panel.dataset.state = r ? r.st : 'none';
  document.getElementById('eqViewRider').innerHTML = r
    ? `<span class="eq-view-num">${r.comp}</span> <span class="eq-view-name">${eqEsc(eqRiderName(r.comp))}</span>` : '';
  const v = eqVariantOf(r);
  document.getElementById('eqViewMeta').textContent = r
    ? [eqPhaseLabel(r.phase, v), r.ta ? `${eqT('ta')} ${eqSec(r.ta, 0)} ${eqT('sec_short')}` : '', eqPhaseInfo(r)].filter(Boolean).join(' · ') : '';
  const res = document.getElementById('eqViewResult');
  if (!r || ['ready', 'countdown'].includes(r.st)) res.innerHTML = '';
  else if (r.elim || r.ret) res.innerHTML = `<span class="eq-res-elim">${eqEsc(eqReasonText(r).toUpperCase())}</span>`;
  else {
    const pos = eqPositionOf(r);
    res.innerHTML = `<span>${eqT('faults')} <b>${eqPts(r.fp)}</b></span><span>${eqT('timepen')} <b id="eqViewTp">${eqPts(r.tp)}</b></span>` +
                    `<span class="eq-view-total">${eqT('total')} <b>${eqPts(r.pts)}</b></span>` + (pos ? `<span class="eq-view-pos">${pos}°</span>` : '');
  }
  const body = document.getElementById('eqViewRankBody');
  if (body) {
    const fm = v?.final || 0;
    const rows = eqRanking(fm && EQ.rounds.some(x => x.phase === 2 && eqDone(x)) ? 'final' : 1).slice(0, 15);
    body.innerHTML = rows.map(e => `<tr class="${e.r.id === r?.id ? 'eq-view-cur' : ''}"><td>${e.pos ?? ''}</td><td>${e.r.comp}</td>
      <td class="eq-name">${eqEsc(eqRiderName(e.r.comp))}</td><td>${e.r.elim || e.r.ret ? '' : eqSec(e.r.t)}</td>
      <td><b>${e.r.elim || e.r.ret ? eqEsc(e.r.ret ? eqT('ret_short') : eqT('elim_short')) : eqPts(e.r.pts)}</b></td></tr>`).join('');
  }
}

function eqTickView() {
  const el = document.getElementById('eqViewClock');
  if (!el) return;
  const r = EQ.cur;
  el.className = 'eq-view-clock';
  if (!r) { el.textContent = ''; return; }
  if (r.st === 'countdown') {
    const ms = eqCountdownMs(r);
    el.textContent = Math.ceil(ms / 1000);
    el.classList.add('cd');
    if (ms <= 10000) el.classList.add('cd-warn');
    return;
  }
  if (r.st === 'ready') { el.textContent = eqSec(0); return; }
  const ms = eqLiveMs(r);
  el.textContent = eqSec(ms);
  if (r.st === 'paused') el.classList.add('pause');
  if (r.ta && ms > r.ta && !eqDone(r)) {
    el.classList.add('over');
    const tp = document.getElementById('eqViewTp');
    if (tp && r.st === 'running') tp.textContent = eqPts(eqLiveTimePen(r, ms));
  }
}

// Cambio lingua: ridisegna anche i testi dell'equitazione
if (typeof setLanguage === 'function') {
  const _eqOrigSetLanguage = setLanguage;
  window.setLanguage = function (lang) {
    _eqOrigSetLanguage(lang);
    if (typeof eqConsoleLabels === 'function') eqConsoleLabels();
    eqNotify();
  };
}
