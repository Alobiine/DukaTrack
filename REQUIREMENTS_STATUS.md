# DukaTrack requirements baseline and assessment

Assessed on 2 November 2026 against the owner's MoSCoW priorities. Updated through deployed release `7907397` and the owner's final Android/iPhone acceptance results. This document distinguishes implemented features, tested acceptance scenarios and remaining limitations; historical stage entries below are retained as a record.

Status meanings: **Implemented** means a code path exists, with automated evidence where noted. **Partial** means a dependency or part of the requirement remains. **Needs verification** means real browser/device acceptance is outstanding. Implementation is not release acceptance.

## Must have

| Requirement | Assessment | Evidence and limits |
| --- | --- | --- |
| Register a business and securely log in | Implemented; security acceptance outstanding | `app/api/auth/route.ts`: validated registration, salted PBKDF2 password hashes, hashed expiring sessions, HttpOnly/Secure/SameSite cookies and origin checks. Automated authentication tests pass. Phone ownership is not verified; this is not an independent security assessment. |
| Lock login for 30 seconds after three wrong passwords | Implemented | Authentication route records failures and sets a 30-second lock; business tests exercise lockout. Concurrent abuse/load verification remains. |
| Add and edit products | Implemented | Product forms in `app/page.tsx`, stock screen and validated product operations in `lib/domain.ts`; stale edits rejected using revisions. |
| View and adjust stock with reasons | Implemented | Stock screen, adjustment form and domain validation; nonempty reason required and adjustments retained. |
| Record sales, calculate totals and deduct stock | Implemented | Sale form and domain operations calculate totals from items and deduct stock atomically; business tests exercise quantities and historical prices. |
| Prevent invalid stock quantities | Implemented | Domain rejects non-integer, negative, excessive and insufficient quantities; client/server use shared domain validation. |
| Distinguish cash, MTN Mobile Money and Airtel Money | Implemented | Separate allowed methods for sales and repayments, displayed in reports. These are records only. |
| Manage customers, credit sales and repayments | Implemented | Customer and repayment forms, credit screen and validated domain operations. No staff management requirement is implied. |
| Calculate outstanding balances | Implemented | `balance` in `lib/domain.ts` accounts for credit sales, repayments and corrections; overpayments rejected. |
| Save and retrieve records offline | Agreed acceptance passed | Desktop Chrome tests cover offline sale, reload, complete browser closure/reopen and reconnect. Owner confirmed installation/offline reopening with records intact on both Android and iPhone. Initial registration/sign-in requires online access; OS/browser eviction and real-device storage exhaustion remain outside these checks. |
| Synchronise with the cloud | Agreed acceptance passed | Batch/retry and two-session Worker/D1 tests pass. Owner confirmed the same live test product, price and stock quantity match between both phones after sync. Sync runs while the app is open; load/scale testing is separate. |
| Prevent duplicate transactions | Implemented | Stable operation IDs, applied-operation tracking and idempotent retry/import tests. |
| Preserve conflicting records for owner review | Implemented | Full operation evidence retained in reviews; Sync screen supports inspection and reasoned resolution. Automated rejection/replay tests pass. Multi-device browser acceptance remains. |
| Back up and restore business records | Implemented with limits | JSON export, validation/preview, same-business conservative merge, safety copy and queued restore. Backup tests pass. Imports limited to 400 KB; differing existing records block import; cloud sync still required. Browser download/import acceptance remains. |
| Protect each business's data from other accounts | Implemented; security acceptance outstanding | Session-scoped sync/audit access, expected-business checks and backup ownership checks; automated isolation tests pass. Local browser records are unencrypted; device lock is a UI privacy gate. |

## Should have

