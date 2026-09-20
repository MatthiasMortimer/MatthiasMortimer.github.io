// Dev Apps Management - Central configuration for all development management applications
// This file helps coordinate content editors, post managers, and other dev tools

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listSites } from "./sites.registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEVAPPS_DIR = path.resolve(__dirname, "..", "devApps");

/**
 * Dev app types and their responsibilities
 */
export const APP_TYPES = {
	LAUNCHER: "launcher",
	TUNNEL: "tunnel",
	CONTENT_EDITOR: "content_editor",
	POST_MANAGER: "post_manager",
	INQUIRY_MANAGER: "inquiry_manager",
	ANALYTICS: "analytics",
	DEPLOYER: "deployer",
};

/**
 * Central registry of all development management apps
 * Each app can manage specific content types across sites
 */
export const DEV_APPS_REGISTRY = {
	// Apps with a devapp.api.mjs run as tabs inside RitesDev App (runtime "tab").
	// ritesDevApp discovers apps by scanning devApps/ directly (see
	// devApps/ritesDevApp/server.mjs), so this registry is only used by the
	// scripts/management/*.mjs CLI tools now.
	"content-editor": {
		name: "Website Content Editor",
		type: APP_TYPES.CONTENT_EDITOR,
		description: "Edit page copy, site details, data, and Markdown across every RitesDev website",
		port: null,
		runtime: "tab",
		basePath: "content-editor",
		version: "1.0.0",
		active: true,
		manages: ["all"],
		contentTypes: ["page", "metadata", "config", "blog_post"],
	},
	"blog-post-manager": {
		name: "Blog Post Manager",
		type: APP_TYPES.POST_MANAGER,
		description: "Blog post creation and management",
		port: null,
		runtime: "tab",
		basePath: "blog-post-manager",
		version: "1.0.0",
		active: true,
		manages: ["s-blog"],
		contentTypes: ["blog_post"],
	},
	"inquiry-manager": {
		name: "Inquiry Manager",
		type: APP_TYPES.INQUIRY_MANAGER,
		description: "Inbox for contact form inquiries saved by the RitesDev site",
		port: null,
		runtime: "tab",
		basePath: "inquiry-manager",
		version: "1.0.0",
		active: true,
		manages: ["s-ritesdev"],
		contentTypes: ["inquiry"],
	},
	"ritesDevApp": {
		name: "RitesDev App",
		type: APP_TYPES.LAUNCHER,
		description: "Master window hosting every management app as a tab",
		port: 4605,
		basePath: "ritesDevApp",
		version: "1.0.0",
		active: true,
		manages: ["all"],
	},
	"siteHosting": {
		name: "Site Hosting",
		type: APP_TYPES.TUNNEL,
		description: "Controls the Astro development server and Cloudflare tunnel",
		port: 4321,
		runtime: "desktop",
		basePath: "siteHosting",
		version: "1.0.0",
		active: true,
		manages: ["all"],
		contentTypes: [],
	},
	// Template for new apps to be added:
	// "new-app-name": {
	//   name: "App Display Name",
	//   type: APP_TYPES.NEW_TYPE,
	//   description: "What this app does",
	//   port: 4604, // Next available port
	//   basePath: "new-app-name",
	//   version: "1.0.0",
	//   active: true,
	//   manages: ["s-blog", "s-ritesdev"],
	//   contentTypes: ["blog_post", "page", "config"],
	// },
};

/**
 * Get all active dev apps
 * @returns {Array} Array of active app configurations
 */
export function getActiveApps() {
	return Object.entries(DEV_APPS_REGISTRY)
		.filter(([_, app]) => app.active)
		.map(([key, app]) => ({ id: key, ...app }));
}

/**
 * Get apps by type
 * @param {string} type - App type to filter by
 * @returns {Array} Array of apps matching the type
 */
export function getAppsByType(type) {
	return Object.entries(DEV_APPS_REGISTRY)
		.filter(([_, app]) => app.type === type)
		.map(([key, app]) => ({ id: key, ...app }));
}

