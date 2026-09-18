const $ = (id) => document.getElementById(id);

function apiUrl(path) {
  const clean = String(path).replace(/^\/+/, "");
  if (window.__GAMUT_DASHBOARD__?.url) return window.__GAMUT_DASHBOARD__.url(clean);
  return "/" + clean;
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
function shortHash(h) {
  const s = String(h || "");
  return s.length > 18 ? s.slice(0, 10) + "…" + s.slice(-6) : s;
}
function age(ts) {
  const d = Date.now() - Number(ts);
  if (d < 60000) return Math.max(1, Math.round(d / 1000)) + " secs ago";
  if (d < 3600000) return Math.round(d / 60000) + " mins ago";
  if (d < 86400000) return Math.round(d / 3600000) + " hrs ago";
  return new Date(Number(ts)).toLocaleString();
}
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function token() {
  return localStorage.getItem("tbotf_token") || "";
}
function setToken(t) {
  if (t) localStorage.setItem("tbotf_token", t);
  else localStorage.removeItem("tbotf_token");
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const t = token();
  if (t) headers.Authorization = "Bearer " + t;
  const res = await fetch(apiUrl(path), { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function route() {
  return (location.hash || "#/").replace(/^#/, "") || "/";
}

function show(name) {
  for (const el of document.querySelectorAll("[data-page]")) {
    el.classList.toggle("hidden", el.dataset.page !== name);
  }
}

function setNav(user) {
  const on = !!user;
  for (const id of ["nav-app", "nav-out", "nav-invest", "nav-load", "nav-card"]) {
    $(id).classList.toggle("hidden", !on);
  }
  $("nav-open").classList.toggle("hidden", on);
  $("nav-in").classList.toggle("hidden", on);
  $("nav-admin").classList.toggle("hidden", !(user && user.isAdmin));
}

function renderApp(payload) {
  const u = payload.user;
  $("hello").textContent = `Member ${String(u.memberNo).padStart(4, "0")} · ${u.name}`;
  $("hello-addr").innerHTML = u.address
    ? `<a class="hash" href="#/explorer/address/${u.address}">${u.address}</a>`
    : "";
  $("bal-cash").textContent = money(u.cashCents);
  $("bal-coin").textContent = money(u.coinCents);
  $("bal-total").textContent = money(u.portfolio?.totalCents ?? u.cashCents + u.coinCents);
  const rows = (u.txns || [])
    .slice()
    .reverse()
    .map((t) => {
      const tx = t.txHash
        ? `<a class="hash" href="#/explorer/tx/${t.txHash}">${shortHash(t.txHash)}</a>`
        : "—";
      return `<tr>
        <td>${new Date(t.at).toLocaleString()}</td>
        <td>${escapeHtml(t.label)}</td>
        <td>${t.cashCents ? money(t.cashCents) : "—"}</td>
        <td>${tx}</td>
      </tr>`;
    })
    .join("");
  $("txn-body").innerHTML = rows || `<tr><td colspan="4">No ledger entries yet.</td></tr>`;
}

async function hydrate() {
  if (!token()) {
    setNav(null);
    return null;
  }
  try {
    const data = await api("api/session");
    setNav(data.user);
    return data;
  } catch {
    setToken("");
    setNav(null);
    return null;
  }
}

function txRow(t) {
  return `<tr>
    <td><a class="hash" href="#/explorer/tx/${t.hash}">${shortHash(t.hash)}</a></td>
    <td><span class="pill">${escapeHtml(t.method || "Transfer")}</span></td>
    <td><a class="hash" href="#/explorer/block/${t.blockNumber}">${t.blockNumber}</a></td>
    <td>${age(t.timestamp)}</td>
    <td><a class="hash" href="#/explorer/address/${t.from}">${shortHash(t.from)}</a></td>
    <td><a class="hash" href="#/explorer/address/${t.to}">${shortHash(t.to)}</a></td>
    <td>${money(t.value)}</td>
  </tr>`;
}

async function renderExplorer(path) {
  $("ex-error").textContent = "";
  try {
    const st = await api("api/explorer/stats");
    $("ex-stats").innerHTML = [
      ["Chain", st.name + " · " + st.chainId],
      ["Latest block", st.latestBlock],
      ["Transactions", st.txCount],
      ["Validator", shortHash(st.validator)],
    ]
      .map(([k, v]) => `<div class="ex-stat"><div class="k">${k}</div><div class="v">${escapeHtml(String(v))}</div></div>`)
      .join("");

    const parts = path.split("/").filter(Boolean);
    if (parts[1] === "block" && parts[2]) {
      const b = await api("api/explorer/blocks/" + parts[2]);
      $("ex-view").innerHTML = `<div class="ex-panel">
        <h3>Block #${b.number}</h3>
        <div class="kv">
          <div>Hash</div><div class="mono">${b.hash}</div>
          <div>Parent</div><div><a class="hash" href="#/explorer/block/${b.parentHash}">${b.parentHash}</a></div>
          <div>Timestamp</div><div>${new Date(b.timestamp).toLocaleString()}</div>
          <div>Miner</div><div><a class="hash" href="#/explorer/address/${b.miner}">${b.miner}</a></div>
          <div>Tx count</div><div>${b.txCount}</div>
          <div>Gas used</div><div>${b.gasUsed}</div>
        </div>
        <table><thead><tr><th>Txn</th><th>Method</th><th>Block</th><th>Age</th><th>From</th><th>To</th><th>Value</th></tr></thead>
        <tbody>${(b.txs || []).map((t) => txRow({ ...t, blockNumber: b.number, timestamp: t.timestamp || b.timestamp })).join("")}</tbody></table>
      </div>`;
      return;
    }
    if (parts[1] === "tx" && parts[2]) {
      const t = await api("api/explorer/tx/" + parts[2]);
      $("ex-view").innerHTML = `<div class="ex-panel">
        <h3>Transaction details</h3>
        <div class="kv">
          <div>Hash</div><div class="mono">${t.hash}</div>
          <div>Status</div><div><span class="pill">${escapeHtml(t.status)}</span></div>
          <div>Block</div><div><a class="hash" href="#/explorer/block/${t.blockNumber}">${t.blockNumber}</a></div>
          <div>Timestamp</div><div>${new Date(t.timestamp).toLocaleString()}</div>
          <div>From</div><div><a class="hash" href="#/explorer/address/${t.from}">${t.from}</a></div>
          <div>To</div><div><a class="hash" href="#/explorer/address/${t.to}">${t.to}</a></div>
          <div>Value</div><div>${money(t.value)}</div>
          <div>Method</div><div>${escapeHtml(t.method)}</div>
          <div>Gas</div><div>${t.gas}</div>
        </div>
      </div>`;
      return;
    }
    if (parts[1] === "address" && parts[2]) {
      const a = await api("api/explorer/address/" + parts[2]);
      $("ex-view").innerHTML = `<div class="ex-panel">
        <h3>Address</h3>
        <div class="kv"><div>Address</div><div class="mono">${a.address}</div><div>Txns</div><div>${a.txCount}</div></div>
        <table><thead><tr><th>Txn</th><th>Method</th><th>Block</th><th>Age</th><th>From</th><th>To</th><th>Value</th></tr></thead>
        <tbody>${(a.txs || []).map(txRow).join("") || `<tr><td colspan="7">No transactions</td></tr>`}</tbody></table>
      </div>`;
      return;
    }

    const [blocks, txs] = await Promise.all([api("api/explorer/blocks"), api("api/explorer/txs")]);
    $("ex-view").innerHTML = `<div class="ex-grid">
      <div class="ex-panel">
        <h3>Latest blocks</h3>
        <table><thead><tr><th>Block</th><th>Age</th><th>Txn</th><th>Miner</th><th>Gas</th></tr></thead>
        <tbody>${(blocks.blocks || [])
          .map(
            (b) => `<tr>
            <td><a class="hash" href="#/explorer/block/${b.number}">${b.number}</a></td>
            <td>${age(b.timestamp)}</td>
            <td>${b.txCount}</td>
            <td><a class="hash" href="#/explorer/address/${b.miner}">${shortHash(b.miner)}</a></td>
            <td>${b.gasUsed}</td>
          </tr>`
          )
          .join("")}</tbody></table>
      </div>
      <div class="ex-panel">
        <h3>Latest transactions</h3>
        <table><thead><tr><th>Txn</th><th>Method</th><th>Block</th><th>Age</th><th>From</th><th>To</th><th>Value</th></tr></thead>
        <tbody>${(txs.txs || []).map(txRow).join("")}</tbody></table>
      </div>
    </div>`;
  } catch (err) {
    $("ex-error").textContent = err.message;
  }
}

async function renderLearn(session) {
  const data = await api("api/learn");
  const done = session?.user?.lessons || {};
  $("learn-list").innerHTML = data.lessons
    .map((l) => {
      const ok = !!done[l.id];
      return `<article class="tile ${ok ? "done" : ""}">
        <h3>${escapeHtml(l.title)}</h3>
        <p>${escapeHtml(l.summary)}</p>
        <p class="muted" style="margin-top:0.6rem;">${l.minutes} min · ${escapeHtml(l.check)}</p>
        <button class="btn ${ok ? "ghost" : "gold"}" style="margin-top:0.8rem;" data-lesson="${l.id}" ${ok ? "disabled" : ""}>
          ${ok ? "Completed" : "Mark complete"}
        </button>
      </article>`;
    })
    .join("");
}

async function renderInvest(session) {
  const u = session.user;
  const px = u.portfolio?.prices || {};
  $("invest-plan").textContent = `Recommended mix (${u.allocation.label}): cash ${u.allocation.cash}% · BANK ${u.allocation.bank}% · ETH ${u.allocation.eth}% · BTC ${u.allocation.btc}%`;
  $("invest-prices").innerHTML = [
    ["Cash", money(u.cashCents)],
    ["BANK", `${(u.holdings?.BANK || 0).toFixed(4)} · $${(px.BANK || 0).toFixed(2)}`],
    ["ETH", `${(u.holdings?.ETH || 0).toFixed(6)} · $${(px.ETH || 0).toFixed(0)}`],
    ["BTC", `${(u.holdings?.BTC || 0).toFixed(6)} · $${(px.BTC || 0).toFixed(0)}`],
  ]
    .map(([k, v]) => `<div class="bal"><div class="label">${k}</div><div class="value" style="font-size:1.35rem">${v}</div></div>`)
    .join("");
}

function renderLoad(session) {
  const invoices = session.user.invoices || [];
  $("load-result").innerHTML = invoices
    .slice()
    .reverse()
    .map((inv) => {
      const pay =
        inv.status === "complete" || inv.credited
          ? `<span class="ok">Credited</span>`
          : `<button class="btn ghost" data-pay="${inv.id}">Refresh BitPay status</button>`;
      const link = inv.url && !String(inv.url).startsWith("#")
        ? `<a class="btn ghost" href="${inv.url}" target="_blank" rel="noopener">Open BitPay</a>`
        : "";
      return `<article class="tile" style="margin-bottom:0.75rem;">
        <h3>$${inv.price} · ${escapeHtml(inv.status)}</h3>
        <p>${escapeHtml(inv.note || inv.itemDesc || "BitPay invoice")}${inv.error ? " — " + escapeHtml(inv.error) : ""}</p>
        <div class="hero-actions" style="margin-top:0.75rem;">${link}${pay}</div>
      </article>`;
    })
    .join("") || `<p class="muted">No invoices yet.</p>`;
}

function renderCard(session) {
  const cards = session.user.cards || [];
  if (!cards.length) {
    $("card-view").innerHTML = `<button class="btn gold" id="issue-card">Issue Marqeta debit card</button>`;
    return;
  }
  const c = cards[0];
  $("card-view").innerHTML = `
    <div class="plastic" aria-label="Virtual debit card">
      <div>
        <div class="muted">The Blocks of the Future Bank</div>
        <div style="margin-top:0.35rem;">Marqeta · ${escapeHtml(c.network)}</div>
      </div>
      <div class="pan">${escapeHtml(c.panMasked)}</div>
      <div style="display:flex;justify-content:space-between;">
        <span>${escapeHtml(c.cardholderName)}</span>
        <span>${String(c.expiryMonth).padStart(2, "0")}/${String(c.expiryYear).slice(-2)}</span>
      </div>
    </div>
    <p style="margin-top:1rem;">Status: <strong>${escapeHtml(c.status)}</strong> · ${escapeHtml(c.note || "")}</p>
    <form class="form" id="form-spend" style="margin-top:1rem;">
      <label for="merch">Merchant</label>
      <input id="merch" type="text" value="Teaching cafe" />
      <label for="spend">Amount (USD)</label>
      <input id="spend" type="number" min="1" step="1" value="5" />
      <div class="hero-actions" style="margin-top:1rem;">
        <button class="btn gold" type="submit">Authorize spend</button>
        <button class="btn ghost" id="freeze-btn" type="button">${c.status === "FROZEN" ? "Unfreeze" : "Freeze"}</button>
      </div>
    </form>`;
}

async function go() {
  const path = route();
  const session = await hydrate();

  if (path.startsWith("/explorer")) {
    show("explorer");
    await renderExplorer(path);
    return;
  }
  if (path.startsWith("/learn")) {
    show("learn");
    try {
      await renderLearn(session);
    } catch (e) {
      $("learn-list").innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
    }
    return;
  }
  if (path.startsWith("/invest")) {
    if (!session) return (location.hash = "#/signin");
    show("invest");
    await renderInvest(session);
    return;
  }
  if (path.startsWith("/load")) {
    if (!session) return (location.hash = "#/signin");
    show("load");
    renderLoad(session);
    return;
  }
  if (path.startsWith("/card")) {
    if (!session) return (location.hash = "#/signin");
    show("card");
    renderCard(session);
    return;
  }
  if (path.startsWith("/app")) {
    if (!session) return (location.hash = "#/signin");
    renderApp(session);
    show("app");
    return;
  }
  if (path.startsWith("/admin")) {
    if (!session?.user?.isAdmin) return (location.hash = "#/signin");
    const summary = await api("api/admin");
    $("admin-pool").textContent = money(summary.adminPoolCents);
    $("admin-count").textContent = String(summary.memberCount);
    $("admin-cash").textContent = money(summary.totalCashCents);
    $("admin-coin").textContent = money(summary.totalCoinCents);
    $("admin-body").innerHTML = summary.members
      .map(
        (m) => `<tr>
          <td>${String(m.memberNo).padStart(4, "0")}</td>
          <td>${escapeHtml(m.name)}</td>
          <td><a class="hash" href="#/explorer/address/${m.address}">${shortHash(m.address || "")}</a></td>
          <td>${money(m.cashCents)}</td>
          <td>${money(m.coinCents)}</td>
        </tr>`
      )
      .join("");
    show("admin");
    return;
  }
  if (path.startsWith("/open")) return show("open");
  if (path.startsWith("/signin")) return show("signin");
  if (path.startsWith("/legal")) return show("legal");
  show("home");
}

$("form-open").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("open-error");
  err.textContent = "";
  if (!$("agree").checked) {
    err.textContent = "Confirm the disclosures to continue.";
    return;
  }
  $("open-btn").disabled = true;
  try {
    const data = await api("api/register", {
      method: "POST",
      body: JSON.stringify({ name: $("name").value, email: $("email").value, password: $("password").value }),
    });
    setToken(data.token);
    location.hash = "#/app";
    await go();
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    $("open-btn").disabled = false;
  }
});

$("form-in").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("in-error").textContent = "";
  $("in-btn").disabled = true;
  try {
    const data = await api("api/login", {
      method: "POST",
      body: JSON.stringify({ email: $("in-email").value, password: $("in-password").value }),
    });
    setToken(data.token);
    location.hash = data.user.isAdmin ? "#/admin" : "#/app";
    await go();
  } catch (ex) {
    $("in-error").textContent = ex.message;
  } finally {
    $("in-btn").disabled = false;
  }
});

$("nav-out").addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    await api("api/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  setToken("");
  location.hash = "#/";
  await go();
});

