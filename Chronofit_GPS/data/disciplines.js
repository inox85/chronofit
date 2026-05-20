// ── Chronofit discipline presets ──────────────────────────────────────────────
// Each entry defines a sport with an emoji icon and a full set of table view
// preferences applied when the user selects that discipline.
//
// Adding a new discipline:
//   1. Add an entry to DISCIPLINES below — no files needed, just an emoji
//   No other changes needed.
// ─────────────────────────────────────────────────────────────────────────────

const DISCIPLINES = [

  {
    id: "generic",
    emoji: "⏱️",
    label: { en: "Generic", it: "Generico" },
    prefs: {
      sortCol: "arrival",   reverseOrder: false,
      showRank: false,      showIndex: true,  showLine: true,    showLineId: true,
      showName: false,      showSurname: false,
      timestamp: true,      deltaTime: false,  elapsedTime: false,
      penality: false,      showEditBtn: true, showSendBtn: true,
      splitsMode: false,    timePrecision: 3,  showDisabled: false
    }
  },

  {
    id: "running",
    emoji: "🏃",
    label: { en: "Running", it: "Corsa" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false, showLine: false,   showLineId: false,
      showName: true,       showSurname: true,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: false,      showEditBtn: true, showSendBtn: false,
      splitsMode: false,    timePrecision: 3,  showDisabled: false
    }
  },

  {
    id: "trail",
    emoji: "🏔️",
    label: { en: "Trail Running", it: "Trail Running" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false, showLine: true,    showLineId: false,
      showName: true,       showSurname: true,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: false,      showEditBtn: true, showSendBtn: false,
      splitsMode: false,    timePrecision: 3,  showDisabled: false
    }
  },

  {
    id: "cycling",
    emoji: "🚴",
    label: { en: "Cycling", it: "Ciclismo" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false, showLine: false,   showLineId: false,
      showName: true,       showSurname: false,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: false,      showEditBtn: true, showSendBtn: false,
      splitsMode: false,    timePrecision: 3,  showDisabled: false
    }
  },

  {
    id: "mtb",
    emoji: "🚵",
    label: { en: "MTB", it: "MTB" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false, showLine: false,   showLineId: false,
      showName: true,       showSurname: false,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: false,      showEditBtn: true, showSendBtn: false,
      splitsMode: false,    timePrecision: 3,  showDisabled: false
    }
  },

  {
    id: "triathlon",
    emoji: "🔱",
    label: { en: "Triathlon", it: "Triathlon" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false, showLine: true,    showLineId: false,
      showName: true,       showSurname: true,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: false,      showEditBtn: true, showSendBtn: false,
      splitsMode: true,     timePrecision: 3,  showDisabled: false
    }
  },

  {
    id: "ski",
    emoji: "⛷️",
    label: { en: "Alpine Ski", it: "Sci Alpino" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false, showLine: false,   showLineId: false,
      showName: true,       showSurname: true,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: true,       showEditBtn: true, showSendBtn: false,
      splitsMode: true,     timePrecision: 2,  showDisabled: false
    }
  },

  {
    id: "xc-ski",
    emoji: "🎿",
    label: { en: "Cross-Country Ski", it: "Sci di Fondo" },
    prefs: {
      sortCol: "race-time", reverseOrder: false,
      showRank: true,       showIndex: false, showLine: true,    showLineId: false,
      showName: true,       showSurname: true,
      timestamp: false,     deltaTime: true,   elapsedTime: false,
      penality: false,      showEditBtn: true, showSendBtn: false,
      splitsMode: true,     timePrecision: 1,  showDisabled: false
    }
  }

];
