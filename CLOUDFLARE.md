# Host DukaTrack in your Cloudflare account

Deploy the full app to **Cloudflare Workers**, with a **D1** database. Run these commands in PowerShell from the inner project folder containing `package.json`.

## Automatic deployments from GitHub (recommended)

This checkout uses `https://github.com/Alobiine/DukaTrack.git`, branch `main`. The app is at the **repository root** (even though your local checkout is inside another DukaTrack folder).

1. Create a D1 database named `dukatrack-db` in your Cloudflare account, through the dashboard or the CLI below. Retain its database ID.
2. Commit and push the prepared deployment files to GitHub, including `scripts/deploy-cloudflare.mjs`, `package.json`, and `vite.config.ts`.
3. In Cloudflare **Workers & Pages**, create a Worker using **Import a repository** and authorize GitHub access to **Alobiine/DukaTrack**. For an existing `dukatrack` Worker, use **Settings > Build** to connect the repository instead.
4. Configure these production settings:

   | Setting | Value |
   | --- | --- |
   | Worker name | `dukatrack` |
   | Production branch | `main` |
   | Root directory | `/` (repository root) |
   | Build command | `npm run typecheck && npm test` |
   | Deploy command | `npm run deploy:cloudflare` |
   | Non-production branch builds / Previews | Disabled for this initial setup |

   The deploy command performs the production build itself, then applies migrations and deploys. Cloudflare installs dependencies before running these commands.

5. Add **build variables** (these must be available during the build/deploy commands):

   | Variable | Value |
   | --- | --- |
   | `DUKATRACK_D1_ID` | The real D1 database UUID |
   | `DUKATRACK_D1_NAME` | `dukatrack-db` |
   | `NODE_VERSION` | `22.16.0` (or a supported newer Node 22 release) |

   The build deployment token needs permission to deploy Workers and edit D1 in this account, because deployment applies database migrations. Configure that token in Cloudflare's build settings; do not commit credentials to GitHub.

6. Deploy and check the first build's logs and live URL. Subsequent pushes to `main` automatically validate and publish the app using the same D1 database. If validation fails, the deployment command does not run.

This connection deploys **application code** from GitHub to Cloudflare. Business records remain in D1 and device storage; GitHub does not store or synchronize those records. Preview environments should have a separate database before enabling them.

This local setup does not authorize the Cloudflare GitHub application for you. Complete that account connection in the dashboard.

See [Workers Builds setup](https://developers.cloudflare.com/workers/ci-cd/builds/) and [build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## Manual deployment alternative

1. Sign in. This opens Cloudflare in your browser; approve the account you want to use.

   ```powershell
   npm.cmd run cf -- login
   npm.cmd run cf -- whoami
   ```

2. Create a new cloud database (once only):

   ```powershell
   npm.cmd run cf -- d1 create dukatrack-db
   ```

   Copy the returned `database_id`. This is an identifier, not an API secret. Reuse this database for later deployments.

3. Set the database details in the current PowerShell session:

   ```powershell
   $env:DUKATRACK_D1_ID = 'paste-the-real-database-id-here'
   $env:DUKATRACK_D1_NAME = 'dukatrack-db'
   ```

   If your login can access multiple accounts, also set `$env:CLOUDFLARE_ACCOUNT_ID` to the intended account ID.

4. Validate, then publish:

   ```powershell
   npm.cmd run typecheck
   npm.cmd test
   npm.cmd run deploy:cloudflare -- --dry-run
   npm.cmd run deploy:cloudflare
   ```

   Deployment builds the app, applies pending SQL migrations to the selected remote database, then publishes Worker `dukatrack` and its assets. A Worker already named `dukatrack` in this account will be updated. Wrangler prints the live `workers.dev` URL. Enable your Workers subdomain in Cloudflare if prompted. The dry run builds and validates the Worker without applying migrations or publishing.

## Existing records and later updates

Your local `.wrangler/state` database and browser records are **not uploaded by deployment**. Export a JSON backup from the existing app, retain it, then use the deployed app's backup preview/restore workflow after signing in or creating the intended business account. Check the restore preview before proceeding. Localhost and the deployed URL have separate browser storage.

For later deployments, set the same database variables and run validation and deployment again. Do not create a new database for each update. The deployment script refuses the local placeholder ID. Do not deploy the existing placeholder build directly.

The deployed URL accepts visitors; business records require the app's account login. Synced records live in D1 in your Cloudflare account; offline changes remain in the device browser until accepted by sync. Cloudflare billing and account limits apply.

Password recovery delivery requires a separate private Worker adapter; see `START_HERE.md`. It is not connected by default. Connected ChatGPT app tools require Sites infrastructure and are not supplied by direct Cloudflare hosting.

To add a domain later, open Cloudflare **Workers & Pages → dukatrack → Settings → Domains & Routes → Add → Custom Domain**.

References: [Workers deployment](https://developers.cloudflare.com/workers/wrangler/commands/#deploy), [D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/).
