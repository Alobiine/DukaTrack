declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    RECOVERY_EMAIL_DELIVERY?: Fetcher;
    BREVO_API_KEY?: string;
    BREVO_SENDER_EMAIL?: string;
    DUKATRACK_APP_URL?: string;
    BREVO_API_KEY?: string;
    BREVO_SENDER_EMAIL?: string;
    DUKATRACK_APP_URL?: string;
    BUCKET?: R2Bucket;
  }
}
