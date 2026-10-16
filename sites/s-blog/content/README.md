# Blog Content

This directory is the source of truth for editable Blog content.

| Path | Content |
| --- | --- |
| `site.json` | Reusable site name, SEO defaults, author details, navigation, and stats |
| `pages/*.md` | Headings, descriptions, labels, and other copy for each top-level route |
| `posts/*.mdx` | Blog post frontmatter, listing metadata, tags, and body content |
| `skills.json` | Reusable skill labels |
| `home-info.json` | Home's static information card: optional title and plain-text body (line breaks supported); blank by default |

The Website Content Editor discovers supported files recursively from this directory. Keep implementation components, layouts, and route files outside `content/`.

Home includes the biography, hobbies, and projects formerly displayed on About.
Their copy remains editable in `pages/about.md`; the old About URL redirects to
the Home biography. Home's introduction and latest-post labels remain in
`pages/index.md`. Edit `home-info.json` under Blog's Reusable Content group in the
Website Content Editor to populate the left card. The right About card uses the
biography and hobbies in `pages/about.md`. On desktop, the side cards stay in place
while the keyboard-focusable middle column scrolls through the introduction,
posts, and projects. Longer About content can scroll within its card to stay
accessible. On narrow screens, the layout stacks with normal page scrolling.
Neither side card has hover lift or scroll reveals.
Home's footer follows the projects inside the middle column and scrolls with it;
other Blog pages keep their normal page footer.

For quick editing, select Blog in Website Content Editor and use **Home cards**:
**Left card - Website information** or **Right card - About Me**.
These focused forms show only the card's fields, with larger text inputs and
placeholder guidance. Saving About Me preserves its SEO and project-heading
fields. The original files remain available below for full-document editing.

Canonical reusable tag labels live in `ritesGlobal/tags.json`; the post-specific selection lives in each MDX file's `tags` frontmatter field.

## Reading and motion

Post cards, project cards, and section headings gently reveal once per page load.
Article paragraphs remain stationary. Existing hover effects are unchanged.
Reveals use local CSS and a native IntersectionObserver, with no external services.
Content remains visible without JavaScript or IntersectionObserver, and reveal
animations are disabled for reduced-motion preferences. Keyboard focus also
immediately ends a reveal so links stay readable.

Reveal targets are marked in the implementation templates with `data-scroll-reveal`;
no animation fields are needed in editable content.