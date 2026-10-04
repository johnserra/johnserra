import { ImageResponse } from "next/og";
import { getSiteContentBySlug } from "@/lib/site-content";
import type { Locale } from "@/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale, slug } = await params;
  if (locale !== "en" && locale !== "tr") return new Response(null, { status: 404 });
  const article = await getSiteContentBySlug("blog", slug, locale as Locale);
  if (!article) return new Response(null, { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          width: "100%", height: "100%", padding: "64px 72px",
          background: "#ffffff", color: "#222222", borderTop: "16px solid #0099cc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, color: "#007aa3" }}>JOHN SERRA</div>
        <div style={{ display: "flex", fontSize: article.frontmatter.title.length > 90 ? 48 : 60, fontWeight: 700, lineHeight: 1.15 }}>
          {article.frontmatter.title}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#007aa3" }}>
          <span>johnserra.com</span>
          <span>{locale === "tr" ? "Yazılar" : "Articles"}</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
