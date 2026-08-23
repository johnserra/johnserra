import { createHmac, timingSafeEqual } from "node:crypto";
import { draftMode } from "next/headers";
import { getWordPressPreviewById } from "@/lib/wordpress/content";
import { aboutPath, privacyPolicyPath, projectsPath } from "@/lib/routes";
import type { WordPressCollectionType, WordPressContentType } from "@/lib/wordpress/types";
import type { Locale } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTIONS: Record<WordPressContentType, WordPressCollectionType> = {
  post: "posts",
  page: "pages",
  js_project: "projects",
};

function validToken(contentId: number, locale: Locale, token: string | null): boolean {
  const secret = process.env.WORDPRESS_WEBHOOK_SECRET;
  if (!secret || !token || !/^[0-9a-f]{64}$/i.test(token)) return false;
  const expected = createHmac("sha256", secret).update(`${contentId}:${locale}`).digest("hex");
  return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
}
function previewPath(type: WordPressContentType, slug: string, locale: Locale, legacySourceKey?: string): string {
  const prefix = locale === "en" ? "" : `/${locale}`;
  if (type === "post") return `${prefix}/blog/${slug}`;
  if (type === "js_project") return `${prefix}${projectsPath(locale, slug)}`;
  if (legacySourceKey === `${locale}/about/index`) {
    return `${prefix}${aboutPath(locale)}`;
  }
  if (legacySourceKey === `${locale}/privacy-policy/index`) {
    return `${prefix}${privacyPolicyPath(locale)}`;
  }
  return `${prefix}/${slug}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const contentId = Number(url.searchParams.get("content_id"));
  const localeValue = url.searchParams.get("locale");
  const locale = localeValue === "tr" ? "tr" : localeValue === "en" ? "en" : null;

  if (!Number.isInteger(contentId) || contentId <= 0 || !locale || !validToken(contentId, locale, url.searchParams.get("token"))) {
    return Response.json({ error: "Invalid preview request" }, { status: 401 });
  }

  for (const [type, collection] of Object.entries(COLLECTIONS) as [WordPressContentType, WordPressCollectionType][]) {
    try {
      const item = await getWordPressPreviewById(collection, contentId);
      if (item.type !== type || item.acf?.locale !== locale) continue;
      const mode = await draftMode();
      mode.enable();
      return Response.redirect(new URL(previewPath(type, item.slug, locale, item.acf?.legacy_source_key), request.url), 307);
    } catch {
      // The ID belongs to another post type, or is unavailable to the preview user.
    }
  }

  return Response.json({ error: "Preview content not found" }, { status: 404 });
}

export async function DELETE() {
  const mode = await draftMode();
  mode.disable();
  return Response.json({ ok: true });
}
