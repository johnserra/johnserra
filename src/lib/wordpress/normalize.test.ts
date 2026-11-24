import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWordPressItem } from "./normalize";

test("normalizeWordPressItem accepts summary items without content when requireContent is false", () => {
  const item = normalizeWordPressItem(
    {
      id: 502,
      slug: "investigate-a-sales-spike-before-deleting-an-outlier",
      type: "post",
      status: "publish",
      date_gmt: "2026-11-23T21:30:00",
      modified_gmt: "2026-11-24T02:01:07",
      title: { rendered: "Investigate a Sales Spike &amp; Verify It" },
      excerpt: { rendered: "<p>Check source receipts first.</p>" },
      acf: { locale: "en", summary: "Check source receipts first." },
      _embedded: {
        "wp:term": [
          [{ id: 1, name: "Data Quality", slug: "data-quality", taxonomy: "post_tag" }],
        ],
      },
    },
    "en",
    false,
    false,
  );

  assert.equal(item.id, 502);
  assert.equal(item.slug, "investigate-a-sales-spike-before-deleting-an-outlier");
  assert.equal(item.title, "Investigate a Sales Spike & Verify It");
  assert.equal(item.summary, "Check source receipts first.");
  assert.equal(item.contentHtml, "");
  assert.deepEqual(item.tags, [{ id: 1, name: "Data Quality", slug: "data-quality" }]);
});

test("normalizeWordPressItem rejects missing content by default for single-item reads", () => {
  assert.throws(
    () =>
      normalizeWordPressItem(
        {
          id: 502,
          slug: "investigate-a-sales-spike-before-deleting-an-outlier",
          type: "post",
          status: "publish",
          title: { rendered: "Investigate a Sales Spike" },
          acf: { locale: "en" },
        },
        "en",
      ),
    TypeError,
  );
});
