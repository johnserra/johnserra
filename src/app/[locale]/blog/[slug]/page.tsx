import { notFound } from "next/navigation";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { getAllSiteContent, getSiteContentBySlug, getSiteContentSlugs, getSiteTranslationSlug } from "@/lib/site-content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { NewsletterSignup } from "@/components/blog/NewsletterSignup";
import { ProseLayout } from "@/components/ui/ProseLayout";
import { Callout } from "@/components/ui/Callout";
import { WordPressContent } from "@/components/ui/WordPressContent";
import { ArrowLeft, ArrowRight, ChartLineData, Compass, Education } from "@carbon/icons-react";
import { Tag } from "@/components/ui/Tag";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getBlogPostSchema } from "@/lib/schema";
import { getBlogMetadata } from "@/lib/blog-metadata";
import { dataAuditPath, projectsPath, servicesPath } from "@/lib/routes";
import type { Metadata } from "next";
import type { Locale } from "@/types";
import { AIChatWidget } from "@/components/widgets/AIChatWidget";
import { isChatEligibleArticle, isRestrictedPublicTopic } from "@/lib/chat/public-boundaries";

const ANALYTICS_KEYWORDS = [
  "analytics",
  "practical analytics",
  "data",
  "data analytics",
  "grain",
  "grain first",
  "sql",
  "excel",
  "power bi",
  "looker",
  "kpi",
  "reporting",
  "metrics",
  "small business",
  "smb",
  "data modeling",
  "data quality",
  "business intelligence",
  "analitik",
  "veri",
  "raporlama",
  "metrik",
  "kobi",
] as const;

const CTL_KEYWORDS = [
  "careertalklab",
  "errorless teaching",
  "language learning",
  "efl",
  "professional english",
] as const;

