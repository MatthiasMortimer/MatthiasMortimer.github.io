# Content Directory

This folder is the source of truth for editable RitesDev site content. Shared ecosystem contact, project, and version data lives in the Website Content Editor's Ecosystem Global section.

| File | Edit this to change |
| --- | --- |
| `site.json` | Reusable site name, SEO metadata, navigation, primary action, and footer copy |
| `pages/index.md` | Home page hero, overview cards, service cards, testimonials, and CTA copy |
| `pages/about.md` | About page copy, philosophy, labels, and site metrics |
| `pages/contact.md` | Contact page headings, labels, and FAQs |
| `pages/services.md` | Service headings, skill lists, and process steps |
| `pages/portfolio.md` | Portfolio headings, project cards, tags, links, and GitHub callout |

Shared contact details, identity, and common media paths live in `ritesGlobal/contact.json` and `ritesGlobal/content.js`. Update those files when a contact detail must be shared by every site.

## Where the content appears

- `site.json` is reused by the layout, navigation, and footer.
- `pages/index.md` appears on the home page and supplies service cards reused elsewhere.
- `pages/about.md`, `pages/contact.md`, `pages/services.md`, and `pages/portfolio.md` supply their matching routes.

Keep the existing frontmatter field names when editing. Image paths should point to files inside `public/`, such as `/media/project-dev.svg`.
