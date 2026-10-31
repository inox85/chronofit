// Finestre di conferma e di avviso disegnate nella pagina.
// alert()/confirm()/prompt() del browser fanno uscire dallo schermo intero:
// queste no. uiConfirm(msg) → Promise<boolean>, uiAlert(msg) → Promise,
// uiShowText(msg, text) mostra un testo da copiare a mano.
// Sostituisce anche window.alert, che non restituisce valori.
(function () {
  const isIt = () => {
    try { if (typeof currentLang === 'function') return currentLang() !== 'en'; } catch (e) { /* niente */ }
    return (document.documentElement.lang || 'it').slice(0, 2) !== 'en';
  };
  const TXT = () => isIt() ? { ok: 'OK', cancel: 'Annulla', close: 'Chiudi' } : { ok: 'OK', cancel: 'Cancel', close: 'Close' };

  let styled = false;
  function addStyle() {
    if (styled) return;
    styled = true;
    const st = document.createElement('style');
    st.textContent = `
.ui-dlg-back { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center;
               z-index: 2147483000; padding: 16px; box-sizing: border-box; }
.ui-dlg { background: #fff; color: #222; border-radius: 10px; max-width: 460px; width: 100%; padding: 20px 20px 16px;
          box-shadow: 0 8px 30px rgba(0,0,0,.35); font-family: 'Nunito', sans-serif; box-sizing: border-box; }
.ui-dlg-msg { font-size: 18px; font-weight: bold; line-height: 1.35; white-space: pre-line; text-align: center; margin: 0 0 16px; }
.ui-dlg-text { width: 100%; box-sizing: border-box; min-height: 90px; font-size: 15px; margin: 0 0 14px; font-family: inherit; }
.ui-dlg-btns { display: flex; gap: 10px; }
.ui-dlg-btns button { flex: 1 1 0; width: auto; padding: 12px 10px; font-size: 17px; font-weight: bold; border: none; border-radius: 8px;
                      cursor: pointer; font-family: inherit; }
.ui-dlg-ok { background: var(--primary-color, #800020); color: #fff; }
.ui-dlg-cancel { background: #e0e0e0; color: #222; }`;
    document.head.appendChild(st);
  }

  function open(msg, { cancel = false, text = null } = {}) {
    addStyle();
    return new Promise(resolve => {
      const t = TXT();
      const back = document.createElement('div');
      back.className = 'ui-dlg-back';
      const box = document.createElement('div');
      box.className = 'ui-dlg';
      box.setAttribute('role', 'dialog');
      const p = document.createElement('p');
      p.className = 'ui-dlg-msg';
      p.textContent = String(msg ?? '');
      box.appendChild(p);
      let ta = null;
      if (text !== null) {
        ta = document.createElement('textarea');
        ta.className = 'ui-dlg-text';
        ta.readOnly = true;
        ta.value = text;
        box.appendChild(ta);
      }
      const btns = document.createElement('div');
      btns.className = 'ui-dlg-btns';
      const done = val => { document.removeEventListener('keydown', onKey, true); back.remove(); resolve(val); };
      if (cancel) {
        const bc = document.createElement('button');
        bc.className = 'ui-dlg-cancel';
        bc.textContent = t.cancel;
        bc.onclick = () => done(false);
        btns.appendChild(bc);
      }
      const bo = document.createElement('button');
      bo.className = 'ui-dlg-ok';
      bo.textContent = text !== null ? t.close : t.ok;
      bo.onclick = () => done(true);
      btns.appendChild(bo);
      box.appendChild(btns);
      back.appendChild(box);
      const onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        else if (e.key === 'Enter' && !ta) { e.preventDefault(); done(true); }
      };
      document.addEventListener('keydown', onKey, true);
      // nello schermo intero di un elemento la finestra va dentro quell'elemento
      (document.fullscreenElement && document.fullscreenElement !== document.documentElement
        ? document.fullscreenElement : document.body).appendChild(back);
      if (ta) { ta.focus(); ta.select(); } else bo.focus();
    });
  }

  window.uiConfirm = msg => open(msg, { cancel: true });
  window.uiAlert = msg => open(msg);
  window.uiShowText = (msg, text) => open(msg, { text });
  window.alert = msg => { open(msg); };
})();
