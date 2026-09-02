/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sql.js (WASM) and pg must not be bundled/transpiled by Next. Both of these
  // graduated out of `experimental` in Next 15; under the old names they are
  // silently ignored, which would put pg through the bundler and leave the
  // sql.js WASM binary out of the serverless output.
  serverExternalPackages: ["sql.js", "pg"],
  // sql.js loads its WASM binary at runtime through a computed path, so
  // Next's static tracing cannot see it and leaves it out of the serverless
  // bundle. Without this the SQLite backend aborts with ENOENT on the first
  // query in production.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
  },
  // Allow the preview host proxy as well as the production domain.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrers leak the path, and paths here carry record ids.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing in this application uses these.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          {
            key: "Content-Security-Policy",
            // 'unsafe-inline' for scripts is what Next's own bootstrap and the
            // theme script need without nonce plumbing, so this is not a
            // defence against injected script - the file-serving allowlist in
            // src/lib/file-serving.ts is. What it does buy: no plugins, no
            // <base> rewriting, forms and framing restricted to this origin,
            // and a fixed list of hosts anything may be fetched from.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
              "frame-ancestors 'self'",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
