const $ = (id) => document.getElementById(id);

function apiUrl(path) {
  const clean = String(path).replace(/^\/+/, "");
  if (window.__GAMUT_DASHBOARD__?.url) return window.__GAMUT_DASHBOARD__.url(clean);
  return "/" + clean;
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

function token() {
  return localStorage.getItem("tbotf_token") || "";
}
function setToken(t) {
  if (t) localStorage.setItem("tbotf_token", t);
  else localStorage.removeItem("tbotf_token");
}

const STARTER = { cashCents: 12500, coinCents: 12500, reserveCents: 25000 };
const ADMINS = new Set(["theblocksofthefuture@gmail.com", "admin@bankchainai.net"]);

function localDb() {
  try {
    return JSON.parse(localStorage.getItem("tbotf_db") || "") || { users: {}, adminPoolCents: 0, nextMember: 1 };
  } catch {
    return { users: {}, adminPoolCents: 0, nextMember: 1 };
  }
}
function saveLocalDb(db) {
  localStorage.setItem("tbotf_db", JSON.stringify(db));
}
function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    memberNo: u.memberNo,
    createdAt: u.createdAt,
    cashCents: u.cashCents,
    coinCents: u.coinCents,
    isAdmin: ADMINS.has(u.email),
    txns: u.txns || [],
  };
}

function localApi(path, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const body = opts.body ? JSON.parse(opts.body) : {};
  const db = localDb();
  const t = token();
  if (path === "api/register" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    if (!name || name.length < 2) throw new Error("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email.");
    if (!body.password || String(body.password).length < 8) throw new Error("Password must be at least 8 characters.");
    if (db.users[email]) throw new Error("An account with that email already exists.");
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      password: String(body.password),
      memberNo: db.nextMember++,
      createdAt: now,
      cashCents: STARTER.cashCents,
      coinCents: STARTER.coinCents,
      txns: [
        { id: crypto.randomUUID(), at: now, label: "Founding starter — cash ledger (simulated)", cashCents: STARTER.cashCents, coinCents: 0 },
        { id: crypto.randomUUID(), at: now, label: "Founding starter — BANK coin (simulated)", cashCents: 0, coinCents: STARTER.coinCents },
      ],
    };
    db.users[email] = user;
    db.adminPoolCents += STARTER.reserveCents;
    saveLocalDb(db);
    const tok = crypto.randomUUID();
    localStorage.setItem("tbotf_local_session", JSON.stringify({ token: tok, email }));
    return { token: tok, user: publicUser(user), adminPoolCents: db.adminPoolCents };
  }
  if (path === "api/login" && method === "POST") {
    const email = String(body.email || "").trim().toLowerCase();
    const user = db.users[email];
    if (!user || user.password !== body.password) throw new Error("Email or password is incorrect.");
    const tok = crypto.randomUUID();
    localStorage.setItem("tbotf_local_session", JSON.stringify({ token: tok, email }));
    return { token: tok, user: publicUser(user), adminPoolCents: db.adminPoolCents };
  }
  const sess = JSON.parse(localStorage.getItem("tbotf_local_session") || "null");
  if (path === "api/session") {
    if (!sess || sess.token !== t || !db.users[sess.email]) throw new Error("Sign in required.");
    return { user: publicUser(db.users[sess.email]), adminPoolCents: db.adminPoolCents };
  }
  if (path === "api/logout" && method === "POST") {
    localStorage.removeItem("tbotf_local_session");
    return { ok: true };
  }
  if (path === "api/admin") {
    if (!sess || sess.token !== t || !ADMINS.has(sess.email)) throw new Error("Admin only.");
    const members = Object.values(db.users).map(publicUser);
    return {
      memberCount: members.length,
      adminPoolCents: db.adminPoolCents,
      totalCashCents: members.reduce((a, u) => a + u.cashCents, 0),
      totalCoinCents: members.reduce((a, u) => a + u.coinCents, 0),
      members,
    };
  }
  throw new Error("Not found");
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const t = token();
  if (t) headers.Authorization = "Bearer " + t;
  try {
    const res = await fetch(apiUrl(path), { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (err) {
    if (path === "api/health") throw err;
    return localApi(path, opts);
  }
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
  $("nav-app").classList.toggle("hidden", !user);
  $("nav-open").classList.toggle("hidden", !!user);
  $("nav-in").classList.toggle("hidden", !!user);
  $("nav-out").classList.toggle("hidden", !user);
  $("nav-admin").classList.toggle("hidden", !(user && user.isAdmin));
}

function renderApp(payload) {
  const u = payload.user;
  $("hello").textContent = `Member ${String(u.memberNo).padStart(4, "0")} · ${u.name}`;
  $("bal-cash").textContent = money(u.cashCents);
  $("bal-coin").textContent = money(u.coinCents);
  $("bal-total").textContent = money(u.cashCents + u.coinCents);
  const rows = (u.txns || [])
    .slice()
    .reverse()
    .map(
      (t) => `<tr>
        <td>${new Date(t.at).toLocaleString()}</td>
        <td>${escapeHtml(t.label)}</td>
        <td>${t.cashCents ? money(t.cashCents) : "—"}</td>
        <td>${t.coinCents ? money(t.coinCents) : "—"}</td>
      </tr>`
    )
    .join("");
  $("txn-body").innerHTML = rows || `<tr><td colspan="4">No ledger entries yet.</td></tr>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

async function go() {
  const path = route();
  const session = await hydrate();

  if (path.startsWith("/app")) {
    if (!session) {
      location.hash = "#/signin";
      show("signin");
      return;
    }
    renderApp(session);
    show("app");
    return;
  }
  if (path.startsWith("/admin")) {
    if (!session?.user?.isAdmin) {
      location.hash = "#/signin";
      show("signin");
      return;
    }
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
          <td>${escapeHtml(m.email)}</td>
          <td>${money(m.cashCents)}</td>
          <td>${money(m.coinCents)}</td>
        </tr>`
      )
      .join("");
    show("admin");
    return;
  }
  if (path.startsWith("/open")) {
    show("open");
    return;
  }
  if (path.startsWith("/signin")) {
    show("signin");
    return;
  }
  if (path.startsWith("/legal")) {
    show("legal");
    return;
  }
  show("home");
}

$("form-open").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("open-error");
  err.textContent = "";
  if (!$("agree").checked) {
    err.textContent = "Confirm that you understand this is a simulated demonstration.";
    return;
  }
  const btn = $("open-btn");
  btn.disabled = true;
  try {
    const data = await api("api/register", {
      method: "POST",
      body: JSON.stringify({
        name: $("name").value,
        email: $("email").value,
        password: $("password").value,
      }),
    });
    setToken(data.token);
    location.hash = "#/app";
    await go();
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
});

$("form-in").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("in-error");
  err.textContent = "";
  const btn = $("in-btn");
  btn.disabled = true;
  try {
    const data = await api("api/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("in-email").value,
        password: $("in-password").value,
      }),
    });
    setToken(data.token);
    location.hash = data.user.isAdmin ? "#/admin" : "#/app";
    await go();
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
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

window.addEventListener("hashchange", go);
go();