$("ex-search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (!q) return;
  try {
    const r = await api("api/explorer/search?q=" + encodeURIComponent(q));
    if (r.type === "block") location.hash = "#/explorer/block/" + r.item.number;
    else if (r.type === "tx") location.hash = "#/explorer/tx/" + r.item.hash;
    else if (r.type === "address") location.hash = "#/explorer/address/" + r.item.address;
    else $("ex-error").textContent = "Nothing found for that query.";
  } catch (ex) {
    $("ex-error").textContent = ex.message;
  }
});

$("learn-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-lesson]");
  if (!btn) return;
  if (!token()) return (location.hash = "#/signin");
  btn.disabled = true;
  try {
    await api("api/learn/" + btn.dataset.lesson, { method: "POST" });
    await go();
  } catch (ex) {
    btn.disabled = false;
    alert(ex.message);
  }
});

$("form-trade").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("trade-error").textContent = "";
  try {
    await api("api/trade", {
      method: "POST",
      body: JSON.stringify({
        symbol: $("sym").value,
        side: $("side").value,
        usdCents: Math.round(Number($("usd").value) * 100),
      }),
    });
    await go();
  } catch (ex) {
    $("trade-error").textContent = ex.message;
  }
});

$("alloc-btn").addEventListener("click", async () => {
  try {
    await api("api/allocate", { method: "POST" });
    await go();
  } catch (ex) {
    $("trade-error").textContent = ex.message;
  }
});

