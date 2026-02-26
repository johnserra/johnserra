import fs from "fs";
import path from "path";
import matter from "gray-matter";

const contentDirectory = path.join(process.cwd(), "content");

export interface Frontmatter {
  title: string;
  description?: string;
  date?: string;
  tags?: string[];
  status?: string;
  coverImage?: string;
  githubUrl?: string;
  // Recipe-specific
  cuisine?: string;
  servings?: number;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  story?: boolean;
  [key: string]: unknown;
}

export interface ContentItem {
  slug: string;
  frontmatter: Frontmatter;
  content: string;
}

/**
 * Transform Obsidian [[wiki links]] into standard markdown links.
 * Handles [[Link]] and [[Link|Display Text]] syntax.
 */
export function transformObsidianLinks(content: string): string {
  return content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, link: string, displayText?: string) => {
      const text = displayText ?? link;
      const slug = link.toLowerCase().replace(/\s+/g, "-");
      return `[${text}](/${slug})`;
    }
  );
}

export function getContentSlugs(type: string): string[] {
  const dir = path.join(contentDirectory, type);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx?$/, ""));
}

export function getContentBySlug(type: string, slug: string): ContentItem | null {
  const mdPath = path.join(contentDirectory, type, `${slug}.md`);
  const mdxPath = path.join(contentDirectory, type, `${slug}.mdx`);
  const fullPath = fs.existsSync(mdPath) ? mdPath : mdxPath;

  if (!fs.existsSync(fullPath)) return null;

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  return {
    slug,
    frontmatter: data as Frontmatter,
    content: transformObsidianLinks(content),
  };
}

export function getAllContent(type: string): ContentItem[] {
  const slugs = getContentSlugs(type);
  const items = slugs
    .map((slug) => getContentBySlug(type, slug))
    .filter((item): item is ContentItem => item !== null);

  // Sort by date descending if date exists, otherwise preserve file order
  return items.sort((a, b) => {
    if (!a.frontmatter.date || !b.frontmatter.date) return 0;
    return a.frontmatter.date > b.frontmatter.date ? -1 : 1;
  });
}
