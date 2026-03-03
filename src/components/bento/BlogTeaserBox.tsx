import { Link } from "@/i18n/navigation";
import { getAllContent } from "@/lib/content";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/types";

interface BlogTeaserBoxProps {
  locale: Locale;
}

export async function BlogTeaserBox({ locale }: BlogTeaserBoxProps) {
  const t = await getTranslations("BlogTeaser");
  const posts = getAllContent("blog", locale).slice(0, 3);
  const dateLocale = locale === "tr" ? "tr-TR" : "en-US";

  return (
    <div className="flex flex-col gap-5 h-full">
      <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{t("heading")}</h2>

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
                  {new Date(post.frontmatter.date).toLocaleDateString(dateLocale, {
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
        {t("readMore")}
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}