/**
 * Get apps that manage a specific site
 * @param {string} siteSlug - Site slug (e.g., "blog", "ritesdev")
 * @returns {Array} Array of apps managing this site
 */
export function getAppsBySite(siteSlug) {
	return Object.entries(DEV_APPS_REGISTRY)
		.filter(([_, app]) => app.active && app.manages.includes(siteSlug))
		.map(([key, app]) => ({ id: key, ...app }));
}

/**
 * Get available ports for new apps
 * @returns {number} Next available port
 */
export function getNextAvailablePort() {
	const ports = Object.values(DEV_APPS_REGISTRY)
		.map((app) => app.port)
		.filter((port) => Number.isFinite(port));
	let nextPort = Math.max(4599, ...ports) + 1;
	// Ensure port is in safe range (4600-4999)
	while (nextPort > 4999) {
		nextPort = 4600;
	}
	return nextPort;
}

/**
 * Get all sites managed by dev apps
 * @returns {Array} Array of unique sites being managed
 */
export function getManagedSites() {
	const sites = new Set();
	Object.values(DEV_APPS_REGISTRY).forEach((app) => {
		if (app.manages.includes("all")) {
			// App manages all sites, get them from sites registry
			listSites().forEach((site) => sites.add(site.slug));
		} else {
			app.manages.forEach((site) => sites.add(site));
		}
	});
	return Array.from(sites);
}

/**
 * Check if a dev app exists
 * @param {string} appId - App ID/name
 * @returns {boolean} True if app exists
 */
export function appExists(appId) {
	return appId in DEV_APPS_REGISTRY;
}

/**
 * Get app configuration by ID
 * @param {string} appId - App ID/name
 * @returns {Object} App configuration
 */
export function getApp(appId) {
	return DEV_APPS_REGISTRY[appId];
}

/**
 * Get app directory path
 * @param {string} appId - App ID/name
 * @returns {string} Full path to app directory
 */
export function getAppPath(appId) {
	const app = getApp(appId);
	if (!app) return null;
	return path.join(DEVAPPS_DIR, app.basePath);
}

/**
 * Check if an app folder exists on disk
 * @param {string} appId - App ID/name
 * @returns {boolean} True if folder exists
 */
export function appFolderExists(appId) {
	const appPath = getAppPath(appId);
	return appPath && fs.existsSync(appPath);
}

/**
 * Get app metadata (from devapp.meta.json)
 * @param {string} appId - App ID/name
 * @returns {Object} Metadata from devapp.meta.json
 */
export function getAppMetadata(appId) {
	const appPath = getAppPath(appId);
	if (!appPath) return null;

	const metaPath = path.join(appPath, "devapp.meta.json");
	if (fs.existsSync(metaPath)) {
		return JSON.parse(fs.readFileSync(metaPath, "utf8"));
	}
	return null;
}

/**
 * List all app directories in devApps/
 * @returns {Array} Array of app folder names
 */
export function listAppDirectories() {
	if (!fs.existsSync(DEVAPPS_DIR)) return [];
	return fs
		.readdirSync(DEVAPPS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

/**
 * Get summary of all dev apps with their status
 * @returns {Object} Summary with active/inactive counts and details
 */
export function getAppSummary() {
	const apps = Object.values(DEV_APPS_REGISTRY);
	const active = apps.filter((app) => app.active);
	const inactive = apps.filter((app) => !app.active);

	return {
		total: apps.length,
		active: active.length,
		inactive: inactive.length,
		apps: Object.entries(DEV_APPS_REGISTRY).map(([key, app]) => ({
			id: key,
			...app,
			folderExists: appFolderExists(key),
			metadataExists: getAppMetadata(key) !== null,
		})),
	};
}

// Example usage:
// const active = getActiveApps(); // Get all running apps
// const blogApps = getAppsBySite("blog"); // Get apps managing blog
// const postEditors = getAppsByType(APP_TYPES.CONTENT_EDITOR); // Get content editors
// const nextPort = getNextAvailablePort(); // Get next available port for new app
// const summary = getAppSummary(); // Get overview of all apps
