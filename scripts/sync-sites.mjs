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

console.log(`[sync-sites] synced ${sites.length} site(s): ${sites.map((s) => s.label).join(", ")}`);
