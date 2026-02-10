import { FeatureHighlight, PortfolioProject, NavLink } from "@/types";

export const NAV_LINKS: NavLink[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Contact", href: "/contact" },
];

export const FEATURES: FeatureHighlight[] = [
  {
    id: "patented-process",
    title: "Patented Process Innovation",
    description:
      "Led the re-engineering of a patented process for self-absorbent polystyrene foam trays, enhancing product functionality for national meat and poultry packaging.",
    span: 4,
  },
  {
    id: "digital-transformation",
    title: "Digital Transformation in Crisis",
    description:
      "As Education Coordinator during the abrupt COVID-19 shutdown, I led the complete transition of a language school from paper-based methods to a live, online learning environment, ensuring educational continuity by digitizing all curriculum and training the entire teaching staff on new technologies.",
    span: 5,
  },
  {
    id: "strategic-growth",
    title: "Strategic Growth Automation",
    description:
      "Architecting an automated business development engine to streamline market research and lead evaluation. This system is designed to generate highly targeted prospect lists, shifting team focus from manual data collection to strategic networking and client communication.",
    span: 3,
  },
];

export const PORTFOLIO_PROJECTS: PortfolioProject[] = [
  {
    id: "cny-market",
    title: "CNY Market Development",
    description: "Strategic market development and growth initiatives in Central New York.",
    image: "/images/projects/cny-market.jpg",
    link: "/portfolio/cny-market",
    span: 4,
  },
  {
    id: "project-2",
    title: "Project Title 2",
    description: "Innovative solutions for complex business challenges.",
    image: "/images/projects/project-2.jpg",
    link: "/portfolio/project-2",
    span: 5,
  },
  {
    id: "project-3",
    title: "Project Title 3",
    description: "Data-driven approach to operational excellence.",
    image: "/images/projects/project-3.jpg",
    link: "/portfolio/project-3",
    span: 3,
  },
];

export const HERO_CONTENT = {
  headline: "Decades of Experience. A Modern, Data-Driven Approach.",
  introduction:
    "Leveraging a career that spans manufacturing, education, and urban mobility, I specialize in solving complex challenges. My focus is on using data to find clarity and drive measurable growth, regardless of the industry.",
  ctaText: "Chat with my AI Assistant",
  ctaLink: "#chat",
};

export const ABOUT_TEASER = {
  content:
    "With a unique blend of hands-on manufacturing expertise, educational leadership, and data analytics skills, I bring a comprehensive perspective to every project. My approach combines decades of real-world experience with modern technological solutions to deliver tangible results.",
  ctaText: "Learn More About Me",
  ctaLink: "/about",
};
