import { Link } from "@/i18n/navigation";
import { getAllSiteContent } from "@/lib/site-content";
import { projectsPath } from "@/lib/routes";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ArrowUpRight } from "@carbon/icons-react";
import { Tag } from "@/components/ui/Tag";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import type { Locale } from "@/types";

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Portfolio" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function ProjectsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Portfolio");
  const projects = await getAllSiteContent("projects", locale as Locale);

  return (
    <div className="bg-ground text-ink">
      <Header />
      <main className="min-h-screen py-14 md:py-20">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="mb-12 max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-3 py-1 mb-3 font-mono text-xs font-medium uppercase tracking-wider text-accent">
              {t("eyebrow")}
            </div>
            <h1 className="mb-3 font-serif text-4xl sm:text-5xl tracking-tight text-ink leading-tight">
              {t("title")}
            </h1>
            <p className="text-base md:text-lg text-muted leading-relaxed">
              {t("subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map((project) => (
              <Link
                key={project.slug}
                href={projectsPath(locale, project.slug)}
                className="group block rounded-xl border border-hair bg-panel p-8 shadow-sm transition-all hover:border-accent/50 hover:shadow-md no-underline"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex flex-wrap gap-2">
                    {project.frontmatter.tags?.slice(0, 2).map((tag) => (
                      <Tag key={tag} type="blue">
                        {tag}
                      </Tag>
                    ))}
                  </div>
                  <ArrowUpRight
                    size={20}
                    className="shrink-0 text-accent transition-colors group-hover:text-accent-dim group-focus-visible:text-accent-dim"
                  />
                </div>
                <h2 className="mb-3 font-serif text-2xl sm:text-3xl text-ink transition-colors group-hover:text-accent group-focus-visible:text-accent leading-snug">
                  {project.frontmatter.title}
                </h2>
                <p className="leading-relaxed text-muted">
                  {project.frontmatter.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
