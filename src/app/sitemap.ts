import { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getContentSlugs } from "@/lib/content";
import { Locale } from "@/types";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://johnserra.com";
  const routes = ["", "/about", "/blog", "/portfolio", "/contact", "/cv-optimizer", "/privacy-policy"];
  
  const sitemap: MetadataRoute.Sitemap = [];

  // Add static routes for each locale
  for (const locale of routing.locales) {
    const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    
    for (const route of routes) {
      sitemap.push({
        url: `${baseUrl}${localePrefix}${route}`,
        lastModified: new Date(),
        changeFrequency: "monthly",
        priority: route === "" ? 1 : 0.8,
      });
    }

    // Add dynamic blog posts
    const blogSlugs = getContentSlugs("blog", locale as Locale);
    for (const slug of blogSlugs) {
      sitemap.push({
        url: `${baseUrl}${localePrefix}/blog/${slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    // Add dynamic portfolio projects
    const portfolioSlugs = getContentSlugs("portfolio", locale as Locale);
    for (const slug of portfolioSlugs) {
      sitemap.push({
        url: `${baseUrl}${localePrefix}/portfolio/${slug}`,
        lastModified: new Date(),
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  return sitemap;
}
