// Content Inventory - Centralized manifest of all content files across all websites
// Helps dev management apps discover and manage content consistently

import fs from "node:fs";
import path from "node:path";
import { listSites } from "./sites.registry.mjs";

export const CONTENT_TYPES = {
	BLOG_POST: "blog_post",
	PAGE: "page",
	CONFIG: "config",
	METADATA: "metadata",
	COMPONENT: "component",
	STYLE: "style",
};

// Site-specific content configuration
const SITE_CONTENT_CONFIG = {
	"s-blog": {
		name: "Blog",
		contentTypes: {
			[CONTENT_TYPES.BLOG_POST]: {
				label: "Blog Posts",
				registry: "const/posts.js",
				folder: "pages/posts/",
				files: [],
			},
			[CONTENT_TYPES.CONFIG]: {
				label: "Configuration",
				files: [
					"const/posts.js",
					"const/tags.js",
					"const/skills.json",
					"const/identity.js",
					"const/siteStats.js",
				],
			},
			[CONTENT_TYPES.COMPONENT]: {
				label: "Components",
				folder: "components/",
				files: ["PostCard.astro", "SiteNav.astro"],
			},
		},
	},
	"s-ritesdev": {
		name: "RitesDev",
		contentTypes: {
			[CONTENT_TYPES.PAGE]: {
				label: "Pages",
				folder: "content/pages/",
				files: ["about.md", "contact.md", "index.md", "portfolio.md", "services.md"],
			},
			[CONTENT_TYPES.CONFIG]: {
				label: "Configuration",
				files: [
					"const/identity.js",
					"content/site.json",
					"layouts/BaseLayout.astro",
				],
			},
			[CONTENT_TYPES.COMPONENT]: {
				label: "Components",
				folder: "components/",
				files: [
					"ContactForm.astro",
					"Footer.astro",
					"ProjectCard.astro",
					"ServiceCard.astro",
					"SiteNav.astro",
					"TestimonialCard.astro",
				],
			},
		},
	},
};

/**
 * Get content inventory for all sites
 * @returns {Array} Array of site content objects with detailed file information
 */
export function getContentInventory() {
	const sites = listSites();
	return sites.map((site) => {
		const config = SITE_CONTENT_CONFIG[site.folder];
		if (!config) return null;

		return {
			slug: site.slug,
			folder: site.folder,
			label: site.label,
			dir: site.dir,
			contentTypes: config.contentTypes,
			metadata: {
				created: new Date().toISOString(),
				lastUpdated: getLastModified(site.dir),
			},
		};
	}).filter(Boolean);
}

/**
 * Get specific content type across all sites
 * @param {string} contentType - Type of content to retrieve
 * @returns {Array} Array of content by site
 */
export function getContentByType(contentType) {
	const inventory = getContentInventory();
	return inventory.map((site) => ({
		site: site.slug,
		label: site.label,
		content: site.contentTypes[contentType] || null,
	})).filter((item) => item.content !== null);
}

/**
 * Get all files for a specific site
 * @param {string} siteSlug - Site slug (e.g., "blog", "ritesdev")
 * @returns {Object} Site content structure with all files
 */
export function getSiteContent(siteSlug) {
	const inventory = getContentInventory();
	return inventory.find((site) => site.slug === siteSlug);
}

/**
 * Get full file path for a content file
 * @param {string} siteSlug - Site slug
 * @param {string} contentType - Content type
 * @param {string} filename - Filename (optional)
 * @returns {string} Full file path
 */
export function getContentFilePath(siteSlug, contentType, filename = "") {
	const site = getSiteContent(siteSlug);
	if (!site) return null;

	const contentConfig = site.contentTypes[contentType];
	if (!contentConfig) return null;

	if (filename) {
		const folder = contentConfig.folder;
		if (folder) {
			return path.join(site.dir, folder, filename);
		}
		return path.join(site.dir, contentConfig.files?.[0] || "");
	}

	if (contentConfig.folder) {
		return path.join(site.dir, contentConfig.folder);
	}
	return site.dir;
}

/**
 * Recursively get last modified date of a directory
 * @param {string} dir - Directory path
 * @returns {string} ISO timestamp
 */
function getLastModified(dir) {
	try {
		let latest = fs.statSync(dir).mtime;
		const files = fs.readdirSync(dir, { withFileTypes: true });

		for (const file of files) {
			const filePath = path.join(dir, file.name);
			const stat = fs.statSync(filePath);
			if (stat.mtime > latest) {
				latest = stat.mtime;
			}
		}
		return latest.toISOString();
	} catch {
		return new Date().toISOString();
	}
}

// Export configuration for direct access
export { SITE_CONTENT_CONFIG };

// Example usage:
// const inventory = getContentInventory();
// const blogContent = getSiteContent("blog");
// const postFiles = getContentByType(CONTENT_TYPES.BLOG_POST);
// const filePath = getContentFilePath("blog", CONTENT_TYPES.BLOG_POST, "posts.js");
