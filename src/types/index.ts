export interface FeatureHighlight {
  id: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  span?: number;
}

export interface PortfolioProject {
  id: string;
  title: string;
  description: string;
  image: string;
  link: string;
  span?: number;
}

export interface SocialLink {
  platform: string;
  url: string;
  icon: React.ReactNode;
}

export interface NavLink {
  label: string;
  href: string;
}

export interface BentoBoxProps {
  children: React.ReactNode;
  span?: number;
  rowSpan?: number;
  className?: string;
  variant?: 'default' | 'gradient' | 'glass';
}
