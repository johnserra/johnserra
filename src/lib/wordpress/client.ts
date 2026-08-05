import "server-only";

import type { WordPressPage } from "./types";

const DEFAULT_REVALIDATE_SECONDS = 86_400;

export class WordPressApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "WordPressApiError";
  }
}
interface WordPressFetchOptions {
  query?: Record<string, string | number | boolean | undefined>;
  tags?: string[];
  revalidate?: number | false;
  signal?: AbortSignal;
  auth?: { username: string; applicationPassword: string };
}

function apiBaseUrl(): URL {
  const configured = process.env.WORDPRESS_API_URL;
  if (!configured) {
    throw new Error("WORDPRESS_API_URL is required for WordPress content reads.");
  }

  const normalized = configured.endsWith("/") ? configured : `${configured}/`;
  return new URL(normalized);
}

function requestUrl(
  path: string,
  query: WordPressFetchOptions["query"] = {},
): URL {
  const url = new URL(path.replace(/^\//, ""), apiBaseUrl());

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  return url;
}

function authHeader(auth: WordPressFetchOptions["auth"]): string | undefined {
  if (!auth) return undefined;
  return `Basic ${Buffer.from(`${auth.username}:${auth.applicationPassword}`).toString("base64")}`;
}

export async function wordpressFetch<T>(
  path: string,
  options: WordPressFetchOptions = {},
): Promise<T> {
  const url = requestUrl(path, options.query);
  const authorization = authHeader(options.auth);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    signal: options.signal,
    next: {
      revalidate: options.revalidate ?? DEFAULT_REVALIDATE_SECONDS,
      tags: options.tags,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new WordPressApiError(
      `WordPress request failed (${response.status}): ${body.slice(0, 300)}`,
      response.status,
      url.pathname,
    );
  }

  return (await response.json()) as T;
}

export async function wordpressFetchPage<T>(
  path: string,
  options: WordPressFetchOptions = {},
): Promise<WordPressPage<T>> {
  const url = requestUrl(path, options.query);
  const authorization = authHeader(options.auth);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    signal: options.signal,
    next: {
      revalidate: options.revalidate ?? DEFAULT_REVALIDATE_SECONDS,
      tags: options.tags,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new WordPressApiError(
      `WordPress collection request failed (${response.status}): ${body.slice(0, 300)}`,
      response.status,
      url.pathname,
    );
  }

  const items = (await response.json()) as T[];
  return {
    items,
    total: Number(response.headers.get("x-wp-total") ?? items.length),
    totalPages: Number(response.headers.get("x-wp-totalpages") ?? 1),
  };
}
