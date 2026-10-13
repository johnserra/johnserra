export interface SitemapSourceItem {
  slug: string;
  modified?: string;
}

export interface DynamicSitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency: "weekly" | "monthly";
  priority: number;
}

export function knownModifiedDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/iu.test(value)) return undefined;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  const date = new Date(timestamp);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T/u);
  if (!match) return undefined;
  const localProbe = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
  if (localProbe.toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) return undefined;
  return date;
}

export function dynamicSitemapEntries(
  baseUrl: string,
  localePrefix: string,
  collectionPath: string,
  items: SitemapSourceItem[],
  options: Pick<DynamicSitemapEntry, "changeFrequency" | "priority">,
): DynamicSitemapEntry[] {
  return items.map((item) => {
    const lastModified = knownModifiedDate(item.modified);
    return {
      url: `${baseUrl}${localePrefix}${collectionPath}/${item.slug}`,
      ...(lastModified ? { lastModified } : {}),
      ...options,
    };
  });
}
