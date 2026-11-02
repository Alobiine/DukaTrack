"use client";

import { snapshotSale } from "../lib/domain";
import { salesCsv } from "../lib/export";
import { SalesScreen } from "./screens/SalesScreen";
import { HomeScreen } from "./screens/HomeScreen";

import { money, day, nowDay, stamp } from "../lib/format";
import { SyncScreen } from "./screens/SyncScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { CreditScreen } from "./screens/CreditScreen";
import { StockScreen } from "./screens/StockScreen";
import { Brand, Field } from "./components/primitives";
import { PasswordField } from "./components/PasswordField";
("use client");
import { useWorkspaceUpdates } from "./components/useWorkspaceUpdates";
import { CorrectionForm } from "./components/CorrectionForm";

import { mergeBackup, sameRecords, type Backup } from "../lib/backup";
import { AccountSecurity } from "./components/AccountSecurity";
import { DeviceLock } from "./components/DeviceLock";
import { useModalFocus } from "./components/ModalFocus";
import React, { useEffect, useState, useRef } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  Users,
  BarChart3,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  ChevronRight,
  WifiOff,
  Download,
  LogOut,
  Check,
  AlertTriangle,
  X,
  Cloud,
  ShieldCheck,
} from "lucide-react";
import { apply, balance, type State, type Operation } from "../lib/domain";
import { readLocal, writeLocal, withWorkspaceLock } from "../lib/storage";
const uid = () =>
  crypto.randomUUID?.() ||
  Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
