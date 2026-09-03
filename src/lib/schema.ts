import { Frontmatter } from "./content";
import { projectsPath } from "./routes";

function resolveImageUrl(image: string | undefined): string | undefined {
  if (!image) return undefined;
  return new URL(image, "https://johnserra.com").toString();
}

export function getBaseSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "John Serra",
    "url": "https://johnserra.com",
    "jobTitle": "Business Development Professional",
    "description": "Business development professional specializing in process innovation, digital transformation, and growth strategy.",
    "sameAs": [
      "https://github.com/johnserra",
      "https://linkedin.com/in/johnserra" // Replace with actual if known, or leave as placeholder
    ]
  };
}

export function getBlogPostSchema(
  slug: string,
  frontmatter: Frontmatter,
  locale: string
) {
  const url = `https://johnserra.com${locale === "en" ? "" : `/${locale}`}/blog/${slug}`;
  
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": frontmatter.title,
    "description": frontmatter.description,
    "image": resolveImageUrl(frontmatter.coverImage),
    "datePublished": frontmatter.date,
    "author": {
      "@type": "Person",
      "name": "John Serra",
      "url": "https://johnserra.com"
    },
    "publisher": {
      "@type": "Person",
      "name": "John Serra"
    },
    "url": url,
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": url
    },
    "keywords": frontmatter.tags?.join(", ")
  };
}

export function getProjectSchema(
  slug: string,
  frontmatter: Frontmatter,
  locale: string
) {
  const url = `https://johnserra.com${locale === "en" ? "" : `/${locale}`}${projectsPath(locale, slug)}`;
  
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": frontmatter.title,
    "description": frontmatter.description,
    "image": resolveImageUrl(frontmatter.coverImage),
    "datePublished": frontmatter.date,
    "author": {
      "@type": "Person",
      "name": "John Serra"
    },
    "url": url,
    "keywords": frontmatter.tags?.join(", ")
  };
}
