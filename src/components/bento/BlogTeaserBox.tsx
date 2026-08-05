import { Link } from "@/i18n/navigation";
import { getAllSiteContent } from "@/lib/site-content";
import { ArrowRight } from "@carbon/icons-react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/types";

interface BlogTeaserBoxProps {
  locale: Locale;
}

export async function BlogTeaserBox({ locale }: BlogTeaserBoxProps) {
  const t = await getTranslations("BlogTeaser");
  const posts = (await getAllSiteContent("blog", locale)).slice(0, 3);
  const dateLocale = locale === "tr" ? "tr-TR" : "en-US";

  return (
    <div className="flex flex-col gap-5 h-full">
      <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-muted">{t("heading")}</h2>

      <ul className="flex flex-col gap-4 flex-1">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              className="group flex flex-col gap-0.5"
            >
              <span className="text-sm font-medium tracking-tight text-ink group-hover:text-accent transition-colors leading-snug">
                {post.frontmatter.title}
              </span>
              {post.frontmatter.date && (
                <time className="font-mono text-xs text-faint">
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
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-accent transition-colors"
      >
        {t("readMore")}
        <ArrowRight size={14} />
      </Link>
    </div>
  );
}
