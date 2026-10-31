import { useEffect, useState, type ReactNode } from "react";
import { readLocal, writeLocal, withWorkspaceLock } from "../../lib/storage";
type Lock = { salt: string; digest: string; failures: number; until: number };
async function digest(pin: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 150000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function DeviceLock({
  accountId,
  children,
}: {
  accountId: string;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false),
    [unlocked, setUnlocked] = useState(false),
    [configured, setConfigured] = useState(false),
    [pin, setPin] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [recover, setRecover] = useState(false);
  useEffect(() => {
    let live = true;
    readLocal<Lock>("lock:" + accountId)
      .then((lock) => {
        if (live) {
          setConfigured(!!lock);
          setUnlocked(!lock);
          setReady(true);
        }
      })
      .catch(() => setError("Cannot read device lock. Reload to retry."));
    return () => {
      live = false;
    };
  }, [accountId]);
  useEffect(() => {
    if (!configured || !unlocked) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setUnlocked(false), 5 * 60000);
    };
    reset();
    window.addEventListener("pointerdown", reset);
    window.addEventListener("keydown", reset);
    const hide = () => {
      if (document.hidden) setUnlocked(false);
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", reset);
      window.removeEventListener("keydown", reset);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [configured, unlocked]);
  async function unlock() {
    setBusy(true);
    setError("");
    try {
      await withWorkspaceLock(accountId, async () => {
        const key = "lock:" + accountId,
          lock = await readLocal<Lock>(key);
        if (!lock) throw Error("Device lock is not configured.");
        if (lock.until > Date.now())
          throw Error("Too many attempts. Wait one minute.");
        if ((await digest(pin, lock.salt)) !== lock.digest) {
          await writeLocal(key, {
            ...lock,
            failures: lock.failures + 1,
            until: lock.failures >= 4 ? Date.now() + 60000 : 0,
          });
          throw Error("Incorrect device passphrase.");
        }
        await writeLocal(key, { ...lock, failures: 0, until: 0 });
        setUnlocked(true);
        setPin("");
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlock.");
    } finally {
      setBusy(false);
    }
  }
  async function configure() {
    setBusy(true);
    try {
      const value = prompt(
        "Create a device passphrase of at least 8 characters. Keep it safe; forgotten device locks require online sign-in to remove.",
      );
      if (!value) return;
      if (value.length < 8) throw Error("Use at least 8 characters.");
      const salt = crypto.randomUUID();
      await writeLocal("lock:" + accountId, {
        salt,
        digest: await digest(value, salt),
        failures: 0,
        until: 0,
      });
      setConfigured(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function recoverLock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          phone: f.get("phone"),
          password: f.get("password"),
        }),
      });
      const d = (await r.json()) as {
        account?: { id: string };
        error?: string;
      };
      if (!r.ok) throw Error(d.error || "Could not sign in.");
      if (d.account?.id !== accountId) {
        await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout" }),
        });
        throw Error("Sign in to the same business to remove this lock.");
      }
      await writeLocal("lock:" + accountId, null);
      setConfigured(false);
      setUnlocked(true);
      setRecover(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Connect online to recover this lock.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!ready || !unlocked)
    return (
      <div className="loading">
        <h1>DukaTrack device lock</h1>
        {ready && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              unlock();
            }}
          >
            <label className="field">
              Device passphrase
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoComplete="off"
                required
                autoFocus
              />
            </label>
            <button className="primary" disabled={busy}>
              Unlock workspace
            </button>
          </form>
        )}
        <button className="secondary" onClick={() => setRecover(!recover)}>
          Forgot device passphrase?
        </button>
        {recover && (
          <form onSubmit={recoverLock}>
            <label className="field">
              Registered phone
              <input name="phone" type="tel" required />
            </label>
            <label className="field">
              Account password
              <input name="password" type="password" required />
            </label>
            <button className="primary" disabled={busy}>
              Sign in online and remove device lock
            </button>
          </form>
        )}
        <p role="alert">{error}</p>
        <small>
          This screen lock does not encrypt browser records. Use your device
          screen lock and disk encryption.
        </small>
      </div>
    );
  return (
    <>
      {children}
      <div style={{ position: "fixed", bottom: 75, right: 16, zIndex: 25 }}>
        <button
          className="secondary"
          disabled={busy}
          onClick={configured ? () => setUnlocked(false) : configure}
        >
          {configured ? "Lock workspace" : "Set device lock"}
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    </>
  );
}
