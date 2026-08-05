import type { Locale } from "@/types";

export type WordPressContentType = "post" | "page" | "js_project";
export type WordPressCollectionType = "posts" | "pages" | "projects";

export interface WordPressRenderedField {
  rendered: string;
  protected?: boolean;
}

export interface WordPressMedia {
  id: number;
  source_url: string;
  alt_text?: string;
  media_details?: {
    width?: number;
    height?: number;
  };
}

export interface WordPressTerm {
  id: number;
  name: string;
  slug: string;
  taxonomy: string;
}

export interface WordPressAcfFields {
  locale?: Locale;
  translation_group_id?: string;
  summary?: string;
  legacy_source_key?: string;
  cuisine?: string;
  servings?: number | string;
  prep_time?: string;
  cook_time?: string;
  total_time?: string;
  story?: boolean | number;
  project_status?: string;
  github_url?: string;
  live_url?: string;
  [key: string]: unknown;
}

export interface WordPressApiItem {
  id: number;
  date_gmt?: string | null;
  modified_gmt?: string | null;
  slug: string;
  status: string;
  type: WordPressContentType;
  title: WordPressRenderedField;
  content: WordPressRenderedField;
  excerpt?: WordPressRenderedField;
  featured_media?: number;
  acf?: WordPressAcfFields;
  _embedded?: {
    "wp:featuredmedia"?: WordPressMedia[];
    "wp:term"?: WordPressTerm[][];
  };
}

export interface ContentTag {
  id: number;
  name: string;
  slug: string;
}

export interface ContentImage {
  id: number;
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface WordPressContentItem {
  id: number;
  type: WordPressContentType;
  slug: string;
  locale: Locale;
  status: string;
  title: string;
  summary?: string;
  date?: string;
  modified?: string;
  contentHtml: string;
  tags: ContentTag[];
  featuredImage?: ContentImage;
  translationGroupId?: string;
  legacySourceKey?: string;
  recipe?: {
    cuisine?: string;
    servings?: number;
    prepTime?: string;
    cookTime?: string;
    totalTime?: string;
    story?: boolean;
  };
  project?: {
    status?: string;
    githubUrl?: string;
    liveUrl?: string;
  };
}

export interface WordPressTranslation {
  id: number;
  type: WordPressContentType;
  slug: string;
  locale: Locale;
  translation_group_id: string;
  link: string;
  modified_gmt: string;
}

export interface WordPressPage<T> {
  items: T[];
  total: number;
  totalPages: number;
}
