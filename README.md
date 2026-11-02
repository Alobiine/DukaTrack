# DukaTrack

An offline-first single-owner business workspace for Ugandan MSMEs. React/TypeScript, Vinext/Vite, Cloudflare Workers/D1 and IndexedDB. Money uses integer UGX and reporting uses Africa/Kampala.

Start with [START_HERE.md](START_HERE.md) for Windows setup, safe upgrades, additive migration, testing, backup restoration and recovery-service configuration. [UPGRADE_NOTES.md](UPGRADE_NOTES.md) records stage results and verification limits.

For hosting in your own Cloudflare account, see [CLOUDFLARE.md](CLOUDFLARE.md).

For Brevo password-reset email configuration, see [EMAIL_SETUP.md](EMAIL_SETUP.md).

The owner's MoSCoW release priorities and current implementation assessment are recorded in [REQUIREMENTS_STATUS.md](REQUIREMENTS_STATUS.md), including acceptance gaps and the order of remaining work.

## Implemented

- Local transaction completion before success, visible storage failures, offline shell/assets, device privacy lock and safe cross-tab writes.
- Idempotent operation identities, automatically drained batches, interrupted retry recovery, relational compare-and-swap transactions and full retained conflict evidence.
- Owner review decisions/history, sale returns and reversals, historical prices, stock restoration, credit reduction and recorded refunds.
- Business-isolated related tables with foreign keys/indexes, additive migration from retained legacy snapshots, owner/security audit history.
- Email/password accounts with existing phone-account sign-in retained, salted PBKDF2 hashing, hashed expiring HttpOnly sessions, lockout, password change/session revocation and optional email-recovery delivery binding.
- Products, reasoned stock adjustments, customer credit, repayments, receipts, reports, CSV export, JSON backup preview/validation/conservative restoration and safety copies.
- Focused screens/components, storage/sync/domain services and modal keyboard focus handling.

## Verification

```powershell
npm.cmd run typecheck
npm.cmd test
node --check public/sw.js
npm.cmd run build
```

Tests run isolated in-memory SQLite and controlled storage/service-worker mocks. They do not use your actual business records. Real browser/device lifecycle, accessibility and offline QA must be performed separately.

## Boundaries

This is not a production security or scale certification. Offline browser records are unencrypted; the optional passphrase gate does not protect against browser-storage inspection. Browser eviction or device loss can remove unsynced work. Recovery email requires a real private adapter and is not connected yet. Email ownership verification and linking emails to existing phone accounts remain pending.

Sync still downloads full account snapshots and is foreground/periodic while the app is open. Large migrations/restores and transaction history require D1 volume testing. Restore supports files up to 400 KB, skips identical records and blocks any differing existing record. It never rewinds a live stock count. Conflicting sales remain complete reconciliation records outside accepted sales/stock/credit until the owner records a resolution. Legacy stock-adjustment product targets cannot be reconstructed when the old application did not retain them.

Owner accounts are supported; staff roles remain future work. Revenue reports deduct corrections against the original sale date. Money received cards deduct refunds on the refund date. Revenue is not profit. Mobile money and refunds are recorded only; no processing, banking, payroll, tax filing or AI forecasting is included. Nothing is deployed by this upgrade.
