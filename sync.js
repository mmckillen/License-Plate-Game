// Sync layer: one small API the app talks to, backed by either Firebase
// Realtime Database (live cross-device sync) or localStorage (single device).
// It auto-detects: if firebase-config.js has real values, it uses Firebase;
// otherwise it falls back to localStorage so the game still works instantly.
//
// Data shape passed to the app:  { AL: {found, ts, lat, lng}, ... }
//   found = true once the plate has been spotted
//   ts    = when it was spotted (ms since epoch)
//   lat/lng = where it was spotted (absent if location was unavailable)
// Legacy entries from the counting era look like {count, ts}; count > 0 is
// treated as found so old boards keep their progress.

const Sync = (() => {
  let mode = "local";          // "firebase" | "local"
  let gameCode = "roadtrip";
  let onChange = () => {};
  let onStatus = () => {};     // called with an error message when sync breaks
  let lastError = null;
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
    let firstSnapshot = true;
    unsub = ref.onValue(dbRef, (snap) => {
      const remote = snap.val() || {};
      if (firstSnapshot) {
        firstSnapshot = false;
        migrateLocalToCloud(remote);
      }
      lastError = null;
      onChange(remote);
    }, (err) => {
      // Read/write denied (bad rules) or database missing. Surface it and
      // fall back to local so the game stays playable.
      console.error("Firebase sync error:", err);
      lastError = err && err.message ? err.message : String(err);
      onStatus(lastError);
      startLocal();
    });
  }

  function entryIsFound(e) {
    return !!e && (e.found === true || ((e.count | 0) > 0));
  }

  // One-time carry-over: plates recorded on this device before sync was
  // enabled (or while offline) get merged into the shared board. A plate
  // already found remotely is never overwritten.
  function migrateLocalToCloud(remote) {
    const migratedKey = "lpg:migrated:" + gameCode;
    if (localStorage.getItem(migratedKey)) return;
    const local = lsRead();
    const updates = {};
    Object.keys(local).forEach((code) => {
      if (entryIsFound(local[code]) && !entryIsFound(remote[code])) {
        updates[code] = local[code];
      }
    });
    if (Object.keys(updates).length > 0) {
      ref.update(dbRef, updates)
        .then(() => localStorage.setItem(migratedKey, "1"))
        .catch((err) => {
          // Leave the flag unset so we retry on the next load
          // (e.g. after the user fixes the database rules).
          console.error("Migrating local counts failed:", err);
          lastError = err && err.message ? err.message : String(err);
          onStatus(lastError);
        });
    } else {
      localStorage.setItem(migratedKey, "1");
    }
  }

  // ---- Public API ------------------------------------------------------------
  async function init(code, changeCb, statusCb) {
    gameCode = normalizeCode(code);
    onChange = changeCb || (() => {});
    onStatus = statusCb || (() => {});
    const cfg = window.FIREBASE_CONFIG;
    if (configLooksReal(cfg)) {
      try {
        await startFirebase(cfg);
        return;
      } catch (err) {
        console.warn("Firebase init failed, falling back to local:", err);
        lastError = err && err.message ? err.message : String(err);
        onStatus(lastError);
      }
    }
    startLocal();
  }

  // Write a plate's full entry ({found, ts, lat, lng, ...}); null removes it.
  function setPlate(codeState, entry) {
    if (mode === "firebase") {
      ref.set(ref.ref(db, "games/" + gameCode + "/plates/" + codeState), entry)
        .catch((err) => {
          // Most common cause: database rules deny writes (locked mode /
          // expired test mode). Tell the UI instead of failing silently.
          console.error("Firebase write failed:", err);
          lastError = err && err.message ? err.message : String(err);
          onStatus(lastError);
        });
    } else {
      const data = lsRead();
      if (entry) data[codeState] = entry;
      else delete data[codeState];
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
    init, setPlate, resetAll, switchGame, normalizeCode,
    get mode() { return mode; },
    get gameCode() { return gameCode; },
    get lastError() { return lastError; },
  };
})();