function classifyArticleTrack(tags?: string[], categories?: string[]): "analytics" | "ctl" | "other" {
  const combined = [...(tags ?? []), ...(categories ?? [])].map((item) => item.toLowerCase().trim());
  if (combined.some((item) => CTL_KEYWORDS.some((kw) => item.includes(kw)))) {
    return "ctl";
  }
  if (combined.some((item) => ANALYTICS_KEYWORDS.some((kw) => item.includes(kw)))) {
    return "analytics";
  }
  return "other";
}

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of routing.locales) {
    const slugs = await getSiteContentSlugs("blog", locale);
    for (const slug of slugs) {
      params.push({ locale, slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = await getSiteContentBySlug("blog", slug, locale as Locale);
  if (!content) return {};
  const targetLocale = (locale === "en" ? "tr" : "en") as Locale;
  const translatedSlug = await getSiteTranslationSlug(
    "blog",
    content,
    locale as Locale,
    targetLocale,
  );
  return getBlogMetadata(locale as Locale, slug, content.frontmatter, translatedSlug);
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Blog");
  const content = await getSiteContentBySlug("blog", slug, locale as Locale);
  if (!content) notFound();

  const { frontmatter } = content;
  const jsonLd = getBlogPostSchema(slug, frontmatter, locale);
  const targetLocale = (locale === "en" ? "tr" : "en") as Locale;
  const translatedSlug = await getSiteTranslationSlug(
    "blog",
    content,
    locale as Locale,
    targetLocale,
  );
  const alternatePath = translatedSlug ? `/blog/${translatedSlug}` : "/blog";

  const allPosts = await getAllSiteContent("blog", locale as Locale);
  const currentTerms = new Set(
    [...(frontmatter.tags ?? []), ...(frontmatter.categories ?? [])].map((item) => item.toLowerCase())
  );
  const relatedPosts = allPosts
    .filter((post) => post.slug !== slug)
    .map((post) => {
      const postTerms = [...(post.frontmatter.tags ?? []), ...(post.frontmatter.categories ?? [])].map((item) =>
        item.toLowerCase()
      );
      const overlap = postTerms.filter((term) => currentTerms.has(term)).length;
      return { post, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 2)
    .map((entry) => entry.post);

  const articleTrack = classifyArticleTrack(frontmatter.tags, frontmatter.categories);
  const isRestricted = isRestrictedPublicTopic({
    categories: frontmatter.categories,
    tags: frontmatter.tags,
    slug,
    title: frontmatter.title,
    restricted: frontmatter.chatRestricted === true,
  });
  const showAnalyticsSoftSell = articleTrack === "analytics" && !isRestricted;

  const dateLocale = locale === "tr" ? "tr-TR" : "en-US";
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header alternateLocalePath={alternatePath} breadcrumbTitle={frontmatter.title} />
      <main className="min-h-screen bg-ground py-16 text-ink">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
          {/* Back link */}
          <Link
            href="/blog"
            className="mb-10 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-accent transition-colors hover:text-accent-dim focus-visible:text-accent-dim"
          >
            <ArrowLeft size={16} />
            {t("backToBlog")}
          </Link>

          {/* Tags */}
          {frontmatter.tags && (
            <div className="flex flex-wrap gap-2 mb-6">
              {frontmatter.tags.map((tag) => (
                <Tag key={tag}>
                  {tag}
                </Tag>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 className="mb-3 font-serif text-4xl sm:text-5xl tracking-tight text-ink leading-tight">
            {frontmatter.title}
          </h1>

          {frontmatter.description && (
            <p className="mb-4 text-lg sm:text-xl leading-relaxed text-muted">
              {frontmatter.description}
            </p>
          )}

          {frontmatter.date && (
            <time className="mb-10 block font-mono text-xs uppercase tracking-[0.1em] text-muted">
              {new Date(frontmatter.date).toLocaleDateString(dateLocale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          )}

          {frontmatter.coverImage && (
            <div className="relative mb-10 aspect-[16/9] w-full overflow-hidden rounded-xl border border-hair shadow-sm">
              <Image
                src={frontmatter.coverImage}
                alt={frontmatter.coverImageAlt ?? frontmatter.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}

          {/* Content */}
          <ProseLayout>
            {content.format === "html" ? (
              <WordPressContent html={content.content} />
            ) : (
              <MDXRemote
                source={content.content}
                components={{ Callout }}
                options={{
                  mdxOptions: {
                    remarkPlugins: [remarkGfm],
                    rehypePlugins: [rehypeSlug],
                  },
                }}
              />
            )}
          </ProseLayout>

          {/* Article-End Contextual Links & Topic-Aware Soft-Sell */}
          <div className="mt-16 pt-10 border-t border-hair space-y-10">
            {relatedPosts.length > 0 && (
              <section aria-labelledby="related-reading-heading">
                <p className="font-mono text-xs font-semibold uppercase tracking-wider text-accent mb-2">
                  {t("articleFooter.relatedEyebrow")}
                </p>
                <h2 id="related-reading-heading" className="font-serif text-2xl sm:text-3xl text-ink tracking-tight text-balance mb-5">
                  {t("articleFooter.relatedTitle")}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {relatedPosts.map((related) => (
                    <Link
                      key={related.slug}
                      href={`/blog/${related.slug}`}
                      className="group flex flex-col justify-between rounded-xl border border-hair bg-panel p-5 transition-all hover:border-accent/50 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <div>
                        <h3 className="font-serif text-xl text-ink group-hover:text-accent transition-colors leading-snug mb-2">
                          {related.frontmatter.title}
                        </h3>
                        {related.frontmatter.description && (
                          <p className="text-sm text-muted leading-relaxed line-clamp-2 mb-4">
                            {related.frontmatter.description}
                          </p>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent group-hover:text-accent-dim">
                        <span>{t("readArticle")}</span>
                        <ArrowRight size={14} />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {showAnalyticsSoftSell ? (
              <aside className="rounded-xl border border-accent/30 bg-panel p-6 md:p-8 shadow-sm">
                <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent mb-2">
                  <ChartLineData size={16} aria-hidden="true" />
                  <span>{t("articleFooter.analyticsEyebrow")}</span>
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl text-ink tracking-tight leading-snug text-balance mb-2.5">
                  {t("articleFooter.analyticsTitle")}
                </h2>
                <p className="text-sm sm:text-base text-muted leading-relaxed mb-6 max-w-2xl">
                  {t("articleFooter.analyticsDescription")}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={dataAuditPath(locale)}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-on-accent hover:bg-accent-dim no-underline transition-colors"
                  >
                    <span>{t("articleFooter.analyticsAssessmentCta")}</span>
                    <ArrowRight size={14} />
                  </Link>
                  <Link
                    href={servicesPath(locale)}
                    className="inline-flex items-center gap-2 rounded-lg border border-hair bg-ground px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-ink hover:bg-panel-2 no-underline transition-colors"
                  >
                    <span>{t("articleFooter.analyticsServicesCta")}</span>
                    <ArrowRight size={14} />
                  </Link>
                  <Link
                    href="/blog?section=analytics"
                    className="inline-flex items-center gap-2 rounded-lg border border-hair bg-ground px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent hover:bg-panel-2 no-underline transition-colors"
                  >
                    <span>{t("articleFooter.analyticsGuidesCta")}</span>
                  </Link>
                </div>
              </aside>
            ) : articleTrack === "ctl" ? (
              <aside className="rounded-xl border border-accent/30 bg-panel p-6 md:p-8 shadow-sm">
                <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent mb-2">
                  <Education size={16} aria-hidden="true" />
                  <span>{t("articleFooter.ctlEyebrow")}</span>
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl text-ink tracking-tight leading-snug text-balance mb-2.5">
                  {t("articleFooter.ctlTitle")}
                </h2>
                <p className="text-sm sm:text-base text-muted leading-relaxed mb-6 max-w-2xl">
                  {t("articleFooter.ctlDescription")}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={projectsPath(locale, "careertalklab")}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-on-accent hover:bg-accent-dim no-underline transition-colors"
                  >
                    <span>{t("articleFooter.ctlCaseStudyCta")}</span>
                    <ArrowRight size={14} />
                  </Link>
                  <Link
                    href="/blog?tag=CareerTalkLab"
                    className="inline-flex items-center gap-2 rounded-lg border border-hair bg-ground px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-ink hover:bg-panel-2 no-underline transition-colors"
                  >
                    <span>{t("articleFooter.ctlEssaysCta")}</span>
                    <ArrowRight size={14} />
                  </Link>
                  <a
                    href={locale === "tr" ? "https://careertalklab.com/tr" : "https://careertalklab.com"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-ground px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent hover:bg-accent/10 no-underline transition-colors"
                  >
                    <span>{t("articleFooter.ctlLiveCta")}</span>
                    <ArrowRight size={14} />
                  </a>
                </div>
              </aside>
            ) : (
              <aside className="rounded-xl border border-hair bg-panel p-6 md:p-8 shadow-sm">
                <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent mb-2">
                  <Compass size={16} aria-hidden="true" />
                  <span>{t("articleFooter.generalEyebrow")}</span>
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl text-ink tracking-tight leading-snug text-balance mb-2.5">
                  {t("articleFooter.generalTitle")}
                </h2>
                <p className="text-sm sm:text-base text-muted leading-relaxed mb-6 max-w-2xl">
                  {t("articleFooter.generalDescription")}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={projectsPath(locale)}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-on-accent hover:bg-accent-dim no-underline transition-colors"
                  >
                    <span>{t("articleFooter.generalProjectsCta")}</span>
                    <ArrowRight size={14} />
                  </Link>
                  <Link
                    href="/blog"
                    className="inline-flex items-center gap-2 rounded-lg border border-hair bg-ground px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-ink hover:bg-panel-2 no-underline transition-colors"
                  >
                    <span>{t("articleFooter.generalBlogCta")}</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </aside>
            )}

            <NewsletterSignup sourcePath={`/blog/${slug}`} />
          </div>
        </div>
      </main>
      <Footer />
      {isChatEligibleArticle({
        categories: frontmatter.categories,
        tags: frontmatter.tags,
        slug,
        title: frontmatter.title,
        restricted: frontmatter.chatRestricted === true,
      }) ? <AIChatWidget /> : null}
    </>
  );
}