| Requirement | Assessment | Evidence and limits |
| --- | --- | --- |
| Dashboard summaries | Desktop Chrome acceptance passed | Real server-seeded transactions verify today/prior-day separation, net sales, cash/mobile receipts, repayments, refunds, credit balances and daily chart values. Phone layout remains part of usability acceptance. |
| Low-stock indicators | Desktop Chrome acceptance passed | Tested warning at the exact threshold, zero-stock message, stock-table/navigation indicators, clearing after restock and archived-product exclusion. |
| Searchable sales history with date filters | Desktop Chrome acceptance passed | Receipt/product searches and Today/This week/All filters tested. Fixed This week to use the Monday calendar-week boundary in Africa/Kampala, with midnight boundary unit tests. Custom date ranges are not implemented. |
| Customer credit and repayment history | Desktop Chrome acceptance passed | Sales, repayments, credit returns/reversals and refund detail are displayed and reconcile with the outstanding balance. Fixed omitted correction entries. |
| Basic sales, stock and credit reports | Desktop Chrome acceptance passed | Browser checks cover revenue/average, cash/MTN/Airtel/credit breakdown, stock quantities/value, credit balances and actual CSV download with gross/returned/net/refund values. Stock and credit summaries are current/all-time, not historical snapshots. |
| Clear sync status, pending count and last-sync time | Desktop Chrome acceptance passed | Offline state, disabled sync control, exact pending count, successful sync timestamp and failed-session warning tested. Fixed false Synced/up-to-date displays after a sync failure, including persistence across navigation. |
| Password change and secure account recovery | Baseline browser/live checks passed | Browser verifies current-password checks, old-session revocation and new-password sign-in. Owner confirmed receipt of the live Brevo reset email, successful reset and sign-in. Device-lock browser checks cover wrong passphrases, offline unlock, lock on reload and same-account online recovery. Email ownership verification and linking emails to legacy accounts remain separate feature gaps; this is not an independent security audit. |
| Installable PWA | Agreed acceptance passed | Chrome manifest/installability checks pass. Explicit PNG/Apple icons and standalone metadata are present. Owner confirmed installation and offline reopening with records visible on both Android and iPhone. |
| Simple receipt viewing and downloading | Desktop Chrome acceptance passed | Actual receipt viewer and downloaded text file verify business, item/quantity, UGX total and payment method. Phone file handling remains unverified; PDF and thermal printing are not implied. |

## Could have

These remain optional and must not displace unfinished Must/Should acceptance work.

| Requirement | Assessment |
| --- | --- |
| Barcode scanning | Not found in current application code. |
| Thermal-printer receipts | Not found; text receipt download exists. |
| Additional charts | A basic dashboard chart exists; further charts have no agreed scope and remain optional. |
| Product images and categories | Not found in current product model/forms. |
| Interface customisation | No user-facing customisation workflow found. |
| Additional languages | No application translation workflow found; current UI is English. |
| Classroom offline/online simulation toggle | Not found; current connectivity follows browser online/offline events. |

## Won't have this time

Actual mobile-money payment processing, banking integration, payroll, tax filing, full accounting/complex ERP, AI forecasting, and e-commerce ordering/delivery management are outside this release. No implementation of these features was identified in the reviewed application flows.

**Mobile-money recording means recording how a customer paid. It does not collect or transfer money through MTN or Airtel.**

## Essential quality requirements

| Requirement | Assessment |
| --- | --- |
| Simple navigation | Desktop navigation, mobile bottom navigation and focused screens exist; user acceptance remains. |
| Readable text | Responsive styles exist; some labels use small text. Phone readability and zoom must be checked. |
| Large tap targets | Main controls have sizing rules, but compact row actions and icon controls require a touch-target review. Do not mark accepted from CSS alone. |
| Consistent UGX amounts | Shared `money` formatter and integer business amounts exist. Review exports and rendered examples during acceptance. |
| Reliable data handling | Automated validation, transaction, retry, duplicate, conflict and restore checks pass. Real browser lifecycle, deployed concurrency and large-volume tests remain. |

## Current acceptance result

