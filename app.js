// License Plate Game — UI logic.
// Talks only to the Sync module (Firebase or localStorage under the hood).

(function () {
  "use strict";

  const grid = document.getElementById("grid");
  const foundCountEl = document.getElementById("foundCount");
  const totalSpotsEl = document.getElementById("totalSpots");
  const progressFill = document.getElementById("progressFill");
  const toastEl = document.getElementById("toast");

  let data = {};                 // { CODE: {count, ts} }
  let filter = "all";            // all | found | missing
  let sort = "name";             // name | recent | most
  const cardEls = {};            // CODE -> card element (built once, then updated)

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
          <button class="minus" aria-label="Decrease ${escapeHtml(p.name)}">−</button>
          <span class="count-badge">0</span>
        </div>`;

      // Tap plate area = +1
      card.querySelector(".plate").addEventListener("click", () => bump(p.code, +1));
      // Minus button = -1 (don't let it also trigger the plate tap)
      card.querySelector(".minus").addEventListener("click", (e) => {
        e.stopPropagation();
        bump(p.code, -1);
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
    let found = 0, spots = 0;

    // order + visibility
    const ordered = orderedCodes();
    ordered.forEach((code, i) => {
      const el = cardEls[code];
      el.style.order = i;
    });

    PLATES.forEach((p) => {
      const el = cardEls[p.code];
      const count = (data[p.code] && data[p.code].count) || 0;
      const isFound = count > 0;
      if (isFound) { found++; spots += count; }

      el.classList.toggle("found", isFound);
      el.classList.toggle("missing", !isFound);
      el.querySelector(".count-badge").textContent = count;

      const show =
        filter === "all" ||
        (filter === "found" && isFound) ||
        (filter === "missing" && !isFound);
      el.style.display = show ? "" : "none";
    });

    foundCountEl.textContent = found;
    totalSpotsEl.textContent = spots > 0 ? `· ${spots} total spotting${spots === 1 ? "" : "s"}` : "";
    progressFill.style.width = (found / PLATES.length * 100).toFixed(1) + "%";
  }

  function orderedCodes() {
    const codes = PLATES.map((p) => p.code);
    if (sort === "name") {
      return codes.slice().sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    }
    if (sort === "recent") {
      return codes.slice().sort((a, b) => (tsOf(b) - tsOf(a)) || nameOf(a).localeCompare(nameOf(b)));
    }
    if (sort === "most") {
      return codes.slice().sort((a, b) => (countOf(b) - countOf(a)) || nameOf(a).localeCompare(nameOf(b)));
    }
    return codes;
  }

  const nameOf  = (c) => (PLATES.find((p) => p.code === c) || {}).name || c;
  const countOf = (c) => (data[c] && data[c].count) || 0;
  const tsOf    = (c) => (data[c] && data[c].ts) || 0;

  // ── Actions ──────────────────────────────────────────────────────────────
  function bump(code, delta) {
    const cur = countOf(code);
    const next = Math.max(0, cur + delta);
    if (next === cur) return;
    Sync.setCount(code, next);

    if (delta > 0 && cur === 0) {
      celebrate(code);
      toast(`${nameOf(code)} spotted! 🎉`);
      if (navigator.vibrate) navigator.vibrate(30);
    }
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
