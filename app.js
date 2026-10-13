(() => {
  "use strict";

  const $ = (s, el = document) => el.querySelector(s);

  const ROUTE = "335E · Majestic → Kadugodi";

  const STOPS = [
    { id: "trinity",     name: "Trinity Circle",    km: 0.4,  stage: 1, fare: 10 },
    { id: "ulsoor",      name: "Ulsoor Lake",       km: 1.2,  stage: 2, fare: 15 },
    { id: "halasuru",    name: "Halasuru",          km: 1.8,  stage: 2, fare: 15 },
    { id: "indiranagar", name: "Indiranagar 100ft", km: 3.1,  stage: 3, fare: 20 },
    { id: "domlur",      name: "Domlur",            km: 3.9,  stage: 3, fare: 20 },
    { id: "murugesh",    name: "Murugeshpalya",     km: 5.6,  stage: 4, fare: 25 },
    { id: "marathahalli",name: "Marathahalli",      km: 7.8,  stage: 5, fare: 30 },
    { id: "kundalahalli",name: "Kundalahalli",      km: 10.2, stage: 6, fare: 30 },
    { id: "kadugodi",    name: "Kadugodi",          km: 14.2, stage: 7, fare: 35 }
  ];
  const stopById = id => STOPS.find(s => s.id === id);
  const fareFor = (stop, conc) => (conc === "adult" ? stop.fare : Math.ceil(stop.fare / 2));

  const BASE_SHIFT = { tickets: 214, revenue: 4380 };

  const state = {
    screen: "standby",
    sale: null,
    sales: [],
    queued: 0,
    offline: false,
    printerOn: true,
    sound: true,
    glare: false,
    lefty: false,
    sheet: null,
    sheetCtx: null,
    demo: null
  };

  /* ---------- sound & haptics ---------- */

  let actx = null;
  function audio() {
    if (!state.sound) return null;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function tone(freq, dur, type, vol, delay) {
    const c = audio(); if (!c) return;
    try {
      const o = c.createOscillator(), g = c.createGain();
      const t = c.currentTime + (delay || 0);
      o.type = type || "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.07, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + dur + 0.05);
    } catch (e) {}
  }
  const sfx = {
    tick:  () => tone(1600, 0.03, "sine", 0.028),
    ok:    () => { tone(880, 0.07, "sine", 0.075); tone(1318, 0.1, "sine", 0.075, 0.07); },
    money: () => tone(520, 0.08, "sine", 0.06),
    err:   () => tone(200, 0.15, "square", 0.045)
  };
  const vib = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  const tapFeedback = () => { sfx.tick(); vib(8); };
  document.addEventListener("pointerdown", () => audio(), { once: true });

  /* ---------- shift math ---------- */

  function shiftTotals() {
    return state.sales.reduce(
      (acc, s) => ({ tickets: acc.tickets + s.qty, revenue: acc.revenue + s.total }),
      { ...BASE_SHIFT }
    );
  }

  const inr = n => "₹" + n.toLocaleString("en-IN");

  /* ---------- toast ---------- */

  function showToast(html, opts = {}) {
    const host = $("#toastHost");
    while (host.children.length >= 2) host.firstChild.remove();
    const el = document.createElement("div");
    el.className = "toast" + (opts.green ? " green" : "");
    el.innerHTML = `<div class="toast-msg">${html}</div>${opts.action ? `<button class="toast-btn" data-toast-act="${opts.action}">${opts.actionLabel}</button>` : ""}${opts.ttl ? `<i class="toast-bar" style="animation-duration:${opts.ttl}ms"></i>` : ""}`;
    host.appendChild(el);
    if (opts.ttl) setTimeout(() => el.remove(), opts.ttl + 60);
    else setTimeout(() => el.remove(), 3400);
    if (opts.action) el.querySelector("[data-toast-act]").addEventListener("click", () => { el.remove(); opts.onAction && opts.onAction(); });
  }

  /* ---------- renderers ---------- */

  const screenEl = () => $("#screen");

  function render() {
    const root = $("#appRoot");
    root.classList.toggle("glare", state.glare);
    root.classList.toggle("lefty", state.lefty);
    $("#sbNet").textContent = state.offline ? "OFF" : "5G";
    $("#sbNet").classList.toggle("off", state.offline);
    closeSheet();
    if (state.screen === "standby") renderStandby();
    else if (state.screen === "quantity") renderQuantity();
    else if (state.screen === "settle") renderSettle();
    screenEl().classList.remove("screen-anim");
    void screenEl().offsetWidth;
    screenEl().classList.add("screen-anim");
  }

  function renderStandby() {
    const t = shiftTotals();
    screenEl().innerHTML = `
      <div class="std">
        <div class="std-top">
          <span class="route-chip">335E · EAST</span>
          <button class="std-menu press" data-act="menu" aria-label="Shift log">☰</button>
        </div>
        <div class="std-today">
          <span>TODAY</span><strong>${t.tickets} tickets</strong><strong>${inr(t.revenue)}</strong>
          ${state.queued ? `<span class="queued-chip">⟳ ${state.queued} QUEUED</span>` : ""}
        </div>
        <div class="std-hero">
          <div class="std-kicker">NEXT STOP</div>
          <div class="std-stop">TRINITY<br>CIRCLE</div>
          <div class="std-sub"><span>400 m · 1 stage · fares ready</span><button class="wrong-stop" data-act="wrong">wrong stop?</button></div>
        </div>
        <div class="std-chips">
          <button class="std-chip std-chip-primary press" data-act="chip" data-stop="trinity">
            <span class="sc-name">Trinity Circle</span><span class="sc-fare">₹10</span><span class="sc-meta">NEXT · 1 STAGE</span>
          </button>
          <button class="std-chip press" data-act="chip" data-stop="ulsoor">
            <span class="sc-name">Ulsoor Lake</span><span class="sc-fare">₹15</span><span class="sc-meta">2 STAGES</span>
          </button>
          <button class="std-chip press" data-act="chip" data-stop="halasuru">
            <span class="sc-name">Halasuru</span><span class="sc-fare">₹15</span><span class="sc-meta">2 STAGES</span>
          </button>
        </div>
        <button class="std-all press" data-act="all">ALL STOPS · search or correct</button>
        <div class="std-hint">tap a stop to start selling · screen wakes on lift</div>
      </div>`;
  }

  function renderQuantity() {
    const s = state.sale;
    const unit = fareFor(s.stop, s.conc);
    s.unit = unit; s.total = unit * s.qty;
    const issueLabel = s.qty ? `ISSUE · ${inr(s.total)}` : "SELECT COUNT";
    screenEl().innerHTML = `
      <div class="qty">
        <button class="qty-back press" data-act="back" aria-label="Back">‹</button>
        <div class="qty-head">
          <div class="qh-name">${s.stop.name.toUpperCase()}</div>
          <div class="qh-fare"><b>${inr(unit)}</b> / ${s.conc} · ${s.stop.stage} stage${s.stop.stage > 1 ? "s" : ""}</div>
        </div>
        <div class="seg" role="group" aria-label="Concession">
          ${["adult", "child", "senior"].map(c => `<button class="press" data-act="seg" data-conc="${c}" aria-pressed="${s.conc === c}">${c.toUpperCase()}</button>`).join("")}
        </div>
        <div class="qty-total">
          <span class="qt-amount">${inr(s.total)}</span>
          <span class="qt-break">${s.qty} × ${inr(unit)}</span>
        </div>
        <div class="numpad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="press num-tile" data-act="num" data-n="${n}" ${n === s.qty ? 'style="border-color:var(--yellow);color:var(--yellow)"' : ""}>${n}</button>`).join("")}
        </div>
        <div class="numpad-hint">tap a count — tap the box to clear · keyboard + / − works too</div>
        <div class="qty-issue-row">
          <button class="qty-count-box press" data-act="clear" aria-label="Clear count">
            <b>${s.qty}</b><span>COUNT</span>
          </button>
          <button class="issue-btn press" id="issueBtn" data-act="issue" ${s.qty ? "" : "disabled"}>${issueLabel}</button>
        </div>
      </div>`;
  }

  function qrSvg() {
    let cells = "";
    const seed = [1,0,1,1,0,1,0,0,1,1,0,1,1,0,0,1,0,1,1,0,1,1,0,1,0,1,0,0,1,0,1,1];
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      if ((x * 7 + y * 5 + seed[(x + y) % 32]) % 3 < 1.4) cells += `<rect x="${x * 10}" y="${y * 10}" width="8" height="8" fill="#0a0b0d"/>`;
    }
    const finder = (x, y) => `<rect x="${x}" y="${y}" width="28" height="28" fill="none" stroke="#0a0b0d" stroke-width="6"/><rect x="${x + 9}" y="${y + 9}" width="10" height="10" fill="#0a0b0d"/>`;
    return `<svg width="140" height="140" viewBox="0 0 120 120" aria-hidden="true">${cells}${finder(2, 2)}${finder(90, 2)}${finder(2, 90)}</svg>`;
  }

  function renderSettle() {
    const s = state.sale;
    const print = state.printerOn
      ? (s.printState === "done"
          ? `<div class="st-print ok">✓ ${s.qty} ticket${s.qty > 1 ? "s" : ""} printed</div>`
          : `<div class="st-print"><span class="spin"></span> printing ${s.qty} ticket${s.qty > 1 ? "s" : ""}…</div>`)
      : `<div class="st-print err">⚠ printer unreachable — digital QR ticket issued to passenger</div>`;

    let payBlock;
    if (s.mode === "upi") {
      payBlock = `
        <div class="st-qr">
          ${qrSvg()}
          <div class="st-qr-status ${s.upiState === "ok" ? "ok" : ""}">${s.upiState === "ok" ? "✓ " + inr(s.total) + " RECEIVED" : "waiting for passenger to scan…"}</div>
        </div>`;
    } else {
      payBlock = `
        <div class="denoms">
          ${[10, 20, 50, 100, 200, 500].map(v => `<button class="press ${s.tendered === v ? "sel" : ""}" data-act="denom" data-v="${v}">₹${v}</button>`).join("")}
        </div>`;
    }

    let changeBlock;
    if (s.mode === "upi") {
      changeBlock = `<div class="st-change"><div class="st-change-label">UPI PAYMENT</div><div class="st-change-amt" style="color:var(--blue)">${inr(s.total)}</div></div>`;
    } else if (s.tendered == null) {
      changeBlock = `<div class="st-change"><div class="st-change-label">TAP AMOUNT RECEIVED</div><div class="st-change-amt" style="color:#3d434c">${inr(s.total)}</div><div class="st-change-sub">change computes instantly</div></div>`;
    } else {
      const diff = s.tendered - s.total;
      changeBlock = diff === 0
        ? `<div class="st-change"><div class="st-change-label">EXACT AMOUNT</div><div class="st-change-amt">NO CHANGE</div><div class="st-change-sub">${inr(s.tendered)} received</div></div>`
        : diff > 0
          ? `<div class="st-change"><div class="st-change-label">CHANGE DUE</div><div class="st-change-amt">${inr(diff)}</div><div class="st-change-sub">from ${inr(s.tendered)}</div></div>`
          : `<div class="st-change"><div class="st-change-label">STILL NEEDED</div><div class="st-change-amt short">${inr(-diff)}</div><div class="st-change-sub">of ${inr(s.total)}</div></div>`;
    }

    screenEl().innerHTML = `
      <div class="settle">
        <div class="st-banner">
          <span class="st-check">✓</span>
          <div class="st-banner-txt"><b>${s.qty} × ${s.stop.name.toUpperCase()} · ${inr(s.total)}</b><span>${s.qty} ${s.conc} ticket${s.qty > 1 ? "s" : ""} · stage ${s.stop.stage}${state.offline ? " · queued for sync" : ""}</span></div>
        </div>
        ${print}
        <div class="st-undo-note">wrong sale? undo stays available for 3s, or void from ☰ log</div>
        <div class="st-pay-label">${s.mode === "upi" ? "PASSENGER PAYS BY UPI" : "CASH RECEIVED"}</div>
        ${payBlock}
        ${s.mode === "cash" ? `<div class="pay-alt"><button class="press ${s.mode === "upi" ? "sel" : ""}" data-act="pay-upi">Scan &amp; pay UPI</button></div>` : `<div class="pay-alt"><button class="press sel" data-act="pay-cash">← back to cash</button></div>`}
        ${changeBlock}
        <button class="done-btn press" data-act="done">DONE · next sale</button>
      </div>`;

    if (state.printerOn && s.printState === "printing") {
      setTimeout(() => { if (state.sale === s) { s.printState = "done"; if (state.screen === "settle") renderSettle(); } }, 1200);
    }
    if (s.mode === "upi" && s.upiState === "wait") {
      setTimeout(() => { if (state.sale === s) { s.upiState = "ok"; sfx.ok(); vib([20, 40, 20]); if (state.screen === "settle") renderSettle(); } }, 1600);
    }
  }

  /* ---------- sheets ---------- */

  function openSheet(kind) {
    state.sheet = kind;
    const host = $("#sheetHost");
    host.classList.add("open");
    if (kind === "stops") {
      host.innerHTML = `
        <button class="sheet-back" data-act="close-sheet" aria-label="Close"></button>
        <div class="sheet">
          <div class="sheet-head"><span class="sheet-title">ALL STOPS · 335E EAST</span><button class="sheet-close press" data-act="close-sheet">✕</button></div>
          <input class="sheet-search" id="stopSearch" type="text" placeholder="Search stop…" aria-label="Search stops">
          <div class="sheet-list" id="stopList"></div>
        </div>`;
      const paint = q => {
        const list = $("#stopList");
        list.innerHTML = STOPS
          .filter(s => !q || s.name.toLowerCase().includes(q))
          .map(s => `<button class="sheet-row press" data-act="chip" data-stop="${s.id}"><span class="sr-name">${s.name}</span><span class="sr-stage">ST ${s.stage}</span><span class="sr-fare">₹${s.fare}</span></button>`).join("") || `<div class="numpad-hint">no stop matches</div>`;
      };
      paint("");
      $("#stopSearch").addEventListener("input", e => paint(e.target.value.trim().toLowerCase()));
      $("#stopSearch").focus();
    } else if (kind === "menu") {
      const t = shiftTotals();
      const last = state.sales.slice(-3).reverse();
      host.innerHTML = `
        <button class="sheet-back" data-act="close-sheet" aria-label="Close"></button>
        <div class="sheet">
          <div class="sheet-head"><span class="sheet-title">SHIFT LOG</span><button class="sheet-close press" data-act="close-sheet">✕</button></div>
          <div class="shift-stats">
            <div class="shift-stat"><b>${t.tickets}</b><span>TICKETS</span></div>
            <div class="shift-stat"><b>${inr(t.revenue)}</b><span>COLLECTED</span></div>
          </div>
          ${state.queued ? `<div class="st-print" style="margin-bottom:10px">⟳ ${state.queued} tickets queued — will sync automatically</div>` : ""}
          <div class="sheet-list">
            ${last.map(s => `<div class="sheet-row"><span class="sr-name">${s.qty} × ${s.stop.name}</span><span class="sr-fare">${inr(s.total)}</span></div>`).join("") || `<div class="numpad-hint">no sales yet this session</div>`}
          </div>
          <button class="shift-void press" data-act="void" style="margin-top:10px" ${state.sales.length ? "" : "disabled"}>VOID LAST SALE</button>
        </div>`;
    }
  }

  function closeSheet() {
    state.sheet = null;
    const host = $("#sheetHost");
    host.classList.remove("open");
    host.innerHTML = "";
  }

  /* ---------- actions ---------- */

  function startSale(stop) {
    state.sale = { stop, conc: "adult", qty: 0, unit: stop.fare, total: 0, tendered: null, mode: "cash", printState: "printing", upiState: "wait" };
    state.screen = "quantity";
    closeSheet();
    render();
  }

  function issue() {
    const s = state.sale;
    if (!s || !s.qty) {
      sfx.err(); vib(60);
      const b = $("#issueBtn"); if (b) { b.classList.add("shake"); setTimeout(() => b.classList.remove("shake"), 260); }
      return;
    }
    if (state.demo && !state.demo.confirmedAt) state.demo.confirmedAt = performance.now();
    state.sales.push(s);
    if (state.offline) state.queued++;
    sfx.ok(); vib([30, 40, 30]);
    state.screen = "settle";
    render();
    showToast(`<span>${s.qty} × ${s.stop.name}</span> · ${inr(s.total)}`, {
      green: false, action: "undo", actionLabel: "UNDO", ttl: 3000,
      onAction: undoSale
    });
  }

  function undoSale() {
    const s = state.sales.pop();
    if (!s) return;
    if (state.offline) state.queued = Math.max(0, state.queued - 1);
    state.sale = s; s.tendered = null; s.mode = "cash";
    state.screen = "quantity";
    sfx.money();
    showToast(`<span>Sale reversed</span> · ${s.qty} × ${s.stop.name}`);
    render();
  }

  function finishSale() {
    state.sale = null;
    state.screen = "standby";
    if (!state.offline && state.queued) {
      const n = state.queued; state.queued = 0;
      setTimeout(() => showToast(`<span>✓ ${n} queued ticket${n > 1 ? "s" : ""} synced</span>`, { green: true }), 500);
    }
    render();
  }

  function handleAction(act, el) {
    const s = state.sale;
    switch (act) {
      case "chip": {
        tapFeedback();
        const stop = stopById(el.dataset.stop);
        if (state.sheetCtx === "wrong" && state.screen === "standby") showToast(`<span>Stop corrected</span> · prediction updated`);
        startSale(stop);
        break;
      }
      case "all": tapFeedback(); state.sheetCtx = "all"; openSheet("stops"); break;
      case "wrong": tapFeedback(); state.sheetCtx = "wrong"; openSheet("stops"); break;
      case "menu": tapFeedback(); openSheet("menu"); break;
      case "close-sheet": closeSheet(); break;
      case "back": tapFeedback(); state.sale = null; state.screen = "standby"; render(); break;
      case "seg": tapFeedback(); s.conc = el.dataset.conc; render(); break;
      case "num": tapFeedback(); s.qty = parseInt(el.dataset.n, 10); render(); break;
      case "clear": tapFeedback(); s.qty = 0; render(); break;
      case "issue": issue(); break;
      case "denom":
        tapFeedback(); sfx.money(); vib(12);
        s.tendered = s.tendered === parseInt(el.dataset.v, 10) ? null : parseInt(el.dataset.v, 10);
        render();
        break;
      case "pay-upi": tapFeedback(); s.mode = "upi"; render(); break;
      case "pay-cash": tapFeedback(); s.mode = "cash"; render(); break;
      case "done": tapFeedback(); finishSale(); break;
      case "void": {
        const v = state.sales.pop();
        if (v) {
          if (state.sale === v) { state.sale = null; state.screen = "standby"; }
          showToast(`<span>Voided</span> · ${v.qty} × ${v.stop.name} · ${inr(v.total)}`);
          closeSheet(); render();
        }
        break;
      }
    }
  }

  $("#screen").addEventListener("click", e => {
    const el = e.target.closest("[data-act]");
    if (el) handleAction(el.dataset.act, el);
  });

  /* ---------- keyboard (volume-key stand-in) ---------- */

  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT") { if (e.key === "Escape") closeSheet(); return; }
    if (state.screen !== "quantity" || !state.sale) return;
    const s = state.sale;
    if (state.demo) return;
    if (["+", "=", "ArrowUp"].includes(e.key)) { if (s.qty < 9) { s.qty++; sfx.tick(); vib(8); render(); } e.preventDefault(); }
    else if (["-", "_", "ArrowDown"].includes(e.key)) { if (s.qty > 0) { s.qty--; sfx.tick(); vib(8); render(); } e.preventDefault(); }
    else if (/^[1-9]$/.test(e.key)) { s.qty = parseInt(e.key, 10); sfx.tick(); vib(8); render(); e.preventDefault(); }
    else if (e.key === "Enter" && s.qty) { issue(); e.preventDefault(); }
    else if (e.key === "Escape") { state.sale = null; state.screen = "standby"; render(); }
  });

  /* ---------- demo runner ---------- */

  const runBtn = $("#runDemo");

  function clearDemoTimers() {
    if (!state.demo) return;
    state.demo.to.forEach(clearTimeout);
    if (state.demo.raf) cancelAnimationFrame(state.demo.raf);
    document.querySelectorAll(".pulse").forEach(el => el.classList.remove("pulse"));
  }

  function endDemo() {
    clearDemoTimers();
    state.demo = null;
    $("#demoHost").classList.remove("open");
    $("#demoHost").innerHTML = "";
    runBtn.disabled = false;
  }

  function runDemo() {
    if (state.demo) return;
    state.sale = null;
    state.screen = "standby";
    closeSheet();
    render();

    const host = $("#demoHost");
    host.innerHTML = `
      <button class="demo-scrim" style="display:none" aria-hidden="true"></button>
      <div class="demo-top">
        <div class="demo-scenario">Bus halts at Trinity · 3 passengers board together — “Trinity! Trinity!”</div>
        <div class="demo-timer">0.00s</div>
        <div class="demo-budget"><i id="demoBar"></i></div>
        <div class="demo-step">GET READY…</div>
      </div>
      <div class="demo-cancel">✕ cancel demo</div>`;
    host.classList.add("open");
    runBtn.disabled = true;

    const timerEl = $(".demo-timer", host);
    const barEl = $("#demoBar", host);
    const stepEl = $(".demo-step", host);
    const scrim = $(".demo-scrim", host);

    const demo = { to: [], raf: null, t0: performance.now(), confirmedAt: null };
    state.demo = demo;

    const tick = () => {
      if (!state.demo) return;
      const t = performance.now() - demo.t0;
      timerEl.textContent = (t / 1000).toFixed(2) + "s";
      barEl.style.width = Math.min(100, (t / 4000) * 100) + "%";
      demo.raf = requestAnimationFrame(tick);
    };
    demo.raf = requestAnimationFrame(tick);

    const later = (ms, fn) => demo.to.push(setTimeout(fn, ms));
    const clickSel = sel => { const el = document.querySelector(sel); if (el) el.click(); };
    const pulse = sel => { const el = document.querySelector(sel); if (el) { el.classList.add("pulse"); later(500, () => el.classList.remove("pulse")); } };

    later(150,  () => { stepEl.textContent = "TAP DESTINATION"; });
    later(200,  () => pulse('[data-act="chip"][data-stop="trinity"]'));
    later(720,  () => clickSel('[data-act="chip"][data-stop="trinity"]'));
    later(840,  () => { stepEl.textContent = "TAP COUNT “3”"; pulse('[data-act="num"][data-n="3"]'); });
    later(1660, () => clickSel('[data-act="num"][data-n="3"]'));
    later(1780, () => { stepEl.textContent = "TAP ISSUE"; pulse("#issueBtn"); });
    later(2420, () => clickSel("#issueBtn"));
    later(2560, () => { stepEl.textContent = "CONFIRMED ✓"; });

    later(3050, () => {
      if (!state.demo) return;
      demo.to.forEach(clearTimeout);
      if (demo.raf) cancelAnimationFrame(demo.raf);
      const measured = demo.confirmedAt ? (demo.confirmedAt - demo.t0) / 1000 : 0;
      scrim.style.display = "";
      $(".demo-top", host).style.display = "none";
      const el = document.createElement("div");
      el.className = "demo-verdict";
      el.innerHTML = `
        <div class="dv-kicker">Interaction time · standby → confirmed</div>
        <div class="dv-time">${measured.toFixed(2)}s</div>
        <div class="dv-line">Budget <b>4.00s</b> — <b>${(4 - measured).toFixed(2)}s of headroom</b> left for cash &amp; change, while printing finishes in the background.</div>
        <div class="dv-line" style="color:#8a9099;font-size:12px">2 taps + 1 confirm · scripted pace of a busy stop</div>
        <div class="dv-actions">
          <button class="dv-replay">↺ Replay</button>
          <button class="dv-close">Close</button>
        </div>`;
      host.appendChild(el);
      $(".dv-replay", el).addEventListener("click", () => { endDemo(); runDemo(); });
      $(".dv-close", el).addEventListener("click", () => { endDemo(); });
      sfx.ok(); vib([30, 40, 30]);
    });

    $(".demo-cancel", host).addEventListener("click", () => { endDemo(); });
  }

  runBtn.addEventListener("click", runDemo);

  /* ---------- rail toggles ---------- */

  function bindToggle(id, key, after) {
    const btn = $(id);
    btn.addEventListener("click", () => {
      state[key] = !state[key];
      btn.setAttribute("aria-pressed", String(state[key]));
      tapFeedback();
      if (after) after();
    });
  }
  bindToggle("#tglGlare", "glare", () => $("#appRoot").classList.toggle("glare", state.glare));
  bindToggle("#tglLefty", "lefty", () => $("#appRoot").classList.toggle("lefty", state.lefty));
  bindToggle("#tglOffline", "offline", () => {
    $("#sbNet").textContent = state.offline ? "OFF" : "5G";
    $("#sbNet").classList.toggle("off", state.offline);
    if (!state.offline && state.queued) {
      const n = state.queued; state.queued = 0;
      setTimeout(() => showToast(`<span>✓ ${n} queued ticket${n > 1 ? "s" : ""} synced</span>`, { green: true }), 600);
      render();
    } else if (state.screen === "standby") render();
  });
  bindToggle("#tglPrinter", "printerOn", () => {
    showToast(state.printerOn ? `<span>Printer reconnected</span>` : `<span>Printer off</span> · next sale falls back to QR tickets`);
  });

  $("#resetDemo").addEventListener("click", () => {
    if (state.demo) endDemo();
    state.sale = null; state.sales = []; state.queued = 0; state.screen = "standby";
    closeSheet(); render();
    showToast(`<span>Shift reset</span> · counters restored`);
  });

  /* ---------- init ---------- */

  render();
})();