**All agreed acceptance groups in the two-batch review have passed.** Automated tests and the production build passed, fixes are deployed, and the owner confirmed the remaining physical/live checks:

1. Android and iPhone both install and reopen offline with workspace records accessible.
2. The same test product appears on both phones with matching price and stock after syncing the same test business.
3. The live email-reset message arrives, the password resets successfully and sign-in with the new password works (confirmed earlier).

Physical/live results are owner-reported, not inferred from viewport emulation. Exactly-once offline-sale upload was verified in desktop Chrome and Worker tests; a physical-phone offline sale/reconnect was not specifically reported. Phone receipt/import handling, OS eviction/storage exhaustion, large-volume contention and an independent accessibility/security assessment remain broader verification limits. Email ownership verification and legacy-account email linking remain documented feature gaps. Optional Could-have features are not part of this acceptance result.

## Verification in this assessment

- `npm.cmd test`: passed all four configured suites: business, sync, backup and offline. Offline storage/service-worker tests use controlled mocks, not real browser lifecycle tests.
- Standard `npm.cmd run typecheck` encountered EPERM writing `tsconfig.tsbuildinfo`. `node node_modules/typescript/bin/tsc --noEmit --incremental false` then passed without writing that cache.
- Existing upgrade notes describe earlier build/runtime passes; these are historical evidence, not fresh checks from this assessment.
- Unit suites, isolated Worker/D1 runtime checks, real Chrome browser acceptance, TypeScript and production build passed during this review. Production pages/PWA assets/recovery configuration were checked, and the owner confirmed both phone checks and live email reset. No independent security audit, current dependency audit or live SMS test was performed.

## Release work in priority order

Final acceptance recorded on 2 November 2026: owner reported "Both phones passed" for Android/iPhone installation and offline reopening with records visible, and "Yes, records match" for the same-business live product/price/stock sync. Both previously pending owner checks are now passed. This completes the agreed two-batch acceptance review for release `7907397`; earlier pending/local-only statements describe prior stages. The limitations above remain explicit rather than being treated as tested.

Release `7907397` is committed, pushed to `main` and deployed to `https://dukatrack.alobiine.workers.dev`. Live checks pass for the updated manifest, all three PNG home-screen icons, home/forgot-password/reset-password pages and configured recovery validation. No business records were modified by those live checks. Owner has been asked to confirm installation/offline launch on both Android and iPhone and a same-test-business cross-device sync. Those two physical/live acceptance items remain pending until results are supplied. Earlier statements that these fixes are local describe previous stages and are superseded by this entry.

Batch two automated checks passed in isolated Chrome: password change/current-password rejection/session revocation/new-password login; device-lock configuration, wrong passphrase rejection, offline unlock, reload locking and online same-account recovery; manifest parsing/Chrome installability; 390px/375px viewport reflow, visible button names and 44px targets; readable mobile form input sizes; modal focus trapping/Escape/focus restoration. Fixed undersized mobile controls, increased key mobile label sizes, added 192/512 PNG and Apple home-screen icons/metadata, and moved the device-lock control into Settings because its floating button covered the phone chart. Removed stale email-setup copy in Settings. Owner confirmed the full live email recovery flow. Unit suites, TypeScript, build and the browser regression pass. Physical-phone installation/offline launch and final updated live cross-device checks remain outstanding.

Batch one (four groups) passed in real isolated Chrome: sales search/calendar-date filters, customer history, reports/CSV and sync-status display. Fixed rolling-week behavior under the This week label, missing credit-correction/refund history and false Synced/up-to-date labels after failure. Added reporting helpers and unit tests for Kampala midnight/Monday boundaries, correction balances and CSV formula escaping. Browser checks seed prior-day/older transactions, search receipts/products, inspect zero-balance corrected customer history, verify report figures/downloaded CSV and revoke the disposable session to confirm persistent failure warnings. Unit suites, TypeScript and production build pass. Four acceptance groups remain; no live business records changed and fixes are not yet deployed.

