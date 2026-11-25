declare namespace Cloudflare {
  interface Env {
    HYPERDRIVE?: Hyperdrive;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
