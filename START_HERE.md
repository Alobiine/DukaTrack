# DukaTrack in VS Code (Windows)

Open the inner `DukaTrack` folder containing `package.json`. The app uses React, TypeScript, Vinext/Vite, Cloudflare Workers, local D1/SQLite and IndexedDB. Currency is integer UGX; business reporting uses Africa/Kampala. Mobile-money entries record payments only.

## Install and run

Install Node.js 22.13+ and VS Code. In a PowerShell terminal:

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run setup:local
npm.cmd run dev
```

Open http://localhost:5173. Use localhost or HTTPS for service workers and Web Locks. `npm.cmd` avoids PowerShell script execution-policy issues. No Cloudflare account is required for local development. The local business accounts and data are separate from a hosted site.

Following sessions:

```powershell
npm.cmd run dev
```

## Upgrade an existing local installation safely

1. Export each business backup from Sync & backup. Keep the files private and off this computer too. Do not clear site storage or IndexedDB.
2. Stop running development/production servers before backing up the database folder. In the project terminal:

```powershell
$dukaBackupPath = Join-Path (Get-Location) ('database-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
Copy-Item -LiteralPath '.wrangler/state' -Destination $dukaBackupPath -Recurse
npm.cmd ci
npm.cmd run build
npm.cmd run db:local
npm.cmd run dev
```

Skip the copy only for a new installation without `.wrangler/state`. Keep the backup until you have checked every account. `db:local` applies pending additive migrations; it never resets your database. Do not edit applied SQL migrations.

The generated `0001` migration adds related business, owner membership, product, customer, sale, historical sale-item, repayment, stock-movement, correction, operation, conflict and audit tables plus recovery tables. The `0002` migration adds account security-event history. Each business migrates its existing snapshot transactionally on its first successful sync. The original `workspaces` row is retained unchanged. Subsequent sync reads related tables, not the old document. A failed validation or losing concurrent write leaves existing data intact. Legacy adjustments did not retain their target product ID; migration preserves those records without inventing a target.

`db/schema.ts` and Drizzle snapshots track the schema. For later schema changes use `npm.cmd run db:generate`, inspect the generated SQL, then `npm.cmd run db:local`. The account and business ID remains stable throughout migration.

## Verify the upgrade

```powershell
npm.cmd run typecheck
npm.cmd test
node --check public/sw.js
npm.cmd run build
npm.cmd run test:runtime
```

`test:runtime` starts and stops a real Worker with a separate D1 store under `.sites-runtime/runtime-smoke`; it requires a completed build and a free localhost port. Other tests use isolated in-memory SQLite and mocked storage/service-worker lifecycles; they do not touch your business database. They cover server validation, account isolation, retry identities, all pending batches, interrupted sync, failed local commits, retained conflicting sales, restore validation, duplicate prevention, additive migration, stale writers, transaction rollback, returns, credit refunds, recovery token use/expiry, password changes, sessions and audit access.

## Offline and browser checks

Automated desktop Chrome acceptance is available after a production build:

```powershell
npm.cmd run test:browser
```

This launches a headless Chromium browser with a new profile and a separate local D1 database under `.sites-runtime/browser-offline`. It covers offline creation/reopen/reconnect; receipts and backup file downloads/imports/safety copies; dashboard/stock/history/report/CSV values; sync errors; password changes/device lock; PWA installability; mobile viewport/touch targets; and modal keyboard focus. It does not touch your normal browser profile or production records. Chrome or Edge must be installed; set `DUKATRACK_BROWSER_EXECUTABLE` to override its path. Actual Android/iPhone installation and cross-device checks remain separate. Device-lock controls are in Settings.

```powershell
npm.cmd run build
npm.cmd start
```

Open the printed localhost address (usually port 8787). Production port 8787 and development port 5173 have separate browser stores; both use the local D1 database. Install/open online, wait for service-worker installation and asset caching, and reload once online before the test.

- Add a product/customer online and sync. Go offline, record a sale, stock adjustment and credit repayment. Refresh, close and reopen the browser; all saved records and the pending queue should remain.
- Reconnect. Syncing changes to Synced only after acknowledged records commit locally; every queued batch drains. Force a connection failure mid-sync and retry; receipts must not duplicate.
- Open two tabs and edit stock. Web Locks serialize writes and BroadcastChannel updates other tabs. Unsupported browsers refuse unsafe writes rather than silently race.
- Use two browsers/devices to sell the last units offline. After sync, one accepted sale updates stock; the other remains an immutable full operation in Needs review. The owner can inspect it, reconcile physical stock/customer money, record an appropriate replacement transaction, and save a resolution reason. Review history retains the original evidence. Conflicts never auto-replay after restocking.
- Simulate storage exhaustion/denial and confirm an error appears, without a saved-success message.
- Check keyboard-only dialogs (Tab/Shift+Tab/Escape and return focus), phone-width layouts, tap targets, backup import preview, local locking and correction refunds.

Browser storage can be evicted, and the app cannot guarantee unsynced data survives device loss. Persistent-storage permission is requested where supported. Keep exported backups. Offline sync runs while the app is open; it is not background delivery. Device timestamps affect report dates. Real browser/device checks remain manual until recorded in `UPGRADE_NOTES.md`.

Do not clear site data to fix stale assets. Close all app tabs and reopen online to activate a waiting service-worker update. Old version caches are retained for tabs using older chunks; this favors reliability and uses additional disk space.

## Backup and restore

Sync & backup exports schema-versioned `dukatrack-v1` JSON and accepts original v1 files without `schemaVersion`. Sign in to the original business; the file business ID must match. Supported imports are at most 400 KB. Larger businesses need a separately reviewed import path.

The preview validates collection identities, safe whole-number values, sale totals, customer/product references, applied transaction identities, returns and credit consistency. Identical records are skipped. A differing existing record blocks the entire import; nothing is overwritten. This is a conservative merge, not a way to roll a live business backward to an earlier stock count. Importing an older conflicting snapshot requires owner reconciliation.

Before restoration the app stores a safety copy under `safety-backup:<business ID>:<timestamp>` in the same IndexedDB store and initiates a JSON download. Keep that download outside the browser. A restored snapshot becomes one queued restore operation; server validation and the normal conflict workflow apply. Import completion means saved locally, not yet cloud-confirmed. Re-importing the same records cannot duplicate sales or repayments. Restoring again from a safety export follows the same rules; the app never blindly rolls back newer records.

## Passwords, recovery and device locking

Settings provides password change with current-password verification. Successful changes revoke all server sessions and require sign-in again. Three failed password attempts lock the account for 30 seconds. Passwords use salted PBKDF2-SHA256 (100,000 iterations, retaining compatibility with existing accounts). This work does not constitute a production security assessment; stronger platform-supported password hashing and infrastructure rate limits should be assessed before public operation. See the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

New accounts register and sign in with email and password. Migration `0003_email_accounts` preserves existing account IDs, passwords and business records while adding unique email addresses and allowing accounts without a phone. Existing phone accounts retain a sign-in option. Attaching and verifying an email for an existing phone account is a separate pending feature; do not create a replacement account expecting its business records to transfer. Email ownership verification is not implemented yet.

Recovery requests the registered email address and uses a 15-minute single-use token. Direct Brevo delivery is implemented; configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` and `DUKATRACK_APP_URL` on the main Worker. See [EMAIL_SETUP.md](EMAIL_SETUP.md) for private local setup, deployment and testing. Email links open the reset page directly. No real provider delivery was tested automatically. A separate `RECOVERY_EMAIL_DELIVERY` adapter remains optional for other providers. The earlier SMS/local-inbox source files were removed; the private unused `recovery/.dev.vars` remains separate from the new root `.dev.vars`.

Set a device passphrase using Set device lock. It locks on hiding the tab, five minutes of inactivity, or reopening the browser. Forgotten device locks can be removed only by online sign-in to the same account. The passphrase verifier is salted and derived locally; repeated failed attempts incur a delay. This is a UI privacy lock, **not encryption**: a person with browser storage/developer-tool access can read or alter the records. Use OS screen lock/disk encryption. Signing out revokes the server session and clears automatic workspace opening but retains device records for later sign-in. Forgotten account passwords require configured recovery delivery.

## Returns, reversals and audit history

Open a sale receipt and choose Return or reverse this sale. A reversal returns all remaining units; a return selects quantities. Enter a reason and confirm the displayed refund. Original receipts and prices remain unchanged. Stock increases atomically with the correction. For credit sales, unpaid debt reduces first and any already-repaid amount is recorded as a refund using the chosen cash/mobile-money method. The app records refunds; it does not transfer money. Damaged returns need a separate reasoned stock adjustment.

Revenue reports deduct corrections against the original sale date; cash/mobile-money cards show today's receipts minus today's refunds. Original receipt totals remain available. Customer histories include correction effects. Sync & backup includes conflict resolution history and the latest 100 online audit events, with owner identity and server recording time. Device operation time is retained too. This remains a single-owner application; staff roles are not implemented.

## Source map and limits

- `app/screens/`: dashboard, sales, stock, credit, reports, settings and sync views.
- `app/components/`: forms, device lock, audit history, modal focus hook and shared controls.
- `lib/domain.ts`, `backup.ts`: business/correction rules and conservative restoration.
- `lib/storage.ts`, `sync.ts`, `http.ts`: committed local storage, retries/batches and bounded request parsing.
- `db/workspace.ts`: related-table reads, version checks and atomic delta writes.
- `app/api/`: authentication, recovery, sync and scoped audit access.

Sync still transfers a full account snapshot and reads account-wide records; pagination/delta download and large-volume load testing remain future work. The server writes only changed relational rows after initial migration. Legacy migration/large restoration is one atomic batch and needs volume testing against D1 limits. No real mobile-money processing, banking, payroll, tax filing, AI forecasting, hosting changes or publication is included.
