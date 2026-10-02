#!/usr/bin/env node
// Symlinks each website under /sites (folders prefixed "s-") into this app's src/pages,
// based on the basePath declared in each site's site.meta.json.
// Run automatically before `dev`/`build` (see package.json) - just add a new "s-<name>"
// folder with a site.meta.json + pages/ dir and it will show up on the next run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listSites } from "../ritesGlobal/sites.registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.resolve(__dirname, "..", "src", "pages");
const PUBLIC_STYLES_DIR = path.resolve(__dirname, "..", "public", "generated");
const DEV_APPS_DIR = path.resolve(__dirname, "..", "devApps");
const VERSIONS_PATH = path.resolve(__dirname, "..", "ritesGlobal", "versions.json");
const TOKENS_PATH = path.resolve(__dirname, "..", "ritesGlobal", "styles", "tokens.css");
const SITE_SWITCHER_STYLES_PATH = path.resolve(__dirname, "..", "ritesGlobal", "styles", "site-switcher.css");
const SITE_FOOTER_STYLES_PATH = path.resolve(__dirname, "..", "ritesGlobal", "styles", "site-footer.css");

fs.mkdirSync(PAGES_DIR, { recursive: true });

function syncDevAppVersions() {
	const source = fs.readFileSync(VERSIONS_PATH, "utf8");
	const versions = JSON.parse(source);
	if (!versions || typeof versions !== "object" || Array.isArray(versions)) {
		throw new Error(`[sync-sites] invalid versions file: ${VERSIONS_PATH}`);
	}

	const devApps = Object.create(null);
	for (const entry of fs.readdirSync(DEV_APPS_DIR, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const metadataPath = path.join(DEV_APPS_DIR, entry.name, "devapp.meta.json");
		if (!fs.existsSync(metadataPath)) continue;

		const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
		if (
			!metadata ||
			typeof metadata !== "object" ||
			typeof metadata.slug !== "string" ||
			!/^[A-Za-z][A-Za-z0-9_-]*$/.test(metadata.slug) ||
			typeof metadata.version !== "string" ||
			!/^\d+\.\d+\.\d+$/.test(metadata.version)
		) {
			throw new Error(`[sync-sites] invalid devApp version metadata: ${metadataPath}`);
		}
		if (Object.hasOwn(devApps, metadata.slug)) {
			throw new Error(`[sync-sites] duplicate devApp slug "${metadata.slug}" in ${metadataPath}`);
		}

		devApps[metadata.slug] = { version: metadata.version };
	}

	versions.devApps = devApps;
	const output = `${JSON.stringify(versions, null, 2)}\n`;
	if (output !== source) fs.writeFileSync(VERSIONS_PATH, output);
}

function ensureSymlink(targetDir, linkPath) {
	const relTarget = path.relative(path.dirname(linkPath), targetDir);
	const stat = fs.lstatSync(linkPath, { throwIfNoEntry: false });
	if (stat) {
		if (stat.isSymbolicLink() && fs.readlinkSync(linkPath) === relTarget) return;
		fs.rmSync(linkPath, { recursive: true, force: true });
	}
	fs.symlinkSync(relTarget, linkPath, "dir");
}

syncDevAppVersions();

const sites = listSites();
const managedEntries = new Set();

for (const site of sites) {
	const sitePagesDir = path.join(site.dir, "pages");
	if (!fs.existsSync(sitePagesDir)) {
		console.warn(`[sync-sites] skipping "${site.folder}": no pages/ directory`);
		continue;
	}

	if (site.basePath === "/") {
		for (const entry of fs.readdirSync(sitePagesDir)) {
			const linkPath = path.join(PAGES_DIR, entry);
			ensureSymlink(path.join(sitePagesDir, entry), linkPath);
			managedEntries.add(entry);
		}
	} else {
		const slug = site.basePath.replace(/^\/+/, "").replace(/\/+$/, "");
		const linkPath = path.join(PAGES_DIR, slug);
		ensureSymlink(sitePagesDir, linkPath);
		managedEntries.add(slug);
	}
}

const sharedTokens = fs.readFileSync(TOKENS_PATH, "utf8");
const siteSwitcherStyles = fs.readFileSync(SITE_SWITCHER_STYLES_PATH, "utf8");
const siteFooterStyles = fs.readFileSync(SITE_FOOTER_STYLES_PATH, "utf8");
fs.mkdirSync(PUBLIC_STYLES_DIR, { recursive: true });
for (const site of sites) {
	const siteStylesPath = path.join(site.dir, "styles", "global.css");
	if (!fs.existsSync(siteStylesPath)) continue;

	const siteStyles = fs.readFileSync(siteStylesPath, "utf8").replace(
		/^\s*@import\s+["'][^"']*ritesGlobal\/styles\/tokens\.css["'];?\s*/m,
		"",
	);
	fs.writeFileSync(path.join(PUBLIC_STYLES_DIR, `${site.slug}.css`), `${sharedTokens}\n${siteSwitcherStyles}\n${siteFooterStyles}\n${siteStyles}`);
}

console.log(`[sync-sites] synced ${sites.length} site(s): ${sites.map((s) => s.label).join(", ")}`);
