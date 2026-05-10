import { notFound } from "next/navigation";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { getContentBySlug, getContentSlugs } from "@/lib/content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProseLayout } from "@/components/ui/ProseLayout";
import { ArrowLeft, Clock, Globe, Users } from "lucide-react";
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
    const slugs = getContentSlugs("blog", locale);
    for (const slug of slugs) {
      params.push({ locale, slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = getContentBySlug("blog", slug, locale as Locale);
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
  const content = getContentBySlug("blog", slug, locale as Locale);
  if (!content) notFound();

  const { frontmatter } = content;
  const jsonLd = getBlogPostSchema(slug, frontmatter, locale, content.content);

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
      <Header />
      <main className="min-h-screen bg-zinc-50 dark:bg-black py-16">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
          {/* Back link */}
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors mb-10"
          >
            <ArrowLeft size={16} />
            {t("backToBlog")}
          </Link>

          {/* Tags */}
          {frontmatter.tags && (
            <div className="flex flex-wrap gap-2 mb-6">
              {frontmatter.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-medium px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">
            {frontmatter.title}
          </h1>

          {frontmatter.description && (
            <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
              {frontmatter.description}
            </p>
          )}

          {frontmatter.date && (
            <time className="block text-sm text-zinc-400 dark:text-zinc-500 mb-10">
              {new Date(frontmatter.date).toLocaleDateString(dateLocale, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          )}

          {frontmatter.coverImage && (
            <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden mb-10">
              <Image
                src={frontmatter.coverImage}
                alt={frontmatter.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}

          {/* Recipe metadata */}
          {hasRecipeMeta && (
            <div className="flex flex-wrap gap-6 p-6 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 mb-10">
              {frontmatter.cuisine && (
                <div className="flex items-center gap-2">
                  <Globe size={16} className="text-zinc-400" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    <strong className="text-zinc-900 dark:text-zinc-50">{frontmatter.cuisine}</strong>
                  </span>
                </div>
              )}
              {frontmatter.servings && (
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-zinc-400" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {tRecipes("serves")} <strong className="text-zinc-900 dark:text-zinc-50">{frontmatter.servings}</strong>
                  </span>
                </div>
              )}
              {frontmatter.prepTime && (
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-zinc-400" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {tRecipes("prep")} <strong className="text-zinc-900 dark:text-zinc-50">{frontmatter.prepTime}</strong>
                  </span>
                </div>
              )}
              {frontmatter.cookTime && (
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-zinc-400" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {tRecipes("cook")} <strong className="text-zinc-900 dark:text-zinc-50">{frontmatter.cookTime}</strong>
                  </span>
                </div>
              )}
              {frontmatter.totalTime && (
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-zinc-400" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {tRecipes("total")} <strong className="text-zinc-900 dark:text-zinc-50">{frontmatter.totalTime}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

import { Callout } from "@/components/ui/Callout";

// ... inside the component
          {/* Content */}
          <ProseLayout>
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
          </ProseLayout>
        </div>
      </main>
      <Footer />
    </>
  );
}
