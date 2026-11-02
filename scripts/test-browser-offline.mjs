// Real Chrome, service worker and IndexedDB acceptance test. No production data.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

const root = process.cwd();
const runtime = path.join(root, ".sites-runtime/browser-offline", crypto.randomUUID());
mkdirSync(runtime, { recursive: true });
const downloads = path.join(runtime, "downloads");
mkdirSync(downloads);
const chrome = process.env.DUKATRACK_BROWSER_EXECUTABLE || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
if (!chrome) throw Error("Set DUKATRACK_BROWSER_EXECUTABLE to an installed Chromium browser.");
const probe = createServer();
await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = "http://127.0.0.1:" + port;
const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
config.name = "dukatrack-browser-qa";
config.main = path.resolve("dist/server", config.main);
config.assets.directory = path.resolve("dist/client");
config.services = [];
for (const database of config.d1_databases) database.migrations_dir = path.resolve("drizzle");
const configPath = path.join(runtime, "wrangler.json");
writeFileSync(configPath, JSON.stringify(config));
const cli = path.resolve("node_modules/wrangler/bin/wrangler.js");
const environment = { ...process.env, CI: "true", WRANGLER_LOG_PATH: path.join(runtime, "logs") };
const migrated = spawnSync(process.execPath, [cli, "d1", "migrations", "apply", "DB", "--local", "--config", configPath, "--persist-to", path.join(runtime, "db")], { env: environment, windowsHide: true, encoding: "utf8", timeout: 60000 });
if (migrated.status !== 0) throw Error(migrated.stderr || migrated.stdout || "Migration failed");
const server = spawn(process.execPath, [cli, "dev", "--local", "--config", configPath, "--persist-to", path.join(runtime, "db"), "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", "0"], { env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let serverLogs = "";
server.stdout.on("data", (data) => { serverLogs = (serverLogs + data).slice(-8000); });
server.stderr.on("data", (data) => { serverLogs = (serverLogs + data).slice(-8000); });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, timeout = 40000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    await pause(250);
  }
  throw Error("Timed out: " + label + (lastError ? " (" + lastError.message + ")" : ""));
}
let browser, connection, browserLogs = "";
async function openBrowser(offline = false) {
  const profile = path.join(runtime, "chrome-profile");
  const portFile = path.join(profile, "DevToolsActivePort");
  browserLogs = "";
  browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-sync", "--window-size=1280,900", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  browser.stderr.on("data", (data) => { browserLogs = (browserLogs + data).slice(-4000); });
  await until(async () => {
    if (browser.exitCode !== null) throw Error("Chrome exited: " + browserLogs);
    if (!existsSync(portFile)) return false;
    const debugPort = readFileSync(portFile, "utf8").split(/\r?\n/)[0];
    const response = await fetch("http://127.0.0.1:" + debugPort + "/json/list");
    const target = (await response.json()).find((entry) => entry.type === "page");
    if (!target) return false;
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    const listeners = new Map();
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        for (const listener of listeners.get(message.method) || []) listener(message.params);
        return;
      }
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      message.error ? request.reject(Error(message.error.message)) : request.resolve(message.result);
    };
    socket.onclose = () => { for (const request of pending.values()) request.reject(Error("Browser connection closed")); pending.clear(); };
    connection = {
      send(method, params = {}) {
        return new Promise((resolve, reject) => {
          const id = ++sequence;
          pending.set(id, { resolve, reject });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
      close: () => socket.close(),
      on(event, listener) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(listener);
        return () => listeners.get(event).delete(listener);
      },
    };
    return true;
  }, "Chrome debugging connection");
  await connection.send("Runtime.enable");
  await connection.send("Page.enable");
  await connection.send("Network.enable");
  await connection.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await network(offline);
  await connection.send("Page.navigate", { url: origin });
}
async function network(offline) {
  await connection.send("Network.emulateNetworkConditions", { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}
async function evaluate(expression) {
  const response = await connection.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
const ready = (expression, label) => until(() => evaluate(expression), label);
async function snapshot() {
  return evaluate(`(async () => {
    const read = (key) => new Promise((resolve,reject) => {
      const open=indexedDB.open('dukatrack-business',1);
      open.onerror=()=>reject(Error('IndexedDB failed'));
      open.onsuccess=()=>{const db=open.result;const tx=db.transaction('workspace');const r=tx.objectStore('workspace').get(key);let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>{db.close();resolve(value)};tx.onerror=()=>reject(Error('Read failed'))};
    });
    const account=await read('last-account');return account ? await read(account.id) : null;
  })()`);
}
async function stop(process) {
  if (!process || process.exitCode !== null) return;
  if (globalThis.process.platform === "win32") spawnSync("taskkill", ["/PID", String(process.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", timeout: 10000 });
  else process.kill("SIGTERM");
  process.stdout?.destroy(); process.stderr?.destroy(); process.unref();
}
async function closeBrowser() {
  if (!browser) return;
  try { await connection?.send("Browser.close"); } catch {}
  connection?.close();
  await until(() => browser.exitCode !== null, "Chrome shutdown", 10000).catch(() => stop(browser));
}

try {
  await until(async () => {
    if (server.exitCode !== null) throw Error(serverLogs);
    return (await fetch(origin)).ok;
  }, "local Worker startup");
  await openBrowser();
  await ready("!!document.querySelector('.authswitch')", "sign-in page");
  await evaluate("document.querySelectorAll('.authswitch button')[1].click()");
  await ready("!!document.querySelector('input[name=business]')", "registration form");
  const user = { business: "Offline browser QA", owner: "QA", email: `offline-${crypto.randomUUID()}@example.com`, password: crypto.randomUUID() };
  await evaluate(`for (const [name,value] of Object.entries(${JSON.stringify(user)})) document.querySelector('input[name="'+name+'"]').value=value; document.querySelector('.authbox form').requestSubmit()`);
  await ready("!!document.querySelector('.sidebar')", "registered workspace");
  await evaluate("Array.from(document.querySelectorAll('.quick')).find(b=>b.textContent.startsWith('Add a product')).click()");
  await ready("!!document.querySelector('.modal input[name=price]')", "product form");
  await evaluate(`for (const [name,value] of Object.entries({name:'Offline sugar',price:'5000',quantity:'5',threshold:'2'})) document.querySelector('.modal input[name="'+name+'"]').value=value; document.querySelector('.modal form').requestSubmit()`);
  await until(async () => { const state = await snapshot(); return state?.state.products.length === 1 && state.operations.length === 0 && state.lastSync > 0; }, "product cloud sync");
  await ready("!!navigator.serviceWorker.controller", "service-worker control");
  await ready(`(async()=>{const urls=performance.getEntriesByType('resource').map(r=>r.name).filter(u=>/\\.(js|css)(\\?|$)/.test(u));return urls.length>0 && (await Promise.all(urls.map(u=>caches.match(u)))).every(Boolean)})()`, "offline asset caching");
  await network(true);
  await ready("navigator.onLine === false", "browser offline status");
  await evaluate("Array.from(document.querySelectorAll('.quick')).find(b=>b.textContent.startsWith('Record a sale')).click()");
  await ready("!!document.querySelector('.pickproduct')", "sale picker");
  await evaluate("document.querySelector('.pickproduct').click()");
  await ready("!!document.querySelector('.salecheckout .primary:not(:disabled)')", "sale checkout");
  await evaluate("document.querySelector('.salecheckout .primary').click()");
  await until(async () => { const state = await snapshot(); return state?.operations.length === 1 && state.state.sales.length === 1 && state.state.products[0].quantity === 4; }, "committed offline sale");
  const saved = await snapshot();
  const operationId = saved.operations[0].id;
  await connection.send("Page.reload");
  await ready("!!document.querySelector('.sidebar')", "offline reload");
  assert.equal((await snapshot()).operations[0].id, operationId);
  console.log("PASS: real Chrome offline sale, IndexedDB commit and offline page reload.");
  await closeBrowser();
  await openBrowser(true);
  await ready("!!document.querySelector('.sidebar')", "offline browser reopen");
  const reopened = await snapshot();
  assert.equal(reopened.operations[0].id, operationId);
  assert.equal(reopened.state.sales.length, 1);
  assert.equal(reopened.state.products[0].quantity, 4);
  console.log("PASS: closing and reopening Chrome offline retains the sale and pending identity.");
  await network(false);
  await until(async () => { const state = await snapshot(); return state?.operations.length === 0 && state.state.sales.length === 1; }, "reconnection sync");
  await connection.send("Page.reload");
  await ready("!!document.querySelector('.sidebar')", "online reload");
  const synced = await snapshot();
  assert.equal(synced.operations.length, 0);
  assert.equal(synced.state.sales.length, 1);
  assert.equal(synced.state.sales[0].total, 5000);
  assert.equal(synced.state.products[0].quantity, 4);
  console.log("PASS: reconnect and reload sync one sale without duplicate stock deduction.");

  // Exercise the actual receipt button and inspect the downloaded file.
  await evaluate("Array.from(document.querySelectorAll('.sidebar nav button')).find(b=>b.textContent.trim()==='Sales').click()");
  await ready("!!document.querySelector('tbody tr')", "sales history");
  await evaluate("document.querySelector('tbody tr').click()");
  await ready("!!document.querySelector('.receiptbrand')", "receipt viewer");
  assert((await evaluate("document.querySelector('.modal').textContent")).includes("Offline sugar"));
  await evaluate("Array.from(document.querySelectorAll('.modal button')).find(b=>b.textContent.includes('Download receipt')).click()");
  await until(() => readdirSync(downloads).some((name) => name.endsWith(".txt")), "receipt file download");
  const receiptPath = path.join(downloads, readdirSync(downloads).find((name) => name.endsWith(".txt")));
  const receipt = readFileSync(receiptPath, "utf8");
  assert(receipt.includes(user.business));
  assert(receipt.includes("Offline sugar x 1: UGX 5,000"));
  assert(receipt.includes("Total: UGX 5,000"));
  assert(receipt.includes("Cash"));
  await evaluate("document.querySelector('button[aria-label=\"Close dialog\"]').click()");
  console.log("PASS: real browser receipt viewing and text-file download with business, items, total and payment method.");

  const openSync = () => evaluate("Array.from(document.querySelectorAll('.sidebottom > button')).find(b=>b.textContent.startsWith('Sync & backup')).click()");
  await openSync();
  await ready("!!document.querySelector('input[type=file]')", "backup controls");
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Download business backup')).click()");
  await until(() => readdirSync(downloads).some((name) => /^DukaTrack-\d{4}.*\.json$/.test(name)), "JSON backup download");
  const backupPath = path.join(downloads, readdirSync(downloads).find((name) => /^DukaTrack-\d{4}.*\.json$/.test(name)));
  const exported = JSON.parse(readFileSync(backupPath, "utf8"));
  assert.equal(exported.format, "dukatrack-v1");
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.state.sales[0].id, synced.state.sales[0].id);
  assert.equal(exported.state.products[0].quantity, 4);
  assert.equal(exported.operations.length, 0);

  // Simulate loss of only this disposable device's workspace, not its cloud data.
  await network(true);
  const cleared = structuredClone(synced);
  for (const key of Object.keys(cleared.state)) cleared.state[key] = [];
  cleared.operations = [];
  await evaluate(`(async()=>{const open=indexedDB.open('dukatrack-business',1);await new Promise((resolve,reject)=>{open.onsuccess=()=>{const db=open.result;const tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put(${JSON.stringify(cleared)},${JSON.stringify(exported.business.id)});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(Error('Test reset failed'))};open.onerror=()=>reject(Error('Test reset failed'))})})()`);
  await connection.send("Page.reload");
  await ready("!!document.querySelector('.sidebar')", "empty disposable workspace");
  assert.equal((await snapshot()).state.sales.length, 0);
  await openSync();
  await ready("!!document.querySelector('input[type=file]')", "restore file input");
  async function selectFile(file) {
    const document = await connection.send("DOM.getDocument");
    const input = await connection.send("DOM.querySelector", { nodeId: document.root.nodeId, selector: "input[type=file]" });
    await connection.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] });
  }
  const restoreButton = "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Create safety backup and restore'))";
  await selectFile(backupPath);
  await ready(`!!(${restoreButton})`, "validated restore preview");
  await evaluate(`(${restoreButton}).click()`);
  await until(async () => { const state = await snapshot(); return state?.state.sales.length === 1 && state.operations.length === 1; }, "restored committed records");
  const restored = await snapshot();
  assert.equal(restored.operations[0].type, "restore");
  assert.equal(restored.state.products[0].quantity, 4);
  await until(() => readdirSync(downloads).some((name) => name.startsWith("DukaTrack-safety-") && name.endsWith(".json")), "pre-restore safety download");
  const safety = JSON.parse(readFileSync(path.join(downloads, readdirSync(downloads).find((name) => name.startsWith("DukaTrack-safety-") && name.endsWith(".json"))), "utf8"));
  assert.equal(safety.state.sales.length, 0);
  const safetyStored = await evaluate(`(async()=>{const open=indexedDB.open('dukatrack-business',1);return await new Promise((resolve,reject)=>{open.onsuccess=()=>{const db=open.result;const tx=db.transaction('workspace');const r=tx.objectStore('workspace').getAllKeys();r.onsuccess=()=>resolve(r.result.some(k=>String(k).startsWith('safety-backup:')));tx.oncomplete=()=>db.close();tx.onerror=()=>reject(Error('Safety read failed'))}})})()`);
  assert.equal(safetyStored, true);
  await network(false);
  await until(async () => (await snapshot())?.operations.length === 0, "restored records cloud sync");
  const beforeRejectedImport = await snapshot();
  assert.equal(beforeRejectedImport.state.sales.length, 1);
  for (const [name, alter, expected] of [
    ["wrong-business", (file) => { file.business.id = crypto.randomUUID(); }, "another business"],
    ["conflicting", (file) => { file.state.products[0].quantity = 999; }, "conflicts with existing"],
  ]) {
    const invalid = structuredClone(exported);
    alter(invalid);
    const file = path.join(runtime, name + ".json");
    writeFileSync(file, JSON.stringify(invalid));
    await selectFile(file);
    await ready(`Array.from(document.querySelectorAll('[role=alert]')).some(e=>e.textContent.includes(${JSON.stringify(expected)}))`, name + " rejection");
    assert.equal(await evaluate(`!!(${restoreButton})`), false);
    assert.deepEqual((await snapshot()).state, beforeRejectedImport.state);
  }
  await selectFile(backupPath);
  await ready(`!!(${restoreButton})`, "duplicate restore preview");
  await evaluate(`(${restoreButton}).click()`);
  await ready("document.body.textContent.includes('already present')", "duplicate import rejection");
  assert.equal((await snapshot()).state.sales.length, 1);
  assert.equal((await snapshot()).operations.length, 0);
  console.log("PASS: real JSON download/file import, safety copies, cloud restore sync, wrong-business/conflicting-file rejection and duplicate prevention.");

  // Seed controlled transactions through the real isolated server, then check rendered summaries.
  const cookies = await connection.send("Network.getCookies", { urls: [origin] });
  const session = cookies.cookies.find((cookie) => cookie.name === "duka_session");
  assert(session, "Test browser must have an authenticated session");
  const qaOperation = (type, payload, at = Date.now()) => ({ id: crypto.randomUUID(), at, type, payload });
  async function seed(operations) {
    const response = await fetch(origin + "/api/sync", {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: "duka_session=" + session.value },
      body: JSON.stringify({ businessId: exported.business.id, operations }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.rejected.length, 0);
    return result;
  }
  const productId = synced.state.products[0].id;
  const creditCustomerId = crypto.randomUUID();
  const saleItems = [{ productId, name: "Offline sugar", quantity: 1, price: 5000 }];
  await seed([
    qaOperation("adjust", { id: productId, delta: 10, reason: "Summary test restock" }),
    qaOperation("customer", { id: creditCustomerId, name: "Summary customer", phone: "" }),
    qaOperation("sale", { items: saleItems, method: "MTN Mobile Money", total: 5000 }),
    qaOperation("sale", { items: saleItems, method: "Airtel Money", total: 5000 }),
    qaOperation("sale", { items: saleItems, method: "Credit", total: 5000, customerId: creditCustomerId }),
    qaOperation("sale", { items: saleItems, method: "Cash", total: 5000 }, Date.now() - 86400000),
    qaOperation("payment", { customerId: creditCustomerId, amount: 1000, method: "Cash" }),
    qaOperation("payment", { customerId: creditCustomerId, amount: 500, method: "MTN Mobile Money" }),
    qaOperation("correction", { saleId: synced.state.sales[0].id, kind: "reversal", reason: "Summary test return", refund: 5000, refundMethod: "Cash" }),
  ]);
  await connection.send("Page.reload");
  await ready("!!document.querySelector('.sidebar')", "dashboard summaries");
  await ready("JSON.stringify(Array.from(document.querySelectorAll('.stats .stat > strong')).map(e=>e.textContent)) === JSON.stringify(['UGX 15,000','UGX 1,000','UGX 10,500','UGX 3,500'])", "dashboard cash/mobile/credit totals after repayment and refund");
  assert((await evaluate("document.querySelector('.chartsummary').textContent")).includes("UGX 20,000"));
  const dailyBars = await evaluate("Array.from(document.querySelectorAll('.bararea')).map(e=>e.title)");
  assert.equal(dailyBars.at(-1), "UGX 15,000");
  assert.equal(dailyBars.at(-2), "UGX 5,000");
  console.log("PASS: rendered dashboard totals separate today/prior-day sales, cash/mobile receipts, repayments, refunds and outstanding credit.");

  async function checkStock(quantity) {
    await connection.send("Page.reload");
    await ready("!!document.querySelector('.sidebar')", "stock dashboard");
    await until(async () => (await snapshot())?.state.products.find((product) => product.id === productId)?.quantity === quantity, "stock refresh");
  }
  await seed([qaOperation("adjust", { id: productId, delta: -9, reason: "Threshold test" })]);
  await checkStock(2);
  await ready("!!document.querySelector('.stockwatch') && document.querySelector('.stockwatch').textContent.includes('Low stock')", "warning at minimum threshold");
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.sidebar nav button')).find(b=>b.textContent.startsWith('Stock')).querySelector('b').textContent"), "1");
  await evaluate("Array.from(document.querySelectorAll('.sidebar nav button')).find(b=>b.textContent.startsWith('Stock')).click()");
  await ready("!!document.querySelector('tbody .pill.amber')", "stock table warning");
  await seed([qaOperation("adjust", { id: productId, delta: -2, reason: "Zero stock test" })]);
  await checkStock(0);
  await ready("!!document.querySelector('.stockwatch') && document.querySelector('.stockwatch').textContent.includes('Out of stock')", "out-of-stock warning");
  const archivedProduct = crypto.randomUUID();
  await seed([
    qaOperation("adjust", { id: productId, delta: 3, reason: "Restock above threshold" }),
    qaOperation("product", { id: archivedProduct, name: "Archived empty product", price: 1000, quantity: 0, threshold: 2 }),
    qaOperation("archive", { id: archivedProduct }),
  ]);
  await checkStock(3);
  await ready("document.body.textContent.includes('Stock looks healthy')", "cleared stock warning after restock");
  assert.equal(await evaluate("!!Array.from(document.querySelectorAll('.sidebar nav button')).find(b=>b.textContent.startsWith('Stock')).querySelector('b')"), false);
  console.log("PASS: low-stock threshold boundary, zero-stock warning, dashboard/table/navigation indicators, restock clearing and archived-product exclusion.");

  // Batch one: sales history, customer history, reports/CSV and sync status.
  const navigate = (tab) => evaluate(`Array.from(document.querySelectorAll('.sidebar nav button')).find(b=>b.textContent.trim()===${JSON.stringify(tab)}).click()`);
  const setInput = (selector, value) => evaluate(`{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))}`);
  await seed([qaOperation("sale", { items: saleItems, method: "Cash", total: 5000 }, Date.now() - 8 * 86400000)]);
  await connection.send("Page.reload");
  await ready("!!document.querySelector('.sidebar')", "history fixture refresh");
  await until(async () => (await snapshot())?.state.sales.length === 6, "six historical sales");
  await navigate("Sales");
  await ready("document.querySelector('.listsummary b')?.textContent === '4 transactions'", "today sales filter");
  await evaluate("Array.from(document.querySelectorAll('.segmented button')).find(b=>b.textContent==='This week').click()");
  const dateKey = (time) => new Date(time).toLocaleDateString("en-CA", { timeZone: "Africa/Kampala" });
  const weekStart = new Date(dateKey(Date.now()) + "T00:00:00Z");
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
  const weekCount = 4 + (dateKey(Date.now() - 86400000) >= weekStart.toISOString().slice(0, 10) ? 1 : 0);
  await ready(`document.querySelector('.listsummary b')?.textContent === '${weekCount} transactions'`, "calendar-week sales filter");
  await evaluate("Array.from(document.querySelectorAll('.segmented button')).find(b=>b.textContent==='All').click()");
  await ready("document.querySelector('.listsummary b')?.textContent === '6 transactions'", "all sales filter");
  await setInput(".search input", "OFFLINE SUGAR");
  await ready("document.querySelector('.listsummary b')?.textContent === '6 transactions'", "case-insensitive product search");
  const historyState = await snapshot();
  const creditSale = historyState.state.sales.find((sale) => sale.method === "Credit");
  await setInput(".search input", creditSale.id.slice(0, 8));
  await ready("document.querySelector('.listsummary b')?.textContent === '1 transactions'", "receipt search");
  await setInput(".search input", "no-matching-product");
  await ready("document.querySelector('.listsummary b')?.textContent === '0 transactions'", "empty search result");
  console.log("PASS: rendered Today/calendar-week/All filters and case-insensitive product/receipt searches.");

  await seed([qaOperation("correction", { saleId: creditSale.id, kind: "reversal", reason: "Customer history test return", refund: 1500, refundMethod: "Airtel Money" })]);
  await connection.send("Page.reload");
  await ready("!!document.querySelector('.sidebar')", "customer history refresh");
  await until(async () => (await snapshot())?.state.corrections.length === 2, "credit reversal download");
  await navigate("Credit");
  await ready("!!document.querySelector('.customercard')", "customer list");
  await evaluate("document.querySelector('.customercard').click()");
  await ready("!!document.querySelector('.customerhero')", "customer history modal");
  assert.equal(await evaluate("document.querySelector('.customerhero h2').textContent"), "UGX 0");
  const customerText = await evaluate("document.querySelector('.modal').textContent");
  for (const expected of ["Credit sale", "Payment", "MTN Mobile Money", "Credit sale reversed", "Customer history test return", "Refund UGX 1,500", "Airtel Money"]) assert(customerText.includes(expected));
  assert.equal(await evaluate("document.querySelectorAll('.modal .reportlist > div').length"), 4);
  await evaluate("document.querySelector('button[aria-label=\"Close dialog\"]').click()");
  console.log("PASS: customer sale/repayment/correction/refund history reconciles with its displayed balance.");

  await navigate("Reports");
  await evaluate("Array.from(document.querySelectorAll('.segmented button')).find(b=>b.textContent==='Today').click()");
  await ready("JSON.stringify(Array.from(document.querySelectorAll('.stats .stat > strong')).map(e=>e.textContent)) === JSON.stringify(['UGX 10,000','UGX 2,500','UGX 0','0'])", "current sales/average/credit/stock reports");
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.paymentreport b')).map(e=>e.textContent)"), ["UGX 0", "UGX 5,000", "UGX 5,000", "UGX 0"]);
  const stockReport = await evaluate("Array.from(document.querySelectorAll('section.card')).find(e=>e.querySelector('h2')?.textContent==='Stock levels').textContent");
  assert(stockReport.includes("3 units remaining") && stockReport.includes("UGX 15,000"));
  await evaluate("Array.from(document.querySelectorAll('.segmented button')).find(b=>b.textContent==='All').click()");
  await ready("document.querySelector('.stats .stat > strong')?.textContent === 'UGX 20,000'", "all-time revenue report");
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Export all sales CSV')).click()");
  await until(() => readdirSync(downloads).some((name) => name.endsWith(".csv")), "report CSV download");
  const salesCsv = readFileSync(path.join(downloads, readdirSync(downloads).find((name) => name.endsWith(".csv"))), "utf8");
  assert.equal(salesCsv.trim().split(/\r?\n/).length, 7);
  assert(salesCsv.includes('"5000","5000","0","1500"'));
  assert(salesCsv.includes('"5000","5000","0","5000"'));
  console.log("PASS: rendered sales/stock/credit/payment reports and downloaded CSV gross/net/refund values.");

  const lastSyncBefore = (await snapshot()).lastSync;
  await network(true);
  await navigate("Home");
  await evaluate("Array.from(document.querySelectorAll('.quick')).find(b=>b.textContent.startsWith('Add a product')).click()");
  await ready("!!document.querySelector('.modal input[name=price]')", "pending record form");
  await evaluate(`for(const [name,value] of Object.entries({name:'Pending sync item',price:'1000',quantity:'1',threshold:'0'}))document.querySelector('.modal input[name="'+name+'"]').value=value;document.querySelector('.modal form').requestSubmit()`);
  await until(async () => (await snapshot())?.operations.length === 1, "one pending record");
  await openSync();
  await ready("document.querySelector('.syncpanel h2')?.textContent === '1 record waiting'", "pending count display");
  assert((await evaluate("document.querySelector('.syncpanel .pill').textContent")).includes("Working offline"));
  assert.equal(await evaluate("document.querySelector('.syncpanel .primary').disabled"), true);
  assert((await evaluate("document.querySelector('.connection').textContent")).includes("1 pending"));
  await network(false);
  await until(async () => { const state = await snapshot(); return state?.operations.length === 0 && state.lastSync > lastSyncBefore; }, "sync status completion");
  await ready("document.querySelector('.syncpanel h2')?.textContent === 'Your workspace is up to date'", "successful sync display");
  assert((await evaluate("document.querySelector('.syncpanel p').textContent")).includes("Last successful sync:"));
  const logout = await fetch(origin + "/api/auth", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: "duka_session=" + session.value }, body: JSON.stringify({ action: "logout" }) });
  assert.equal(logout.status, 200);
  await evaluate("document.querySelector('.syncpanel .primary').click()");
  await ready("document.querySelector('.syncpanel h2')?.textContent === 'Sync needs attention'", "failed sync warning");
  assert((await evaluate("document.querySelector('.connection').textContent")).includes("Sync needs attention"));
  await navigate("Home");
  assert((await evaluate("document.querySelector('.synchint b').textContent")).includes("Sync needs attention"));
  console.log("PASS: offline/pending-count/last-sync/success displays and persistent failed-session sync warnings.");

  // Batch two: real-browser account security, installability and responsive/keyboard checks.
  await openSync();
  await evaluate("Array.from(document.querySelectorAll('.syncpanel button')).find(b=>b.textContent.includes('Sign in again')).click()");
  await ready("!!document.querySelector('.modal input[name=password]')", "session recovery sign-in");
  await evaluate(`document.querySelector('.modal input[name=password]').value=${JSON.stringify(user.password)};document.querySelector('.modal form').requestSubmit()`);
  await ready("!document.querySelector('.modal')", "re-authenticated workspace");
  await evaluate("Array.from(document.querySelectorAll('.sidebottom > button')).find(b=>b.textContent.includes('Settings')).click()");
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Change password').click()");
  await ready("!!document.querySelector('input[name=currentPassword]')", "password change form");
  const newPassword = crypto.randomUUID();
  const currentCookies = await connection.send("Network.getCookies", { urls: [origin] });
  const priorSession = currentCookies.cookies.find((cookie) => cookie.name === "duka_session");
  await evaluate(`document.querySelector('input[name=currentPassword]').value='incorrect-password';document.querySelector('input[name=newPassword]').value=${JSON.stringify(newPassword)};document.querySelector('.modal form').requestSubmit()`);
  await ready("document.querySelector('.modal [role=status]')?.textContent.includes('Incorrect current password')", "current-password verification");
  await evaluate(`document.querySelector('input[name=currentPassword]').value=${JSON.stringify(user.password)};document.querySelector('.modal form').requestSubmit()`);
  await ready("!!document.querySelector('.modal input[name=password]')", "password change sign-in requirement");
  const revoked = await fetch(origin + "/api/sync", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: "duka_session=" + priorSession.value }, body: JSON.stringify({ operations: [] }) });
  assert.equal(revoked.status, 401);
  const oldLogin = await fetch(origin + "/api/auth", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ action: "login", email: user.email, password: user.password }) });
  assert.equal(oldLogin.status, 401);
  user.password = newPassword;
  await evaluate(`document.querySelector('.modal input[name=password]').value=${JSON.stringify(newPassword)};document.querySelector('.modal form').requestSubmit()`);
  await ready("!document.querySelector('.modal')", "new-password sign-in");
  const passphrase = "qa-device-passphrase";
  const removeDialogListener = connection.on("Page.javascriptDialogOpening", () => {
    connection.send("Page.handleJavaScriptDialog", { accept: true, promptText: passphrase }).catch(() => {});
  });
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Set device lock').click()");
  await ready("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Lock workspace')", "device lock configuration");
  removeDialogListener();
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Lock workspace').click()");
  await ready("document.body.textContent.includes('DukaTrack device lock')", "locked workspace");
  await setInput(".loading input[type=password]", "wrong-passphrase");
  await evaluate("document.querySelector('.loading form').requestSubmit()");
  await ready("document.querySelector('[role=alert]')?.textContent.includes('Incorrect device passphrase')", "wrong lock passphrase rejection");
  await network(true);
  await setInput(".loading input[type=password]", passphrase);
  await evaluate("document.querySelector('.loading form').requestSubmit()");
  await ready("!!document.querySelector('.sidebar')", "offline passphrase unlock");
  await connection.send("Page.reload");
  await ready("document.body.textContent.includes('DukaTrack device lock')", "device lock on reopen");
  await network(false);
  await evaluate("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Forgot device passphrase')).click()");
  await ready("!!document.querySelector('input[name=identifier]')", "device lock online recovery");
  await evaluate(`document.querySelector('input[name=identifier]').value=${JSON.stringify(user.email)};document.querySelector('input[name=password]').value=${JSON.stringify(user.password)};document.querySelector('input[name=identifier]').closest('form').requestSubmit()`);
  await ready("!!document.querySelector('.sidebar')", "same-account device lock recovery");
  await evaluate("Array.from(document.querySelectorAll('.sidebottom > button')).find(b=>b.textContent.includes('Settings')).click()");
  assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Set device lock')"), true);
  console.log("PASS: browser password change verifies current password, revokes sessions and accepts the new password; device lock rejects wrong passphrases, unlocks offline, locks on reload and recovers online.");

  const manifestResult = await connection.send("Page.getAppManifest");
  assert.deepEqual(manifestResult.errors, []);
  const manifest = JSON.parse(manifestResult.data);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert(manifest.icons.length > 0);
  assert(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert(manifest.icons.some((icon) => icon.sizes === "512x512"));
  assert.equal(await evaluate("!!document.querySelector('link[rel=apple-touch-icon]')"), true);
  await ready("(async()=>!!(await caches.match('/icons/apple-touch-icon.png')))()", "offline Apple home-screen icon");
  const installability = await connection.send("Page.getInstallabilityErrors");
  assert.deepEqual(installability.installabilityErrors, [], "Chrome installability criteria must pass");
  console.log("PASS: Chrome manifest parsing, standalone launch configuration, service worker and installability criteria. Actual phone installation is a separate manual check.");

  for (const width of [390, 375]) {
    await connection.send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: true });
    await connection.send("Emulation.setTouchEmulationEnabled", { enabled: true });
    for (const tab of ["Home", "Sales", "Stock", "Credit", "Reports"]) {
      await evaluate(`Array.from(document.querySelectorAll('.bottomnav button')).find(b=>b.textContent.trim()===${JSON.stringify(tab)}).click()`);
      await ready(`Array.from(document.querySelectorAll('.bottomnav button.active')).some(b=>b.textContent.trim()===${JSON.stringify(tab)})`, "mobile " + tab);
      assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true, tab + " must not overflow the mobile viewport");
      const smallButtons = await evaluate("Array.from(document.querySelectorAll('button')).filter(b=>b.getClientRects().length).map(b=>({name:b.getAttribute('aria-label')||b.textContent.trim(),width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height})).filter(b=>b.width<43.5||b.height<43.5)");
      assert.deepEqual(smallButtons, [], tab + " buttons need 44px touch targets");
      assert.equal(await evaluate("Array.from(document.querySelectorAll('button')).filter(b=>b.getClientRects().length).every(b=>!!(b.getAttribute('aria-label')||b.textContent.trim()||b.title))"), true);
    }
    await evaluate("Array.from(document.querySelectorAll('.bottomnav button')).find(b=>b.textContent.trim()==='Home').click()");
    const mobileScreenshot = await connection.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(runtime, `mobile-${width}.png`), Buffer.from(mobileScreenshot.data, "base64"));
    await evaluate("Array.from(document.querySelectorAll('.quick')).find(b=>b.textContent.startsWith('Add a product')).click()");
    await ready("!!document.querySelector('.modal input[name=name]')", "mobile form");
    assert.equal(await evaluate("Array.from(document.querySelectorAll('.modal input')).every(e=>parseFloat(getComputedStyle(e).fontSize)>=16)"), true, "Mobile form text must remain readable without automatic focus zoom");
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), true);
    await evaluate("document.querySelector('button[aria-label=\"Close dialog\"]').click()");
  }
  await connection.send("Emulation.clearDeviceMetricsOverride");
  await connection.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await navigate("Home");
  await evaluate("window.__qaLauncher=Array.from(document.querySelectorAll('.quick')).find(b=>b.textContent.startsWith('Add a product'));window.__qaLauncher.focus();window.__qaLauncher.click()");
  await ready("!!document.querySelector('[role=dialog]')", "keyboard modal");
  assert.equal(await evaluate("document.querySelector('.modal').contains(document.activeElement)"), true);
  await evaluate("window.__qaFocusable=Array.from(document.querySelectorAll('.modal button:not(:disabled),.modal input:not(:disabled)')).filter(e=>e.getClientRects().length);window.__qaFocusable.at(-1).focus()");
  await connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate("document.activeElement===window.__qaFocusable[0]"), true);
  await connection.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await connection.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await ready("!document.querySelector('.modal')", "Escape closes modal");
  assert.equal(await evaluate("document.activeElement===window.__qaLauncher"), true);
  console.log("PASS: Android/iPhone-sized layout reflow, mobile button targets/names and keyboard modal focus/Escape restoration. This is viewport emulation, not physical-phone certification.");
  console.log("Artifacts and isolated test state: " + path.relative(root, runtime));
} catch (error) {
  if (connection) {
    try {
      const screenshot = await connection.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(path.join(runtime, "failure.png"), Buffer.from(screenshot.data, "base64"));
      writeFileSync(path.join(runtime, "failure.txt"), await evaluate("document.body.innerText"));
      console.error("Browser diagnostics: " + path.relative(root, runtime));
    } catch {}
  }
  throw error;
} finally {
  await closeBrowser();
  await stop(browser);
  await stop(server);
}
