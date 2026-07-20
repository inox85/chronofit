// ── Chronofit discipline presets ──────────────────────────────────────────────
// Each entry defines a sport with an emoji icon and a full set of table view
// preferences applied when the user selects that discipline.
//
// Adding a new discipline:
//   1. Add an entry to DISCIPLINES below — no files needed, just an emoji
//   No other changes needed.
//
// Preference keys (all optional — undefined = leave current value unchanged):
//   sortCol        "arrival" | "race-time" | ...
//   reverseOrder   bool — reverse table sort order
//   showRank       bool — rank column (#)
//   showIndex      bool — index column (position number)
//   showLine       bool — line column
//   showName       bool — first name column
//   showSurname    bool — last name column
//   timestamp      bool — arrival timestamp column
//   deltaTime      bool — delta time column
//   elapsedTime    bool — elapsed time column
//   penality       bool — penalty column
//   showCancelBtn  bool — cancel ("annulla") button column
//   showSendBtn    bool — send button column
//   showTest     bool — device column
//   showTrigger       bool — mode column
//   splitsMode     bool — split times mode
//   timePrecision  1=tenths | 2=hundredths | 3=milliseconds
//   showDisabled   bool — show disabled rows
//   showCompList   bool — competitor list card visible
//   syncMode       0=manual | 1=line-closure | 2=GPS | 3=elapsed(no sync)
//   bgColor        hex — GUI background color for this discipline (light tint,
//                  in armonia con --primary-color/--card-border-color di style.css)
//   propagateCompetitor  bool — default del toggle "propaga competitor" nel popup
//                  impostazioni linee: quando true, assegnare un competitor a una
//                  linea lo riporta automaticamente sulle altre linee gestite
//                  (device non vuoto) ma ancora senza competitor assegnato (0)
//   tableAcquireCompetitor  bool — default del toggle "Acquire from arrivals table"
//                  nel registro competitori (tab Auto)
//   showSecondArrivalsCard  bool — mostra la seconda card Arrivi (linee, ordinamento
//                  e colonne configurabili indipendentemente dalla prima card)
//   firstCardTitleKey   chiave i18n per il titolo della prima card (default "card.arrivals")
//   secondCardTitleKey  chiave i18n per il titolo della seconda card (default "card.arrivals")
//   lines               { "1".."6": bool } — linee visibili di default nella prima card
//                  (tab "Lines" del popup impostazioni tabella). Chiavi omesse = invariate.
//   linesSecondary      come "lines" ma per la seconda card Arrivi
// ─────────────────────────────────────────────────────────────────────────────

const DISCIPLINES = [

  {
    id: "generic",
    emoji: "⏱️",
    label: { en: "Generic", it: "Generico" },
    prefs: {
      sortCol: "arrival",   reverseOrder: false,
      showRank: false,      showIndex: true,   showLine: true,
      showName: false,      showSurname: false,
      timestamp: true,      deltaTime: false,  elapsedTime: false,
      penality: false,      showCancelBtn: true,  showSendBtn: true,
      showTest: true,     showTrigger: true,
      splitsMode: false,    timePrecision: 3,  showDisabled: false,
      showCompList: true,   syncMode: 0,
      bgColor: "#f5f5f5",
      propagateCompetitor: false,
      tableAcquireCompetitor: false,
      showSecondArrivalsCard: false
    }
  },

  {
    id: "regularity",
    emoji: "🚗",
    label: { en: "Regularity", it: "Regolarita" },
    prefs: {
      sortCol: "arrival",   reverseOrder: true,
      showRank: false,       showIndex: false,  showLine: true,
      showName: false,       showSurname: false,
      timestamp: true,     deltaTime: true,   elapsedTime: false,
      penality: false,      showCancelBtn: true,  showSendBtn: true,
      showTest: true,    showTrigger: true,
      splitsMode: false,    timePrecision: 3,  showDisabled: false,
      showCompList: true,   syncMode: 1,
      bgColor: "#f2e3c4",
      propagateCompetitor: false,
      tableAcquireCompetitor: false,
      showSecondArrivalsCard: false
    }
  },

  {
    id: "enduro",
    emoji: "🏍️",
    label: { en: "Enduro", it: "Enduro" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: false,      showIndex: false,  showLine: true,
      showName: false,      showSurname: false,
      timestamp: true,      deltaTime: false,  elapsedTime: false,
      penality: false,      showCancelBtn: false,  showSendBtn: false,
      showTest: false,    showTrigger: false,
      splitsMode: false,   timePrecision: 3,  showDisabled: false,
      showCompList: true,  syncMode: 2,
      bgColor: "#d9f0d9",
      propagateCompetitor: true,
      tableAcquireCompetitor: true,
      showSecondArrivalsCard: true,
      firstCardTitleKey: "card.departures",
      secondCardTitleKey: "card.finish",
      lines: { "1": true, "2": true, "3": false, "4": false, "5": false, "6": true },
      linesSecondary: { "1": false, "2": false, "3": true, "4": true, "5": false, "6": true }
    }
  },

  {
    id: "ski",
    emoji: "⛷️",
    label: { en: "Ski", it: "Sci" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false,  showLine: false,
      showName: true,       showSurname: true,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: true,       showCancelBtn: false,  showSendBtn: false,
      showTest: false,    showTrigger: false,
      splitsMode: true,     timePrecision: 2,  showDisabled: false,
      showCompList: false,  syncMode: 2,
      bgColor: "#d7ebf8",
      propagateCompetitor: true,
      tableAcquireCompetitor: false,
      showSecondArrivalsCard: false
    }
  },

];
