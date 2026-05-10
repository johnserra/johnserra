import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getContentBySlug } from "@/lib/content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProseLayout } from "@/components/ui/ProseLayout";
import type { Metadata } from "next";
import type { Locale } from "@/types";

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const content = getContentBySlug("about", "index", locale as Locale);
  if (!content) notFound();

import { Callout } from "@/components/ui/Callout";

// ... inside the component
  return (
    <>
      <Header />
      <main className="min-h-screen bg-zinc-50 dark:bg-black py-16">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
          <ProseLayout>
            <MDXRemote
              source={content.content}
              components={{ Callout }}
              options={{
                mdxOptions: {
                  remarkPlugins: [remarkGfm],
                  rehypePlugins: [rehypeSlug],
                },
              }}
            />
          </ProseLayout>
        </div>
      </main>
      <Footer />
    </>
  );
}
