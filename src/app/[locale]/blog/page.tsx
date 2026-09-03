import { Link } from "@/i18n/navigation";
import { getAllSiteContent } from "@/lib/site-content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TagCloud } from "@/components/blog/TagCloud";
import { Tag } from "@/components/ui/Tag";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import type { Locale } from "@/types";

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tag?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Blog" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function BlogPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { tag } = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("Blog");
  const allPosts = await getAllSiteContent("blog", locale as Locale);
  const dateLocale = locale === "tr" ? "tr-TR" : "en-US";

  // Build tag counts
  const tagCounts = new Map<string, number>();
  for (const post of allPosts) {
    for (const t of post.frontmatter.tags ?? []) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }
  const tags = Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Filter by tag if specified
  const posts = tag
    ? allPosts.filter((p) => p.frontmatter.tags?.includes(tag))
    : allPosts;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-ground py-16 text-ink">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
          <h1 className="mb-4 font-display text-4xl uppercase tracking-tight text-ink">{t("title")}</h1>
          <p className="mb-8 text-lg text-ink-soft">
            {t("subtitle")}
          </p>

          {tags.length > 0 && <TagCloud tags={tags} />}

          <div className="flex flex-col gap-8">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block rounded-card border border-hair bg-panel p-6 transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {post.frontmatter.tags && post.frontmatter.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {post.frontmatter.tags.map((tag) => (
                      <Tag key={tag}>
                        {tag}
                      </Tag>
                    ))}
                  </div>
                )}
                <h2 className="mb-2 text-xl font-bold text-ink transition-colors group-hover:text-accent">
                  {post.frontmatter.title}
                </h2>
                {post.frontmatter.description && (
                  <p className="mb-3 leading-relaxed text-ink-soft">
                    {post.frontmatter.description}
                  </p>
                )}
                <div className="flex items-center gap-4">
                  {post.frontmatter.date && (
                    <time className="font-mono text-xs uppercase tracking-[0.1em] text-faint">
                      {new Date(post.frontmatter.date).toLocaleDateString(dateLocale, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
