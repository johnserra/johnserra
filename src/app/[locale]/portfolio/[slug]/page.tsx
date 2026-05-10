import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { getContentBySlug, getContentSlugs } from "@/lib/content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProseLayout } from "@/components/ui/ProseLayout";
import { ArrowLeft, Github } from "lucide-react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getPortfolioSchema } from "@/lib/schema";
import type { Metadata } from "next";
import type { Locale } from "@/types";

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of routing.locales) {
    const slugs = getContentSlugs("portfolio", locale);
    for (const slug of slugs) {
      params.push({ locale, slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = getContentBySlug("portfolio", slug, locale as Locale);
  if (!content) return {};
  return {
    title: `${content.frontmatter.title} — John Serra`,
    description: content.frontmatter.description,
  };
}

export default async function PortfolioCaseStudy({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Portfolio");
  const content = getContentBySlug("portfolio", slug, locale as Locale);
  if (!content) return notFound();

  const jsonLd = getPortfolioSchema(slug, content.frontmatter, locale);

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
            href="/portfolio"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors mb-10"
          >
            <ArrowLeft size={16} />
            {t("backToPortfolio")}
          </Link>

          {/* Tags */}
          {content.frontmatter.tags && (
            <div className="flex flex-wrap gap-2 mb-6">
              {content.frontmatter.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-medium px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
            {content.frontmatter.title}
          </h1>
          {content.frontmatter.description && (
            <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-6 leading-relaxed">
              {content.frontmatter.description}
            </p>
          )}
          {content.frontmatter.githubUrl && (
            <a
              href={content.frontmatter.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors mb-12"
            >
              <Github size={16} />
              {t("viewOnGithub")}
            </a>
          )}

          <hr className="border-zinc-200 dark:border-zinc-800 mb-12" />

import { Callout } from "@/components/ui/Callout";

// ... later
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
