declare namespace NodeJS {
  interface ProcessEnv {
    /** Server-side only: gRPC backend URL for the Next.js rewrite proxy. Never sent to the browser. */
    API_URL?: string;
    NEXT_PUBLIC_SITE_URL?: string;
  }
}
