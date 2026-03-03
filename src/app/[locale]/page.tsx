import { setRequestLocale, getTranslations } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BentoGrid } from "@/components/bento/BentoGrid";
import { BentoBox } from "@/components/bento/BentoBox";
import { HeroBox } from "@/components/bento/HeroBox";
import { FeatureBox } from "@/components/bento/FeatureBox";
import { AboutTeaserBox } from "@/components/bento/AboutTeaserBox";
import { BlogTeaserBox } from "@/components/bento/BlogTeaserBox";
import { PortfolioBox } from "@/components/bento/PortfolioBox";
import { AIChatWidget } from "@/components/widgets/AIChatWidget";
import { FEATURE_LAYOUT, PORTFOLIO_LAYOUT } from "@/lib/constants";
import type { Locale } from "@/types";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function Home({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const tFeatures = await getTranslations("Features");
  const tPortfolio = await getTranslations("PortfolioProjects");

  return (
    <>
      <Header />
      <main className="min-h-screen py-8 md:py-12 bg-zinc-50 dark:bg-black">
        <BentoGrid>
          {/* Hero Section - Large focal point */}
          <HeroBox />

          {/* Feature Highlights - Asymmetric spans */}
          {FEATURE_LAYOUT.map((feature) => (
            <BentoBox key={feature.id} span={feature.span} variant="glass">
              <FeatureBox
                id={feature.id}
                title={tFeatures(`${feature.key}.title`)}
                description={tFeatures(`${feature.key}.description`)}
                span={feature.span}
              />
            </BentoBox>
          ))}

          {/* About Me Teaser */}
          <BentoBox span={8} variant="gradient">
            <AboutTeaserBox />
          </BentoBox>

          {/* Blog Teaser */}
          <BentoBox span={4}>
            <BlogTeaserBox locale={locale as Locale} />
          </BentoBox>

          {/* Portfolio Projects */}
          {PORTFOLIO_LAYOUT.map((project) => (
            <BentoBox key={project.id} span={project.span}>
              <PortfolioBox
                id={project.id}
                title={tPortfolio(`${project.key}.title`)}
                description={tPortfolio(`${project.key}.description`)}
                image={project.image}
                link={project.link}
                span={project.span}
              />
            </BentoBox>
          ))}
        </BentoGrid>
      </main>
      <Footer />
      <AIChatWidget />
    </>
  );
}
