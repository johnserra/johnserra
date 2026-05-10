import { Frontmatter } from "./content";

export function getBaseSchema(locale: string) {
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
  locale: string,
  content: string
) {
  const url = `https://johnserra.com${locale === "en" ? "" : `/${locale}`}/blog/${slug}`;
  
  // Base BlogPosting schema
  const schema: any = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": frontmatter.title,
    "description": frontmatter.description,
    "image": frontmatter.coverImage ? `https://johnserra.com${frontmatter.coverImage}` : undefined,
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

  // If it has recipe fields, add Recipe schema as well or instead
  if (frontmatter.cuisine || frontmatter.totalTime) {
    schema["@type"] = ["BlogPosting", "Recipe"];
    schema["recipeCuisine"] = frontmatter.cuisine;
    schema["prepTime"] = frontmatter.prepTime; // Should ideally be ISO 8601, but strings are often accepted by AI
    schema["cookTime"] = frontmatter.cookTime;
    schema["totalTime"] = frontmatter.totalTime;
    schema["recipeYield"] = frontmatter.servings?.toString();
  }

  return schema;
}

export function getPortfolioSchema(
  slug: string,
  frontmatter: Frontmatter,
  locale: string
) {
  const url = `https://johnserra.com${locale === "en" ? "" : `/${locale}`}/portfolio/${slug}`;
  
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "name": frontmatter.title,
    "description": frontmatter.description,
    "image": frontmatter.coverImage ? `https://johnserra.com${frontmatter.coverImage}` : undefined,
    "datePublished": frontmatter.date,
    "author": {
      "@type": "Person",
      "name": "John Serra"
    },
    "url": url,
    "keywords": frontmatter.tags?.join(", ")
  };
}
