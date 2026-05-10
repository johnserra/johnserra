import { config, fields, collection, singleton } from "@keystatic/core";

export default config({
  storage: process.env.CI
    ? { kind: "local" }
    : { kind: "github", repo: "johnserra/johnserra" },
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
        content: fields.mdx({ 
          label: "Content",
          components: {
            Callout: {
              label: "Callout",
              schema: {
                type: fields.select({
                  label: "Type",
                  options: [
                    { label: "Note", value: "info" },
                    { label: "Success", value: "success" },
                    { label: "Warning", value: "warning" },
                    { label: "Idea", value: "tip" },
                  ],
                  defaultValue: "info",
                }),
                title: fields.text({ label: "Title (Optional)" }),
                content: fields.child({
                  kind: "block",
                  placeholder: "Write your highlight content here...",
                  formatting: { inlineCode: true, strong: true, emphasis: true, links: true },
                }),
              },
            },
          },
        }),
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
        content: fields.mdx({ 
          label: "Content",
          components: {
            Callout: {
              label: "Callout",
              schema: {
                type: fields.select({
                  label: "Type",
                  options: [
                    { label: "Note", value: "info" },
                    { label: "Success", value: "success" },
                    { label: "Warning", value: "warning" },
                    { label: "Idea", value: "tip" },
                  ],
                  defaultValue: "info",
                }),
                title: fields.text({ label: "Title (Optional)" }),
                content: fields.child({
                  kind: "block",
                  placeholder: "Write your highlight content here...",
                  formatting: { inlineCode: true, strong: true, emphasis: true, links: true },
                }),
              },
            },
          },
        }),
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
        content: fields.mdx({ 
          label: "Content",
          components: {
            Callout: {
              label: "Callout",
              schema: {
                type: fields.select({
                  label: "Type",
                  options: [
                    { label: "Note", value: "info" },
                    { label: "Success", value: "success" },
                    { label: "Warning", value: "warning" },
                    { label: "Idea", value: "tip" },
                  ],
                  defaultValue: "info",
                }),
                title: fields.text({ label: "Title (Optional)" }),
                content: fields.child({
                  kind: "block",
                  placeholder: "Write your highlight content here...",
                  formatting: { inlineCode: true, strong: true, emphasis: true, links: true },
                }),
              },
            },
          },
        }),
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
        content: fields.mdx({ 
          label: "Content",
          components: {
            Callout: {
              label: "Callout",
              schema: {
                type: fields.select({
                  label: "Type",
                  options: [
                    { label: "Note", value: "info" },
                    { label: "Success", value: "success" },
                    { label: "Warning", value: "warning" },
                    { label: "Idea", value: "tip" },
                  ],
                  defaultValue: "info",
                }),
                title: fields.text({ label: "Title (Optional)" }),
                content: fields.child({
                  kind: "block",
                  placeholder: "Write your highlight content here...",
                  formatting: { inlineCode: true, strong: true, emphasis: true, links: true },
                }),
              },
            },
          },
        }),
      },
    }),
    aboutTr: singleton({
      label: "About (TR)",
      path: "content/tr/about/index",
      format: { contentField: "content" },
      schema: {
        title: fields.text({ label: "Title" }),
        description: fields.text({ label: "Description", multiline: true }),
        content: fields.mdx({ 
          label: "Content",
          components: {
            Callout: {
              label: "Callout",
              schema: {
                type: fields.select({
                  label: "Type",
                  options: [
                    { label: "Note", value: "info" },
                    { label: "Success", value: "success" },
                    { label: "Warning", value: "warning" },
                    { label: "Idea", value: "tip" },
                  ],
                  defaultValue: "info",
                }),
                title: fields.text({ label: "Title (Optional)" }),
                content: fields.child({
                  kind: "block",
                  placeholder: "Write your highlight content here...",
                  formatting: { inlineCode: true, strong: true, emphasis: true, links: true },
                }),
              },
            },
          },
        }),
      },
    }),
  },
});
