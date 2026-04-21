declare namespace NodeJS {
  interface ProcessEnv {
    /** Server-side only: gRPC backend URL for the Next.js rewrite proxy. Never sent to the browser. */
    API_URL?: string;
    SITE_URL?: string;
    /** Set to "true" to enable bundle analysis via @next/bundle-analyzer */
    ANALYZE?: string;
  }
}
