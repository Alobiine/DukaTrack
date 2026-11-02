# DukaTrack requirements baseline and assessment

Assessed on 2 November 2026 against the owner's MoSCoW priorities and this local checkout. This baseline describes the intended release; it does not claim that every requirement is complete. No deployment or live-account verification was performed.

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
| Save and retrieve records offline | Implemented; needs device verification | IndexedDB committed transactions, workspace locks and service-worker caching. Mock tests pass; offline refresh, closure/reopen, eviction and storage exhaustion need real browser checks. Initial registration/sign-in requires online access. |
| Synchronise with the cloud | Implemented; needs deployed verification | `lib/sync.ts`, authenticated sync route and transactional relational persistence. Automated batch/retry tests pass; live multi-device acceptance and volume tests remain. Sync runs while the app is open. |
| Prevent duplicate transactions | Implemented | Stable operation IDs, applied-operation tracking and idempotent retry/import tests. |
| Preserve conflicting records for owner review | Implemented | Full operation evidence retained in reviews; Sync screen supports inspection and reasoned resolution. Automated rejection/replay tests pass. Multi-device browser acceptance remains. |
| Back up and restore business records | Implemented with limits | JSON export, validation/preview, same-business conservative merge, safety copy and queued restore. Backup tests pass. Imports limited to 400 KB; differing existing records block import; cloud sync still required. Browser download/import acceptance remains. |
| Protect each business's data from other accounts | Implemented; security acceptance outstanding | Session-scoped sync/audit access, expected-business checks and backup ownership checks; automated isolation tests pass. Local browser records are unencrypted; device lock is a UI privacy gate. |

## Should have

| Requirement | Assessment | Evidence and limits |
| --- | --- | --- |
| Dashboard summaries | Implemented | `app/screens/HomeScreen.tsx`; real-data visual acceptance remains. |
| Low-stock indicators | Implemented | Product thresholds and low-stock status on stock/dashboard/report views. |
| Searchable sales history with date filters | Implemented, basic filters | `SalesScreen.tsx` and filtering in `app/page.tsx`: receipt/product search and Today, This week, All. Custom date ranges are not implemented. |
| Customer credit and repayment history | Implemented | Customer detail modal lists related sales and repayments. |
| Basic sales, stock and credit reports | Implemented | `ReportsScreen.tsx`: revenue, average sale, payment breakdown, stock levels and credit balances; sales CSV export. Stock and credit summaries are current/all-time, not historical snapshots. |
| Clear sync status, pending count and last-sync time | Implemented | `SyncScreen.tsx` and page status display use pending operations and last successful sync. |
| Password change and secure account recovery | Partial | The sign-in page labels password reset as "Forgot password?". Password change verifies the current password and revokes sessions. Recovery uses hashed, single-use tokens that expire after 15 minutes; stub-based tests pass. The flow now requests email; a private `RECOVERY_EMAIL_DELIVERY` adapter, provider setup and end-to-end email testing remain pending. |
| Installable PWA | Partial / needs device verification | Manifest, standalone display, SVG icon and service worker exist. Installation and offline launch must be checked on target phones/browsers; broader icon compatibility may need additional assets. |
| Simple receipt viewing and downloading | Implemented | Receipt modal and text-file receipt download in `app/page.tsx`. Download/file handling needs browser acceptance. PDF and thermal printing are not implied. |

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

## Verification in this assessment

- `npm.cmd test`: passed all four configured suites: business, sync, backup and offline. Offline storage/service-worker tests use controlled mocks, not real browser lifecycle tests.
- Standard `npm.cmd run typecheck` encountered EPERM writing `tsconfig.tsbuildinfo`. `node node_modules/typescript/bin/tsc --noEmit --incremental false` then passed without writing that cache.
- Existing upgrade notes describe earlier build/runtime passes; these are historical evidence, not fresh checks from this assessment.
- No independent security audit, current dependency audit, live SMS test, production deployment, browser installation or visual/accessibility test was performed here.

## Release work in priority order

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
