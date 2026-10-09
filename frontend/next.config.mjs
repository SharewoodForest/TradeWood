/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export", // static site for Cloudflare Pages
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi/WalletConnect optional deps that aren't needed in the browser bundle
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};
export default nextConfig;
