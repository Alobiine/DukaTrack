import { Download, Store, LogOut } from "lucide-react";

type Props = {
  account: { business: string; owner: string; phone: string };
  install: { prompt: () => Promise<unknown> } | null;
  backup: () => void;
  open: (name: string) => void;
  logout: () => Promise<void>;
};
export function SettingsScreen({
  account,
  install,
  backup,
  open,
  logout,
}: Props) {
  return (
    <div className="settingsgrid">
      <section className="card">
        <div className="cardhead">
          <div>
            <h2>Business profile</h2>
            <p>Your registered workspace</p>
          </div>
          <Store size={22} />
        </div>
        <div className="details">
          <div>
            <small>Business name</small>
            <b>{account.business}</b>
          </div>
          <div>
            <small>Business owner</small>
            <b>{account.owner}</b>
          </div>
          <div>
            <small>Phone number</small>
            <b>+{account.phone}</b>
          </div>
          <div>
            <small>Language</small>
            <b>English</b>
          </div>
          <div>
            <small>Currency & timezone</small>
            <b>UGX · Africa/Kampala</b>
          </div>
        </div>
      </section>
      <section className="card">
        <div className="cardhead">
          <div>
            <h2>Device & account</h2>
            <p>Work securely on a trusted device</p>
          </div>
        </div>
        <div className="backupbody">
          <p>
            Offline records are stored in this browser. Anyone using this
            unlocked browser can open the workspace. Use your device’s screen
            lock and sign out on shared devices.
          </p>
          {install ? (
            <button className="secondary" onClick={() => install.prompt()}>
              <Download size={17} />
              Install DukaTrack
            </button>
          ) : (
            <p className="muted">
              To install: use your browser’s Install app or Add to Home Screen
              option when available.
            </p>
          )}
          <button className="secondary" onClick={backup}>
            <Download size={17} />
            Export backup
          </button>
          <button className="secondary" onClick={() => open("password")}>
            Change password
          </button>
          <button className="secondary dangertext" onClick={logout}>
            <LogOut size={17} />
            Sign out
          </button>
          <small>
            App release 0.1 · Early implementation. Recovery, multi-user roles,
            restore and full security testing are still pending.
          </small>
        </div>
      </section>
    </div>
  );
}
