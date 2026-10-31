# Dependency and security review

The baseline npm audit reported 42 findings: 1 critical, 15 high, 25 moderate and 1 low. After explicit compatible framework/tool updates and a non-forced `npm audit fix`, the final audit reports **24 moderate, 0 high, 0 critical, 0 low**. This is not an audit-clean claim. The lockfile is updated.

Pinned updates include Next 16.4.3, React/React DOM/RSC 19.3.1, Vinext 1.4.0, Vite 8.3.5, Cloudflare Vite plugin 1.66.0, Wrangler 4.154.0, RSC plugin 0.5.38, Workers types 5.20261031.1 and Zod 4.6.7. The existing Miniflare Sharp override moves to 0.35.5. Compatible transitive patches were applied. Peer requirements were resolved explicitly; no force or legacy-peer-deps was used.

Remaining roots (24 includes affected parents, not 24 independent root flaws):

| Root | Affected chain and use | Decision |
| --- | --- | --- |
| esbuild <=0.24.2 | Drizzle Kit -> @esbuild-kit/esm-loader -> core-utils -> old esbuild; development migration tooling | npm proposes a breaking Drizzle downgrade. Retained; do not expose development tooling to untrusted networks. [Advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |
| minimatch <11.0.1 | ESLint and TypeScript ESLint/import/accessibility/react plugins; development lint tooling | npm proposes breaking downgrades. No forced override across incompatible API versions. [Advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| fflate 0.7.0-0.7.4 | Vinext -> @vercel/og -> satori; OG-image dependency chain that can be part of a server build | npm proposes downgrading Vinext to 0.2.1. The application does not expose a custom ZIP/OG upload flow, but the dependency remains flagged and must be reviewed before public operation. [Advisory](https://github.com/advisories/GHSA-px8p-9vwx-vf98) |

`npm.cmd audit` exits nonzero while these findings remain. Advisory data changes over time; rerun it before release. `npm.cmd audit --omit=dev` is not a sufficient check for the Worker artifact: build tools such as Vinext can contribute runtime code.

Authentication checks cover account scoping, origin enforcement, bounded request bodies, salted password hashes, session hashes/expiry/revocation, password changes and lockout. Password recovery is an optional private delivery binding, not a connected SMS service. Recovery token expiry/single-use and session revocation are tested. Infrastructure/global rate limits, verified phone ownership, independent penetration/load assessment, stronger platform-supported password hashing and staff permissions remain outside this upgrade.

Offline records remain unencrypted. The device passphrase gate and delays provide casual UI privacy only. Browser/OS controls and private off-device backups are still needed. See START_HERE.md for precise recovery and lock behavior.
