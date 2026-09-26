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
const TOKENS_PATH = path.resolve(__dirname, "..", "ritesGlobal", "styles", "tokens.css");
const SITE_SWITCHER_STYLES_PATH = path.resolve(__dirname, "..", "ritesGlobal", "styles", "site-switcher.css");

fs.mkdirSync(PAGES_DIR, { recursive: true });

function ensureSymlink(targetDir, linkPath) {
	const relTarget = path.relative(path.dirname(linkPath), targetDir);
	const stat = fs.lstatSync(linkPath, { throwIfNoEntry: false });
	if (stat) {
		if (stat.isSymbolicLink() && fs.readlinkSync(linkPath) === relTarget) return;
		fs.rmSync(linkPath, { recursive: true, force: true });
	}
	fs.symlinkSync(relTarget, linkPath, "dir");
}

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
fs.mkdirSync(PUBLIC_STYLES_DIR, { recursive: true });
for (const site of sites) {
	const siteStylesPath = path.join(site.dir, "styles", "global.css");
	if (!fs.existsSync(siteStylesPath)) continue;

	const siteStyles = fs.readFileSync(siteStylesPath, "utf8").replace(
		/^\s*@import\s+["'][^"']*ritesGlobal\/styles\/tokens\.css["'];?\s*/m,
		"",
	);
	fs.writeFileSync(path.join(PUBLIC_STYLES_DIR, `${site.slug}.css`), `${sharedTokens}\n${siteSwitcherStyles}\n${siteStyles}`);
}

console.log(`[sync-sites] synced ${sites.length} site(s): ${sites.map((s) => s.label).join(", ")}`);
