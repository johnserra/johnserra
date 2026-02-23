import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { getContentBySlug } from "@/lib/content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProseLayout } from "@/components/ui/ProseLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — John Serra",
  description:
    "Account Manager, business development strategist, and data-driven problem solver with decades of experience across manufacturing, education, and urban mobility.",
};

export default function AboutPage() {
  const content = getContentBySlug("about", "index");
  if (!content) notFound();

  return (
    <>
      <Header />
      <main className="min-h-screen bg-zinc-50 dark:bg-black py-16">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8">
          <ProseLayout>
            <MDXRemote
              source={content.content}
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
