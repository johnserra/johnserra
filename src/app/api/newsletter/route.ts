import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

type NewsletterRequest = {
  email?: string;
  locale?: string;
  topic?: string;
  sourcePath?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function sanitizePath(raw?: string): string {
  if (!raw || typeof raw !== "string") return "/blog";
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/blog";
  return trimmed.split(/[?#]/u)[0].slice(0, 160) || "/blog";
}

export async function POST(req: NextRequest) {
  let data: NewsletterRequest;
  try {
    data = (await req.json()) as NewsletterRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const locale = data.locale === "tr" ? "tr" : "en";
  const topic = data.topic === "all" ? "all" : "analytics";
  const sourcePath = sanitizePath(data.sourcePath);

  const supabase = createAdminClient();
  const { error: subscriberError } = await supabase
    .from("newsletter_subscribers")
    .upsert(
      [{ email, locale, topic, source_path: sourcePath }],
      { onConflict: "email" }
    );

  if (subscriberError) {
    // Duplicate key is idempotent success; if the table is not migrated yet, fall back to contact_messages so no signup is lost.
    if (subscriberError.code !== "23505") {
      const { error: fallbackError } = await supabase
        .from("contact_messages")
        .insert([
          {
            name: "Newsletter Subscriber",
            email,
            message: [
              `Subscription: Practical Analytics Email Updates (${topic})`,
              `Locale: ${locale}`,
              `Source path: ${sourcePath}`,
            ].join("\n"),
          },
        ]);

      if (fallbackError) {
        console.error("Supabase newsletter insert error:", subscriberError, fallbackError);
        return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true });
}
