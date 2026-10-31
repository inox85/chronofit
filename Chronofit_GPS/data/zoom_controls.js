// ── Pulsanti zoom + / − (console e viste) ───────────────────────────────────
// FILE CONDIVISO: identico in Chronofit_GPS, Chronofit_Main_Cell e
// Chronofit_Main_Cell_RF (data/zoom_controls.js).
//
// Ingrandisce o riduce tutta la pagina con la proprietà CSS `zoom` su <html>, per
// adattare ogni schermata al display in uso (telefono, tablet, TV, proiettore).
// Il livello è salvato nel browser per ogni pagina (chronofit_zoom:<percorso>).
//
// Con `zoom` anche le unità vh/vw vengono scalate: 100vh a 125% esce dallo schermo,
// a 80% lascia un vuoto. Per questo lo script pubblica --zvh / --zvw (1vh / 1vw
// corretti per lo zoom) e i CSS delle pagine usano calc(N * var(--zvh, 1vh)): senza
// questo script la variabile manca e vale 1vh, come prima.
//
// Posizione dei pulsanti:
//   - console (index.html): nella navbar, subito dopo il pulsante fullscreen
//     (#fullscreen-nav-btn) o, se manca, dopo "apri la vista" (#view-btn);
//   - viste: in basso a destra, a sinistra del pulsante di view_fullscreen.js,
//     con lo stesso stile discreto. Non vengono ingranditi con la pagina.
(function () {
  var MIN = 0.5, MAX = 2, STEP = 0.1;
  var path = location.pathname === '/' ? '/index.html' : location.pathname;
  var KEY = 'chronofit_zoom:' + path;
  var root = document.documentElement;

  var zoom = 1;
  try { zoom = parseFloat(localStorage.getItem(KEY)) || 1; } catch (e) { /* storage non disponibile */ }
  zoom = clamp(zoom);

  function clamp(z) { return Math.min(MAX, Math.max(MIN, Math.round(z * 10) / 10)); }

  function isIt() {
    var l = '';
    try { if (typeof currentLang === 'function') l = currentLang() || ''; } catch (e) { /* senza i18n */ }
    l = l || navigator.language || '';
    return l.toLowerCase().indexOf('it') === 0;
  }

  function updateViewportUnits() {
    if (zoom === 1) {
      root.style.removeProperty('--zvh');
      root.style.removeProperty('--zvw');
    } else {
      root.style.setProperty('--zvh', (window.innerHeight / 100 / zoom) + 'px');
      root.style.setProperty('--zvw', (root.clientWidth / 100 / zoom) + 'px');
    }
  }

  // Elementi che non devono crescere con la pagina (pulsanti flottanti, avviso %)
  var fixedSize = [];
  function keepFixedSize(el) { fixedSize.push(el); el.style.zoom = String(1 / zoom); }

  function apply() {
    root.style.zoom = zoom === 1 ? '' : String(zoom);
    updateViewportUnits();
    fixedSize.forEach(function (el) { el.style.zoom = String(1 / zoom); });
    var fs = document.getElementById('view-fullscreen-btn');
    if (fs) fs.style.zoom = String(1 / zoom);
    refreshTitles();
    updateFallback();
  }

  function setZoom(z) {
    zoom = clamp(z);
    try {
      if (zoom === 1) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(zoom));
    } catch (e) { /* idem */ }
    apply();
    showToast();
  }

  // ── Interfaccia ───────────────────────────────────────────────────────────
  var PLUS  = '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6"/>';
  var MINUS = '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M7.5 10.5h6"/>';
  function svg(paths) {
    return '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  var pairs = [];            // [{ out, in }] : navbar e/o flottanti
  var navPair = null, floatBox = null;
  var toast, toastTimer;

  function refreshTitles() {
    var pct = Math.round(zoom * 100) + '%';
    var tin  = (isIt() ? 'Ingrandisci' : 'Zoom in')  + ' (' + pct + ')';
    var tout = (isIt() ? 'Riduci'      : 'Zoom out') + ' (' + pct + ')';
    pairs.forEach(function (pr) {
      pr['in'].title = tin;   pr['in'].setAttribute('aria-label', tin);
      pr.out.title = tout;    pr.out.setAttribute('aria-label', tout);
      pr['in'].disabled = zoom >= MAX;
      pr.out.disabled = zoom <= MIN;
      pr['in'].style.opacity = pr['in'].disabled ? '.25' : '';
      pr.out.style.opacity = pr.out.disabled ? '.25' : '';
    });
  }

  function showToast() {
    if (!toast) {
      toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:10060;' +
        'padding:6px 14px;border-radius:8px;background:rgba(0,0,0,.75);color:#fff;font:bold 18px sans-serif;' +
        'pointer-events:none;transition:opacity .3s;opacity:0;';
      document.body.appendChild(toast);
      keepFixedSize(toast);
    }
    toast.textContent = Math.round(zoom * 100) + '%';
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.style.opacity = '0'; }, 1200);
  }

  function makeButton(icon, delta, cls, css) {
    var b = document.createElement('button');
    b.type = 'button';
    if (cls) b.className = cls;
    if (css) b.style.cssText = css;
    b.innerHTML = svg(icon);
    b.addEventListener('click', function (e) { e.stopPropagation(); setZoom(zoom + delta); });
    b.addEventListener('mouseenter', refreshTitles);   // la lingua può essere cambiata nel frattempo
    return b;
  }

  function mountNavbar(anchor) {
    // Stessa classe e stesso colore del pulsante accanto
    var color = getComputedStyle(anchor).color;
    navPair = { out: makeButton(MINUS, -STEP, 'navbar-icon-btn zoom-nav-btn'),
                'in': makeButton(PLUS,  +STEP, 'navbar-icon-btn zoom-nav-btn') };
    navPair.out.style.color = color;
    navPair['in'].style.color = color;
    anchor.parentNode.insertBefore(navPair['in'], anchor.nextSibling);
    anchor.parentNode.insertBefore(navPair.out, anchor.nextSibling);
    pairs.push(navPair);
  }

  function mountFloating() {
    // Stile in linea: le pagine hanno una regola globale "button { width: 100%; … }"
    var css = 'width:40px;height:40px;min-height:0;padding:7px;margin:0;border:1px solid rgba(255,255,255,.4);' +
      'border-radius:8px;background:rgba(0,0,0,.5);color:#fff;cursor:pointer;display:flex;align-items:center;' +
      'justify-content:center;font-size:0;';
    floatBox = document.createElement('div');
    floatBox.id = 'view-zoom-btns';
    // a sinistra del pulsante fullscreen (40px + 10px di margine), se c'è
    var fs = document.getElementById('view-fullscreen-btn');
    floatBox.style.cssText = 'position:fixed;bottom:10px;right:' + (fs ? 56 : 10) + 'px;z-index:10050;display:flex;gap:6px;' +
      'opacity:.4;transition:opacity .2s;';
    var pr = { out: makeButton(MINUS, -STEP, '', css), 'in': makeButton(PLUS, +STEP, '', css) };
    floatBox.appendChild(pr.out);
    floatBox.appendChild(pr['in']);
    floatBox.addEventListener('mouseenter', function () { floatBox.style.opacity = '1'; });
    floatBox.addEventListener('mouseleave', function () { floatBox.style.opacity = '.4'; });
    document.body.appendChild(floatBox);
    keepFixedSize(floatBox);
    pairs.push(pr);
  }

  // Console ingrandita su uno schermo stretto: la navbar esce a destra e con lei i
  // pulsanti zoom. In quel caso compaiono anche i pulsanti flottanti, sempre visibili,
  // per poter tornare indietro.
  function updateFallback() {
    if (!navPair) return;
    var r = navPair['in'].getBoundingClientRect();
    var hidden = r.width === 0 || r.right > window.innerWidth || r.left < 0;
    if (hidden && !floatBox) { mountFloating(); apply(); }
    if (floatBox) floatBox.style.display = hidden ? 'flex' : 'none';
  }

  function mount() {
    var anchor = document.querySelector('.navbar-right #fullscreen-nav-btn');
    if (anchor && getComputedStyle(anchor).display === 'none') anchor = null;   // es. iPhone
    anchor = anchor || document.querySelector('.navbar-right #view-btn');
    if (anchor) mountNavbar(anchor);
    else mountFloating();
    apply();
  }

  apply();   // subito, per non far vedere la pagina a 100% e poi ridimensionata
  window.addEventListener('resize', function () { updateViewportUnits(); updateFallback(); });
  document.addEventListener('fullscreenchange', updateViewportUnits);
  document.addEventListener('webkitfullscreenchange', updateViewportUnits);

  // Dopo view_fullscreen.js (incluso prima) e dopo che la navbar esiste
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
