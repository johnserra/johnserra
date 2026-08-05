import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase";
import { processContentIndexingBatch, type ContentIndexingJob } from "@/lib/knowledge/wordpress-indexer";
import type { WordPressCollectionType } from "@/lib/wordpress/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTIONS: Record<ContentIndexingJob["content_type"], WordPressCollectionType> = {
  post: "posts",
  page: "pages",
  js_project: "projects",
};

function validSignature(body: string, signature: string | null): boolean {
  const secret = process.env.WORDPRESS_WEBHOOK_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;

  const supplied = signature.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;

  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"));
}
function parseJob(body: string): ContentIndexingJob | null {
  try {
    const value = JSON.parse(body) as Partial<ContentIndexingJob>;
    if (
      typeof value.event_id !== "string" ||
      !Number.isInteger(value.wordpress_id) ||
      value.wordpress_id! <= 0 ||
      (value.content_type !== "post" && value.content_type !== "page" && value.content_type !== "js_project") ||
      (value.locale !== "en" && value.locale !== "tr") ||
      (value.operation !== "upsert" && value.operation !== "delete")
    ) return null;
    return value as ContentIndexingJob;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  if (!validSignature(body, request.headers.get("x-johnserra-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const job = parseJob(body);
  if (!job) return Response.json({ error: "Invalid payload" }, { status: 400 });

  const collection = COLLECTIONS[job.content_type];
  revalidateTag(`wp:${collection}:${job.locale}`, "max");
  revalidateTag(`wp:item:${job.wordpress_id}`, "max");
  revalidateTag("wp:translations", "max");

  const supabase = createAdminClient();
  const { data: messageId, error } = await supabase.rpc("enqueue_content_indexing_job", { job });
  if (error) {
    console.error("Failed to enqueue WordPress indexing job", error);
    return Response.json({ error: "Queue unavailable" }, { status: 503 });
  }

  after(async () => {
    try {
      await processContentIndexingBatch(1);
    } catch (caught) {
      console.error("Immediate content indexing attempt failed", caught);
    }
  });

  return Response.json({ ok: true, queued: messageId }, { status: 202 });
}
