/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sql.js (WASM) and pg must not be bundled/transpiled by Next.
  experimental: {
    serverComponentsExternalPackages: ["sql.js", "pg"],
    // sql.js loads its WASM binary at runtime through a computed path, so
    // Next's static tracing cannot see it and leaves it out of the serverless
    // bundle. Without this the SQLite backend aborts with ENOENT on the first
    // query in production.
    outputFileTracingIncludes: {
      "/**": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
    },
  },
  // Allow the preview host proxy as well as the production domain.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
