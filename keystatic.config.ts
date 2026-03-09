import { config, fields, collection, singleton } from "@keystatic/core";

export default config({
  storage: {
    kind: "local",
  },
  ui: {
    brand: {
      name: "John Serra",
    },
  },
  collections: {
    blogEn: collection({
      label: "Blog Posts (EN)",
      slugField: "title",
      path: "content/en/blog/*",
      format: { contentField: "content" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        description: fields.text({ label: "Description", multiline: true }),
        date: fields.date({ label: "Date" }),
        tags: fields.array(fields.text({ label: "Tag" }), {
          label: "Tags",
          itemLabel: (props) => props.value,
        }),
        coverImage: fields.text({ label: "Cover Image Path" }),
        // Recipe-specific fields (optional)
        cuisine: fields.text({ label: "Cuisine (recipes only)" }),
        servings: fields.integer({ label: "Servings (recipes only)" }),
        prepTime: fields.text({ label: "Prep Time (recipes only)" }),
        cookTime: fields.text({ label: "Cook Time (recipes only)" }),
        totalTime: fields.text({ label: "Total Time (recipes only)" }),
        story: fields.checkbox({ label: "Has Story Section (recipes only)" }),
        content: fields.mdx({ label: "Content" }),
      },
    }),
    blogTr: collection({
      label: "Blog Posts (TR)",
      slugField: "title",
      path: "content/tr/blog/*",
      format: { contentField: "content" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        description: fields.text({ label: "Description", multiline: true }),
        date: fields.date({ label: "Date" }),
        tags: fields.array(fields.text({ label: "Tag" }), {
          label: "Tags",
          itemLabel: (props) => props.value,
        }),
        coverImage: fields.text({ label: "Cover Image Path" }),
        cuisine: fields.text({ label: "Cuisine (recipes only)" }),
        servings: fields.integer({ label: "Servings (recipes only)" }),
        prepTime: fields.text({ label: "Prep Time (recipes only)" }),
        cookTime: fields.text({ label: "Cook Time (recipes only)" }),
        totalTime: fields.text({ label: "Total Time (recipes only)" }),
        story: fields.checkbox({ label: "Has Story Section (recipes only)" }),
        translationOf: fields.text({ label: "Translation Of (EN slug)" }),
        content: fields.mdx({ label: "Content" }),
      },
    }),
    portfolioEn: collection({
      label: "Portfolio (EN)",
      slugField: "title",
      path: "content/en/portfolio/*",
      format: { contentField: "content" },
      schema: {
        title: fields.slug({ name: { label: "Title" } }),
        description: fields.text({ label: "Description", multiline: true }),
        date: fields.date({ label: "Date" }),
        tags: fields.array(fields.text({ label: "Tag" }), {
          label: "Tags",
          itemLabel: (props) => props.value,
        }),
        status: fields.text({ label: "Status" }),
        coverImage: fields.text({ label: "Cover Image Path" }),
        githubUrl: fields.text({ label: "GitHub URL" }),
        liveUrl: fields.text({ label: "Live URL" }),
        content: fields.mdx({ label: "Content" }),
      },
    }),
  },
  singletons: {
    aboutEn: singleton({
      label: "About (EN)",
      path: "content/en/about/index",
      format: { contentField: "content" },
      schema: {
        title: fields.text({ label: "Title" }),
        description: fields.text({ label: "Description", multiline: true }),
        content: fields.mdx({ label: "Content" }),
      },
    }),
    aboutTr: singleton({
      label: "About (TR)",
      path: "content/tr/about/index",
      format: { contentField: "content" },
      schema: {
        title: fields.text({ label: "Title" }),
        description: fields.text({ label: "Description", multiline: true }),
        content: fields.mdx({ label: "Content" }),
      },
    }),
  },
});
