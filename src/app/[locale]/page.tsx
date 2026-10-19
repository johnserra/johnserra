import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Layers } from "@carbon/icons-react";
import { Link } from "@/i18n/navigation";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BentoGrid } from "@/components/bento/BentoGrid";
import { HeroBox } from "@/components/bento/HeroBox";
import { AboutTeaserBox } from "@/components/bento/AboutTeaserBox";
import { BlogTeaserBox } from "@/components/bento/BlogTeaserBox";
import { ProjectBox } from "@/components/bento/ProjectBox";
import { AIChatWidget } from "@/components/widgets/AIChatWidget";
import { PROJECTS_LAYOUT } from "@/lib/constants";
import { projectsPath } from "@/lib/routes";
import type { Locale } from "@/types";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const tPortfolio = await getTranslations("PortfolioProjects");

  return (
    <div className="bg-ground text-ink">
      <Header />
      <main>
        {/* Section 1: Split Hero & Interactive Dark Workbench */}
        <HeroBox />

        {/* Section 2: Case Studies Bento & Operator Manifesto */}
        <section className="border-b border-hair bg-ground-2/60 py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 md:px-6 mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3 py-1 mb-3">
                <Layers size={14} className="text-accent" />
                <span className="font-mono text-xs font-medium uppercase tracking-wider text-accent">
                  {tPortfolio("eyebrow")}
                </span>
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-ink tracking-tight leading-tight mb-3">
                {tPortfolio("sectionTitle")}
              </h2>
              <p className="text-base md:text-lg text-muted leading-relaxed">
                {tPortfolio("sectionSubtitle")}
              </p>
            </div>

            <Link
              href={projectsPath(locale)}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-hair bg-ground px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-accent hover:bg-panel-2 transition-colors no-underline"
            >
              <span>{tPortfolio("viewAll")}</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          <BentoGrid>
            {PROJECTS_LAYOUT.map((project, index) => (
              <ProjectBox
                key={project.id}
                id={project.id}
                badge={tPortfolio(`${project.key}.badge`)}
                title={tPortfolio(`${project.key}.title`)}
                description={tPortfolio(`${project.key}.description`)}
                ctaLabel={tPortfolio("exploreProject")}
                image={project.image}
                link={projectsPath(locale, project.id)}
                span={project.span}
                priority={index === 0}
              />
            ))}

            <AboutTeaserBox />
          </BentoGrid>
        </section>

        {/* Section 3: Writing & Field Notes (with Analytics & CareerTalkLab tracks) */}
        <BlogTeaserBox locale={locale as Locale} />
      </main>
      <Footer />
      <AIChatWidget />
    </div>
  );
}
