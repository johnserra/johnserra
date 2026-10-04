import assert from "node:assert/strict";
import test from "node:test";
import { getBlogMetadata } from "./blog-metadata";

const article = { title: "How to Measure Parking Facility Occupancy", description: "Measure parking occupancy.", date: "2026-10-04T00:33:06" };

test("an untranslated article uses its public URL without advertising a missing translation", () => {
  const metadata = getBlogMetadata("en", "measure-parking-occupancy", article, null);
  assert.equal(metadata.alternates?.canonical, "https://johnserra.com/blog/measure-parking-occupancy");
  assert.deepEqual(metadata.alternates?.languages, {
    en: "https://johnserra.com/blog/measure-parking-occupancy",
    "x-default": "https://johnserra.com/blog/measure-parking-occupancy",
  });
  assert.equal(metadata.openGraph?.url, metadata.alternates?.canonical);
  assert.deepEqual(metadata.openGraph?.images, [{
    url: "https://johnserra.com/blog/measure-parking-occupancy/share-image",
    alt: article.title, width: 1200, height: 630,
  }]);
  assert.deepEqual(metadata.twitter?.images, metadata.openGraph?.images);
});

test("translated articles keep separate canonicals and reciprocal links using actual slugs", () => {
  const english = getBlogMetadata("en", "english-slug", article, "turkce-baslik");
  const turkish = getBlogMetadata("tr", "turkce-baslik", article, "english-slug");
  assert.equal(turkish.alternates?.canonical, "https://johnserra.com/tr/blog/turkce-baslik");
  assert.deepEqual(turkish.alternates?.languages, english.alternates?.languages);
  assert.deepEqual(turkish.alternates?.languages, {
    en: "https://johnserra.com/blog/english-slug",
    tr: "https://johnserra.com/tr/blog/turkce-baslik",
    "x-default": "https://johnserra.com/blog/english-slug",
  });
});

test("Turkish-only articles omit an invented English alternate and preserve featured images", () => {
  const metadata = getBlogMetadata("tr", "yazi", {
    ...article, coverImage: "/images/blog/example.jpg", coverImageAlt: "Article illustration",
  }, null);
  assert.deepEqual(metadata.alternates?.languages, { tr: "https://johnserra.com/tr/blog/yazi" });
  assert.deepEqual(metadata.openGraph?.images, [{
    url: "https://johnserra.com/images/blog/example.jpg", alt: "Article illustration",
  }]);
});
