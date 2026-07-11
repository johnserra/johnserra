import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { getContentBySlug, getContentSlugs } from "@/lib/content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProseLayout } from "@/components/ui/ProseLayout";
import { Callout } from "@/components/ui/Callout";
import { ArrowLeft, LogoGithub } from "@carbon/icons-react";
import { Tag } from "@/components/ui/Tag";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getProjectSchema } from "@/lib/schema";
import type { Metadata } from "next";
import type { Locale } from "@/types";

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of routing.locales) {
    const slugs = getContentSlugs("projects", locale);
    for (const slug of slugs) {
      params.push({ locale, slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const content = getContentBySlug("projects", slug, locale as Locale);
  if (!content) return {};
  return {
    title: `${content.frontmatter.title} — John Serra`,
    description: content.frontmatter.description,
  };
}

export default async function ProjectCaseStudy({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Portfolio");
  const content = getContentBySlug("projects", slug, locale as Locale);
  if (!content) return notFound();

  const jsonLd = getProjectSchema(slug, content.frontmatter, locale);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Header />
      <main className="min-h-screen bg-ground py-16 text-ink">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
          {/* Back link */}
          <Link
            href="/projects"
            className="mb-10 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-muted transition-colors hover:text-accent"
          >
            <ArrowLeft size={16} />
            {t("backToPortfolio")}
          </Link>

          {/* Tags */}
          {content.frontmatter.tags && (
            <div className="flex flex-wrap gap-2 mb-6">
              {content.frontmatter.tags.map((tag) => (
                <Tag key={tag} type="blue">
                  {tag}
                </Tag>
              ))}
            </div>
          )}

          {/* Title */}
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-ink">
            {content.frontmatter.title}
          </h1>
          {content.frontmatter.description && (
            <p className="mb-6 text-xl leading-relaxed text-ink-soft">
              {content.frontmatter.description}
            </p>
          )}
          {content.frontmatter.githubUrl && (
            <a
              href={content.frontmatter.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-12 inline-flex cursor-pointer items-center justify-center gap-2 rounded-card border border-accent-dim bg-accent/10 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.1em] text-accent transition-colors hover:border-accent"
            >
              <LogoGithub size={18} />
              {t("viewOnGithub")}
            </a>
          )}

          <hr className="mb-12 border-hair" />
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
