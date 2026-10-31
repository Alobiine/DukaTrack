import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const require = createRequire(import.meta.url),
  { build } = createRequire(require.resolve("wrangler/package.json"))(
    "esbuild",
  );
const r = await build({
  entryPoints: ["lib/storage.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const storage = await import(
  "data:text/javascript;base64," +
    Buffer.from(r.outputFiles[0].text).toString("base64")
);
let tx, request, opened;
globalThis.indexedDB = {
  open() {
    opened = {
      result: {
        close() {},
        transaction() {
          tx = {
            objectStore() {
              return {
                put() {
                  request = {};
                  return request;
                },
                get() {
                  request = {};
                  return request;
                },
              };
            },
          };
          return tx;
        },
      },
    };
    queueMicrotask(() => opened.onsuccess());
    return opened;
  },
};
const write = storage.writeLocal("shop", { sales: ["receipt"] });
let completed = false;
write.then(
  () => (completed = true),
  () => {},
);
await Promise.resolve();
request.onsuccess();
await Promise.resolve();
assert.equal(completed, false);
tx.onabort();
await assert.rejects(write, /not been saved/);
const successful = storage.writeLocal("shop", { sales: ["receipt"] });
await Promise.resolve();
request.onsuccess();
tx.oncomplete();
assert.deepEqual(await successful, { sales: ["receipt"] });
const failed = storage.readLocal("shop");
await Promise.resolve();
opened.onerror();
await assert.rejects(failed, /could not open/);
const handlers = {},
  cache = new Map();
let offline = false;
const shell = new Response("<html>Shell</html>", {
  headers: { "Content-Type": "text/html" },
});
const normalResponse = () =>
  new Response("asset", {
    headers: { "Content-Type": "application/javascript" },
  });
const context = {
  URL,
  Response,
  location: { origin: "https://duka.test" },
  self: {
    clients: { claim: async () => {} },
    addEventListener: (type, fn) => (handlers[type] = fn),
  },
  caches: {
    async open() {
      return {
        async addAll(urls) {
          for (const u of urls) cache.set(u, shell.clone());
        },
        async put(key, value) {
          cache.set(typeof key === "string" ? key : key.url, value);
        },
        async add(url) {
          cache.set(url, normalResponse());
        },
      };
    },
    async match(key) {
      return cache.get(typeof key === "string" ? key : key.url)?.clone();
    },
  },
  fetch: async (request) => {
    if (offline) throw Error("No network");
    return request.headers.get("rsc")
      ? new Response("rsc", { headers: { "Content-Type": "text/x-component" } })
      : request.mode === "navigate"
        ? shell.clone()
        : normalResponse();
  },
};
vm.runInNewContext(readFileSync("public/sw.js", "utf8"), context);
let task;
handlers.install({ waitUntil: (p) => (task = p) });
await task;
function fetchEvent(url, mode = "cors", headers = {}) {
  let response;
  handlers.fetch({
    request: {
      url: "https://duka.test" + url,
      method: "GET",
      mode,
      headers: new Headers(headers),
    },
    respondWith: (p) => (response = p),
  });
  return response;
}
assert.equal(fetchEvent("/api/sync"), undefined);
assert.equal(
  await (await fetchEvent("/", "navigate")).text(),
  "<html>Shell</html>",
);
await fetchEvent("/?_rsc=1", "cors", { rsc: "1" });
assert.equal(await cache.get("/").clone().text(), "<html>Shell</html>");
await fetchEvent("/app.js");
offline = true;
assert.equal(
  await (await fetchEvent("/", "navigate")).text(),
  "<html>Shell</html>",
);
assert.equal(await (await fetchEvent("/app.js")).text(), "asset");
console.log(
  "PASS: IndexedDB commit/abort/open failures; service-worker offline shell/assets and API/RSC exclusion. Browser lifecycle testing remains manual.",
);
