import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { Resend } from "resend";

type ContactRequest = {
  name?: string;
  email?: string;
  message?: string;
  company?: string;
  service?: string;
  budget?: string;
  timeline?: string;
  source?: string;
};

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { fname: parts[0], lname: parts.slice(1).join(" ") };
}

async function syncJetpackCrm(data: Required<Pick<ContactRequest, "name" | "email" | "message">> & ContactRequest) {
  const endpoint = process.env.JETPACK_CRM_API_URL;
  const apiKey = process.env.JETPACK_CRM_API_KEY;
  const apiSecret = process.env.JETPACK_CRM_API_SECRET;

  if (!endpoint || !apiKey || !apiSecret) return;

  const url = new URL("create_customer", endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("api_secret", apiSecret);

  const { fname, lname } = splitName(data.name);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: data.email,
      fname,
      lname,
      status: "Lead",
      tags: ["website-inquiry", data.service ? `service-${data.service}` : "general-contact"],
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) throw new Error(`Jetpack CRM returned ${response.status}`);
}

export async function POST(req: NextRequest) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const data = (await req.json()) as ContactRequest;
  const { name, email, message } = data;

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  if (name.length > 120 || email.length > 254 || message.length > 5000) {
    return NextResponse.json({ error: "Invalid field length" }, { status: 400 });
  }

  const details = [
    data.company && `Company: ${data.company}`,
    data.service && `Service: ${data.service}`,
    data.budget && `Budget: ${data.budget}`,
    data.timeline && `Timeline: ${data.timeline}`,
    `Message: ${message}`,
  ].filter(Boolean).join("\n");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("contact_messages")
    .insert([{ name, email, message: details }]);

  if (error) {
    console.error("Supabase insert error:", error);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }

  await resend.emails.send({
    from: "Contact Form <contact@cantactform.serra.us>",
    to: "john@serra.us",
    replyTo: email,
    subject: `${data.source === "services" ? "New analytics inquiry" : "New message"} from ${name}`,
    text: `Name: ${name}\nEmail: ${email}\n${details}`,
  });

  try {
    await syncJetpackCrm({ ...data, name, email, message });
  } catch (crmError) {
    console.error("Jetpack CRM sync failed:", crmError instanceof Error ? crmError.message : "Unknown error");
  }

  return NextResponse.json({ success: true });
}
