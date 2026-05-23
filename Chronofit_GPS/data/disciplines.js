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
//   showSendBtn    bool — send button column
//   showDevice     bool — device column
//   showMode       bool — mode column
//   splitsMode     bool — split times mode
//   timePrecision  1=tenths | 2=hundredths | 3=milliseconds
//   showDisabled   bool — show disabled rows
//   showCompList   bool — competitor list card visible
//   syncMode       0=manual | 1=line-closure | 2=GPS | 3=elapsed(no sync)
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
      penality: false,      showSendBtn: true,
      showDevice: true,     showMode: true,
      splitsMode: false,    timePrecision: 3,  showDisabled: false,
      showCompList: true,   syncMode: 0
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
      penality: false,      showSendBtn: true,
      showDevice: true,    showMode: true,
      splitsMode: false,    timePrecision: 3,  showDisabled: false,
      showCompList: true,   syncMode: 1
    }
  },

  {
    id: "ski",
    emoji: "⛷️",
    label: { en: "Alpine Ski", it: "Sci Alpino" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false,  showLine: false,
      showName: true,       showSurname: true,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: true,       showSendBtn: false,
      showDevice: false,    showMode: false,
      splitsMode: true,     timePrecision: 2,  showDisabled: false,
      showCompList: false,  syncMode: 2
    }
  },

  {
    id: "cycling",
    emoji: "🚴",
    label: { en: "Cycling", it: "Ciclismo" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false,  showLine: false,
      showName: true,       showSurname: false,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: false,      showSendBtn: false,
      showDevice: false,    showMode: false,
      splitsMode: false,    timePrecision: 3,  showDisabled: false,
      showCompList: false,  syncMode: 2
    }
  },

  {
    id: "mtb",
    emoji: "🚵",
    label: { en: "MTB", it: "MTB" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false,  showLine: false,
      showName: true,       showSurname: false,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: false,      showSendBtn: false,
      showDevice: false,    showMode: false,
      splitsMode: false,    timePrecision: 3,  showDisabled: false,
      showCompList: false,  syncMode: 2
    }
  },


];
