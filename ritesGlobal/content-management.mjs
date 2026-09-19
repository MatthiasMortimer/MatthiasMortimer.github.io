// Content Management Utilities - Shared functions for dev apps to manage content
// Provides file I/O, content parsing, and management helpers

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSiteContent, getContentFilePath, CONTENT_TYPES } from "./content-inventory.mjs";
import { listSites } from "./sites.registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

/**
 * Read a content file (JSON, JS, MD, MDX)
 * @param {string} siteSlug - Site slug
 * @param {string} contentType - Content type
 * @param {string} filename - Filename to read
 * @returns {Promise<string|Object>} File contents
 */
export async function readContentFile(siteSlug, contentType, filename) {
	const filePath = getContentFilePath(siteSlug, contentType, filename);
	if (!filePath) throw new Error(`Invalid path for ${siteSlug}/${contentType}/${filename}`);

	try {
		const content = fs.readFileSync(filePath, "utf8");

		// Parse JSON files
		if (filePath.endsWith(".json")) {
			return JSON.parse(content);
		}

		// For JS files, return raw content (caller should eval or import)
		return content;
	} catch (error) {
		throw new Error(`Failed to read ${filePath}: ${error.message}`);
	}
}

/**
 * Write content to a file with backup
 * @param {string} siteSlug - Site slug
 * @param {string} contentType - Content type
 * @param {string} filename - Filename to write
 * @param {string|Object} content - Content to write
 * @param {boolean} createBackup - Create .bak backup file
 * @returns {Promise<void>}
 */
export async function writeContentFile(siteSlug, contentType, filename, content, createBackup = true) {
	const filePath = getContentFilePath(siteSlug, contentType, filename);
	if (!filePath) throw new Error(`Invalid path for ${siteSlug}/${contentType}/${filename}`);

	try {
		// Create backup if file exists
		if (createBackup && fs.existsSync(filePath)) {
			const backupPath = `${filePath}.bak`;
			fs.copyFileSync(filePath, backupPath);
		}

		// Convert object to string if needed
		let contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);

		// Ensure directory exists
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		fs.writeFileSync(filePath, contentStr, "utf8");
	} catch (error) {
		throw new Error(`Failed to write ${filePath}: ${error.message}`);
	}
}

/**
 * List all files in a content folder
 * @param {string} siteSlug - Site slug
 * @param {string} contentType - Content type
 * @returns {Promise<Array>} Array of filenames
 */
export async function listContentFiles(siteSlug, contentType) {
	const folderPath = getContentFilePath(siteSlug, contentType);
	if (!folderPath) throw new Error(`Invalid path for ${siteSlug}/${contentType}`);

	try {
		if (!fs.existsSync(folderPath)) return [];

		return fs
			.readdirSync(folderPath, { withFileTypes: true })
			.filter((file) => !file.isDirectory() && !file.name.startsWith("."))
			.map((file) => file.name);
	} catch (error) {
		throw new Error(`Failed to list files in ${folderPath}: ${error.message}`);
	}
}

/**
 * Get file metadata (size, modified, etc)
 * @param {string} siteSlug - Site slug
 * @param {string} contentType - Content type
 * @param {string} filename - Filename
 * @returns {Promise<Object>} File metadata
 */
export async function getFileMetadata(siteSlug, contentType, filename) {
	const filePath = getContentFilePath(siteSlug, contentType, filename);
	if (!filePath) throw new Error(`Invalid path for ${siteSlug}/${contentType}/${filename}`);

	try {
		const stats = fs.statSync(filePath);
		return {
			size: stats.size,
			modified: stats.mtime,
			created: stats.birthtime,
			isDirectory: stats.isDirectory(),
		};
	} catch (error) {
		throw new Error(`Failed to get metadata for ${filePath}: ${error.message}`);
	}
}

/**
 * Create a new post in posts.js
 * @param {string} siteSlug - Site slug
 * @param {Object} postData - Post data object
 * @returns {Promise<Array>} Updated posts array
 */
export async function createPost(siteSlug, postData) {
	if (siteSlug !== "blog" && siteSlug !== "ritesdev") {
		throw new Error(`Cannot create posts in site: ${siteSlug}`);
	}

	try {
		const content = await readContentFile(siteSlug, CONTENT_TYPES.CONFIG, "posts.js");

		// Parse the posts array from export statement
		// Assumes format: export const posts = [...]
		const postsMatch = content.match(/export const posts = (\[[\s\S]*\]);/);
		if (!postsMatch) throw new Error("Could not parse posts array");

		let posts = eval(postsMatch[1]); // Safely evaluate the array

		// Add new post
		posts.push({
			title: postData.title || "Untitled",
			href: postData.href || `/posts/${Date.now()}/`,
			date: postData.date || new Date().toISOString().split("T")[0],
			tag: postData.tag || "untagged",
			description: postData.description || "",
		});

		// Write back to file
		const updatedContent = content.replace(
			/export const posts = \[[\s\S]*\];/,
			`export const posts = ${JSON.stringify(posts, null, 2)};`
		);

		await writeContentFile(siteSlug, CONTENT_TYPES.CONFIG, "posts.js", updatedContent);

		return posts;
	} catch (error) {
		throw new Error(`Failed to create post: ${error.message}`);
	}
}

