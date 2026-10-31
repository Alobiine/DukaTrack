declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    RECOVERY_DELIVERY?: Fetcher;
    BUCKET?: R2Bucket;
  }
}
