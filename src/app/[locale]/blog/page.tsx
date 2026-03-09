import { Link } from "@/i18n/navigation";
import { getAllContent } from "@/lib/content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TagCloud } from "@/components/blog/TagCloud";
import { Clock, Users } from "lucide-react";
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
      <main className="min-h-screen bg-zinc-50 dark:bg-black py-16">
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
                className="group block p-6 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
              >
                {post.frontmatter.tags && post.frontmatter.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {post.frontmatter.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                      >
                        {tag}
                      </span>
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
                      <Users size={14} />
                      {tRecipes("servings", { count: post.frontmatter.servings })}
                    </span>
                  )}
                  {isRecipe(post) && post.frontmatter.totalTime && (
                    <span className="flex items-center gap-1.5 text-sm text-zinc-400 dark:text-zinc-500">
                      <Clock size={14} />
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
