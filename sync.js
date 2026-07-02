// Sync layer: one small API the app talks to, backed by either Firebase
// Realtime Database (live cross-device sync) or localStorage (single device).
// It auto-detects: if firebase-config.js has real values, it uses Firebase;
// otherwise it falls back to localStorage so the game still works instantly.
//
// Data shape passed to the app:  { AL: {count, ts}, CA: {count, ts}, ... }
//   count = number of times that plate has been spotted (found === count > 0)
//   ts    = timestamp of the most recent change (ms since epoch)

const Sync = (() => {
  let mode = "local";          // "firebase" | "local"
  let gameCode = "roadtrip";
  let onChange = () => {};
  let db = null;               // firebase database handle
  let ref = null;              // firebase ref helpers
  let dbRef = null;            // current game ref
  let unsub = null;            // firebase listener detacher

  function configLooksReal(c) {
    return c && typeof c.apiKey === "string" &&
      !c.apiKey.includes("YOUR_") &&
      typeof c.databaseURL === "string" &&
      !c.databaseURL.includes("YOUR_") &&
      c.databaseURL.startsWith("http");
  }

  // ---- localStorage backend --------------------------------------------------
  function lsKey() { return "lpg:" + gameCode; }

  function lsRead() {
    try { return JSON.parse(localStorage.getItem(lsKey())) || {}; }
    catch { return {}; }
  }

  function lsWrite(data) {
    localStorage.setItem(lsKey(), JSON.stringify(data));
  }

  function startLocal() {
    mode = "local";
    // React to changes made in other tabs on the same device.
    window.addEventListener("storage", (e) => {
      if (e.key === lsKey()) onChange(lsRead());
    });
    onChange(lsRead());
  }

  // ---- Firebase backend ------------------------------------------------------
  async function startFirebase(config) {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const dbMod  = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
    const app = appMod.initializeApp(config);
    db = dbMod.getDatabase(app);
    ref = dbMod;
    mode = "firebase";
    attachFirebase();
  }

  function attachFirebase() {
    if (unsub) { unsub(); unsub = null; }
    dbRef = ref.ref(db, "games/" + gameCode + "/plates");
    unsub = ref.onValue(dbRef, (snap) => {
      onChange(snap.val() || {});
    });
  }

  // ---- Public API ------------------------------------------------------------
  async function init(code, changeCb) {
    gameCode = normalizeCode(code);
    onChange = changeCb || (() => {});
    const cfg = window.FIREBASE_CONFIG;
    if (configLooksReal(cfg)) {
      try {
        await startFirebase(cfg);
        return;
      } catch (err) {
        console.warn("Firebase init failed, falling back to local:", err);
      }
    }
    startLocal();
  }

  // Set an absolute count for a plate (used for both + and −).
  function setCount(codeState, count) {
    count = Math.max(0, count | 0);
    const entry = { count, ts: Date.now() };
    if (mode === "firebase") {
      ref.set(ref.ref(db, "games/" + gameCode + "/plates/" + codeState), entry);
    } else {
      const data = lsRead();
      data[codeState] = entry;
      lsWrite(data);
      onChange(data);
    }
  }

  function resetAll(stateCodes) {
    if (mode === "firebase") {
      ref.set(ref.ref(db, "games/" + gameCode + "/plates"), null);
    } else {
      lsWrite({});
      onChange({});
    }
  }

  function switchGame(code) {
    gameCode = normalizeCode(code);
    if (mode === "firebase") {
      attachFirebase();
    } else {
      // rebind storage listener target implicitly via lsKey(); emit current data
      onChange(lsRead());
    }
  }

  function normalizeCode(code) {
    return (code || "roadtrip").toString().trim().toLowerCase()
      .replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 40) || "roadtrip";
  }

  return {
    init, setCount, resetAll, switchGame, normalizeCode,
    get mode() { return mode; },
    get gameCode() { return gameCode; },
  };
})();
