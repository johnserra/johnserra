import { setRequestLocale, getTranslations } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BentoGrid } from "@/components/bento/BentoGrid";
import { BentoBox } from "@/components/bento/BentoBox";
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
    <>
      <Header />
      <main className="min-h-screen py-8 md:py-12 bg-background text-foreground">
        <BentoGrid>
          {/* Hero Section - Large focal point */}
          <HeroBox />

          {/* Portfolio Projects - Clickable cards with generated images */}
          {PROJECTS_LAYOUT.map((project, index) => (
            <ProjectBox
              key={project.id}
              id={project.id}
              title={tPortfolio(`${project.key}.title`)}
              description={tPortfolio(`${project.key}.description`)}
              image={project.image}
              link={projectsPath(locale, project.id)}
              span={project.span}
              priority={index === 0}
            />
          ))}

          {/* About Me Teaser */}
          <BentoBox span={8} variant="gradient">
            <AboutTeaserBox />
          </BentoBox>

          {/* Blog Teaser */}
          <BentoBox span={4}>
            <BlogTeaserBox locale={locale as Locale} />
          </BentoBox>
        </BentoGrid>
      </main>
      <Footer />
      <AIChatWidget />
    </>
  );
}
