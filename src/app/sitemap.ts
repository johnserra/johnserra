import { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getAllSiteContent } from "@/lib/site-content";
import { dynamicSitemapEntries } from "@/lib/sitemap";
import { aboutPath, dataAuditPath, privacyPolicyPath, projectsPath, servicesPath } from "@/lib/routes";
import { Locale } from "@/types";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://johnserra.com";
  
  const sitemap: MetadataRoute.Sitemap = [];

  // Add static routes for each locale
  for (const locale of routing.locales) {
    const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    const routes = [
      "",
      aboutPath(locale),
      "/blog",
      projectsPath(locale),
      servicesPath(locale),
      dataAuditPath(locale),
      "/contact",
      privacyPolicyPath(locale),
    ];
    
    for (const route of routes) {
      sitemap.push({
        url: `${baseUrl}${localePrefix}${route}`,
        changeFrequency: "monthly",
        priority: route === "" ? 1 : 0.8,
      });
    }

    // Add dynamic blog posts
    const blogItems = await getAllSiteContent("blog", locale as Locale);
    sitemap.push(...dynamicSitemapEntries(baseUrl, localePrefix, "/blog", blogItems, {
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    // Add dynamic projects
    const projectItems = await getAllSiteContent("projects", locale as Locale);
    sitemap.push(...dynamicSitemapEntries(baseUrl, localePrefix, projectsPath(locale), projectItems, {
      changeFrequency: "monthly",
      priority: 0.6,
    }));
  }

  return sitemap;
}
