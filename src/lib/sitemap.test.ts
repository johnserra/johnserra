import assert from "node:assert/strict";
import test from "node:test";
import { dynamicSitemapEntries, knownModifiedDate } from "./sitemap";
import { normalizeWordPressItem } from "./wordpress/normalize";

test("known modified dates require a valid explicit timezone", () => {
  assert.equal(knownModifiedDate("2026-10-13T12:30:00Z")?.toISOString(), "2026-10-13T12:30:00.000Z");
  assert.equal(knownModifiedDate("2026-10-13T08:30:00-04:00")?.toISOString(), "2026-10-13T12:30:00.000Z");
  assert.equal(knownModifiedDate("2026-10-13T12:30:00"), undefined);
  assert.equal(knownModifiedDate("2026-10-13")?.toISOString(), "2026-10-13T00:00:00.000Z");
  assert.equal(knownModifiedDate("2026-02-30"), undefined);
  assert.equal(knownModifiedDate("2026-13-01"), undefined);
  assert.equal(knownModifiedDate("2026-00-01"), undefined);
  assert.equal(knownModifiedDate("2026-10-00"), undefined);
  assert.equal(knownModifiedDate("not-a-date"), undefined);
});

test("WordPress invalid calendar dates are rejected rather than normalized", () => {
  const item = normalizeWordPressItem({
    id: 2, slug: "invalid-date", status: "publish", type: "post", modified_gmt: "2026-02-30T12:30:00",
    title: { rendered: "Invalid" }, content: { rendered: "<p>Body</p>" }, acf: { locale: "en" },
  }, "en");
  assert.equal(item.modified, undefined);
});

test("dynamic entries are stable, locale-correct, and omit unknown dates", () => {
  const items = [
    { slug: "known", modified: "2026-10-13T12:30:00Z" },
    { slug: "unknown" },
    { slug: "zone-less", modified: "2026-10-13T12:30:00" },
  ];
  const options = { changeFrequency: "weekly" as const, priority: 0.7 };
  const english = dynamicSitemapEntries("https://johnserra.com", "", "/blog", items, options);
  const turkish = dynamicSitemapEntries("https://johnserra.com", "/tr", "/blog", items, options);
  assert.deepEqual(dynamicSitemapEntries("https://johnserra.com", "", "/blog", items, options), english);
  assert.equal(english[0].url, "https://johnserra.com/blog/known");
  assert.equal(turkish[0].url, "https://johnserra.com/tr/blog/known");
  assert.equal(english[0].lastModified?.toISOString(), "2026-10-13T12:30:00.000Z");
  assert.ok(!("lastModified" in english[1]));
  assert.ok(!("lastModified" in english[2]));
});

test("WordPress modified_gmt is UTC and categories and tags remain distinct", () => {
  const item = normalizeWordPressItem({
    id: 1,
    slug: "sample",
    status: "publish",
    type: "post",
    modified_gmt: "2026-10-13T12:30:00",
    title: { rendered: "Sample" },
    content: { rendered: "<p>Body</p>" },
    acf: { locale: "en" },
    _embedded: { "wp:term": [[
      { id: 2, name: "Parking &amp; Property", slug: "parking", taxonomy: "category" },
      { id: 3, name: "Data", slug: "data", taxonomy: "post_tag" },
    ]] },
  }, "en");
  assert.equal(item.modified, "2026-10-13T12:30:00.000Z");
  assert.deepEqual(item.categories.map(({ name }) => name), ["Parking & Property"]);
  assert.deepEqual(item.tags.map(({ name }) => name), ["Data"]);
});
