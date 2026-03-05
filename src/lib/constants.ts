export const NAV_LINK_HREFS = [
  { key: "home", href: "/" },
  { key: "about", href: "/about" },
  { key: "blog", href: "/blog" },
  { key: "portfolio", href: "/portfolio" },
  { key: "recipes", href: "/recipes" },
  { key: "contact", href: "/contact" },
] as const;

export const FEATURE_LAYOUT = [
  { id: "patented-process", key: "patentedProcess", span: 4 },
  { id: "digital-transformation", key: "digitalTransformation", span: 5 },
  { id: "strategic-growth", key: "strategicGrowth", span: 3 },
] as const;

export const PORTFOLIO_LAYOUT = [
  { id: "bd-automation-suite", key: "bdAutomation", image: "/images/projects/bd-automation-suite.jpg", link: "/portfolio/bd-automation-suite", span: 4 },
  { id: "digital-transformation", key: "digitalTransformation", image: "/images/projects/digital-transformation.jpg", link: "/portfolio/digital-transformation", span: 5 },
  { id: "careertalklab", key: "careerTalkLab", image: "/images/projects/careertalklab.jpg", link: "/portfolio/careertalklab", span: 3 },
] as const;
