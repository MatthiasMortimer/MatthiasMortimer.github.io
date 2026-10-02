// Content Inventory - Centralized manifest of all content files across all websites
// Helps dev management apps discover and manage content consistently

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listEditableSites } from "./sites.registry.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const CONTENT_TYPES = {
	BLOG_POST: "blog_post",
	PAGE: "page",
	CONFIG: "config",
	METADATA: "metadata",
	IDENTITY: "identity",
	PROJECTS: "projects",
	TAGS: "tags",
	VERSIONS: "versions",
	SEO: "seo",
};

const GLOBAL_CONTENT_DENYLIST = new Set(["package.json"]);

export function discoverGlobalContentFiles(directory = path.join(ROOT_DIR, "ritesGlobal")) {
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				path.extname(entry.name).toLowerCase() === ".json" &&
				!entry.name.startsWith(".") &&
				!GLOBAL_CONTENT_DENYLIST.has(entry.name.toLowerCase()),
		)
		.map((entry) => entry.name)
		.sort();
}

export const GLOBAL_CONTENT_FILES = discoverGlobalContentFiles().map((file) => `ritesGlobal/${file}`);

const CONTENT_EXTENSIONS = new Set([".json", ".md", ".mdx", ".js", ".mjs", ".astro", ".html", ".txt"]);

function discoverContentFiles(siteDir, roots = ["content"], extensions = CONTENT_EXTENSIONS) {
	const files = [];
	const allowedExtensions = extensions instanceof Set ? extensions : new Set(extensions);

	function visit(directory) {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || entry.name.endsWith(".bak")) continue;

			const filePath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				visit(filePath);
				continue;
			}

			const relativePath = path.relative(siteDir, filePath).split(path.sep).join("/");
			const extension = path.extname(entry.name).toLowerCase();
			if (entry.name.toLowerCase() === "readme.md") continue;
			if (!allowedExtensions.has(extension)) continue;

			files.push(relativePath);
		}
	}

	for (const root of roots) {
		const contentRoot = path.resolve(siteDir, root);
		const relativeRoot = path.relative(siteDir, contentRoot);
		if (relativeRoot.startsWith("..") || path.isAbsolute(relativeRoot) || !fs.existsSync(contentRoot)) continue;
		visit(contentRoot);
	}
	return files.sort();
}

function createContentTypes(site) {
	if (site.editor?.groups) {
		return Object.fromEntries(site.editor.groups.map((group) => [
			group.type,
			{
				label: group.label,
				files: discoverContentFiles(site.dir, group.roots, group.extensions || CONTENT_EXTENSIONS),
			},
		]));
	}

	const groups = {};

	for (const file of discoverContentFiles(site.dir)) {
		let type = CONTENT_TYPES.CONFIG;
		let label = "Reusable Content";

		if (file === "content/site.json") {
			type = CONTENT_TYPES.METADATA;
			label = "Site Settings";
		} else if (file.startsWith("content/posts/")) {
			type = CONTENT_TYPES.BLOG_POST;
			label = "Blog Posts";
		} else if (file.startsWith("content/pages/")) {
			type = CONTENT_TYPES.PAGE;
			label = "Page Content";
		}

		groups[type] ??= { label, files: [] };
		groups[type].files.push(file);
	}

	for (const group of Object.values(groups)) {
		const directories = new Set(group.files.map((file) => path.posix.dirname(file)));
		if (directories.size === 1) group.folder = `${[...directories][0]}/`;
	}

	return groups;
}

const GLOBAL_FILE_TYPES = new Map([
	["contact.json", { type: CONTENT_TYPES.IDENTITY, label: "Contact & Identity" }],
	["projects.json", { type: CONTENT_TYPES.PROJECTS, label: "Projects" }],
	["tags.json", { type: CONTENT_TYPES.TAGS, label: "Shared Tags" }],
	["versions.json", { type: CONTENT_TYPES.VERSIONS, label: "Versions" }],
	["seo.json", { type: CONTENT_TYPES.SEO, label: "SEO Defaults" }],
]);

function createGlobalContentTypes() {
	const groups = {};
	for (const file of GLOBAL_CONTENT_FILES) {
		const filename = path.basename(file);
		const knownType = GLOBAL_FILE_TYPES.get(filename);
		const type = knownType?.type ?? CONTENT_TYPES.CONFIG;
		const label = knownType?.label ?? "Global JSON";
		groups[type] ??= { label, files: [] };
		groups[type].files.push(filename);
	}
	return groups;
}

const SITE_CONTENT_CONFIG = Object.fromEntries(
	listEditableSites().map((site) => [site.folder, { name: site.label, contentTypes: createContentTypes(site) }]),
);

/**
 * Get content inventory for all sites
 * @returns {Array} Array of site content objects with detailed file information
 */
export function getContentInventory() {
	const sites = listEditableSites();
	const globalDir = path.join(ROOT_DIR, "ritesGlobal");
	const globalContent = {
		slug: "global",
		folder: "ritesGlobal",
		label: "Ecosystem Global",
		dir: globalDir,
		contentTypes: createGlobalContentTypes(),
		metadata: {
			created: new Date().toISOString(),
			lastUpdated: getLastModified(globalDir),
		},
	};

	const siteContent = sites.map((site) => {
		const config = {
			name: site.label,
			contentTypes: createContentTypes(site),
		};

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
	});

	return [globalContent, ...siteContent];
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

export function getGlobalContentInventory() {
	return GLOBAL_CONTENT_FILES.map((file) => ({
		file,
		exists: fs.existsSync(path.join(ROOT_DIR, file)),
	}));
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
		const configuredFiles = contentConfig.files?.filter(
			(file) => file === filename || path.basename(file) === filename,
		) || [];
		if (configuredFiles.length === 1) return path.join(site.dir, configuredFiles[0]);
		if (contentConfig.folder) return path.join(site.dir, contentConfig.folder, filename);
		return null;
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
			const stat = file.isDirectory() ? fs.statSync(filePath) : fs.statSync(filePath);
			if (stat.mtime > latest) {
				latest = stat.mtime;
			}
			if (file.isDirectory()) {
				const nested = new Date(getLastModified(filePath));
				if (nested > latest) latest = nested;
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
