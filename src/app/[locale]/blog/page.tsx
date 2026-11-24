import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { getAllSiteContent } from "@/lib/site-content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BlogListing, type BlogListingPost } from "@/components/blog/BlogListing";
import { NewsletterSignup } from "@/components/blog/NewsletterSignup";
import { AIChatWidget } from "@/components/widgets/AIChatWidget";
import { Blog } from "@carbon/icons-react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { projectsPath } from "@/lib/routes";
import type { Metadata } from "next";
import type { Locale } from "@/types";

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Blog" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations("Blog");
  const allPosts = await getAllSiteContent("blog", locale as Locale);
  const dateLocale = locale === "tr" ? "tr-TR" : "en-US";

  // Build tag counts
  const tagCounts = new Map<string, number>();
  for (const post of allPosts) {
    for (const postTag of post.frontmatter.tags ?? []) {
      tagCounts.set(postTag, (tagCounts.get(postTag) ?? 0) + 1);
    }
  }
  const tags = Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const listingPosts: BlogListingPost[] = allPosts.map((post) => ({
    slug: post.slug,
    title: post.frontmatter.title,
    description: post.frontmatter.description,
    formattedDate: post.frontmatter.date
      ? new Date(post.frontmatter.date).toLocaleDateString(dateLocale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : undefined,
    tags: post.frontmatter.tags,
    categories: post.frontmatter.categories,
  }));

  return (
    <div className="bg-ground text-ink">
      <Header />
      <main className="min-h-screen py-14 md:py-20">
        <div className="max-w-4xl mx-auto px-4 md:px-6">
          {/* Header */}
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 mb-3">
              <Blog size={14} className="text-accent" />
              <span className="font-mono text-xs font-medium uppercase tracking-wider text-accent">
                {t("eyebrow")}
              </span>
            </div>
            <h1 className="mb-3 font-serif text-4xl sm:text-5xl tracking-tight text-ink leading-tight">
              {t("title")}
            </h1>
            <p className="text-base md:text-lg text-muted leading-relaxed max-w-2xl">
              {t("subtitle")}
            </p>
          </div>

          <BlogListing
            locale={locale as Locale}
            posts={listingPosts}
            tags={tags}
            ctlProjectHref={projectsPath(locale, "careertalklab")}
            labels={{
              sectionLabel: t("sectionLabel"),
              trackAll: t("trackAll"),
              trackAnalytics: t("trackAnalytics"),
              trackCtl: t("trackCtl"),
              ctlBannerTitle: t("ctlBannerTitle"),
              ctlBannerBody: t("ctlBannerBody"),
              ctlBannerCta: t("ctlBannerCta"),
              ctlBannerLiveCta: t("ctlBannerLiveCta"),
              readArticle: t("readArticle"),
            }}
          />

          <div className="mt-14">
            <NewsletterSignup sourcePath="/blog" />
          </div>
        </div>
      </main>
      <Footer />
      <AIChatWidget />
    </div>
  );
}
