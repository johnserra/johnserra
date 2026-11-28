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
  { id: "careertalklab", key: "careerTalkLab", image: "/images/projects/careertalklab.avif", link: "/projects/careertalklab", span: 4, linkLocale: undefined },
  { id: "digital-transformation", key: "digitalTransformation", image: "/images/projects/digital-transformation.avif", link: "/projects/digital-transformation", span: 5, linkLocale: undefined },
  { id: "agentic-lesson-pipeline", key: "agenticLessonPipeline", image: "/images/projects/agentic-lesson-pipeline.png", link: "/projects/agentic-lesson-pipeline", span: 3, linkLocale: "en" as const },
] as const;
