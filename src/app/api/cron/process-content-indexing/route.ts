import { processContentIndexingBatch } from "@/lib/knowledge/wordpress-indexer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json({ ok: true, ...(await processContentIndexingBatch(5)) });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error("Content indexing cron failed", caught);
    return Response.json({ error: message }, { status: 500 });
  }
}
