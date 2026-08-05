import { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getSiteContentSlugs } from "@/lib/site-content";
import { Locale } from "@/types";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://johnserra.com";
  const routes = ["", "/about", "/blog", "/projects", "/contact", "/privacy-policy"];
  
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
    const blogSlugs = await getSiteContentSlugs("blog", locale as Locale);
    for (const slug of blogSlugs) {
      sitemap.push({
        url: `${baseUrl}${localePrefix}/blog/${slug}`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }

    // Add dynamic projects
    const projectSlugs = await getSiteContentSlugs("projects", locale as Locale);
    for (const slug of projectSlugs) {
      sitemap.push({
        url: `${baseUrl}${localePrefix}/projects/${slug}`,
        lastModified: new Date(),
        changeFrequency: "monthly",
        priority: 0.6,
      });
    }
  }

  return sitemap;
}