type Account = { id: string; business: string; owner: string; phone: string | null; email?: string | null };
import { synchronise, blank, type Bundle, type Reply } from "../lib/sync";
const nav = [
  ["Home", LayoutDashboard],
  ["Sales", ShoppingBag],
  ["Stock", Package],
  ["Credit", Users],
  ["Reports", BarChart3],
] as const;
export default function App() {
  const [account, setAccount] = useState<Account | null>(null),
    [ready, setReady] = useState(false),
    [bundle, setBundle] = useState<Bundle>(blank()),
    [tab, setTab] = useState("Home"),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("Today"),
    [online, setOnline] = useState(true),
    [syncing, setSyncing] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [register, setRegister] = useState(false),
    [legacyLogin, setLegacyLogin] = useState(false),
    [authBusy, setAuthBusy] = useState(false),
    [cart, setCart] = useState<Record<string, number>>({}),
    [method, setMethod] = useState("Cash"),
    [customer, setCustomer] = useState(""),
    [install, setInstall] = useState<any>(null);
  const modalRef = useRef<HTMLElement>(null);
  useModalFocus(modal, modalRef);
  const aRef = useRef<Account | null>(null),
    busy = useRef(false),
    saving = useRef(false);
  aRef.current = account;
  const s = bundle.state,
    products = s.products.filter((p) => !p.archived),
    sales = [...s.sales].reverse(),
    todaySales = s.sales.filter((x) => day(x.at) === nowDay()),
    total = (xs: State["sales"]) =>
      xs.reduce(
        (a, x) =>
          a +
          x.total -
          (s.corrections || [])
            .filter((c) => c.saleId === x.id)
            .reduce((n, c) => n + c.total, 0),
        0,
      ),
    todayTotal = total(todaySales),
    low = products.filter((x) => x.quantity <= x.threshold),
    credit = s.customers.reduce((a, c) => a + balance(s, c.id), 0),
    reviews = s.reviews.filter((x) => !x.resolved);
  function flash(text: string) {
    setNotice(text);
    setTimeout(() => setNotice(""), 4500);
  }
  async function locked<T>(fn: () => Promise<T>): Promise<T> {
    if (!aRef.current) throw Error("Sign in first.");
    return withWorkspaceLock(aRef.current.id, fn);
  }
  async function load(a: Account) {
    const b = await readLocal(a.id);
    await writeLocal("last-account", a);
    setBundle(b || blank());
    setAccount(a);
    navigator.storage?.persist?.().catch(() => {});
  }
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const last = await readLocal("last-account");
        if (last && mounted) await load(last);
        const r = await fetch("/api/auth", { cache: "no-store" });
        const d: any = await r.json();
        if (d.account && mounted) await load(d.account);
      } catch (e) {
        if (mounted)
          setError(
            e instanceof Error ? e.message : "Could not open device storage.",
          );
      } finally {
        if (mounted) setReady(true);
      }
    }
    init();
    setOnline(navigator.onLine);
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    const installer = (e: any) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", installer);
    navigator.serviceWorker
      ?.register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        const cacheAssets = () =>
          reg.active?.postMessage({
            type: "CACHE_ASSETS",
            urls: performance
              .getEntriesByType("resource")
              .map((x) => x.name)
              .filter((x) => /\.(js|css)(\?|$)/.test(x)),
          });
        cacheAssets();
        window.addEventListener("load", cacheAssets, { once: true });
        setTimeout(cacheAssets, 4000);
      })
      .catch(() => {});
    return () => {
      mounted = false;
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
      window.removeEventListener("beforeinstallprompt", installer);
    };
  }, []);
  async function sync() {
    if (!aRef.current || !navigator.onLine || busy.current) return;
    busy.current = true;
    setSyncing(true);
    setError("");
    try {
      await locked(async () => {
        const a = aRef.current!;
        const b: Bundle = (await readLocal(a.id)) || blank();
        await synchronise(
          b,
          async (operations) => {
            const r = await fetch("/api/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ businessId: a.id, operations }),
              signal: AbortSignal.timeout(30000),
            });
            const d = (await r.json()) as Reply & { error?: string };
            if (!r.ok) throw Error(d.error || "Could not sync.");
            return d;
          },
          async (next) => {
            await writeLocal(a.id, next);
            if (aRef.current?.id === a.id) setBundle(next);
          },
        );
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Sync unavailable. Pending records remain on this device.",
      );
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (account && ready && online) sync();
    const t = setInterval(() => {
      if (aRef.current && navigator.onLine) sync();
    }, 60000);
    return () => clearInterval(t);
  }, [account?.id, ready, online]);
  useWorkspaceUpdates(account?.id, busy, setBundle);
  async function mutate(type: string, payload: any) {
    if (saving.current) return false;
    saving.current = true;
    setError("");
    try {
      await locked(async () => {
        const a = aRef.current;
        if (!a) throw Error("Sign in first.");
        const b: Bundle = (await readLocal(a.id)) || blank();
        const op: Operation = {
          id: uid(),
          at: Date.now(),
          type,
          payload: type === "sale" ? snapshotSale(b.state, payload) : payload,
        };
        const next = {
          ...b,
          state: apply(b.state, op),
          operations: [...b.operations, op],
        };
        await writeLocal(a.id, next);
        setBundle(next);
      });
      setModal("");
      setSelected(null);
      flash("Saved on this device.");
      if (navigator.onLine) setTimeout(sync, 100);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save. Your changes have not been recorded.",
      );
      return false;
    } finally {
      saving.current = false;
    }
  }
  async function auth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, action: register ? "register" : "login" }),
      });
      const d: any = await r.json();
      if (!r.ok) throw Error(d.error);
      await load(d.account);
      setModal("");
      setRegister(false);
      flash("Welcome to your business workspace.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Connect to the internet to sign in.",
      );
    } finally {
      setAuthBusy(false);
    }
  }
  async function logout() {
    if (
      bundle.operations.length &&
      !confirm(
        "You have unsynced records. They will stay on this device. Sign out?",
      )
    )
      return;
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      if (!r.ok) throw Error();
      await writeLocal("last-account", null);
      setAccount(null);
      setBundle(blank());
      setTab("Home");
    } catch {
      setError("Connect to the internet to sign out securely.");
    }
  }
  function go(name: string) {
    setTab(name);
    setSearch("");
    setError("");
  }
  function open(name: string, obj: any = null) {
    setError("");
    setSelected(obj);
    setModal(name);
  }
  function download(name: string, text: string, type = "application/json") {
    const u = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = u;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }
  function backup() {
    download(
      "DukaTrack-" + nowDay() + ".json",
      JSON.stringify(
        {
          format: "dukatrack-v1",
          schemaVersion: 1,
          business: account,
          exportedAt: Date.now(),
          ...bundle,
        },
        null,
        2,
      ),
    );
    flash("Backup exported. Store it somewhere safe.");
  }
  async function restoreBackup(source: Backup) {
    setError("");
    try {
      await locked(async () => {
        const a = aRef.current!;
        const current: Bundle = (await readLocal(a.id)) || blank();
        const merged = mergeBackup(current.state, source.state);
        if (
          sameRecords(
            { ...current.state, corrections: current.state.corrections || [] },
            merged,
          )
        )
          throw Error(
            "This backup is already present. No records were imported.",
          );
        const safety = {
          format: "dukatrack-v1",
          schemaVersion: 1,
          business: a,
          exportedAt: Date.now(),
          ...current,
        };
        await writeLocal("safety-backup:" + a.id + ":" + Date.now(), safety);
        download(
          "DukaTrack-safety-" + Date.now() + ".json",
          JSON.stringify(safety),
        );
        const op: Operation = {
          id: uid(),
          type: "restore",
          at: Date.now(),
          payload: { state: source.state, businessId: source.business.id },
        };
        const next = {
          ...current,
          state: apply(current.state, op),
          operations: [...current.operations, op],
        };
        await writeLocal(a.id, next);
        setBundle(next);
      });
      flash("Backup restored on this device. Pending cloud validation.");
      if (navigator.onLine) setTimeout(sync, 100);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed.");
      return false;
    }
  }
  function exportSales() {
    download("DukaTrack-sales.csv", salesCsv(s), "text/csv");
  }
  const syncLabel = !online
    ? `Offline ? ${bundle.operations.length} pending`
    : syncing
      ? "Syncing"
      : bundle.operations.length
        ? `${bundle.operations.length} pending`
        : bundle.lastSync
          ? "Synced"
          : "Pending first sync";
  const cartItems = Object.entries(cart)
    .filter(([id, q]) => q > 0)
    .map(([id, q]) => ({ p: products.find((p) => p.id === id)!, q }))
    .filter((x) => x.p);
  const cartTotal = cartItems.reduce((a, x) => a + x.p.price * x.q, 0);
  const filteredSales = sales
    .filter(
      (x) =>
        filter === "All" ||
        (filter === "Today"
          ? day(x.at) === nowDay()
          : x.at > Date.now() - 7 * 86400000),
    )
    .filter(
      (x) =>
        !search ||
        x.id.toLowerCase().includes(search.toLowerCase()) ||
        x.items.some((i) =>
          i.name.toLowerCase().includes(search.toLowerCase()),
        ),
    );
  if (!ready)
    return (
      <div className="loading">
        <Brand />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!account)
    return (
      <div className="authpage">
        <section className="authstory">
          <Brand />
          <div>
            <span className="eyebrow">YOUR BUSINESS. IN YOUR HANDS.</span>
            <h1>
              A clearer view.
              <br />A stronger business.
            </h1>
            <p>
              From your first sale to your last stock count. Keep your business
              moving, even when the internet stops.
            </p>
            <div className="storyfeatures">
              <span>
                <Check size={18} /> Sales & stock, together
              </span>
              <span>
                <Check size={18} /> Customer credit, under control
              </span>
              <span>
                <Check size={18} /> Offline first. Connected when you are.
              </span>
            </div>
          </div>
          <small>Built for the everyday businesses of Uganda.</small>
        </section>
        <section className="authform">
          <div className="mobilebrand">
            <Brand />
          </div>
          <div className="authbox">
            <span className="eyebrow">DUKATRACK WORKSPACE</span>
            <h2>{register ? "Your business starts here" : "Welcome back"}</h2>
            <p>
              {register
                ? "Set up a workspace for your business."
                : "Sign in to manage your business."}
            </p>
            <div className="authswitch">
              <button
                className={!register ? "active" : ""}
                onClick={() => {
                  setRegister(false);
                  setError("");
                }}
              >
                Sign in
              </button>
              <button
                className={register ? "active" : ""}
                onClick={() => {
                  setRegister(true);
                  setLegacyLogin(false);
                  setError("");
                }}
              >
                Create account
              </button>
            </div>
            <form onSubmit={auth}>
              {register && (
                <>
                  <Field
                    label="Business name"
                    name="business"
                    placeholder="Enter your business name"
                    required
                  />
                  <Field
                    label="Owner name"
                    name="owner"
                    autoComplete="name"
                    required
                  />
                </>
              )}
              <Field
                label={legacyLogin ? "Registered phone number" : "Email address"}
                name={legacyLogin ? "phone" : "email"}
                type={legacyLogin ? "tel" : "email"}
                placeholder={legacyLogin ? "Enter your registered phone" : "Enter your email address"}
                autoComplete="username"
                required
              />
              <PasswordField
                key={register ? "signup-password" : "signin-password"}
                label="Password"
                name="password"
                minLength={8}
                maxLength={128}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="At least 8 characters"
                required
              />
              {!register && (
                <div className="auth-password-help">
                  <a href="/forgot-password">Forgot password?</a>
                </div>
              )}
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              <button className="primary wide" disabled={authBusy || !online}>
                {authBusy
                  ? "Please wait…"
                  : register
                    ? "Create business account"
                    : "Open workspace"}
                <ArrowUpRight size={18} />
              </button>
            </form>
            {!register && (
              <button className="textbutton" onClick={() => { setLegacyLogin(!legacyLogin); setError(""); }}>
                {legacyLogin ? "Sign in with email" : "Already have a phone-based account?"}
              </button>
            )}
            <p className="authnote">
              <ShieldCheck size={17} /> Your business has its own private
              workspace.
            </p>
            <small className="muted">
              Internet is required to create an account or sign in. Once opened
              on this device, your workspace is available offline.
            </small>
          </div>
        </section>
      </div>
    );
  return (
    <DeviceLock key={account.id} accountId={account.id}>
      <div className="app">
        <aside className="sidebar">
          <Brand />
          <button className="business">
            <span className="avatar">{account.business.slice(0, 1)}</span>
            <span>
              {account.business}
              <small>Business workspace</small>
            </span>
            <ChevronRight size={14} />
          </button>
          <span className="navlabel">WORKSPACE</span>
          <nav>
            {nav.map(([name, Icon]) => (
              <button
                key={name}
                className={tab === name ? "active" : ""}
                onClick={() => go(name)}
              >
                <Icon size={20} />
                {name}
                {name === "Stock" && low.length > 0 && <b>{low.length}</b>}
              </button>
            ))}
          </nav>
          <div className="sidebottom">
            <button
              className={tab === "Sync" ? "active" : ""}
              onClick={() => go("Sync")}
            >
              <Cloud size={20} />
              Sync & backup{bundle.operations.length > 0 && <i />}
            </button>
            <button
              className={tab === "Settings" ? "active" : ""}
              onClick={() => go("Settings")}
            >
              <Settings size={20} />
              Settings
            </button>
            <div className="offlinepromise">
              <ShieldCheck size={20} />
              <b>Built to work offline</b>
              <p>
                Your work saves on this device first, even without internet.
              </p>
            </div>
            <div className="profile">
              <span className="avatar pale">{account.owner.slice(0, 1)}</span>
              <span>
                {account.owner}
                <small>Business owner</small>
              </span>
              <button aria-label="Sign out" onClick={logout}>
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="breadcrumb">
              Workspace <ChevronRight size={14} />
              <strong>
                {tab === "Home"
                  ? "Overview"
                  : tab === "Sync"
                    ? "Sync & backup"
                    : tab}
              </strong>
            </div>
            <div className="topactions">
              <button
                className={"connection " + (!online ? "off" : "")}
                onClick={() => go("Sync")}
              >
                {online ? (
                  <span className="statusdot" />
                ) : (
                  <WifiOff size={14} />
                )}{" "}
                {online ? "Online · " : ""}
                {syncLabel}
              </button>
              <span className="today">
                {new Date().toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "Africa/Kampala",
                })}
              </span>
              <span className="avatar pale smallavatar">
                {account.owner.slice(0, 1)}
              </span>
            </div>
          </header>
          <main>
            <div className="pagehead">
              <div>
                <span className="eyebrow">
                  {tab === "Home"
                    ? "YOUR BUSINESS AT A GLANCE"
                    : "BUSINESS WORKSPACE"}
                </span>
                <h1>
                  {tab === "Home"
                    ? "Business overview"
                    : tab === "Credit"
                      ? "Customer credit"
                      : tab === "Sync"
                        ? "Sync & backup"
                        : tab === "Stock"
                          ? "Products & stock"
                          : tab}
                </h1>
                <p>
                  {
                    (
                      {
                        Home: `Welcome back, ${account.owner.split(" ")[0]}. Here’s how business is looking.`,
                        Sales: "Every transaction, clearly recorded.",
                        Stock: "Keep the right products on your shelves.",
                        Credit:
                          "Know who owes you, and keep payments on track.",
                        Reports:
                          "Revenue after returns, grouped by original sale date.",
                        Sync: "Keep your device and cloud records together.",
                        Settings: "Make this workspace yours.",
                      } as any
                    )[tab]
                  }
                </p>
              </div>
              <div className="headbuttons">
                {tab === "Home" || tab === "Sales" ? (
                  <>
                    <button className="secondary desktop" onClick={exportSales}>
                      <Download size={17} />
                      Export sales
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        setCart({});
                        setMethod("Cash");
                        open("sale");
                      }}
                    >
                      <Plus size={19} />
                      New sale
                    </button>
                  </>
                ) : tab === "Stock" ? (
                  <button className="primary" onClick={() => open("product")}>
                    <Plus size={18} />
                    Add product
                  </button>
                ) : tab === "Credit" ? (
                  <button className="primary" onClick={() => open("customer")}>
                    <Plus size={18} />
                    Add customer
                  </button>
                ) : null}
              </div>
            </div>
            {!online && (
              <div className="banner">
                <WifiOff size={18} />
                <span>
                  You’re offline. Keep working — changes are saved on this
                  device.
                </span>
              </div>
            )}
            {error && !modal && (
              <div className="error" role="alert">
                {error}
                <button onClick={() => setError("")} aria-label="Dismiss">
                  <X size={16} />
                </button>
              </div>
            )}
            {reviews.length > 0 && tab !== "Sync" && (
              <button className="reviewbanner" onClick={() => go("Sync")}>
                <AlertTriangle size={18} />
                {reviews.length} record(s) need your review
                <ChevronRight size={17} />
              </button>
            )}
            {tab === "Home" && (
              <HomeScreen
                s={s}
                todaySales={todaySales}
                todayTotal={todayTotal}
                total={total}
                credit={credit}
                bundle={bundle}
                setCart={setCart}
                open={open}
                sync={sync}
                syncing={syncing}
                online={online}
                go={go}
                sales={sales}
                low={low}
                products={products}
              />
            )}
            {tab === "Stock" && (
              <StockScreen
                products={products}
                low={low}
                search={search}
                setSearch={setSearch}
                open={open}
              />
            )}
            {tab === "Sales" && (
              <SalesScreen
                filter={filter}
                setFilter={setFilter}
                search={search}
                setSearch={setSearch}
                filteredSales={filteredSales}
                total={total}
                open={open}
                setCart={setCart}
                s={s}
              />
            )}
            {tab === "Credit" && (
              <CreditScreen
                s={s}
                credit={credit}
                search={search}
                setSearch={setSearch}
                open={open}
              />
            )}
            {tab === "Reports" && (
              <ReportsScreen
                s={s}
                products={products}
                low={low}
                credit={credit}
                filter={filter}
                setFilter={setFilter}
                filteredSales={filteredSales}
                total={total}
                exportSales={exportSales}
              />
            )}
            {tab === "Sync" && (
              <SyncScreen
                account={account}
                bundle={bundle}
                s={s}
                reviews={reviews}
                online={online}
                syncing={syncing}
                error={error}
                sync={sync}
                backup={backup}
                restoreBackup={restoreBackup}
                open={open}
              />
            )}
            {tab === "Settings" && (
              <SettingsScreen
                account={account}
                install={install}
                backup={backup}
                open={open}
                logout={logout}
              />
            )}
            <footer>
              <span>
                DukaTrack <i /> A little clarity. A better business.
              </span>
              <span>
                <ShieldCheck size={13} />
                Saved locally first
              </span>
            </footer>
          </main>
          <nav className="bottomnav">
            {nav.map(([n, I]) => (
              <button
                key={n}
                className={tab === n ? "active" : ""}
                onClick={() => go(n)}
              >
                <I size={21} />
                <span>{n}</span>
              </button>
            ))}
            <button
              className={["Settings", "Sync"].includes(tab) ? "active" : ""}
              onClick={() => go("Settings")}
            >
              <Settings size={21} />
              <span>More</span>
            </button>
          </nav>
        </div>
        {notice && (
          <div className="toast" role="status">
            <Check size={18} />
            {notice}
          </div>
        )}
        {modal && (
          <div
            className="modalback"
            onClick={(e) => {
              if (e.target === e.currentTarget) setModal("");
            }}
          >
            <section
              className={"modal " + (modal === "sale" ? "salemodal" : "")}
              ref={modalRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label={modal}
              onKeyDown={(e) => {
                if (e.key === "Escape") setModal("");
              }}
            >
              <div className="modalhead">
                <div>
                  <span className="eyebrow">DUKATRACK WORKSPACE</span>
                  <h2>
                    {
                      (
                        {
                          product: selected ? "Edit product" : "Add product",
                          adjust: "Adjust stock",
                          customer: selected ? "Edit customer" : "Add customer",
                          payment: "Record credit payment",
                          sale: "New sale",
                          receipt: "Sale receipt",
                          archive: "Archive product",
                          "customer-detail": selected?.name,
                          correction: "Return or reverse sale",
                          password: "Change password",
                          resolve: "Review conflict",
                          reauth: "Sign in to sync",
                        } as any
                      )[modal]
                    }
                  </h2>
                </div>
                <button
                  className="iconbutton"
                  aria-label="Close dialog"
                  onClick={() => setModal("")}
                >
                  <X size={22} />
                </button>
              </div>
              {error && (
                <div role="alert" className="error">
                  {error}
                </div>
              )}
              {modal === "correction" && (
                <CorrectionForm state={s} sale={selected} save={mutate} />
              )}
              {modal === "password" && (
                <AccountSecurity
                  mode="change"
                  onComplete={() => {
                    setModal("reauth");
                    flash("Password changed. Sign in again.");
                  }}
                />
              )}
              {modal === "resolve" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    mutate("resolve", {
                      id: selected.id,
                      reason: f.get("reason"),
                    });
                  }}
                >
                  <p>{selected?.message}</p>
                  <Field
                    label="Resolution reason and any replacement receipt reference"
                    name="reason"
                    required
                    maxLength={120}
                  />
                  <p>
                    Closing this review preserves the original operation. It
                    does not apply it to stock or balances.
                  </p>
                  <button className="primary wide">Save review decision</button>
                </form>
              )}
              {modal === "reauth" && (
                <form onSubmit={auth}>
                  <Field
                    label={account.email ? "Email address" : "Registered phone number"}
                    name={account.email ? "email" : "phone"}
                    type={account.email ? "email" : "tel"}
                    defaultValue={account.email || account.phone || ""}
                    required
                  />
                  <PasswordField
                    label="Password"
                    name="password"
                    required
                  />
                  <button className="primary wide" disabled={authBusy}>
                    Sign in
                  </button>
                </form>
              )}
              {modal === "product" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f: any = Object.fromEntries(
                      new FormData(e.currentTarget),
                    );
                    mutate("product", {
                      id: selected?.id || uid(),
                      name: f.name,
                      price: +f.price,
                      quantity: selected?.quantity ?? +f.quantity,
                      threshold: +f.threshold,
                      base: selected?.updatedAt,
                      baseRevision: selected?.revision,
                    });
                  }}
                >
                  <Field
                    label="Product name"
                    name="name"
                    defaultValue={selected?.name}
                    placeholder="e.g. Sugar 1 kg"
                    required
                    maxLength={120}
                  />
                  <div className="formgrid">
                    <Field
                      label="Selling price (UGX)"
                      name="price"
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={selected?.price}
                      required
                    />
                    {!selected && (
                      <Field
                        label="Opening stock"
                        name="quantity"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue="0"
                        required
                      />
                    )}
                    <Field
                      label="Low-stock threshold"
                      name="threshold"
                      type="number"
                      min="0"
                      step="1"
                      defaultValue={selected?.threshold ?? 5}
                      required
                    />
                  </div>
                  <p className="formhelp">
                    Use stock adjustments to change existing quantities. Each
                    adjustment keeps a reason.
                  </p>
                  <button className="primary wide">
                    {selected ? "Save changes" : "Add product"}
                  </button>
                </form>
              )}
              {modal === "adjust" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f: any = Object.fromEntries(
                      new FormData(e.currentTarget),
                    );
                    mutate("adjust", {
                      id: selected.id,
                      delta: +f.quantity * (f.direction === "reduce" ? -1 : 1),
                      reason: f.reason,
                    });
                  }}
                >
                  <div className="infobox">
                    <b>{selected.name}</b>
                    <span>{selected.quantity} currently in stock</span>
                  </div>
                  <label className="field">
                    Adjustment
                    <select name="direction">
                      <option value="add">Add stock</option>
                      <option value="reduce">Reduce stock</option>
                    </select>
                  </label>
                  <Field
                    label="Quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    step="1"
                    required
                  />
                  <Field
                    label="Reason"
                    name="reason"
                    placeholder="e.g. Delivery received, damaged stock"
                    required
                    maxLength={120}
                  />
                  <button className="primary wide">Save adjustment</button>
                </form>
              )}
              {modal === "archive" && (
                <>
                  <p>
                    Archive <b>{selected.name}</b>? It will no longer appear in
                    new sales. Existing sales and history will be preserved.
                  </p>
                  <button
                    className="primary wide"
                    onClick={() => mutate("archive", { id: selected.id })}
                  >
                    Archive product
                  </button>
                </>
              )}
              {modal === "customer" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f: any = Object.fromEntries(
                      new FormData(e.currentTarget),
                    );
                    mutate(selected ? "customer-edit" : "customer", {
                      id: selected?.id || uid(),
                      name: f.name,
                      phone: f.phone,
                      ...(selected ? { base: { name: selected.name, phone: selected.phone } } : {}),
                    });
                  }}
                >
                  <Field
                    label="Customer name"
                    name="name"
                    defaultValue={selected?.name}
                    required
                    maxLength={120}
                  />
                  <Field
                    label="Phone number (optional)"
                    name="phone"
                    defaultValue={selected?.phone}
                    type="tel"
                    maxLength={25}
                  />
                  <button className="primary wide">{selected ? "Save changes" : "Add customer"}</button>
                </form>
              )}
              {modal === "payment" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f: any = Object.fromEntries(
                      new FormData(e.currentTarget),
                    );
                    mutate("payment", {
                      customerId: f.customer,
                      amount: +f.amount,
                      method: f.method,
                    });
                  }}
                >
                  <label className="field">
                    Customer
                    <select
                      name="customer"
                      defaultValue={selected?.id || ""}
                      required
                    >
                      <option value="" disabled>
                        Select customer
                      </option>
                      {s.customers
                        .filter((c) => balance(s, c.id) > 0)
                        .map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.name} — {money(balance(s, c.id))}
                          </option>
                        ))}
                    </select>
                  </label>
                  <Field
                    label="Amount paid (UGX)"
                    name="amount"
                    type="number"
                    min="1"
                    step="1"
                    required
                  />
                  <label className="field">
                    Payment method
                    <select name="method">
                      <option>Cash</option>
                      <option>MTN Mobile Money</option>
                      <option>Airtel Money</option>
                    </select>
                  </label>
                  <button
                    className="primary wide"
                    disabled={!s.customers.some((c) => balance(s, c.id) > 0)}
                  >
                    Save payment
                  </button>
                </form>
              )}
              {modal === "sale" && (
                <>
                  <div className="salegrid">
                    <div className="salepicker">
                      <div className="search">
                        <Search size={17} />
                        <input
                          placeholder="Find product"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                      {products.length ? (
                        products
                          .filter((p) =>
                            p.name.toLowerCase().includes(search.toLowerCase()),
                          )
                          .map((p) => (
                            <button
                              className="pickproduct"
                              disabled={p.quantity === 0}
                              key={p.id}
                              onClick={() =>
                                setCart({
                                  ...cart,
                                  [p.id]: Math.min(
                                    p.quantity,
                                    (cart[p.id] || 0) + 1,
                                  ),
                                })
                              }
                            >
                              <span className="productavatar">
                                {p.name.slice(0, 1)}
                              </span>
                              <span>
                                <b>{p.name}</b>
                                <small>
                                  {money(p.price)} · {p.quantity} in stock
                                </small>
                              </span>
                              <Plus size={18} />
                            </button>
                          ))
                      ) : (
                        <p className="muted">
                          Add products in Stock before recording a sale.
                        </p>
                      )}
                    </div>
                    <div className="salecheckout">
                      <h3>
                        Current sale{" "}
                        <span className="muted">({cartItems.length})</span>
                      </h3>
                      {cartItems.length ? (
                        cartItems.map(({ p, q }) => (
                          <div className="cartrow" key={p.id}>
                            <div>
                              <b>{p.name}</b>
                              <small>{money(p.price)}</small>
                            </div>
                            <div className="quantity">
                              <button
                                aria-label={"Reduce " + p.name}
                                onClick={() =>
                                  setCart({ ...cart, [p.id]: q - 1 })
                                }
                              >
                                −
                              </button>
                              <input
                                aria-label={"Quantity for " + p.name}
                                type="number"
                                min="0"
                                max={p.quantity}
                                value={q}
                                onChange={(e) =>
                                  setCart({
                                    ...cart,
                                    [p.id]: Number(e.target.value),
                                  })
                                }
                              />
                              <button
                                aria-label={"Increase " + p.name}
                                onClick={() =>
                                  setCart({ ...cart, [p.id]: q + 1 })
                                }
                              >
                                +
                              </button>
                            </div>
                            {q > p.quantity && (
                              <small className="dangertext">
                                Only {p.quantity} available
                              </small>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="cartempty">
                          <ShoppingBag size={30} />
                          <p>Tap a product to add it here.</p>
                        </div>
                      )}
                      <div className="saletotal">
                        <span>Total</span>
                        <strong>{money(cartTotal)}</strong>
                      </div>
                      <label className="field">
                        Payment type
                        <select
                          value={method}
                          onChange={(e) => setMethod(e.target.value)}
                        >
                          <option>Cash</option>
                          <option>MTN Mobile Money</option>
                          <option>Airtel Money</option>
                          <option>Credit</option>
                        </select>
                      </label>
                      {method === "Credit" && (
                        <>
                          <label className="field">
                            Customer
                            <select
                              value={customer}
                              onChange={(e) => setCustomer(e.target.value)}
                            >
                              <option value="">Select customer</option>
                              {s.customers.map((c) => (
                                <option value={c.id} key={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="textbutton"
                            onClick={() => open("customer")}
                          >
                            Add a new customer first
                            <Plus size={14} />
                          </button>
                        </>
                      )}
                      <button
                        className="primary wide"
                        disabled={
                          !cartItems.length ||
                          cartItems.some(
                            (x) => x.q > x.p.quantity || !Number.isInteger(x.q),
                          ) ||
                          (method === "Credit" && !customer)
                        }
                        onClick={async () => {
                          const ok = await mutate("sale", {
                            items: cartItems.map((x) => ({
                              productId: x.p.id,
                              quantity: x.q,
                              price: x.p.price,
                            })),
                            method,
                            customerId: customer,
                          });
                          if (ok) setCart({});
                        }}
                      >
                        <Check size={18} />
                        Save sale · {money(cartTotal)}
                      </button>
                      <p className="formhelp">
                        Stock updates immediately. Payments are recorded, not
                        processed.
                      </p>
                    </div>
                  </div>
                </>
              )}
              {modal === "receipt" && (
                <>
                  <button
                    className="secondary wide"
                    onClick={() => open("correction", selected)}
                  >
                    Return or reverse this sale
                  </button>
                  {(s.corrections || [])
                    .filter((c) => c.saleId === selected.id)
                    .map((c) => (
                      <div className="infobox" key={c.id}>
                        <span>
                          {stamp(c.at)} - {c.reason}
                        </span>
                        <b>
                          Returned {money(c.total)} - Refund {money(c.refund)}
                        </b>
                      </div>
                    ))}
                  <div className="receiptbrand">
                    <Brand />
                    <h3>{account.business}</h3>
                    <small>
                      #{selected.id.slice(0, 8).toUpperCase()} ·{" "}
                      {stamp(selected.at)}
                    </small>
                  </div>
                  <div className="reportlist">
                    {selected.items.map((i: any) => (
                      <div key={i.productId}>
                        <span>
                          {i.name}
                          <small>
                            {i.quantity} × {money(i.price)}
                          </small>
                        </span>
                        <b>{money(i.quantity * i.price)}</b>
                      </div>
                    ))}
                  </div>
                  <div className="saletotal">
                    <b>Total</b>
                    <strong>{money(selected.total)}</strong>
                  </div>
                  <div className="infobox">
                    <span>{selected.method}</span>
                    {selected.customerId && (
                      <b>
                        {
                          s.customers.find((c) => c.id === selected.customerId)
                            ?.name
                        }
                      </b>
                    )}
                  </div>
                  <button
                    className="secondary wide"
                    onClick={() =>
                      download(
                        "DukaTrack-receipt-" + selected.id.slice(0, 8) + ".txt",
                        account.business +
                          "\n" +
                          stamp(selected.at) +
                          "\n" +
                          selected.items
                            .map(
                              (i: any) =>
                                `${i.name} x ${i.quantity}: ${money(i.quantity * i.price)}`,
                            )
                            .join("\n") +
                          "\nTotal: " +
                          money(selected.total) +
                          "\n" +
                          selected.method +
                          "\n" +
                          (s.corrections || [])
                            .filter((c) => c.saleId === selected.id)
                            .map(
                              (c) =>
                                "Return: " +
                                money(c.total) +
                                "; refund: " +
                                money(c.refund) +
                                "; " +
                                c.reason,
                            )
                            .join("\n"),
                        "text/plain",
                      )
                    }
                  >
                    <Download size={17} />
                    Download receipt
                  </button>
                </>
              )}
              {modal === "customer-detail" && (
                <>
                  <div className="customerhero">
                    <span className="avatar pale">
                      {selected.name.slice(0, 1)}
                    </span>
                    <div>
                      <small>{selected.phone || "No phone number"}</small>
                      <h2>{money(balance(s, selected.id))}</h2>
                      <span>Outstanding balance</span>
                    </div>
                  </div>
                  <button
                    className="primary wide"
                    onClick={() => open("payment", selected)}
                    disabled={balance(s, selected.id) <= 0}
                  >
                    <ArrowDownLeft size={18} />
                    Record payment
                  </button>
                  <h3 className="sectiontitle">Credit & payment history</h3>
                  <button className="secondary wide" onClick={() => open("customer", selected)}>
                    Edit customer details
                  </button>
                  <div className="reportlist">
                    {[
                      ...s.sales
                        .filter((x) => x.customerId === selected.id)
                        .map((x) => ({
                          id: x.id,
                          at: x.at,
                          label: "Credit sale",
                          amount: x.total,
                        })),
                      ...s.payments
                        .filter((x) => x.customerId === selected.id)
                        .map((x) => ({
                          id: x.id,
                          at: x.at,
                          label: "Payment · " + x.method,
                          amount: -x.amount,
                        })),
                    ]
                      .sort((a, b) => b.at - a.at)
                      .map((x) => (
                        <div key={x.id}>
                          <span>
                            {x.label}
                            <small>{stamp(x.at)}</small>
                          </span>
                          <b className={x.amount < 0 ? "success" : ""}>
                            {x.amount < 0 ? "−" : ""}
                            {money(Math.abs(x.amount))}
                          </b>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </DeviceLock>
  );
}
