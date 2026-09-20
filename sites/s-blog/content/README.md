# Blog Content

This directory is the source of truth for editable Blog content.

| Path | Content |
| --- | --- |
| `site.json` | Reusable site name, SEO defaults, author details, navigation, and stats |
| `pages/*.md` | Headings, descriptions, labels, and other copy for each top-level route |
| `posts.json` | Blog listing cards, dates, tags, links, and summaries |
| `posts/*.mdx` | Blog post frontmatter and body content |
| `skills.json` | Reusable skill labels |

The Website Content Editor discovers supported files recursively from this directory. Keep implementation components, layouts, and route files outside `content/`.