Dashboard/low-stock pair passed in real desktop Chrome against isolated local Worker/D1 data. Seeded today/prior-day cash/mobile/credit sales, repayments and a refund produce the expected rendered summary amounts and chart bars. Exact-threshold and zero-stock warnings display, stock/navigation indicators agree, restocking clears warnings and archived zero-stock products do not trigger warnings. No application code fix was needed. Current remaining acceptance work is enumerated in the eight groups above; all new test/fix work since the last deployed commit remains local.

Paired acceptance checks (desktop Chrome): browser receipt viewing/download and backup download/file restoration both pass. The downloaded receipt contains the test business, product/quantity, UGX unit total and sale total, and payment method. The actual downloaded JSON is imported via Chrome's file input into an intentionally emptied disposable local workspace while offline. The test verifies restored sale/stock, a queued restore, a downloaded pre-import safety copy and a stored IndexedDB safety copy; reconnecting drains the restore without duplicating the existing cloud sale. Wrong-business and conflicting-stock files are rejected without modifying records, and re-importing the same backup adds no sale or pending operation. Test data/profile/database are isolated; no live records changed. No further application fix was needed. Continue requirement reviews two at a time as requested. Phone browser/download compatibility remains unverified.

Real-browser offline acceptance (desktop Chrome, headless): `npm.cmd run test:browser` passed using a new browser profile and a separate local Worker/D1 database. The test registers an email-based test account, adds/syncs stock, waits for service-worker control and cached assets, disables browser networking, records a sale, reloads offline, closes Chrome, reopens the same test profile offline, and verifies the original sale and pending operation ID persist. Reconnection drains the queue; a subsequent reload shows exactly one sale and one stock deduction. No production business records or existing browser profile were used. Application behavior needed no additional fix. The command requires an installed Chromium browser and permission to launch it; the first sandboxed launch could not expose debugging, while the permitted isolated run passed. Phone installation/background/OS-eviction behavior, browser file-download/import flows and storage exhaustion on real devices remain unverified. These QA changes are not deployed.

Backup/account-isolation verification completed locally: production build, all unit suites, TypeScript and isolated Worker/D1 runtime checks pass. Real restore tests cover missing-product/sale import, persisted downloads, duplicate retries and conflicting-overwrite rejection. Isolation tests attempt forged adjustments and wrong-business restores and confirm no changes to the victim workspace; audit query parameters cannot select another business's events. Audit test identities account for per-business migration IDs. No additional isolation code fix was required. File-picker/download acceptance, IndexedDB safety-copy failure scenarios in a real browser and offline/reconnect lifecycle remain manual. New fixes and test changes have not been committed or deployed in this review.

Backup review fixes: exports now read the latest committed IndexedDB bundle under the workspace lock rather than relying on the rendered snapshot. Backup snapshots are cloned and retain pending operations. Restore rechecks the current business immediately before merging/saving, so an earlier file preview cannot authorize import into a different account. State validation no longer adds default fields to its caller's objects. Unit checks cover pending-operation export, independent snapshots, wrong-business rejection, non-mutating legacy validation and the 400 KB limit. Safety-copy-before-write behavior remains in place. These fixes are local and not deployed yet.

Conflict review acceptance: added a real isolated Worker/D1 test that concurrently submits two sales for the last stock from separate sessions. Exactly one is accepted; the other retains its complete original operation and stays outside accepted sales/totals. Restocking does not replay the rejected sale. Owner resolution persists across sessions, retains evidence/history and is idempotent without changing stock or sales. Added a shared-domain check that blank resolution reasons cannot close a conflict. Runtime assertions pass; real-browser review usability remains unverified. Production business records were not used or changed.

