// A successful request is not a committed transaction. Resolve only on completion.
export function readLocal<T = any>(key: string): Promise<T | undefined> {
  return transact<T>(key);
}
export function writeLocal<T>(key: string, value: T): Promise<T | undefined> {
  return transact(key, value);
}
function transact<T>(key: string, value?: T): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("dukatrack-business", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("workspace");
    open.onerror = () =>
      reject(
        new Error(
          "Device storage could not open. Changes have not been saved.",
        ),
      );
    open.onblocked = () =>
      reject(
        new Error(
          "Device storage is blocked. Close other DukaTrack windows and retry.",
        ),
      );
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => db.close();
      try {
        const tx = db.transaction(
            "workspace",
            value === undefined ? "readonly" : "readwrite",
          ),
          store = tx.objectStore("workspace");
        let result: T | undefined;
        const q = value === undefined ? store.get(key) : store.put(value, key);
        q.onsuccess = () => {
          result = value === undefined ? q.result : value;
        };
        tx.oncomplete = () => {
          db.close();
          if (value !== undefined && typeof BroadcastChannel !== "undefined") {
            const channel = new BroadcastChannel("dukatrack-updates");
            channel.postMessage({ key });
            channel.close();
          }
          resolve(result);
        };
        const fail = () => {
          db.close();
          reject(
            new Error(
              "Device storage failed or is full. Changes have not been saved. Export a backup before clearing storage.",
            ),
          );
        };
        tx.onerror = fail;
        tx.onabort = fail;
      } catch (e) {
        db.close();
        reject(e);
      }
    };
  });
}
export async function withWorkspaceLock<T>(
  id: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!navigator.locks)
    throw new Error(
      "This browser cannot safely coordinate offline writes. Use a current browser with Web Locks support.",
    );
  return navigator.locks.request("duka-" + id, fn);
}
