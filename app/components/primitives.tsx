import { Plus } from "lucide-react";
export function Brand() {
  return (
    <div className="brand">
      <span className="brandmark">
        D<span />
      </span>
      Duka<span>Track</span>
      <i>BUSINESS</i>
    </div>
  );
}
export function Field({
  label,
  ...props
}: { label: string } & import("react").InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      {label}
      <input {...props} />
    </label>
  );
}
export function Stat({
  label,
  value,
  icon: Icon,
  foot,
  green = false,
}: {
  label: string;
  value: string;
  icon: import("lucide-react").LucideIcon;
  foot: string;
  green?: boolean;
}) {
  return (
    <section className={"stat " + (green ? "featured" : "")}>
      <div>
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>
        {green && <span className="statusdot" />}
        {foot}
      </small>
    </section>
  );
}
export function Empty({
  icon: Icon,
  title,
  text,
  action,
  label,
}: {
  icon: import("lucide-react").LucideIcon;
  title: string;
  text: string;
  action?: () => void;
  label?: string;
}) {
  return (
    <div className="empty">
      <span>
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="textbutton" onClick={action}>
          <Plus size={15} />
          {label}
        </button>
      )}
    </div>
  );
}
