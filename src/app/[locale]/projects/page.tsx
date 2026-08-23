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
    <>
      <Header />
      <main className="min-h-screen bg-ground py-16 text-ink">
        <div className="max-w-5xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="mb-12">
            <h1 className="mb-4 font-display text-4xl uppercase tracking-tight text-ink">
              {t("title")}
            </h1>
            <p className="text-lg text-ink-soft">
              {t("subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map((project) => (
              <Link
                key={project.slug}
                href={projectsPath(locale, project.slug)}
                className="group block rounded-card border border-hair bg-panel p-8 transition-colors hover:border-line-strong"
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
                    className="shrink-0 text-faint transition-colors group-hover:text-accent"
                  />
                </div>
                <h2 className="mb-3 text-xl font-bold text-ink">
                  {project.frontmatter.title}
                </h2>
                <p className="leading-relaxed text-ink-soft">
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
