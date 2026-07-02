// License Plate Game — UI logic.
// Talks only to the Sync module (Firebase or localStorage under the hood).
// A plate entry is {found, ts, lat, lng} — see sync.js for the shape notes.

(function () {
  "use strict";

  const grid = document.getElementById("grid");
  const foundCountEl = document.getElementById("foundCount");
  const progressFill = document.getElementById("progressFill");
  const toastEl = document.getElementById("toast");

  let data = {};                 // { CODE: entry }
  let filter = "all";            // all | found | missing
  let sort = "name";             // name | recent
  const cardEls = {};            // CODE -> card element (built once, then updated)
  let geoWarned = false;         // only nag about location permission once

  const entryOf = (c) => data[c] || null;
  const isFound = (e) => !!e && (e.found === true || ((e.count | 0) > 0));
  const hasLoc  = (e) => !!e && typeof e.lat === "number" && typeof e.lng === "number";
  const nameOf  = (c) => (PLATES.find((p) => p.code === c) || {}).name || c;
  const tsOf    = (c) => (data[c] && data[c].ts) || 0;

  // ── Initial render: build every card once ────────────────────────────────
  function buildCards() {
    const frag = document.createDocumentFragment();
    PLATES.forEach((p) => {
      const card = document.createElement("div");
      card.className = "card missing";
      card.dataset.code = p.code;
      card.innerHTML = `
        <div class="check">✓</div>
        <div class="plate" style="--pbg:${p.colors.bg};--ptext:${p.colors.text};--pband:${p.colors.band};--pbandtext:${p.colors.bandText}">
          <div class="band top">${escapeHtml(p.name)}</div>
          <div class="plate-name">${escapeHtml(shortName(p.name))}</div>
          <div class="plate-code">${p.code}</div>
          <div class="band bottom">${escapeHtml(p.nick)}</div>
        </div>
        <div class="card-footer">
          <button class="info" aria-label="Show ${escapeHtml(p.name)} on the map">ⓘ map</button>
          <button class="remove" aria-label="Un-mark ${escapeHtml(p.name)}">✕</button>
        </div>`;

      // Tap plate: capture it; if already found, show where it was found.
      card.querySelector(".plate").addEventListener("click", () => {
        if (isFound(entryOf(p.code))) openMap(p.code);
        else capture(p.code);
      });
      card.querySelector(".info").addEventListener("click", (e) => {
        e.stopPropagation();
        openMap(p.code);
      });
      card.querySelector(".remove").addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Un-mark " + p.name + "? Its pin will be removed too.")) {
          Sync.setPlate(p.code, null);
          toast(p.name + " removed");
        }
      });

      cardEls[p.code] = card;
      frag.appendChild(card);
    });
    grid.appendChild(frag);
  }

  function shortName(name) {
    if (name === "District of Columbia") return "D.C.";
    return name;
  }

  // ── Apply data to the DOM ────────────────────────────────────────────────
  function render() {
    let found = 0;

    const ordered = orderedCodes();
    ordered.forEach((code, i) => {
      cardEls[code].style.order = i;
    });

    PLATES.forEach((p) => {
      const el = cardEls[p.code];
      const e = entryOf(p.code);
      const f = isFound(e);
      if (f) found++;

      el.classList.toggle("found", f);
      el.classList.toggle("missing", !f);
      el.querySelector(".info").classList.toggle("no-loc", f && !hasLoc(e));

      const show =
        filter === "all" ||
        (filter === "found" && f) ||
        (filter === "missing" && !f);
      el.style.display = show ? "" : "none";
    });

    foundCountEl.textContent = found;
    progressFill.style.width = (found / PLATES.length * 100).toFixed(1) + "%";
  }

  function orderedCodes() {
    const codes = PLATES.map((p) => p.code);
    if (sort === "recent") {
      return codes.slice().sort((a, b) => (tsOf(b) - tsOf(a)) || nameOf(a).localeCompare(nameOf(b)));
    }
    return codes.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  }

  // ── Capturing a plate (mark found + geotag) ──────────────────────────────
  function capture(code) {
    const entry = { found: true, ts: Date.now() };
    Sync.setPlate(code, entry);
    celebrate(code);
    toast(nameOf(code) + " spotted! 🎉");
    if (navigator.vibrate) navigator.vibrate(30);

    // Attach the location asynchronously so the tap always feels instant.
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const cur = entryOf(code);
        if (!isFound(cur)) return; // un-marked while we waited for a fix
        Sync.setPlate(code, {
          ...(cur || entry),
          found: true,
          lat: +pos.coords.latitude.toFixed(5),
          lng: +pos.coords.longitude.toFixed(5),
        });
      },
      (err) => {
        if (geoWarned) return;
        geoWarned = true;
        toast("📍 No location — plate still counted");
        console.warn("Geolocation failed:", err && err.message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function celebrate(code) {
    const el = cardEls[code];
    if (!el) return;
    el.classList.remove("confetti-pop");
    void el.offsetWidth; // reflow to restart animation
    el.classList.add("confetti-pop");
  }

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 1600);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ── Map overlay (Leaflet + OpenStreetMap, loaded on first open) ──────────
  const mapOverlay = document.getElementById("mapOverlay");
  const mapTitle = document.getElementById("mapTitle");
  const mapMsg = document.getElementById("mapMsg");
  const mapCanvas = document.getElementById("mapCanvas");
  let leafletPromise = null;
  let map = null;
  let markersLayer = null;

  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => resolve(window.L);
      s.onerror = () => { leafletPromise = null; reject(new Error("Couldn't load map library")); };
      document.head.appendChild(s);
    });
    return leafletPromise;
  }

  function plateIcon(L, p) {
    return L.divIcon({
      className: "pin-plate",
      html: `<span style="--pbg:${p.colors.bg};--ptext:${p.colors.text}">${p.code}</span>`,
      iconSize: [36, 24],
      iconAnchor: [18, 12],
    });
  }

  function fmtWhen(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  // singleCode = null → whole-trip map
  async function openMap(singleCode) {
    mapOverlay.classList.remove("hidden");
    const foundPlates = PLATES.filter((p) => isFound(entryOf(p.code)));
    const targets = singleCode ? foundPlates.filter((p) => p.code === singleCode) : foundPlates;
    const located = targets.filter((p) => hasLoc(entryOf(p.code)));

    mapTitle.textContent = singleCode
      ? nameOf(singleCode)
      : "Trip map — " + located.length + " of " + foundPlates.length + " pinned";

    mapMsg.classList.add("hidden");
    mapCanvas.classList.remove("hidden");

    if (located.length === 0) {
      mapCanvas.classList.add("hidden");
      mapMsg.classList.remove("hidden");
      mapMsg.textContent = targets.length === 0
        ? "Nothing captured yet — tap a plate when you spot one!"
        : (singleCode
            ? "No location was recorded for this plate. (Plates found before the map update, or with location off, don't have a pin.)"
            : "None of your plates have a location yet. New finds get pinned automatically once location permission is allowed.");
      return;
    }

    let L;
    try {
      L = await loadLeaflet();
    } catch (err) {
      // Offline or blocked — at least show the raw coordinates.
      mapCanvas.classList.add("hidden");
      mapMsg.classList.remove("hidden");
      mapMsg.textContent = "Couldn't load the map (offline?). Pinned locations:\n\n" +
        located.map((p) => {
          const e = entryOf(p.code);
          return p.code + "  " + e.lat + ", " + e.lng + "  (" + fmtWhen(e.ts) + ")";
        }).join("\n");
      return;
    }

    if (!map) {
      map = L.map(mapCanvas, { zoomControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      markersLayer = L.layerGroup().addTo(map);
    }

    markersLayer.clearLayers();
    const bounds = [];
    located.forEach((p) => {
      const e = entryOf(p.code);
      bounds.push([e.lat, e.lng]);
      L.marker([e.lat, e.lng], { icon: plateIcon(L, p) })
        .bindPopup("<b>" + escapeHtml(p.name) + "</b><br>" + fmtWhen(e.ts))
        .addTo(markersLayer);
    });

    // The container just became visible; Leaflet needs a size recalculation.
    setTimeout(() => {
      map.invalidateSize();
      if (bounds.length === 1) map.setView(bounds[0], 12);
      else map.fitBounds(bounds, { padding: [40, 40] });
    }, 50);
  }

  document.getElementById("closeMap").addEventListener("click", () => {
    mapOverlay.classList.add("hidden");
  });
  document.getElementById("mapBtn").addEventListener("click", () => openMap(null));

  // ── Controls wiring ──────────────────────────────────────────────────────
  function wireControls() {
    document.querySelectorAll(".seg").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".seg").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        filter = btn.dataset.filter;
        render();
      });
    });

    document.getElementById("sortSel").addEventListener("change", (e) => {
      sort = e.target.value;
      render();
    });

    // Settings sheet
    const sheet = document.getElementById("sheet");
    const openSheet = () => { sheet.classList.remove("hidden"); refreshSyncBadge(); };
    const closeSheet = () => sheet.classList.add("hidden");
    document.getElementById("menuBtn").addEventListener("click", openSheet);
    document.getElementById("closeSheet").addEventListener("click", closeSheet);
    document.getElementById("sheetScrim").addEventListener("click", closeSheet);

    document.getElementById("joinBtn").addEventListener("click", () => {
      const code = Sync.normalizeCode(document.getElementById("gameCodeInput").value);
      setGameCode(code, true);
      Sync.switchGame(code);
      toast(`Joined “${code}”`);
      refreshSyncBadge();
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
      if (confirm("Reset the board for game code “" + Sync.gameCode + "”? This clears it for everyone on this code.")) {
        Sync.resetAll();
        toast("Board reset");
      }
    });

    document.getElementById("shareBtn").addEventListener("click", async () => {
      const url = shareUrl();
      try {
        if (navigator.share) {
          await navigator.share({ title: "License Plate Game", text: "Join our road-trip board!", url });
        } else {
          await navigator.clipboard.writeText(url);
          toast("Link copied 🔗");
        }
      } catch (_) { /* user cancelled share */ }
    });
  }

  function refreshSyncBadge() {
    const badge = document.getElementById("syncBadge");
    const help = document.getElementById("syncHelp");
    if (Sync.lastError) {
      badge.textContent = "⚠ Sync error";
      badge.className = "badge error";
      help.textContent = "Saving to this device instead. Usually the Firebase " +
        "database is missing or its rules deny access. (" + Sync.lastError + ")";
    } else if (Sync.mode === "firebase") {
      badge.textContent = "● Live sync";
      badge.className = "badge live";
      help.textContent = "All devices on this game code update in real time.";
    } else {
      badge.textContent = "● On this device";
      badge.className = "badge local";
      help.textContent = "Add Firebase keys (see README) to sync across phones.";
    }
    document.getElementById("gameCodeInput").value = Sync.gameCode;
  }

  // ── Game code in the URL (?game=xyz) so a shared link joins the board ─────
  function currentGameFromUrl() {
    const p = new URLSearchParams(location.search);
    return p.get("game") || localStorage.getItem("lpg:lastGame") || "roadtrip";
  }
  function setGameCode(code, updateUrl) {
    localStorage.setItem("lpg:lastGame", code);
    if (updateUrl) {
      const u = new URL(location.href);
      u.searchParams.set("game", code);
      history.replaceState(null, "", u);
    }
  }
  function shareUrl() {
    const u = new URL(location.href);
    u.searchParams.set("game", Sync.gameCode);
    return u.toString();
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  async function boot() {
    buildCards();
    wireControls();
    const code = Sync.normalizeCode(currentGameFromUrl());
    setGameCode(code, true);
    await Sync.init(code, (incoming) => {
      data = incoming || {};
      render();
    }, (errMsg) => {
      toast("⚠ Sync problem — saving to this device");
      refreshSyncBadge();
    });
    refreshSyncBadge();
    render();
  }

  boot();
})();