Resumed Must-have review — cloud sync: added passing checks for empty-queue downloads, UTF-8 batch byte limits and oversized-record preservation. Extended the real local Worker/D1 smoke test to use two authenticated sessions, verify downloaded sales/stock, retry a sale without duplication and reject cross-business/unauthenticated access. The standard runtime command now loads checkout-local tool configuration rather than a restricted global registry path. All configured unit suites and runtime assertions pass. The real Worker test uses an isolated local database, not production business data; actual multi-browser offline/reconnect acceptance remains pending.

Brevo recovery integration: implemented direct transactional email on the main Worker with private API-key/sender/app-origin configuration, provider acceptance validation and reset links that carry tokens in URL fragments. The reset form consumes/removes the fragment and skips manual code entry when opened from email. Mocked integration tests cover successful send/reset, unknown account privacy, bad configuration and provider/network failures. No real API key was read or email sent; live delivery needs the owner's local secret setup. See `EMAIL_SETUP.md`. Email verification at registration and linking legacy phone accounts remain pending.

Password-reset presentation: sign-in now links to `/forgot-password` directly below the password field. Dedicated branded request and `/reset-password` pages replace the inline recovery dropdown. Reset includes password confirmation and clear error/success states. The service worker caches navigation by path so recovery pages cannot overwrite the offline homepage; a regression test covers both cached routes. Automated suites, TypeScript, production build and isolated Worker HTTP checks of both pages pass. Real-browser visual checks and email delivery remain outstanding.

Email page change verification: all four configured automated suites, TypeScript without incremental cache and the production build pass. A real isolated Worker/D1 smoke test passes when run with `node --import ./scripts/sites-env.mjs scripts/test-runtime.mjs`; the plain npm runtime command encountered a restricted global Wrangler registry path. Local account database backed up to `database-backup-email-1793610819781` before applying `0003_email_accounts` successfully. Populated-account migration tests verify retained passwords, phone identities, workspaces, sessions and foreign keys. No hosted deployment or remote database change was performed.

Latest scope change: sign-up/sign-in now default to email/password; existing phone accounts retain access. Migration `0003_email_accounts` preserves account IDs/passwords and dependent records, adds unique normalized emails and makes phone optional. Recovery requests email through the optional `RECOVERY_EMAIL_DELIVERY` adapter; no provider or email ownership verification is implemented yet. SMS sandbox/local-inbox source/configuration and their provider test suite have been removed. Private `.dev.vars` and local generated state are retained. Earlier SMS setup entries below are historical and superseded. Customer editing and the confirmed stock/storage fixes remain in place.

Provider-independent recovery testing: added an in-memory local inbox Worker (`recovery/local/`) so recovery can be tested without SMS credentials or a working provider simulator. Tokens display only through loopback inbox URLs, expire automatically and are not logged or persisted. Adapter tests cover delivery/display, expiry, invalid inputs and public/cross-origin rejection; a real local Worker startup and inbox HTTP 200 check pass. Full app-to-inbox reset acceptance remains to be exercised. This is a development tool, not production phone delivery; never deploy it.

Sandbox recovery adapter prepared in `recovery/` for Africa's Talking. It is restricted to the sandbox endpoint and a single configured simulator phone, validates token/expiry, and returns success only for an accepted recipient status. Private local credentials are in ignored `recovery/.dev.vars`; no real key was supplied. A fifth automated suite verifies adapter requests and failure handling using a mock provider. All five suites and TypeScript pass. Real provider/simulator delivery and local cross-Worker integration remain pending credential setup and manual testing. See `recovery/README.md`; nothing was deployed.

Incomplete-feature work: customer editing is now implemented from the customer detail view. Name/optional phone fields are prefilled; edits preserve customer identity, sales, repayments and balances. Changes based on outdated customer details are rejected for review. Automated checks cover validation, duplicate retry, stale edits, balance/history preservation and persistence through relational cloud sync. All four suites and TypeScript pass. Earlier statements that customer editing is missing describe the initial assessment and are superseded by this entry. Recovery provider onboarding is still required; no live phone delivery is configured by this work.

