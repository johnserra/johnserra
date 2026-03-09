import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  reactCompiler: true,
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
