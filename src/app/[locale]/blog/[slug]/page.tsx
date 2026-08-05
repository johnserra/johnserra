import { notFound } from "next/navigation";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { getSiteContentBySlug, getSiteContentSlugs, getSiteTranslationSlug } from "@/lib/site-content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProseLayout } from "@/components/ui/ProseLayout";
import { Callout } from "@/components/ui/Callout";
import { WordPressContent } from "@/components/ui/WordPressContent";
import { ArrowLeft, Time, Globe, UserMultiple } from "@carbon/icons-react";
import { Tag } from "@/components/ui/Tag";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getBlogPostSchema } from "@/lib/schema";
import type { Metadata } from "next";
import type { Locale } from "@/types";

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
  return {
    title: `${content.frontmatter.title} — John Serra`,
    description: content.frontmatter.description,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Blog");
  const tRecipes = await getTranslations("Recipes");
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

  const dateLocale = locale === "tr" ? "tr-TR" : "en-US";
  const hasRecipeMeta =
    frontmatter.cuisine ||
    frontmatter.servings ||
    frontmatter.prepTime ||
    frontmatter.cookTime ||
    frontmatter.totalTime;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header alternateLocalePath={alternatePath} />
      <main className="min-h-screen bg-ground py-16 text-ink">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
          {/* Back link */}
          <Link
            href="/blog"
            className="mb-10 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-muted transition-colors hover:text-accent"
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
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-ink">
            {frontmatter.title}
          </h1>

          {frontmatter.description && (
            <p className="mb-4 text-xl leading-relaxed text-ink-soft">
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
            <div className="relative mb-10 aspect-[16/9] w-full overflow-hidden rounded-card border border-hair">
              <Image
                src={frontmatter.coverImage}
                alt={frontmatter.coverImageAlt ?? frontmatter.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}

          {/* Recipe metadata */}
          {hasRecipeMeta && (
            <div className="mb-10 flex flex-wrap gap-6 rounded-card border border-hair bg-panel p-6 font-mono text-xs uppercase tracking-[0.1em] text-muted">
              {frontmatter.cuisine && (
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-faint" />
                  <span>
                    <strong className="text-ink">{frontmatter.cuisine}</strong>
                  </span>
                </div>
              )}
              {frontmatter.servings && (
                <div className="flex items-center gap-2">
                  <UserMultiple size={16} className="text-faint" />
                  <span>
                    {tRecipes("serves")} <strong className="text-ink">{frontmatter.servings}</strong>
                  </span>
                </div>
              )}
              {frontmatter.prepTime && (
                <div className="flex items-center gap-2">
                  <Time size={16} className="text-faint" />
                  <span>
                    {tRecipes("prep")} <strong className="text-ink">{frontmatter.prepTime}</strong>
                  </span>
                </div>
              )}
              {frontmatter.cookTime && (
                <div className="flex items-center gap-2">
                  <Time size={16} className="text-faint" />
                  <span>
                    {tRecipes("cook")} <strong className="text-ink">{frontmatter.cookTime}</strong>
                  </span>
                </div>
              )}
              {frontmatter.totalTime && (
                <div className="flex items-center gap-2">
                  <Time size={16} className="text-faint" />
                  <span>
                    {tRecipes("total")} <strong className="text-ink">{frontmatter.totalTime}</strong>
                  </span>
                </div>
              )}
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
        </div>
      </main>
      <Footer />
    </>
  );
}
