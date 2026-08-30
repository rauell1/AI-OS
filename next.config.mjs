/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sql.js (WASM) and pg must not be bundled/transpiled by Next.
  experimental: {
    serverComponentsExternalPackages: ["sql.js", "pg"],
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
