---
title: Building This Site
description: The technical decisions behind johnserra.com — Next.js, Tailwind, MDX, and a bento grid layout.
date: "2026-02-20"
tags: [tech, next.js, design]
---

I wanted a personal site that felt deliberate — not a template with my name swapped in. Here's how it came together and some of the tradeoffs I made along the way.

## Stack

The site runs on **Next.js 15** with the App Router and is deployed on Vercel. Content (including this post) is written in Markdown and rendered with `next-mdx-remote` at build time, which means zero client JavaScript for reading a blog post.

**Tailwind CSS** handles all styling. I was skeptical of utility-first CSS for years, but after using it on a few projects I've come around. The bento grid layout on the home page would have been painful to maintain with traditional CSS.

## The bento grid

The layout on the home page is a 12-column bento grid — a design pattern popularized by Apple's product pages. Each box has a configurable `span` prop, so it's easy to rearrange sections without touching layout code.

```tsx
<BentoBox span={8} variant="gradient">
  <AboutTeaserBox />
</BentoBox>
```

## Content pipeline

All written content (about, portfolio case studies, recipes, blog posts) lives in a `content/` directory as Markdown files with YAML frontmatter. A single `content.ts` utility handles reading, parsing, and sorting — so adding a new content type is as simple as creating a new subdirectory.

## What I'd do differently

- **Database-backed content.** Flat files are fast to start with, but editing from a phone is painful. I'd consider a headless CMS for anything that needs frequent updates.
- **More aggressive image optimization.** Next.js `<Image />` helps, but I haven't done a proper audit of the assets yet.

Overall, it was a satisfying build. The constraint of keeping it simple actually pushed me toward better decisions.
