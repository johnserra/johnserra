import Link from "next/link";
import { getAllContent } from "@/lib/content";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Portfolio — John Serra",
  description: "Case studies in business development, digital transformation, and data-driven problem solving.",
};

export default function PortfolioPage() {
  const projects = getAllContent("portfolio");

  return (
    <>
      <Header />
      <main className="min-h-screen bg-zinc-50 dark:bg-black py-16">
        <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
              Portfolio
            </h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-400">
              Case studies in business development, digital transformation, and data-driven problem solving.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map((project) => (
              <Link
                key={project.slug}
                href={`/portfolio/${project.slug}`}
                className="group block bg-white dark:bg-zinc-900 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-800 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex flex-wrap gap-2">
                    {project.frontmatter.tags?.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="text-xs font-medium px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <ArrowUpRight
                    size={20}
                    className="text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-50 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all shrink-0"
                  />
                </div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-3">
                  {project.frontmatter.title}
                </h2>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {project.frontmatter.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
