"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { TagCloud } from "@/components/blog/TagCloud";
import { Tag } from "@/components/ui/Tag";
import { ArrowRight, Education } from "@carbon/icons-react";
import type { Locale } from "@/types";

export interface BlogListingPost {
  slug: string;
  title: string;
  description?: string;
  formattedDate?: string;
  tags?: string[];
  categories?: string[];
}

export interface BlogListingLabels {
  sectionLabel: string;
  trackAll: string;
  trackAnalytics: string;
  trackCtl: string;
  ctlBannerTitle: string;
  ctlBannerBody: string;
  ctlBannerCta: string;
  ctlBannerLiveCta: string;
  readArticle: string;
}

interface BlogListingProps {
  locale: Locale;
  posts: BlogListingPost[];
  tags: { name: string; count: number }[];
  ctlProjectHref: string;
  labels: BlogListingLabels;
}

function isCtlPost(tags?: string[], categories?: string[]): boolean {
  const combined = [...(tags ?? []), ...(categories ?? [])];
  return combined.some((item) => item.toLowerCase() === "careertalklab");
}

function BlogListingView({
  locale,
  posts: allPosts,
  tags,
  ctlProjectHref,
  labels,
  activeTag,
  activeSection,
  interactiveTags,
}: BlogListingProps & {
  activeTag: string | null;
  activeSection: string | null;
  interactiveTags: boolean;
}) {
  const isCtlActive = activeTag?.toLowerCase() === "careertalklab" || activeSection === "ctl";
  const isAnalyticsActive = !activeTag && activeSection === "analytics";
  const isAllActive = !activeTag && !activeSection;

  const posts = allPosts.filter((p) => {
    if (isCtlActive && !activeTag) {
      return isCtlPost(p.tags, p.categories);
    }
    if (isAnalyticsActive) {
      return !isCtlPost(p.tags, p.categories);
    }
    if (activeTag) {
      return p.tags?.some((pt) => pt.toLowerCase() === activeTag.toLowerCase());
    }
    return true;
  });

  return (
    <>
      {/* Section / Category Switcher (All Writing | Small-Business Analytics | CareerTalkLab) */}
      <div className="mb-8">
        <p className="font-mono text-xs uppercase tracking-wider text-muted mb-2.5">
          {labels.sectionLabel}
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/blog"
            className={`inline-flex items-center rounded-lg px-4 py-2 font-mono text-xs font-semibold no-underline transition-all ${
              isAllActive
                ? "bg-accent text-on-accent shadow-xs"
                : "border border-hair bg-panel text-ink hover:bg-panel-2"
            }`}
          >
            {labels.trackAll}
          </Link>
          <Link
            href="/blog?section=analytics"
            className={`inline-flex items-center rounded-lg px-4 py-2 font-mono text-xs font-semibold no-underline transition-all ${
              isAnalyticsActive
                ? "bg-accent text-on-accent shadow-xs"
                : "border border-hair bg-panel text-ink hover:bg-panel-2"
            }`}
          >
            {labels.trackAnalytics}
          </Link>
          <Link
            href="/blog?tag=CareerTalkLab"
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 font-mono text-xs font-semibold no-underline transition-all ${
              isCtlActive
                ? "bg-accent text-on-accent shadow-xs"
                : "border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
            {labels.trackCtl}
          </Link>
        </div>
      </div>

      {/* CareerTalkLab Section Context Callout when viewing CareerTalkLab posts */}
      {isCtlActive && (
        <div className="mb-10 relative overflow-hidden rounded-xl border border-accent/30 bg-panel shadow-sm">
          <div
            className="h-1 w-full bg-gradient-to-r from-[#006b9e] via-[#38a3d6] to-[#22c55e]"
            aria-hidden="true"
          />
          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent mb-1">
                <Education size={16} />
                <span>{labels.ctlBannerTitle}</span>
              </div>
              <p className="text-sm text-muted leading-relaxed max-w-xl">
                {labels.ctlBannerBody}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2.5">
              <Link
                href={ctlProjectHref}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-on-accent hover:bg-accent-dim no-underline transition-colors"
              >
                <span>{labels.ctlBannerCta}</span>
                <ArrowRight size={14} />
              </Link>
              <a
                href={locale === "tr" ? "https://careertalklab.com/tr" : "https://careertalklab.com"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent/30 bg-ground px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent hover:bg-accent/10 no-underline transition-colors"
              >
                <span>{labels.ctlBannerLiveCta}</span>
                <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </div>
      )}

      {tags.length > 0 && interactiveTags && <TagCloud tags={tags} />}

      <div className="flex flex-col gap-6">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group block rounded-xl border border-hair bg-panel p-6 md:p-8 shadow-sm transition-all hover:border-accent/50 hover:shadow-md no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((postTag) => (
                    <Tag key={postTag} type={postTag === "CareerTalkLab" ? "blue" : "gray"}>
                      {postTag}
                    </Tag>
                  ))}
                </div>
              )}
              {post.formattedDate && (
                <time className="font-mono text-xs uppercase tracking-[0.08em] text-faint">
                  {post.formattedDate}
                </time>
              )}
            </div>

            <h2 className="mb-2.5 font-serif text-2xl sm:text-3xl text-ink transition-colors group-hover:text-accent group-focus-visible:text-accent leading-snug">
              {post.title}
            </h2>
            {post.description && (
              <p className="mb-4 text-sm sm:text-base leading-relaxed text-muted">
                {post.description}
              </p>
            )}
            <div className="pt-3 border-t border-hair/70 inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent group-hover:text-accent-dim">
              <span>{labels.readArticle}</span>
              <ArrowRight size={14} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function BlogListingInteractive(props: BlogListingProps) {
  const searchParams = useSearchParams();
  const activeTag = searchParams.get("tag");
  const activeSection = searchParams.get("section");

  return (
    <BlogListingView
      {...props}
      activeTag={activeTag}
      activeSection={activeSection}
      interactiveTags
    />
  );
}

export function BlogListing(props: BlogListingProps) {
  return (
    <Suspense
      fallback={
        <BlogListingView
          {...props}
          activeTag={null}
          activeSection={null}
          interactiveTags={false}
        />
      }
    >
      <BlogListingInteractive {...props} />
    </Suspense>
  );
}
