# Tech Business & Freelance Portfolio (Astro)
# To-Do 
- 
A clean, customizable, fast tech business and portfolio website for freelance web development and freelance technical teaching/tutoring. Built with Astro.

## Features

- **Dual Focus**: Highlights both Freelance Web Development services and Freelance Teaching / Technical Tutoring.
- **Data-Driven & Highly Customizable**: Edit site identity, services, portfolio projects, testimonials, stats, skills, and FAQs in `src/content/`.
- **Placeholder Media**: Clean SVG placeholders included in `public/media/` for logos, hero images, and project previews.
- **Contact & Inquiries**: Interactive contact form with option to select service type (Dev or Teaching) and direct contact details.
- **Responsive & Modern Styling**: Built with CSS custom properties (`var(--...)`) for effortless theme customization.

See [src/content/README.md](src/content/README.md) for a simple guide to each editable content file.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Or from the workspace root:

```bash
npm run dev -- BlogRites
```

## Structure

```
BlogRites/
├── public/              # Static assets and SVG media placeholders
│   └── media/
├── src/
│   ├── components/      # Reusable UI components (SiteNav, Footer, ServiceCard, ProjectCard, ContactForm, etc.)
│   ├── content/         # Editable Markdown and JSON content (the source of truth)
│   │   ├── README.md    # Guide to each editable content file
│   │   ├── pages/       # Page-specific Markdown frontmatter, such as contact FAQs
│   │   ├── projects.json
│   │   ├── services.json
│   │   ├── site.json
│   │   ├── skills.json
│   │   ├── stats.json
│   │   └── testimonials.json
│   ├── const/           # Identity adapter kept for existing layout imports
│   ├── layouts/         # Page layout templates (BaseLayout.astro)
│   ├── pages/           # Site pages (index.astro, about.astro, services.astro, portfolio.astro, contact.astro)
│   └── styles/          # Global styles & CSS variable themes (global.css)
└── astro.config.mjs
```
