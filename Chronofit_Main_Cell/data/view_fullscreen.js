// ── Pulsante schermo intero per le viste (secondo schermo) ───────────────────
// Incluso in fondo a ogni pagina view*.html / enduro_competitor_*.html: aggiunge in basso a
// destra un piccolo pulsante, discreto (semi-trasparente) per non coprire i risultati, che
// entra e esce dallo schermo intero. Se il browser non ha l'API (es. iPhone) non fa nulla.
(function () {
  var el = document.documentElement;
  var request = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!request) return;

  var ENTER = '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>';
  var EXIT  = '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>';

  var btn = document.createElement('button');
  btn.id = 'view-fullscreen-btn';
  btn.type = 'button';
  // stile in linea: le pagine hanno una regola globale "button { width: 100%; background: … }"
  btn.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:10050;width:40px;height:40px;' +
    'min-height:0;padding:7px;margin:0;border:1px solid rgba(255,255,255,.4);border-radius:8px;' +
    'background:rgba(0,0,0,.5);color:#fff;cursor:pointer;opacity:.4;transition:opacity .2s;' +
    'display:flex;align-items:center;justify-content:center;font-size:0;';
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg>';
  var icon = btn.firstChild;

  function active() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function label() {
    if (typeof t === 'function') {
      try { var s = t('main.fullscreen'); if (s && s !== 'main.fullscreen') return s; } catch (e) { /* senza i18n */ }
    }
    return (navigator.language || '').toLowerCase().indexOf('it') === 0 ? 'Schermo intero' : 'Fullscreen';
  }

  function refresh() {
    icon.innerHTML = active() ? EXIT : ENTER;
    var l = label();
    btn.title = l;
    btn.setAttribute('aria-label', l);
  }

  btn.addEventListener('mouseenter', function () { btn.style.opacity = '1'; });
  btn.addEventListener('mouseleave', function () { btn.style.opacity = '.4'; });
  btn.addEventListener('click', function () {
    if (active()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      try {
        var p = request.call(el);
        if (p && p.catch) p.catch(function () { /* rifiutato dal browser */ });
      } catch (e) { /* idem */ }
    }
  });

  document.addEventListener('fullscreenchange', refresh);
  document.addEventListener('webkitfullscreenchange', refresh);

  function mount() {
    document.body.appendChild(btn);
    refresh();
  }
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
