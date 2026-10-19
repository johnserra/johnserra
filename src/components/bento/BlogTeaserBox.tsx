import { Link } from "@/i18n/navigation";
import { getAllSiteContent } from "@/lib/site-content";
import { ArrowRight, Blog } from "@carbon/icons-react";
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
    <section className="border-t border-hair bg-ground px-4 py-16 md:px-6 md:py-24">
      <div className="mx-auto max-w-6xl">
        {/* Header & Section / Category Pills */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 mb-3">
              <Blog size={14} className="text-accent" />
              <span className="font-mono text-xs font-medium uppercase tracking-wider text-accent">
                {t("eyebrow")}
              </span>
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink tracking-tight leading-tight mb-3">
              {t("title")}
            </h2>
            <p className="text-base md:text-lg text-muted leading-relaxed">
              {t("subtitle")}
            </p>
          </div>

          <Link
            href="/blog"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-hair bg-panel px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent hover:bg-panel-2 transition-colors no-underline"
          >
            <span>{t("readMore")}</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {/* Blog Section Quick-Links (including CareerTalkLab section) */}
        <div className="flex flex-wrap items-center gap-2.5 mb-8">
          <Link
            href="/blog"
            className="inline-flex items-center rounded-lg bg-accent px-3.5 py-1.5 font-mono text-xs font-semibold text-on-accent no-underline transition-colors hover:bg-accent-dim"
          >
            {t("trackAll")}
          </Link>
          <Link
            href="/blog?section=analytics"
            className="inline-flex items-center rounded-lg border border-hair bg-panel px-3.5 py-1.5 font-mono text-xs font-medium text-ink no-underline transition-colors hover:bg-panel-2"
          >
            {t("trackAnalytics")}
          </Link>
          <Link
            href="/blog?tag=CareerTalkLab"
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-1.5 font-mono text-xs font-semibold text-accent no-underline transition-colors hover:bg-accent/20"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
            {t("trackCtl")}
          </Link>
        </div>

        {/* 3-Card Article Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {posts.map((post) => {
            const primaryTag = post.frontmatter.tags?.[0];
            return (
              <article
                key={post.slug}
                className="flex flex-col justify-between rounded-xl border border-hair bg-panel p-6 shadow-sm transition-all hover:border-accent/50 hover:shadow-md"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    {primaryTag && (
                      <span className="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-accent">
                        {primaryTag}
                      </span>
                    )}
                    {post.frontmatter.date && (
                      <time className="font-mono text-[11px] text-faint">
                        {new Date(post.frontmatter.date).toLocaleDateString(dateLocale, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    )}
                  </div>

                  <h3 className="font-serif text-xl sm:text-2xl text-ink leading-snug mb-3">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="text-ink hover:text-accent no-underline transition-colors"
                    >
                      {post.frontmatter.title}
                    </Link>
                  </h3>

                  {post.frontmatter.description && (
                    <p className="text-sm text-muted leading-relaxed mb-6 line-clamp-3">
                      {post.frontmatter.description}
                    </p>
                  )}
                </div>

                <div className="pt-4 border-t border-hair/70">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="inline-flex w-full items-center justify-between font-mono text-xs font-semibold uppercase tracking-wider text-accent hover:text-accent-dim no-underline transition-colors"
                  >
                    <span>{t("readArticle")}</span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