$("form-load").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("load-error").textContent = "";
  try {
    await api("api/load", {
      method: "POST",
      body: JSON.stringify({ amountUsd: Number($("load-amt").value) }),
    });
    await go();
  } catch (ex) {
    $("load-error").textContent = ex.message;
  }
});

$("load-result").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-pay]");
  if (!btn) return;
  try {
    await api("api/load/" + btn.dataset.pay + "/status", { method: "POST" });
    await go();
  } catch (ex) {
    $("load-error").textContent = ex.message;
  }
});

$("card-view").addEventListener("click", async (e) => {
  if (e.target.id === "issue-card") {
    $("card-error").textContent = "";
    try {
      await api("api/cards", { method: "POST" });
      await go();
    } catch (ex) {
      $("card-error").textContent = ex.message;
    }
  }
  if (e.target.id === "freeze-btn") {
    const session = await api("api/session");
    const c = session.user.cards[0];
    const path = c.status === "FROZEN" ? "unfreeze" : "freeze";
    await api("api/cards/" + c.id + "/" + path, { method: "POST" });
    await go();
  }
});

$("card-view").addEventListener("submit", async (e) => {
  if (e.target.id !== "form-spend") return;
  e.preventDefault();
  $("card-error").textContent = "";
  try {
    const session = await api("api/session");
    const c = session.user.cards[0];
    await api("api/cards/" + c.id + "/spend", {
      method: "POST",
      body: JSON.stringify({
        amountCents: Math.round(Number($("spend").value) * 100),
        merchant: $("merch").value,
      }),
    });
    await go();
  } catch (ex) {
    $("card-error").textContent = ex.message;
  }
});

window.addEventListener("hashchange", go);
go();
