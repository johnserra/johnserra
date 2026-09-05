export const NAV_LINK_HREFS = [
  { key: "home", href: "/" },
  { key: "about", href: "/about" },
  { key: "blog", href: "/blog" },
  { key: "portfolio", href: "/projects" },
  { key: "contact", href: "/contact" },
] as const;

export const FEATURE_LAYOUT = [
  { id: "patented-process", key: "patentedProcess", span: 4 },
  { id: "digital-transformation", key: "digitalTransformation", span: 5 },
  { id: "strategic-growth", key: "strategicGrowth", span: 3 },
] as const;

export const PROJECTS_LAYOUT = [
  { id: "careertalklab", key: "careerTalkLab", image: "/images/projects/careertalklab.avif", link: "/projects/careertalklab", span: 4 },
  { id: "digital-transformation", key: "digitalTransformation", image: "/images/projects/digital-transformation.avif", link: "/projects/digital-transformation", span: 5 },
  { id: "bd-automation-suite", key: "bdAutomation", image: "/images/projects/bd-automation-suite.avif", link: "/projects/bd-automation-suite", span: 3 },
] as const;