Seventh sequential review: offline workspace initialization, committed IndexedDB saves, pending-operation persistence and service-worker shell/asset caching reviewed. Fixed a post-commit BroadcastChannel exception that could leave a successful save promise unresolved; notifications are now best effort and channels close even if posting fails. Added passing tests for committed record retrieval (including pending operations), missing records, blocked/storage failures and notification constructor/post failures. All four suites and TypeScript without cache writing pass. Tests use controlled mocks; actual offline refresh, browser closure/reopen and phone lifecycle acceptance remain unverified.

Sixth sequential review: customer creation, credit sale selection, repayment forms and balance calculation reviewed. Added passing checks for customer validation/optional phone, trimmed names, duplicate customer-operation retry, required existing credit customers, cumulative credit across sales, balances isolated per customer, partial and full repayments, duplicate repayment retry, overpayment/invalid amount rejection and unchanged state after rejection. Business and backup suites pass, including existing credit reversal/refund checks. No functional fix was necessary. Customer editing is not implemented; the present workflow supports adding, searching and viewing customers and their credit/repayment history. Real-device acceptance remains.

Fifth sequential review: separate Cash, MTN Mobile Money and Airtel Money options are present in sales and repayments; sale history, receipts, reports and CSV retain method labels. Added checks for separate method records, credit balance after mixed-method repayments, backup/restore preservation and unsupported-method rejection. Dashboard intentionally combines MTN/Airtel into one mobile-money summary while Reports separates sales by method. No payment processing was added; real-device display acceptance remains.

Fourth sequential review: sale entry, cart totals and shared sale validation reviewed. Added passing checks for multi-item totals and receipt identity/time, automatic stock deduction down to zero, duplicate retry protection, and rejection of empty/duplicate items, invalid quantities, overselling, incorrect totals, changed prices, unknown methods and missing/archived products. A later invalid item leaves all original quantities and records unchanged. Business and backup suites pass. No functional sale change was necessary; real-device sale entry remains unverified.

Third sequential review: stock view, adjustment form and shared adjustment validation reviewed. Added passing tests for additions, reductions down to zero, retained reason/product/quantity/time/operation identity, duplicate retry protection, and rejection of overselling reductions, zero/fractional/nonfinite/over-limit changes, blank/overlong reasons and missing/archived products. Rejected changes leave inventory/history unchanged. Backup and business suites pass. No functional adjustment change was necessary; real-phone form acceptance remains.

Second sequential review: product creation/edit forms and shared validation reviewed. Zero-stock edit payload now preserves zero instead of falling back to an absent opening-stock field. Added passing checks for trimmed names, editable price/threshold, inventory preservation, invalid blank/negative/fractional/nonfinite values and stale-edit rejection. The existing backup suite still passes. Product entry and editing on real phones remain acceptance work.

Sequential review started with registration/login and lockout. Authentication code was reviewed and the business suite rerun successfully. Added regression checks that the first two wrong passwords do not lock the account, the third sets a 30-second lock, a correct password cannot bypass the active lock, and sign-in resumes at expiry with counters reset. These use isolated in-memory accounts and a controlled clock. Live browser and production security acceptance remain outstanding.

1. Accept the Must workflows on target browsers/phones: offline sale and reopening, reconnect/retry without duplication, two-device stock conflict and owner review, backup download/import, account isolation and login lockout.
2. Review production security/dependencies and address findings according to exposure; confirm deployment bindings and session behavior. See `SECURITY_NOTES.md` for historical findings, not a current audit result.
3. Connect and test recovery delivery, including invalid/expired/used tokens and provider failure.
4. Verify PWA installation/offline launch and receipt downloads on target devices.
5. Complete readability, navigation, keyboard and tap-target acceptance. Only then consider optional features.

Documentation issue: `app/screens/SettingsScreen.tsx` still describes recovery, restore and full security testing as pending together. Restore is now implemented with the limits above; recovery delivery and full security assessment remain incomplete. Update that copy when making the next UI change.
