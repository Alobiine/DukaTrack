# Password recovery with Brevo

DukaTrack sends recovery emails directly from its server through Brevo's transactional API. No second development server or SMS configuration is needed. Provider acceptance does not guarantee inbox delivery: check Brevo's transactional logs and the recipient's inbox/spam folder.

## Local setup

Open the **project-root** `.dev.vars` file (next to `package.json`, not `recovery/.dev.vars`) in your editor:

```dotenv
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=your-verified-sender@example.com
DUKATRACK_APP_URL=http://localhost:5173
```

Use the verified sender shown in Brevo. Set the app URL to the exact origin printed by your local server. Public deployments require HTTPS. This file is excluded from Git; never paste the API key into chat, screenshots or source files. Restart the app after editing:

```powershell
npm.cmd run dev
```

Create or use an existing **email-based DukaTrack account**. On sign-in, select Forgot password?, enter that account's email, and submit. Open the email's reset link and choose/confirm a new password. Then sign in with it. If the account was originally phone-only, email linking is not implemented yet; creating another account will not transfer business records.

Tokens are single-use, expire after 15 minutes and revoke existing sessions on reset. Requests are limited to one per email every five minutes. Unknown emails receive the same success message without mail being sent. A provider rejection is treated as failure, and the newly created reset token is removed. Reset URLs use the configured origin, not incoming Host headers; the token is carried in the URL fragment and removed from the address bar after the form loads. Do not refresh the reset form before submitting; the email also includes a manual reset code as a fallback.

## Cloudflare deployment

For this deployment, use `https://dukatrack.alobiine.workers.dev` as `DUKATRACK_APP_URL`. A trailing slash is also accepted.

Add `BREVO_API_KEY` as a secret on the main DukaTrack Worker, and configure `BREVO_SENDER_EMAIL` and `DUKATRACK_APP_URL` on that Worker. Use the public DukaTrack URL (without a path) as `DUKATRACK_APP_URL`. Local `.dev.vars` files are not production secrets and must not be uploaded. The earlier `DUKATRACK_RECOVERY_SERVICE` variable is obsolete. `DUKATRACK_RECOVERY_EMAIL_SERVICE` is only needed if choosing a separate custom adapter instead of direct Brevo delivery.

Brevo must allow transactional sending and the sender must be verified. Its sender/domain authentication and API security settings may require additional account action. Never expose provider error bodies or credentials to the browser. Email address ownership verification at registration remains a separate pending feature.

Automated tests use fake API keys and mocked provider responses; they do not send mail. Real inbox delivery remains a manual acceptance check after configuration.

Reference: [Brevo transactional email API](https://developers.brevo.com/docs/send-a-transactional-email).
