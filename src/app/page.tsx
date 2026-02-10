import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { BentoGrid } from "@/components/bento/BentoGrid";
import { BentoBox } from "@/components/bento/BentoBox";
import { HeroBox } from "@/components/bento/HeroBox";
import { FeatureBox } from "@/components/bento/FeatureBox";
import { AboutTeaserBox } from "@/components/bento/AboutTeaserBox";
import { PortfolioBox } from "@/components/bento/PortfolioBox";
import { AIChatWidget } from "@/components/widgets/AIChatWidget";
import { FEATURES, PORTFOLIO_PROJECTS } from "@/lib/constants";

export default function Home() {
  return (
    <>
      <Header />
      <main className="min-h-screen py-8 md:py-12 bg-zinc-50 dark:bg-black">
        <BentoGrid>
          {/* Hero Section - Large focal point */}
          <HeroBox />

          {/* Feature Highlights - Asymmetric spans */}
          <BentoBox span={FEATURES[0].span} variant="glass">
            <FeatureBox {...FEATURES[0]} />
          </BentoBox>

          <BentoBox span={FEATURES[1].span} variant="glass">
            <FeatureBox {...FEATURES[1]} />
          </BentoBox>

          <BentoBox span={FEATURES[2].span} variant="glass">
            <FeatureBox {...FEATURES[2]} />
          </BentoBox>

          {/* About Me Teaser */}
          <BentoBox span={8} variant="gradient">
            <AboutTeaserBox />
          </BentoBox>

          {/* Portfolio Projects */}
          <BentoBox span={PORTFOLIO_PROJECTS[0].span}>
            <PortfolioBox {...PORTFOLIO_PROJECTS[0]} />
          </BentoBox>

          <BentoBox span={PORTFOLIO_PROJECTS[1].span}>
            <PortfolioBox {...PORTFOLIO_PROJECTS[1]} />
          </BentoBox>

          <BentoBox span={PORTFOLIO_PROJECTS[2].span}>
            <PortfolioBox {...PORTFOLIO_PROJECTS[2]} />
          </BentoBox>
        </BentoGrid>
      </main>
      <Footer />
      <AIChatWidget />
    </>
  );
}
