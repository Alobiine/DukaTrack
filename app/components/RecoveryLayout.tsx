import { Brand } from "./primitives";
import type { ReactNode } from "react";

export function RecoveryLayout({ title, description, children }: {
  title: string; description: string; children: ReactNode;
}) {
  return (
    <div className="recovery-page">
      <header className="recovery-brand"><a href="/" aria-label="DukaTrack home"><Brand /></a></header>
      <main className="recovery-card">
        <h1>{title}</h1>
        <p className="recovery-description">{description}</p>
        {children}
        <a className="recovery-back" href="/">Back to sign in</a>
      </main>
    </div>
  );
}
