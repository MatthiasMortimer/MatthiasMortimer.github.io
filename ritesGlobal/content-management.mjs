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
	const relative = path.relative(allowed, resolved);
	return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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
