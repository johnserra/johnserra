import assert from "node:assert/strict";
import test from "node:test";
import {
  getHomeMetadata,
  getLocaleLayoutMetadata,
  SITE_OG_IMAGE,
} from "./site-metadata";

test("locale layout metadata provides Open Graph and Twitter defaults with root og:image without forcing homepage canonical or og:url", () => {
  const metadata = getLocaleLayoutMetadata(
    "en",
    "John Serra - Data-Driven Problem Solver",
    "Practical analytics and data systems.",
  );

  assert.equal(metadata.metadataBase?.href, "https://johnserra.com/");
  assert.equal(metadata.alternates?.canonical, undefined);
  assert.deepEqual(metadata.alternates?.languages, {
    en: "https://johnserra.com",
    tr: "https://johnserra.com/tr",
    "x-default": "https://johnserra.com",
  });
  assert.deepEqual(metadata.openGraph, {
    type: "website",
    siteName: "John Serra",
    locale: "en_US",
    alternateLocale: ["tr_TR"],
    title: "John Serra - Data-Driven Problem Solver",
    description: "Practical analytics and data systems.",
    images: [{ ...SITE_OG_IMAGE }],
  });
  assert.deepEqual(metadata.twitter, {
    card: "summary_large_image",
    title: "John Serra - Data-Driven Problem Solver",
    description: "Practical analytics and data systems.",
    images: [{ ...SITE_OG_IMAGE }],
  });
});

test("homepage metadata sets locale-specific canonical, og:url, and share images for EN and TR", () => {
  const en = getHomeMetadata("en", "John Serra - Data-Driven Problem Solver", "English description.");
  assert.equal(en.alternates?.canonical, "https://johnserra.com");
  assert.equal(en.openGraph?.url, "https://johnserra.com");
  assert.equal(en.openGraph?.locale, "en_US");
  assert.deepEqual(en.openGraph?.alternateLocale, ["tr_TR"]);
  assert.deepEqual(en.openGraph?.images, [{ ...SITE_OG_IMAGE }]);
  assert.equal(en.twitter?.card, "summary_large_image");
  assert.deepEqual(en.twitter?.images, [{ ...SITE_OG_IMAGE }]);

  const tr = getHomeMetadata("tr", "John Serra - Veri Odaklı Problem Çözücü", "Turkish description.");
  assert.equal(tr.alternates?.canonical, "https://johnserra.com/tr");
  assert.equal(tr.openGraph?.url, "https://johnserra.com/tr");
  assert.equal(tr.openGraph?.locale, "tr_TR");
  assert.deepEqual(tr.openGraph?.alternateLocale, ["en_US"]);
  assert.deepEqual(tr.openGraph?.images, [{ ...SITE_OG_IMAGE }]);
  assert.equal(tr.twitter?.card, "summary_large_image");
  assert.deepEqual(tr.twitter?.images, [{ ...SITE_OG_IMAGE }]);
});
