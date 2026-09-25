/** Publish only the reviewed EN/TR privacy-policy content to its existing WordPress pages. */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluate } from "@mdx-js/mdx";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import remarkGfm from "remark-gfm";

const pages = [
  { id: 47, locale: "en", expectedTitle: "Privacy Policy" },
  { id: 62, locale: "tr", expectedTitle: "Gizlilik Politikası" },
] as const;
const apply = process.argv.includes("--apply");
const base = process.env.WORDPRESS_API_URL;
const username = process.env.WORDPRESS_USERNAME;
const password = process.env.WORDPRESS_APPLICATION_PASSWORD;
if (!base || !username || !password) throw new Error("WordPress URL or credentials are missing");

const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
for (const page of pages) {
  const source = readFileSync(resolve(`content/${page.locale}/privacy-policy/index.mdx`), "utf8");
  if (!source.includes(page.expectedTitle) || !source.includes("Gemini")) throw new Error(`Unexpected ${page.locale} policy source`);
  const rendered = await evaluate(source, { ...jsxRuntime, remarkPlugins: [remarkGfm], useMDXComponents: () => ({}) });
  const content = renderToStaticMarkup(createElement(rendered.default));
  const url = new URL(`wp/v2/pages/${page.id}?context=edit`, base.endsWith("/") ? base : `${base}/`);
  const currentResponse = await fetch(url, { headers: { Authorization: authorization } });
  if (!currentResponse.ok) throw new Error(`Cannot inspect ${page.locale} policy page: HTTP ${currentResponse.status}`);
  const current = await currentResponse.json() as { id: number; slug: string; status: string; title: { raw: string }; content: { raw: string } };
  if (current.id !== page.id || current.status !== "publish" || current.title.raw !== page.expectedTitle) {
    throw new Error(`Unexpected ${page.locale} WordPress page identity or publication state: ${JSON.stringify({ id: current.id, slug: current.slug, status: current.status, title: current.title.raw })}`);
  }
  if (!apply) {
    const notice = page.locale === "en" ? "Conversation saving is off by default" : "Sohbet kaydetme varsayılan olarak kapalıdır";
    process.stdout.write(`${page.locale}: verified published page ${page.id}; approved notice ${current.content.raw.includes(notice) ? "present" : "absent"}\n`);
    continue;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) throw new Error(`Cannot update ${page.locale} policy page: HTTP ${response.status}`);
  const updated = await response.json() as { id: number; status: string; modified_gmt?: string };
  if (updated.id !== page.id || updated.status !== "publish") throw new Error(`Unexpected ${page.locale} WordPress update result`);
  process.stdout.write(`${page.locale}: updated published page ${page.id} at ${updated.modified_gmt ?? "unknown time"}\n`);
}
