import assert from "node:assert/strict";
import test from "node:test";
import {
  WORDPRESS_MAX_CHUNK_CHARACTERS,
  WORDPRESS_MAX_CHUNK_OVERLAP_CHARACTERS,
  chunkWordPressHtml,
  chunkUnstructuredText,
  parseWordPressHtml,
  htmlToStructuredPlainText,
  structureWordPressBlocks,
} from "./wordpress-chunking";

test("headings create deterministic nested section paths and preserve block boundaries", () => {
  const blocks = parseWordPressHtml(
    "<h2>Experience</h2><p>Role paragraph.</p><h3>Project A</h3><p>Project detail.</p><ul><li>First</li><li>Second</li></ul>",
  );
  assert.deepEqual(
    blocks.map(({ kind, text, level }) => ({ kind, text, level })),
    [
      { kind: "heading", text: "Experience", level: 2 },
      { kind: "paragraph", text: "Role paragraph.", level: undefined },
      { kind: "heading", text: "Project A", level: 3 },
      { kind: "paragraph", text: "Project detail.", level: undefined },
      { kind: "list-item", text: "First", level: undefined },
      { kind: "list-item", text: "Second", level: undefined },
    ],
  );
  assert.deepEqual(structureWordPressBlocks(blocks).map((section) => section.sectionPath), [
    ["Experience"],
    ["Experience", "Project A"],
  ]);
});

test("short meaningful sections are retained and list items remain separate", () => {
  const chunks = chunkWordPressHtml("Portfolio", "<h2>Role</h2><p>Go.</p><ul><li>Ship.</li></ul>");
  assert.equal(chunks.length, 1);
  assert.match(chunks[0].content, /Document: Portfolio/);
  assert.match(chunks[0].content, /Section path: Role/);
  assert.match(chunks[0].content, /Paragraph: Go\./);
  assert.match(chunks[0].content, /List item: Ship\./);
});

test("oversized sections split only inside the same semantic section with bounded overlap", () => {
  const longParagraph = Array.from({ length: 900 }, (_, index) => `term-${index}`).join(" ");
  const chunks = chunkWordPressHtml("Work", `<h2>Role</h2><p>${longParagraph}</p><h2>Next role</h2><p>Separate.</p>`);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((chunk) => chunk.content.length <= WORDPRESS_MAX_CHUNK_CHARACTERS));
  const roleChunks = chunks.filter((chunk) => chunk.sectionPath.join(" > ") === "Role");
  assert.ok(roleChunks.length > 1);
  assert.ok(roleChunks.every((chunk) => chunk.content.includes("Section path: Role")));
  const previousBody = roleChunks[0].content.split("\n").slice(2).join("\n");
  const nextBody = roleChunks[1].content.split("\n").slice(2).join("\n");
  let overlap = "";
  for (let length = Math.min(previousBody.length, nextBody.length); length > 0; length -= 1) {
    const candidate = previousBody.slice(-length);
    if (nextBody.startsWith(candidate)) {
      overlap = candidate;
      break;
    }
  }
  assert.ok(overlap.length > 0, "adjacent chunks should overlap within the same section");
  assert.ok(overlap.length <= WORDPRESS_MAX_CHUNK_OVERLAP_CHARACTERS);
  assert.equal(overlap, overlap.trim());
  assert.ok(!/[\s]$/.test(overlap));
  assert.ok(!/^\s/.test(overlap));
  const nextRole = chunks.find((chunk) => chunk.sectionPath.join(" > ") === "Next role");
  assert.ok(nextRole);
  assert.doesNotMatch(nextRole?.content ?? "", /term-899/);
  const bodyLengths = roleChunks.map((chunk) => chunk.content.split("\n").slice(2).join("\n").length);
  assert.ok(bodyLengths.every((length) => length <= WORDPRESS_MAX_CHUNK_CHARACTERS));
});

test("unstructured text is deterministic and does not drop short input", () => {
  const html = "A short note with no structural HTML.";
  const first = chunkWordPressHtml("Note", html);
  const second = chunkWordPressHtml("Note", html);
  assert.deepEqual(first, second);
  assert.equal(first.length, 1);
  assert.match(first[0].content, /A short note with no structural HTML\./);
});

test("plain-text fallback preserves literal angle brackets as text", () => {
  const chunks = chunkUnstructuredText("Note", "literal <angle-bracket> text and 2 < 3");
  assert.match(chunks[0].content, /literal <angle-bracket> text and 2 < 3/);
});

test("prefix capacity errors before emitting an oversized unit", () => {
  const title = "T".repeat(2_390);
  assert.throws(
    () => chunkWordPressHtml(title, "<h2>Role</h2><p>Content.</p>"),
    /section context exceeds|cannot fit/i,
  );
});