/**
 * Update an existing post in posts.js
 * @param {string} siteSlug - Site slug
 * @param {number} postIndex - Index of post to update
 * @param {Object} updates - Updates to merge
 * @returns {Promise<Array>} Updated posts array
 */
export async function updatePost(siteSlug, postIndex, updates) {
	if (siteSlug !== "blog" && siteSlug !== "ritesdev") {
		throw new Error(`Cannot update posts in site: ${siteSlug}`);
	}

	try {
		const content = await readContentFile(siteSlug, CONTENT_TYPES.CONFIG, "posts.js");

		const postsMatch = content.match(/export const posts = (\[[\s\S]*\]);/);
		if (!postsMatch) throw new Error("Could not parse posts array");

		let posts = eval(postsMatch[1]);

		if (postIndex >= posts.length || postIndex < 0) {
			throw new Error(`Invalid post index: ${postIndex}`);
		}

		posts[postIndex] = { ...posts[postIndex], ...updates };

		const updatedContent = content.replace(
			/export const posts = \[[\s\S]*\];/,
			`export const posts = ${JSON.stringify(posts, null, 2)};`
		);

		await writeContentFile(siteSlug, CONTENT_TYPES.CONFIG, "posts.js", updatedContent);

		return posts;
	} catch (error) {
		throw new Error(`Failed to update post: ${error.message}`);
	}
}

/**
 * Delete a post from posts.js
 * @param {string} siteSlug - Site slug
 * @param {number} postIndex - Index of post to delete
 * @returns {Promise<Array>} Updated posts array
 */
export async function deletePost(siteSlug, postIndex) {
	if (siteSlug !== "blog" && siteSlug !== "ritesdev") {
		throw new Error(`Cannot delete posts from site: ${siteSlug}`);
	}

	try {
		const content = await readContentFile(siteSlug, CONTENT_TYPES.CONFIG, "posts.js");

		const postsMatch = content.match(/export const posts = (\[[\s\S]*\]);/);
		if (!postsMatch) throw new Error("Could not parse posts array");

		let posts = eval(postsMatch[1]);

		if (postIndex >= posts.length || postIndex < 0) {
			throw new Error(`Invalid post index: ${postIndex}`);
		}

		posts.splice(postIndex, 1);

		const updatedContent = content.replace(
			/export const posts = \[[\s\S]*\];/,
			`export const posts = ${JSON.stringify(posts, null, 2)};`
		);

		await writeContentFile(siteSlug, CONTENT_TYPES.CONFIG, "posts.js", updatedContent);

		return posts;
	} catch (error) {
		throw new Error(`Failed to delete post: ${error.message}`);
	}
}

/**
 * Get all posts for a site
 * @param {string} siteSlug - Site slug
 * @returns {Promise<Array>} Array of posts
 */
export async function getPosts(siteSlug) {
	try {
		const content = await readContentFile(siteSlug, CONTENT_TYPES.CONFIG, "posts.js");
		const postsMatch = content.match(/export const posts = (\[[\s\S]*\]);/);

		if (!postsMatch) throw new Error("Could not parse posts array");

		return eval(postsMatch[1]);
	} catch (error) {
		throw new Error(`Failed to get posts: ${error.message}`);
	}
}

/**
 * Get all available sites and their info
 * @returns {Array} Array of sites with details
 */
export async function getAllSites() {
	return listSites().map((site) => ({
		slug: site.slug,
		label: site.label,
		folder: site.folder,
		basePath: site.basePath,
		dir: site.dir,
	}));
}

/**
 * Validate file path to prevent directory traversal
 * @param {string} filePath - Path to validate
 * @param {string} allowedDir - Base directory to stay within
 * @returns {boolean} True if path is safe
 */
export function isPathSafe(filePath, allowedDir) {
	const resolved = path.resolve(filePath);
	const allowed = path.resolve(allowedDir);
	return resolved.startsWith(allowed);
}

/**
 * Create a new markdown page file
 * @param {string} siteSlug - Site slug
 * @param {string} filename - Filename (without .md)
 * @param {string} content - Page content (markdown)
 * @returns {Promise<void>}
 */
export async function createPage(siteSlug, filename, content) {
	const filePath = getContentFilePath(siteSlug, CONTENT_TYPES.PAGE, filename);
	if (!filePath) throw new Error(`Cannot create pages in site: ${siteSlug}`);

	const mdFilePath = filePath.endsWith(".md") ? filePath : `${filePath}.md`;

	try {
		const dir = path.dirname(mdFilePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		fs.writeFileSync(mdFilePath, content, "utf8");
	} catch (error) {
		throw new Error(`Failed to create page: ${error.message}`);
	}
}

// Export for use in dev apps
export { CONTENT_TYPES };
