import { Link } from "@/i18n/navigation";
import { getAllContent } from "@/lib/content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TagCloud } from "@/components/blog/TagCloud";
import { Time, UserMultiple } from "@carbon/icons-react";
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
  const tRecipes = await getTranslations("Recipes");
  const allPosts = getAllContent("blog", locale as Locale);
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

  const isRecipe = (post: (typeof posts)[0]) =>
    post.frontmatter.tags?.includes("recipe");

  return (
    <>
      <Header />
      <main className="min-h-screen bg-background text-foreground py-16">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">{t("title")}</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-8">
            {t("subtitle")}
          </p>

          {tags.length > 0 && <TagCloud tags={tags} />}

          <div className="flex flex-col gap-8">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block p-6 bg-carbon-gray-10 dark:bg-carbon-gray-90 rounded-[var(--radius-bento)] border border-carbon-gray-20 dark:border-zinc-800 hover:border-carbon-blue dark:hover:border-carbon-blue transition-colors focus-visible:ring-2 focus-visible:ring-carbon-blue focus-visible:outline-none"
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
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors mb-2">
                  {post.frontmatter.title}
                </h2>
                {post.frontmatter.description && (
                  <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed mb-3">
                    {post.frontmatter.description}
                  </p>
                )}
                <div className="flex items-center gap-4">
                  {post.frontmatter.date && (
                    <time className="text-sm text-zinc-400 dark:text-zinc-500">
                      {new Date(post.frontmatter.date).toLocaleDateString(dateLocale, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                  )}
                  {isRecipe(post) && post.frontmatter.servings && (
                    <span className="flex items-center gap-1.5 text-sm text-zinc-400 dark:text-zinc-500">
                      <UserMultiple size={16} />
                      {tRecipes("servings", { count: post.frontmatter.servings })}
                    </span>
                  )}
                  {isRecipe(post) && post.frontmatter.totalTime && (
                    <span className="flex items-center gap-1.5 text-sm text-zinc-400 dark:text-zinc-500">
                      <Time size={16} />
                      {post.frontmatter.totalTime}
                    </span>
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
