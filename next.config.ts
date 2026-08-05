import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

function wordpressRemotePatterns(): URL[] {
  const configured = process.env.WORDPRESS_MEDIA_URL ?? process.env.WORDPRESS_API_URL;
  if (!configured) return [];

  try {
    const url = new URL(configured);
    return [new URL(`${url.origin}/wp-content/uploads/**`)];
  } catch {
    throw new Error("WORDPRESS_MEDIA_URL or WORDPRESS_API_URL must be a valid absolute URL.");
  }
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["resend"],
  images: {
    remotePatterns: wordpressRemotePatterns(),
  },
  async redirects() {
    return [
      {
        source: "/recipes",
        destination: "/blog?tag=recipe",
        permanent: true,
      },
      {
        source: "/recipes/:slug",
        destination: "/blog/:slug",
        permanent: true,
      },
      {
        source: "/tr/recipes",
        destination: "/tr/blog?tag=recipe",
        permanent: true,
      },
      {
        source: "/tr/recipes/:slug",
        destination: "/tr/blog/:slug",
        permanent: true,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
