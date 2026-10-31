# DukaTrack upgrade stages

All changes are local. No hosted deployment, database reset or deletion of existing business records was performed. The existing `.wrangler/state` database was not used for verification. Existing source/configuration and the original `0000` migration were retained.

## 1. Offline reliability

Changed: IndexedDB resolves after transaction completion, rejects transaction abort/open/block/storage failures, and exposes actionable errors. Local writes complete before success. Workspace/account selection is persisted before showing success. Cross-tab writes require Web Locks; BroadcastChannel/focus refresh other tabs. Persistent storage is requested when supported. The service worker caches the shell/assets, excludes APIs and RSC responses from the HTML shell, and waits for cache writes.

Passed: storage commit-vs-request timing, abort/open failure tests; offline shell/asset fallback and API/RSC exclusion tests; TypeScript and production build.

Limits: storage tests are controlled mocks, not browser eviction/closure tests. Browser/device offline reload, storage exhaustion, service-worker update and persistent-storage permission checks remain manual. Unsynced data is vulnerable to browser eviction/device loss.

Commands: `node scripts/test-offline.mjs`, `node --check public/sw.js`, `npm.cmd run typecheck`, `npm.cmd run build`.

## 2. Synchronisation and conflicts

Changed: all batches drain automatically, with limits on count and bytes. Acknowledgements are verified and committed locally before continuing. Failed/interrupted sends retain pending work and operation IDs. Unsent optimistic replay conflicts retain their full original operation and remain queued for the server. Version checks, atomic batches and unique write tokens prevent stale writers changing relational records. Product edits use operation revisions, avoiding same-millisecond timestamp collisions. The current client sends its expected business ID so a changed browser login cannot sync into a different account.

New offline sales capture original product names, customer details and totals in their queued evidence. Rejected operations are permanent full server-side reconciliation evidence and are not replayed later after restocking. The accepted sale updates stock; the conflicting sale is retained in Needs review, outside accepted totals. Owners inspect full payloads, reconcile records and save a reason; closed decisions and evidence remain visible.

Passed: 205 queued records drain in three batches; interruption/resume; failed local acknowledgement commit; incomplete response protection; retained unsent conflict details; idempotent server replay; stale-writer rejection and rollback; same-timestamp edits; account mismatch rejection.

Limits: sync runs while open and transfers full account snapshots. Cross-device/browser lifecycle and high-volume contention need manual/load testing. Owner reconciliation is explicit; the app does not silently accept oversold stock.

Commands: `node scripts/test-sync.mjs`, `node scripts/test-business.mjs`, `node scripts/test-backup.mjs`.

## 3. Security and dependency fixes

Changed: compatible patched framework/runtime/tool dependencies and lockfile; password change requires the current password and revokes sessions; optional 256-bit expiring, hashed, single-use recovery tokens with private delivery adapter contract; bounded request parsing; account security-event auditing; optional local passphrase privacy gate with inactivity/tab-hide/reopen locking and online same-account recovery.

Passed: server account isolation, origin checks, three-attempt lockout, password change, session revocation/expiry, recovery unconfigured response, adapter-stub delivery, request throttling, expired/used token rejection and audit access.

Audit: 42 initial findings became 24 moderate, zero high/critical/low after explicit updates and non-forced compatible fixes. Remaining Drizzle/esbuild, ESLint/minimatch and Vinext/OG/fflate chains are documented in SECURITY_NOTES.md. Breaking downgrades were not applied.

Limits: recovery delivery is not connected; real provider testing/configuration is required. Phone ownership is not verified. The local gate is not encryption. Platform-supported password hashing improvements, global abuse controls and independent security assessment remain.

Commands: `npm.cmd test`, `npm.cmd audit` (nonzero while documented findings remain), `npm.cmd run typecheck`, `npm.cmd run build`.

## 4. Backup restoration

Changed: version/business/schema/integrity validation and preview, conservative no-overwrite merge, identical record skipping, duplicate import detection, safety export plus committed local safety copy, and one idempotent queued restore operation. Server-side business identity and integrity checks apply too.

