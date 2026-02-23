import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { getContentBySlug, getContentSlugs } from "@/lib/content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProseLayout } from "@/components/ui/ProseLayout";
import { ArrowLeft, Clock, Globe, Users } from "lucide-react";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getContentSlugs("recipes").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const content = getContentBySlug("recipes", slug);
  if (!content) return {};
  return {
    title: `${content.frontmatter.title} — John Serra`,
    description: content.frontmatter.description,
  };
}

export default async function RecipePage({ params }: Props) {
  const { slug } = await params;
  const content = getContentBySlug("recipes", slug);
  if (!content) notFound();

  const { frontmatter } = content;

  return (
    <>
      <Header />
      <main className="min-h-screen bg-zinc-50 dark:bg-black py-16">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
          {/* Back link */}
          <Link
            href="/about"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors mb-10"
          >
            <ArrowLeft size={16} />
            Back
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
            <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
              {frontmatter.description}
            </p>
          )}

          {/* Recipe meta */}
          {(frontmatter.cuisine || frontmatter.servings || frontmatter.prepTime || frontmatter.cookTime || frontmatter.totalTime) && (
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
                    Serves <strong className="text-zinc-900 dark:text-zinc-50">{frontmatter.servings}</strong>
                  </span>
                </div>
              )}
              {frontmatter.prepTime && (
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-zinc-400" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Prep <strong className="text-zinc-900 dark:text-zinc-50">{frontmatter.prepTime}</strong>
                  </span>
                </div>
              )}
              {frontmatter.cookTime && (
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-zinc-400" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Cook <strong className="text-zinc-900 dark:text-zinc-50">{frontmatter.cookTime}</strong>
                  </span>
                </div>
              )}
              {frontmatter.totalTime && (
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-zinc-400" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Total <strong className="text-zinc-900 dark:text-zinc-50">{frontmatter.totalTime}</strong>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Content */}
          <ProseLayout>
            <MDXRemote
              source={content.content}
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