test("near-limit title and path keep long content bounded", () => {
  const title = "T".repeat(1_100);
  const heading = "H".repeat(1_100);
  const content = "word ".repeat(1_000);
  const chunks = chunkWordPressHtml(title, `<h2>${heading}</h2><p>${content}</p>`);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.content.length <= WORDPRESS_MAX_CHUNK_CHARACTERS));
});

test("tables preserve headers, empty cells, inline HTML, entities, and literal pipes", () => {
  const chunks = chunkWordPressHtml("Data", `
    <h2>Metrics</h2><p>Before table.</p>
    <table><thead><tr><th>Name</th><th>Value</th><th>Note</th></tr></thead><tbody>
      <tr><td><p>Alpha <strong>&amp;</strong> Beta</p></td><td></td><td>A | B</td></tr>
      <tr><td>Gamma</td><td><em>42</em></td><td>Done</td></tr>
    </tbody></table><p>After table.</p>`);
  const content = chunks.map((chunk) => chunk.content).join("\n");
  assert.match(content, /Table 1 headers: Name \| Value \| Note/);
  assert.match(content, /Table 1 row 1: Alpha & Beta \|  \| A \\\| B/);
  assert.match(content, /Table 1 row 2: Gamma \| 42 \| Done/);
  assert.match(content, /Paragraph: Before table\./);
  assert.match(content, /Paragraph: After table\./);
});

test("structured plain text retains table-only and mixed prose while stripping scripts and styles", () => {
  const tableOnly = htmlToStructuredPlainText("<script><table><tr><td>secret</td></tr></table></script><table><tr><th>A</th><th>B</th></tr><tr><td>x</td><td>y | z</td></tr></table>");
  assert.equal(tableOnly, "Table headers: A | B\nTable row: x | y \\| z");
  const mixed = htmlToStructuredPlainText("<p>Before.</p><table><tr><td>Cell<style>hidden</style></td></tr></table><p>After.</p>");
  assert.match(mixed, /^Before\.\nTable headers: \(none\)\nTable row: Cell\nAfter\.$/u);
  assert.doesNotMatch(`${tableOnly}\n${mixed}`, /secret|hidden/u);
});

test("split tables repeat headers and keep every short row intact", () => {
  const rows = Array.from({ length: 80 }, (_, index) => `<tr><td>row-${index}</td><td>${"value ".repeat(5)}${index}</td></tr>`).join("");
  const chunks = chunkWordPressHtml("Large table", `<h2>Rows</h2><table><tr><th>ID</th><th>Value</th></tr>${rows}</table>`);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.content.length <= WORDPRESS_MAX_CHUNK_CHARACTERS));
  assert.ok(chunks.every((chunk) => chunk.content.includes("Table 1 headers: ID | Value")));
  const combined = chunks.map((chunk) => chunk.content).join("\n");
  for (let index = 0; index < 80; index += 1) {
    assert.equal((combined.match(new RegExp(`Table 1 row ${index + 1}: row-${index} \\|`, "g")) ?? []).length, 1);
  }
});

test("headerless and multiple tables retain independent row relationships", () => {
  const content = chunkWordPressHtml("Tables", `
    <table><tr><td>A</td><td></td><td>C</td></tr></table>
    <p>Between.</p>
    <table><tr><th>Left</th><th>Right</th></tr><tr><td>L</td><td>R</td></tr></table>`)
    .map((chunk) => chunk.content).join("\n");
  assert.match(content, /Table 1 headers: \(none\)/);
  assert.match(content, /Table 1 row 1: A \|  \| C/);
  assert.match(content, /Paragraph: Between\./);
  assert.match(content, /Table 2 headers: Left \| Right/);
  assert.match(content, /Table 2 row 1: L \| R/);
});

test("oversized table rows use bounded labeled cell continuations without loss", () => {
  const longCell = Array.from({ length: 900 }, (_, index) => `token-${index}`).join(" ");
  const chunks = chunkWordPressHtml("Oversized", `<table><tr><th>ID</th><th>Description</th></tr><tr><td>one</td><td>${longCell}</td></tr></table>`);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.content.length <= WORDPRESS_MAX_CHUNK_CHARACTERS));
  assert.ok(chunks.every((chunk) => chunk.content.includes("Table 1 headers: ID | Description")));
  const content = chunks.map((chunk) => chunk.content).join("\n");
  assert.match(content, /Table 1 row 1, Description \(continued\), part 1:/);
  for (let index = 0; index < 900; index += 1) assert.ok(content.includes(`token-${index}`));
});