Passed: original v1 and versioned backup parsing, wrong-business/version rejection, invalid totals, conflicting existing records, duplicate sales prevention, restoration, correction consistency and optional-field JSON round trips.

Limits: 400 KB supported import limit. Differing existing records block the entire import; older snapshots cannot rewind a live business. A locally completed restore still needs successful cloud sync. Download acceptance and real browser file handling need manual QA.

Commands: `node scripts/test-backup.mjs`, `node scripts/test-business.mjs`, `npm.cmd test`.

## 5. Database improvements

Changed: additive generated migrations `0001` and `0002`, matching Drizzle schema/snapshots, related account/business/owner membership/product/customer/sale/item/repayment/stock/correction/operation/review/audit/security/recovery tables with ownership, foreign keys, indexes and constraints. First successful business sync transactionally migrates its legacy snapshot; the original document remains unchanged. Subsequent reads use related tables and writes persist only deltas. Sale item prices remain historical.

Passed: migration of a populated legacy workspace, unchanged legacy recovery evidence, relational price/quantity assertions, stale version rejection, account isolation and transaction rollback on a constraint failure.

Limits: account-wide reads/downloads remain; large migrations/restores need D1 volume testing. Lost product references on original v1 stock adjustments cannot be reconstructed. The current owner remains the user identity; additional staff roles are not implemented.

Commands: export backups and copy `.wrangler/state` using START_HERE.md first; then `npm.cmd run db:local`. Tests: `node scripts/test-business.mjs`. Schema changes: `npm.cmd run db:generate`, review SQL, then `npm.cmd run db:local`.

## 6. Corrections and audit history

Changed: selected-item returns/full remaining-sale reversals with reasons, original receipt preservation, historical prices, stock restoration, credit reductions and explicit refunds of money already received. Cash/mobile-money refund method is recorded. Revenue reports/exports show corrections; received-money cards deduct refunds by refund date. Owner operation/security audit logs and conflict decision history are available.

Passed: full credit reversal after partial repayment returns stock and leaves zero debt, excess/duplicate correction rejection, immutable original receipt/price, backup correction checks and scoped audit access.

Limits: refunds are records, not money transfers. Revenue is reported against the original sale date after returns. Damaged goods require a separate stock adjustment. Offline multi-device correction conflicts require the same owner reconciliation as other financial operations.

Commands: `node scripts/test-business.mjs`, `node scripts/test-backup.mjs`, `npm.cmd test`.

## 7. Maintainability and accessibility

Changed: seven focused screens, reusable forms/components, typed screen props and shared controls, modal focus/keyboard handling, cross-tab update hook, separate formatting/CSV, domain/backup, storage/sync/HTTP and relational repository modules. Changed files are formatted. CSV exports include gross/returned/net/refunded values and guard formula-like text.

Passed: TypeScript, all business/sync/backup/storage/service-worker tests and production build after dependency updates.

Limits: some dynamic operation/form payloads and modal selection still use `any`; additional typed modal/domain variants can be introduced incrementally. Keyboard, focus restoration, device lock and mobile tap-target behavior require real browser QA. Upstream build warnings include sourcemaps, chunk import placement, native-config future compatibility and automatic route classification; builds complete successfully.

Commands: `npm.cmd run typecheck`, `npm.cmd test`, `node --check public/sw.js`, `npm.cmd run build`.

## Real runtime verification

`npm.cmd run test:runtime` performs an optional real production Worker HTTP smoke test with migrations applied to a separate `.sites-runtime/runtime-smoke` D1 store. It registers disposable test data, tests sync/audit/recovery-unconfigured/logout, and stops its own server. It does not test a browser's service worker, IndexedDB, visual layout or offline closure/reopen behavior.

Passed on the final upgraded stack: real production Worker page, isolated D1 migration, registration, relational sync, audit, recovery-unconfigured response and logout. The smoke test caught a client-directive placement error during refactoring; the directive was corrected and the rebuilt Worker passed. Real browser offline/visual/accessibility QA remains unverified.
