import Link from "next/link";
import { getAllContent } from "@/lib/content";
import { ArrowRight } from "lucide-react";

export async function BlogTeaserBox() {
  const posts = getAllContent("blog").slice(0, 3);

  return (
    <div className="flex flex-col gap-5 h-full">
      <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">From the Blog</h2>

      <ul className="flex flex-col gap-4 flex-1">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="group flex flex-col gap-0.5"
            >
              <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug">
                {post.frontmatter.title}
              </span>
              {post.frontmatter.date && (
                <time className="text-xs text-zinc-400 dark:text-zinc-500">
                  {new Date(post.frontmatter.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
      >
        Read the blog
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}
