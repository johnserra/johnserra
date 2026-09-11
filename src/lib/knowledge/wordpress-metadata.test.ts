import assert from "node:assert/strict";
import test from "node:test";
import { wordPressCanonicalUrl, wordPressAuthority, wordPressSourceMetadata } from "./wordpress-metadata";

test("canonical URLs follow the public EN/TR frontend route conventions", () => {
  assert.equal(wordPressCanonicalUrl("post", "published-view", "en"), "https://johnserra.com/blog/published-view");
  assert.equal(wordPressCanonicalUrl("post", "published-view", "tr"), "https://johnserra.com/tr/blog/published-view");
  assert.equal(wordPressCanonicalUrl("js_project", "careertalklab", "en"), "https://johnserra.com/projects/careertalklab");
  assert.equal(wordPressCanonicalUrl("js_project", "careertalklab", "tr"), "https://johnserra.com/tr/projeler/careertalklab");
  assert.equal(wordPressCanonicalUrl("page", "about", "en", "en/about/index"), "https://johnserra.com/about");
  assert.equal(wordPressCanonicalUrl("page", "about", "tr", "tr/about/index"), "https://johnserra.com/tr/hakkimda");
  assert.equal(wordPressCanonicalUrl("page", "privacy-policy", "en", "en/privacy-policy/index"), "https://johnserra.com/privacy-policy");
  assert.equal(wordPressCanonicalUrl("page", "custom", "tr"), "https://johnserra.com/tr/custom");
});

test("authority separates authored posts from project details and site pages", () => {
  assert.equal(wordPressAuthority("post"), "authored_post");
  assert.equal(wordPressAuthority("js_project"), "project_page");
  assert.equal(wordPressAuthority("page"), "site_page");
  const metadata = wordPressSourceMetadata({
    id: 1,
    type: "post",
    slug: "viewpoint",
    status: "publish",
    title: { rendered: "Viewpoint" },
    content: { rendered: "<p>Example</p>" },
    acf: { locale: "en" },
  }, "en");
  assert.deepEqual(metadata, {
    canonical_url: "https://johnserra.com/blog/viewpoint",
    authority: "authored_post",
    document_type: "wordpress",
  });
});
