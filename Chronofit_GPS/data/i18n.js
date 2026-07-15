// ── Chronofit i18n engine ────────────────────────────────────────────────────
// Usage:
//   t('key')            → translated string (falls back to 'en', then key itself)
//   t('key', v1, v2)    → replaces {0}, {1}, … with the provided values
//   setLanguage('it')   → switches language and re-renders all data-i18n nodes
//   currentLang         → read-only getter for the active language code
//
// Adding a new language:
//   1. Add a new top-level key to TRANSLATIONS (e.g. 'de': { ... })
//   2. Add the flag button in index.html inside #lang-switcher
//   No other changes are needed.
// ─────────────────────────────────────────────────────────────────────────────

const TRANSLATIONS = {

  en: {
    // ── Generic buttons ───────────────────────────────────────────────────────
    'btn.cancel':           'Cancel',
    'btn.confirm':          'Confirm',
    'btn.close':            'Close',
    'btn.apply':            'Apply',
    'btn.save':             'Save',
    'btn.connect':          'Connect',
    'btn.yes':              'Yes',
    'btn.no':               'No',
    'btn.assign':           'Assign',
    'btn.load':             'Load',
    'btn.clear':            'Clear',
    'btn.download':         '⬇ Download',
    'btn.start':            'Start',
    'btn.stop':             'Stop',
    'btn.reset':            'Reset',
    'btn.download_session': 'Download session',
    'btn.download_view':    'Download view',
    'btn.send_email':       'Send via email',
    'btn.clear_session':    'Clear session',
    'btn.actions':          'Actions',
    'btn.close_all':        '✕ Close all',
    'btn.disconnect':       '⛔ Disconnect',
    'btn.stop_reconnect':   '⛔ Stop reconnecting',
    'btn.save_broker':      'Save broker',
    'btn.reset_assigned':   'Reset assigned',
    'btn.open_file':        '📂 Open file',
    'btn.back':             '← Back',

    // ── Splash ────────────────────────────────────────────────────────────────
    'splash.loading': 'Loading session...',

    // ── Start menu ────────────────────────────────────────────────────────────
    'startmenu.utility': 'Utility',
    'startmenu.timing':  'Timing',

    // ── Exit discipline confirm ───────────────────────────────────────────────
    'exit_discipline.title':   'Exit discipline?',
    'exit_discipline.message': 'This will permanently clear all recorded times for this session. Continue?',

    // ── Clear session ─────────────────────────────────────────────────────────
    'clear.title':   'Confirm',
    'clear.message': 'Delete entire session?',

    // ── Generic message overlay ───────────────────────────────────────────────
    'message.title': 'Message',

    // ── Penalty ───────────────────────────────────────────────────────────────
    'penalty.title': 'Assign penalty',

    // ── Time choice ───────────────────────────────────────────────────────────
    'time_choice.setup':     'Setup',
    'time_choice.sync_test': 'Sync test',
    'time_choice.home':      'Home',

    // ── Time settings ─────────────────────────────────────────────────────────
    'time.title':         'Time settings',
    'time.sync_method':   'Sync method',
    'time.manual_sync':   'Manual sync',
    'time.line_sync':     'Line closure sync',
    'time.gps_sync':      'GPS sync',
    'time.elapsed_mode':  'Elapsed mode (no sync)',
    'time.gps_interval':  'GPS Sync interval',
    'time.one_shot':      'One-shot sync',
    'time.timezone':      'Timezone',
    'time.time_to_set':   'Time to set',
    'time.time_to_sync':  'Time to sync',

    // ── Athlete registry ──────────────────────────────────────────────────────
    'athlete.title':       'Competitor registry',
    'athlete.tab_select':  'Select',
    'athlete.tab_load':    'Load',
    'athlete.tab_manual':  'Manual',
    'athlete.tab_auto':    'Auto',
    'athlete.search_ph':   'Search bib, name, surname…',
    'athlete.empty':       'Select an athlete from the list',
    'athlete.assign':      'Assign',
    'athlete.reset':       'Reset assigned',
    'athlete.paste_info':  'Paste JSON or load a file.<br>Expected format: <code>[{"competitor":1,"name":"Mario","surname":"Rossi", ...}]</code>',
    'athlete.load_ph':     '[{"competitor":1,"name":"Mario","surname":"Rossi"}]',
    'athlete.cleared':     'Registry cleared',
    'athlete.none_loaded': 'No athletes loaded',
    'athlete.loaded':      '✅ {0} athletes loaded',
    'athlete.loaded_csv':  '✅ {0} athletes loaded from CSV',
    'athlete.no_results':  'No results',
    'athlete.manual_num':     'Number',
    'athlete.manual_name':    'Name',
    'athlete.manual_surname': 'Surname',
    'athlete.manual_team':    'Team',
    'athlete.manual_add':     'Add',
    'athlete.manual_added':   '✅ Competitor {0} added',
    'athlete.manual_err_num': 'Enter a valid number',
    'athlete.auto_info':      'Automatically add a competitor to the registry the first time its number appears from a live source. Both sources can be active at the same time.',
    'athlete.auto_mqtt':      'Acquire from MQTT',
    'athlete.auto_table':     'Acquire from arrivals table',
    'athlete.auto_table_lines': 'Lines:',

    // ── Table settings ────────────────────────────────────────────────────────
    'table.tab_sort':        '↕ Sort',
    'table.tab_columns':     '📊 Columns',
    'table.tab_rows':        '☰ Rows',
    'table.show_rank':       'Show rank column',
    'table.order_by':        'Order by',
    'table.arrival':         'Arrival (default)',
    'table.line':            'Line',
    'table.competitor':      'Competitor',
    'table.name':            'Name',
    'table.surname':         'Surname',
    'table.event_time':      'Event time',
    'table.race_time':       'Race time',
    'table.delta':           'Δ time',
    'table.elapsed':         'Elapsed',
    'table.reverse_order':   'Reverse row order',
    'table.show_index':      'Show index column',
    'table.show_line':       'Show line column',
    'table.show_name':       'Show name column',
    'table.show_surname':    'Show surname column',
    'table.show_event_time': 'Show event time column',
    'table.show_delta':      'Show incremental Δ column',
    'table.show_elapsed':    'Show elapsed time column',
    'table.show_penalty':    'Show penality column',
    'table.show_edit':       'Show edit button',
    'table.show_send':       'Show send button',
    'settings.keep_comp_focus': 'Keep competitor input active after detection',
    'settings.propagate_competitor': 'Propagate competitor number to managed, unassigned lines',
    'settings.title':    'Settings',
    'settings.tab_sync':  '🕐 Sync',
    'settings.tab_wifi':  '🌍 WiFi',
    'settings.tab_mqtt':  '📡 MQTT',
    'settings.tab_print': '🖨 Print',

    // ── Print overlay ─────────────────────────────────────────────────────────
    'print.title':      '🖨️ Print',
    'print.row_range':  'Row range',
    'print.from':       'From #',
    'print.to':         'To #',
    'print.row_format': 'Row format',
    'print.fields':     'Fields',
    'print.separator':  'Row separator',
    'print.preview':    'Preview',
    'print.start':      '🖨 Print',

    // ── Card titles ───────────────────────────────────────────────────────────
    'card.competitors': 'Comp.',
    'card.time':        'Time',
    'card.checkpoints': 'Checkpoints',
    'card.status':      'Status',
    'card.arrivals':    'Arrivals',

    'table.show_test':     'Show test column',
    'table.show_trigger':       'Show detection column',
    'table.time_precision':  'Time precision decimals',
    'table.show_sync_test':  'Show sync test rows',
    'table.show_out_of_sensor': 'Show out-of-sensor rows',
    'table.show_disabled':   'Show disabled line rows',
    'table.splits_mode':     'Competitor splits mode',

    // ── WiFi overlay ──────────────────────────────────────────────────────────
    'wifi.title':          'Connect to Wi-Fi for internet access',
    'wifi.connected_ip':   'Already connected with IP address',
    'wifi.show_password':  'Show password',
    'wifi.ssid_ph':        'Enter Wi-Fi SSID',
    'wifi.pass_ph':        'Enter Wi-Fi password',
    'wifi.conn_error':     '❌ Connection error',

    // ── MQTT overlay ──────────────────────────────────────────────────────────
    'mqtt.title':           'Messages settings',
    'mqtt.prefix':          'Topic prefix',
    'mqtt.event':           'Event name',
    'mqtt.sub':             'Subscribe topic',
    'mqtt.notifications':   'Enable notifications',
    'mqtt.acquire_row':     'Acquire row',
    'mqtt.acquisition':     'Acquisition',
    'mqtt.immediate':       'Immediate',
    'mqtt.manual':          'Manual confirm',
    'mqtt.timed':           'Timed',
    'mqtt.show_info':       'Show info popup',
    'mqtt.timeout_s':       'Timeout (s)',
    'mqtt.on_timeout':      'On timeout',
    'mqtt.accept':          'Accept',
    'mqtt.reject':          'Reject',
    'mqtt.broker_settings': '⚙️ Broker settings',
    'mqtt.broker_host':     'Broker address',
    'mqtt.broker_port':     'Port',
    'mqtt.use_credentials': 'Use credentials',
    'mqtt.saved':           '✅ Saved',
    'mqtt.broker_saved':    '✅ Broker saved',
    'mqtt.save_error':      '❌ Error saving',

    // ── Email overlay ─────────────────────────────────────────────────────────
    'email.title':     'Insert your email',
    'email.ph':        'Enter email',
    'email.invalid':   'Invalid email format',
    'email.confirmed': 'Email confirmed ✔',
    'email.sent':      'Request sent ✔',
    'email.error':     'Error sending email',

    // ── Fullscreen overlay ────────────────────────────────────────────────────
    'fullscreen.title':    'Fullscreen Mode',
    'fullscreen.question': 'Would you like to enable fullscreen mode for a better experience?',

    // ── Discipline overlay ────────────────────────────────────────────────────
    'discipline.title': 'Select discipline',

    // ── About overlay ─────────────────────────────────────────────────────────
    'about.manual':   '📄 Manual',
    'about.wifi_fix': '🖥️ WiFi fix tool',

    // ── Main UI ───────────────────────────────────────────────────────────────
    'main.no_connection':    'No connection to Chronofit device',
    'main.wifi_connecting':  '⏳ Connecting to WiFi, please wait...',
    'main.quick_settings':   'Quick settings',
    'main.station_name':     'Timing station name',
    'main.station_name_ph':  'Station name',
    'main.print':            'Print on paper',
    'main.buzzer':           'Buzzer enable',
    'main.fullscreen':       'Fullscreen',
    'main.error_send':       'Error sending data',

    // ── Checkpoint settings table headers ─────────────────────────────────────
    'cp.line':        'Line',
    'cp.tipo':        'Type',
    'cp.competitor':  'Competitor',
    'cp.comp_abbr':   'Comp.',
    'cp.ms':          'ms',
    'cp.edit_title':       'Line {0} — Settings',
    'cp.settings_title':   'Checkpoint settings',
    'cp.line_id':     'Line ID',
    'cp.tipo_test': 'Test',
    'cp.tipo_trigger':   'Rel.',
    'cp.delay_ms':    'Delay (ms)',
    'cp.tipo1_fpc':   'FPC 102',
    'cp.tipo1_none':  'Unmanaged',
    'cp.tipo1_placeholder': 'e.g. FPC 102',
    'cp.tipo2_auto':  'Auto',
    'cp.tipo2_manual':'Man.',

    // ── Event table headers ───────────────────────────────────────────────────
    'th.line':       'Line',
    'th.competitor': 'Comp.',
    'th.name':       'Name',
    'th.surname':    'Surname',
    'th.event_time': 'Event ⏱️',
    'th.race_time':  'Race time',
    'th.elapsed':    'Elapsed ⏱️',
    'th.test':     'Test',
    'th.trigger':       'Rel.',
    'th.edit':       'Edit',
    'th.send':       'Send',

    // ── Status messages ───────────────────────────────────────────────────────
    'status.not_sync':        'Device not synchronized',
    'status.manual_not_set':  'Sync mode: Manual — Status: 🔴 not set',
    'status.manual_ok':       'Sync mode: Manual — Status: 🟢 OK',
    'status.line_waiting':    'Sync mode: Line — Status: ⏳ waiting for trigger...',
    'status.line_synced':     'Sync mode: Line — Status: 🟢 synced',
    'status.gps_waiting':     'Sync mode: GPS — Status: ⏳ waiting for signal...',
    'status.gps_one_shot':    'Sync mode: GPS — Status: 🟢 One shot-sync',
    'status.gps_synced_s':    'Sync mode: GPS — Status: 🟢 synced (resync {0}s)',
    'status.gps_synced_m':    'Sync mode: GPS — Status: 🟢 synced (resync {0}m)',
    'status.gps_synced_1s':   'Sync mode: GPS — Status: 🟢 synced (resync 1s)',
    'status.sync_test':       'Sync test: ⏱️ Waiting for the next minute to start...',
    'status.elapsed_waiting': '🟢 Waiting for timing start...',
    'status.elapsed_running': '⏱️ Timing started!',
    'status.valid_time':      'Enter a valid hour and minute.',
  },

  // ── Italian ─────────────────────────────────────────────────────────────────
  it: {
    // ── Generic buttons ───────────────────────────────────────────────────────
    'btn.cancel':           'Annulla',
    'btn.confirm':          'Conferma',
    'btn.close':            'Chiudi',
    'btn.apply':            'Applica',
    'btn.save':             'Salva',
    'btn.connect':          'Connetti',
    'btn.yes':              'Sì',
    'btn.no':               'No',
    'btn.assign':           'Assegna',
    'btn.load':             'Carica',
    'btn.clear':            'Cancella',
    'btn.download':         '⬇ Scarica',
    'btn.start':            'Start',
    'btn.stop':             'Stop',
    'btn.reset':            'Reset',
    'btn.download_session': 'Scarica sessione',
    'btn.download_view':    'Scarica vista',
    'btn.send_email':       'Invia via email',
    'btn.clear_session':    'Cancella sessione',
    'btn.actions':          'Azioni',
    'btn.close_all':        '✕ Chiudi tutti',
    'btn.disconnect':       '⛔ Disconnetti',
    'btn.stop_reconnect':   '⛔ Interrompi riconnessione',
    'btn.save_broker':      'Salva broker',
    'btn.reset_assigned':   'Reset assegnati',
    'btn.open_file':        '📂 Apri file',
    'btn.back':             '← Indietro',

    // ── Splash ────────────────────────────────────────────────────────────────
    'splash.loading': 'Caricamento sessione...',

    // ── Start menu ────────────────────────────────────────────────────────────
    'startmenu.utility': 'Utilità',
    'startmenu.timing':  'Cronometraggio',

    // ── Exit discipline confirm ───────────────────────────────────────────────
    'exit_discipline.title':   'Uscire dalla disciplina?',
    'exit_discipline.message': 'Questa operazione cancellerà definitivamente tutti i tempi registrati in questa sessione. Continuare?',

    // ── Clear session ─────────────────────────────────────────────────────────
    'clear.title':   'Conferma',
    'clear.message': 'Eliminare l\'intera sessione?',

    // ── Generic message overlay ───────────────────────────────────────────────
    'message.title': 'Messaggio',

    // ── Penalty ───────────────────────────────────────────────────────────────
    'penalty.title': 'Assegna penalità',

    // ── Time choice ───────────────────────────────────────────────────────────
    'time_choice.setup':     'Impostazioni',
    'time_choice.sync_test': 'Test sync',
    'time_choice.home':      'Home',

    // ── Time settings ─────────────────────────────────────────────────────────
    'time.title':         'Impostazioni ora',
    'time.sync_method':   'Metodo di sync',
    'time.manual_sync':   'Sync manuale',
    'time.line_sync':     'Sync chiusura linea',
    'time.gps_sync':      'Sync GPS',
    'time.elapsed_mode':  'Modalità elapsed (no sync)',
    'time.gps_interval':  'Intervallo sync GPS',
    'time.one_shot':      'Sync una tantum',
    'time.timezone':      'Fuso orario',
    'time.time_to_set':   'Ora da impostare',
    'time.time_to_sync':  'Ora da sincronizzare',

    // ── Athlete registry ──────────────────────────────────────────────────────
    'athlete.title':       'Registro competitori',
    'athlete.tab_select':  'Seleziona',
    'athlete.tab_load':    'Carica',
    'athlete.tab_manual':  'Manuale',
    'athlete.tab_auto':    'Auto',
    'athlete.search_ph':   'Cerca pettorale, nome, cognome…',
    'athlete.empty':       'Seleziona un atleta dalla lista',
    'athlete.assign':      'Assegna',
    'athlete.reset':       'Reset assegnati',
    'athlete.paste_info':  'Incolla JSON o carica un file.<br>Formato atteso: <code>[{"competitor":1,"name":"Mario","surname":"Rossi", ...}]</code>',
    'athlete.load_ph':     '[{"competitor":1,"name":"Mario","surname":"Rossi"}]',
    'athlete.cleared':     'Registro cancellato',
    'athlete.none_loaded': 'Nessun atleta caricato',
    'athlete.loaded':      '✅ {0} atleti caricati',
    'athlete.loaded_csv':  '✅ {0} atleti caricati da CSV',
    'athlete.no_results':  'Nessun risultato',
    'athlete.manual_num':     'Numero',
    'athlete.manual_name':    'Nome',
    'athlete.manual_surname': 'Cognome',
    'athlete.manual_team':    'Squadra',
    'athlete.manual_add':     'Aggiungi',
    'athlete.manual_added':   '✅ Competitore {0} aggiunto',
    'athlete.manual_err_num': 'Inserire un numero valido',
    'athlete.auto_info':      'Aggiunge automaticamente un competitore al registro la prima volta che il suo numero arriva da una fonte live. Entrambe le fonti possono essere attive insieme.',
    'athlete.auto_mqtt':      'Acquisisci da MQTT',
    'athlete.auto_table':     'Acquisisci dalla tabella arrivi',
    'athlete.auto_table_lines': 'Linee:',

    // ── Table settings ────────────────────────────────────────────────────────
    'table.tab_sort':        '↕ Ordina',
    'table.tab_columns':     '📊 Colonne',
    'table.tab_rows':        '☰ Righe',
    'table.show_rank':       'Mostra colonna classifica',
    'table.order_by':        'Ordina per',
    'table.arrival':         'Arrivo (default)',
    'table.line':            'Linea',
    'table.competitor':      'Competitore',
    'table.name':            'Nome',
    'table.surname':         'Cognome',
    'table.event_time':      'Ora evento',
    'table.race_time':       'Tempo gara',
    'table.delta':           'Δ tempo',
    'table.elapsed':         'Trascorso',
    'table.reverse_order':   'Ordine inverso',
    'table.show_index':      'Mostra colonna indice',
    'table.show_line':       'Mostra colonna linea',
    'table.show_name':       'Mostra colonna nome',
    'table.show_surname':    'Mostra colonna cognome',
    'table.show_event_time': 'Mostra colonna ora evento',
    'table.show_delta':      'Mostra colonna Δ incrementale',
    'table.show_elapsed':    'Mostra colonna tempo trascorso',
    'table.show_penalty':    'Mostra colonna penalità',
    'table.show_edit':       'Mostra pulsante modifica',
    'table.show_send':       'Mostra pulsante invia',
    'settings.keep_comp_focus': 'Mantieni input competitor attivo dopo rilevazione',
    'settings.propagate_competitor': 'Propaga il numero competitor alle linee gestite non assegnate',
    'settings.title':    'Impostazioni',
    'settings.tab_sync':  '🕐 Sync',
    'settings.tab_wifi':  '🌍 WiFi',
    'settings.tab_mqtt':  '📡 MQTT',
    'settings.tab_print': '⚙️ Generali',

    // ── Print overlay ─────────────────────────────────────────────────────────
    'print.title':      '🖨️ Stampa',
    'print.row_range':  'Intervallo righe',
    'print.from':       'Da #',
    'print.to':         'A #',
    'print.row_format': 'Formato riga',
    'print.fields':     'Campi',
    'print.separator':  'Separatore righe',
    'print.preview':    'Anteprima',
    'print.start':      '🖨 Stampa',

    // ── Card titles ───────────────────────────────────────────────────────────
    'card.competitors': 'Attesi',
    'card.time':        'Orario',
    'card.checkpoints': 'Gestione transiti',
    'card.status':      'Utilità',
    'card.arrivals':    'Lista passaggi',

    'table.show_test':     'Mostra colonna prova',
    'table.show_trigger':       'Mostra colonna rilevamento',
    'table.time_precision':  'Decimali precisione tempo',
    'table.show_sync_test':  'Mostra righe test sync',
    'table.show_out_of_sensor': 'Mostra righe fuori pressostato',
    'table.show_disabled':   'Mostra righe linee disabilitate',
    'table.splits_mode':     'Modalità split competitore',

    // ── WiFi overlay ──────────────────────────────────────────────────────────
    'wifi.title':          'Connetti al Wi-Fi per accesso internet',
    'wifi.connected_ip':   'Già connesso con indirizzo IP',
    'wifi.show_password':  'Mostra password',
    'wifi.ssid_ph':        'Inserisci SSID Wi-Fi',
    'wifi.pass_ph':        'Inserisci password Wi-Fi',
    'wifi.conn_error':     '❌ Errore di connessione',

    // ── MQTT overlay ──────────────────────────────────────────────────────────
    'mqtt.title':           'Impostazioni messaggi',
    'mqtt.prefix':          'Prefisso topic',
    'mqtt.event':           'Nome evento',
    'mqtt.sub':             'Topic sottoscrizione',
    'mqtt.notifications':   'Abilita notifiche',
    'mqtt.acquire_row':     'Acquisisci riga',
    'mqtt.acquisition':     'Acquisizione',
    'mqtt.immediate':       'Immediata',
    'mqtt.manual':          'Conferma manuale',
    'mqtt.timed':           'Temporizzata',
    'mqtt.show_info':       'Mostra popup info',
    'mqtt.timeout_s':       'Timeout (s)',
    'mqtt.on_timeout':      'Alla scadenza',
    'mqtt.accept':          'Accetta',
    'mqtt.reject':          'Rifiuta',
    'mqtt.broker_settings': '⚙️ Impostazioni broker',
    'mqtt.broker_host':     'Indirizzo broker',
    'mqtt.broker_port':     'Porta',
    'mqtt.use_credentials': 'Usa credenziali',
    'mqtt.saved':           '✅ Salvato',
    'mqtt.broker_saved':    '✅ Broker salvato',
    'mqtt.save_error':      '❌ Errore salvataggio',

    // ── Email overlay ─────────────────────────────────────────────────────────
    'email.title':     'Inserisci la tua email',
    'email.ph':        'Inserisci email',
    'email.invalid':   'Formato email non valido',
    'email.confirmed': 'Email confermata ✔',
    'email.sent':      'Richiesta inviata ✔',
    'email.error':     'Errore nell\'invio dell\'email',

    // ── Fullscreen overlay ────────────────────────────────────────────────────
    'fullscreen.title':    'Modalità schermo intero',
    'fullscreen.question': 'Vuoi abilitare la modalità schermo intero per una migliore esperienza?',

    // ── Discipline overlay ────────────────────────────────────────────────────
    'discipline.title': 'Seleziona disciplina',

    // ── About overlay ─────────────────────────────────────────────────────────
    'about.manual':   '📄 Manuale',
    'about.wifi_fix': '🖥️ Strumento fix WiFi',

    // ── Main UI ───────────────────────────────────────────────────────────────
    'main.no_connection':    'Nessuna connessione al dispositivo Chronofit',
    'main.wifi_connecting':  '⏳ Connessione al WiFi in corso...',
    'main.quick_settings':   'Impostazioni rapide',
    'main.station_name':     'Nome stazione timing',
    'main.station_name_ph':  'Nome stazione',
    'main.print':            'Stampa su carta',
    'main.buzzer':           'Abilita buzzer',
    'main.fullscreen':       'Schermo intero',
    'main.error_send':       'Errore invio dati',

    // ── Checkpoint settings table headers ─────────────────────────────────────
    'cp.line':        'Linea',
    'cp.tipo':        'Tipo',
    'cp.competitor':  'Competitore',
    'cp.comp_abbr':   'Conc.',
    'cp.ms':          'ms',
    'cp.edit_title':       'Linea {0} — Impostazioni',
    'cp.settings_title':   'Impostazioni checkpoint',
    'cp.line_id':     'ID Linea',
    'cp.tipo_test': 'Prova',
    'cp.tipo_trigger':   'Ril.',
    'cp.delay_ms':    'Ritardo (ms)',
    'cp.tipo1_fpc':   'FPC 102',
    'cp.tipo1_none':  'Non gestita',
    'cp.tipo1_placeholder': 'Es. FPC 102',
    'cp.tipo2_auto':  'Auto',
    'cp.tipo2_manual':'Man.',

    // ── Event table headers ───────────────────────────────────────────────────
    'th.line':       'Linea',
    'th.competitor': 'Comp.',
    'th.name':       'Nome',
    'th.surname':    'Cognome',
    'th.event_time': 'Evento ⏱️',
    'th.race_time':  'T. gara',
    'th.elapsed':    'Trascorso ⏱️',
    'th.test':     'Prova',
    'th.trigger':       'Ril.',
    'th.edit':       'Modifica',
    'th.send':       'Invia',

    // ── Status messages ───────────────────────────────────────────────────────
    'status.not_sync':        'Dispositivo non sincronizzato',
    'status.manual_not_set':  'Modo: Manuale — Stato: 🔴 non impostato',
    'status.manual_ok':       'Modo: Manuale — Stato: 🟢 OK',
    'status.line_waiting':    'Modo: Linea — Stato: ⏳ in attesa del trigger...',
    'status.line_synced':     'Modo: Linea — Stato: 🟢 sincronizzato',
    'status.gps_waiting':     'Modo: GPS — Stato: ⏳ in attesa del segnale...',
    'status.gps_one_shot':    'Modo: GPS — Stato: 🟢 One shot-sync',
    'status.gps_synced_s':    'Modo: GPS — Stato: 🟢 sincronizzato (resync {0}s)',
    'status.gps_synced_m':    'Modo: GPS — Stato: 🟢 sincronizzato (resync {0}m)',
    'status.gps_synced_1s':   'Modo: GPS — Stato: 🟢 sincronizzato (resync 1s)',
    'status.sync_test':       'Test sync: ⏱️ In attesa del prossimo minuto...',
    'status.elapsed_waiting': '🟢 In attesa dell\'avvio del timing...',
    'status.elapsed_running': '⏱️ Timing avviato!',
    'status.valid_time':      'Inserisci un\'ora e un minuto validi.',
  },

};

// ── Engine ───────────────────────────────────────────────────────────────────

let _lang = localStorage.getItem('chronofit_lang') || 'en';

/** Current active language code (read-only via getter). */
function currentLang() { return _lang; }

/**
 * Translate key. Additional arguments replace {0}, {1}, … in the string.
 * Falls back to English, then returns the key itself.
 */
function t(key, ...args) {
  const str = TRANSLATIONS[_lang]?.[key]
           ?? TRANSLATIONS['en']?.[key]
           ?? key;
  return args.reduce((s, v, i) => s.replace('{' + i + '}', v), str);
}

/** Apply all data-i18n / data-i18n-ph / data-i18n-html attributes in the DOM. */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  // Update flag buttons: highlight the active one
  document.querySelectorAll('#lang-switcher .lang-flag').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === _lang);
  });
  document.documentElement.lang = _lang;
  // Refresh any dynamic displays that use t() at runtime
  if (typeof updateAllLineDisplays === 'function') updateAllLineDisplays();
}

/**
 * Switch language, persist to localStorage, and re-render all translated nodes.
 * Call this from the flag buttons: onclick="setLanguage('it')"
 */
function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) return;
  _lang = lang;
  localStorage.setItem('chronofit_lang', lang);
  applyTranslations();
}
