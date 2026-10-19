import { Link } from "@/i18n/navigation";
import { getAllSiteContent } from "@/lib/site-content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TagCloud } from "@/components/blog/TagCloud";
import { Tag } from "@/components/ui/Tag";
import { ArrowRight, Blog, Education } from "@carbon/icons-react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { projectsPath } from "@/lib/routes";
import type { Metadata } from "next";
import type { Locale } from "@/types";

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tag?: string; section?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Blog" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

function isCtlPost(tags?: string[], categories?: string[]): boolean {
  const combined = [...(tags ?? []), ...(categories ?? [])];
  return combined.some((item) => item.toLowerCase() === "careertalklab");
}

export default async function BlogPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { tag, section } = await searchParams;
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

  const isCtlActive = tag?.toLowerCase() === "careertalklab" || section === "ctl";
  const isAnalyticsActive = !tag && section === "analytics";
  const isAllActive = !tag && !section;

  // Filter by section or tag
  const posts = allPosts.filter((p) => {
    if (isCtlActive && !tag) {
      return isCtlPost(p.frontmatter.tags, p.frontmatter.categories);
    }
    if (isAnalyticsActive) {
      return !isCtlPost(p.frontmatter.tags, p.frontmatter.categories);
    }
    if (tag) {
      return p.frontmatter.tags?.some((pt) => pt.toLowerCase() === tag.toLowerCase());
    }
    return true;
  });

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

          {/* Section / Category Switcher (All Writing | Small-Business Analytics | CareerTalkLab) */}
          <div className="mb-8">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted mb-2.5">
              {t("sectionLabel")}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/blog"
                className={`inline-flex items-center rounded-lg px-4 py-2 font-mono text-xs font-semibold no-underline transition-all ${
                  isAllActive
                    ? "bg-accent text-on-accent shadow-xs"
                    : "border border-hair bg-panel text-ink hover:bg-panel-2"
                }`}
              >
                {t("trackAll")}
              </Link>
              <Link
                href="/blog?section=analytics"
                className={`inline-flex items-center rounded-lg px-4 py-2 font-mono text-xs font-semibold no-underline transition-all ${
                  isAnalyticsActive
                    ? "bg-accent text-on-accent shadow-xs"
                    : "border border-hair bg-panel text-ink hover:bg-panel-2"
                }`}
              >
                {t("trackAnalytics")}
              </Link>
              <Link
                href="/blog?tag=CareerTalkLab"
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-mono text-xs font-semibold no-underline transition-all ${
                  isCtlActive
                    ? "bg-accent text-on-accent shadow-xs"
                    : "border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                {t("trackCtl")}
              </Link>
            </div>
          </div>

          {/* CareerTalkLab Section Context Callout when viewing CareerTalkLab posts */}
          {isCtlActive && (
            <div className="mb-10 relative overflow-hidden rounded-xl border border-accent/30 bg-panel shadow-sm">
              <div
                className="h-1 w-full bg-gradient-to-r from-[#006b9e] via-[#38a3d6] to-[#22c55e]"
                aria-hidden="true"
              />
              <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent mb-1">
                    <Education size={16} />
                    <span>{t("ctlBannerTitle")}</span>
                  </div>
                  <p className="text-sm text-muted leading-relaxed max-w-xl">
                    {t("ctlBannerBody")}
                  </p>
                </div>
                <Link
                  href={projectsPath(locale, "careertalklab")}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-on-accent hover:bg-accent-dim no-underline transition-colors"
                >
                  <span>{t("ctlBannerCta")}</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          )}

          {tags.length > 0 && <TagCloud tags={tags} />}

          <div className="flex flex-col gap-6">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block rounded-xl border border-hair bg-panel p-6 md:p-8 shadow-sm transition-all hover:border-accent/50 hover:shadow-md no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  {post.frontmatter.tags && post.frontmatter.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {post.frontmatter.tags.map((postTag) => (
                        <Tag key={postTag} type={postTag === "CareerTalkLab" ? "blue" : "gray"}>
                          {postTag}
                        </Tag>
                      ))}
                    </div>
                  )}
                  {post.frontmatter.date && (
                    <time className="font-mono text-xs uppercase tracking-[0.08em] text-faint">
                      {new Date(post.frontmatter.date).toLocaleDateString(dateLocale, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  )}
                </div>

                <h2 className="mb-2.5 font-serif text-2xl sm:text-3xl text-ink transition-colors group-hover:text-accent group-focus-visible:text-accent leading-snug">
                  {post.frontmatter.title}
                </h2>
                {post.frontmatter.description && (
                  <p className="mb-4 text-sm sm:text-base leading-relaxed text-muted">
                    {post.frontmatter.description}
                  </p>
                )}
                <div className="pt-3 border-t border-hair/70 inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent group-hover:text-accent-dim">
                  <span>{t("readArticle")}</span>
                  <ArrowRight size={14} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
