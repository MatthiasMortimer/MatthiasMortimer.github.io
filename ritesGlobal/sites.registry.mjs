// Discovers ecosystem sites and manifest-enabled sibling websites in the workspace.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SITES_DIR = path.resolve(__dirname, "..", "sites");
export const WEBSITES_DIR = path.resolve(SITES_DIR, "..", "..");

function readSite(directory, metadataFile, folder) {
	const metaPath = path.join(directory, metadataFile);
	if (!fs.existsSync(metaPath)) return null;
	const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
	return { ...meta, folder, dir: directory };
}

export function listSites() {
	return fs.existsSync(SITES_DIR) ? fs
		.readdirSync(SITES_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name.startsWith("s-"))
		.map((entry) => readSite(path.join(SITES_DIR, entry.name), "site.meta.json", entry.name))
		.filter(Boolean)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : [];
}

export function listEditableSites() {
	const workspaceSites = fs.existsSync(WEBSITES_DIR) ? fs
		.readdirSync(WEBSITES_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => readSite(path.join(WEBSITES_DIR, entry.name), "ritesdev.site.json", entry.name))
		.filter(Boolean) : [];

	return [...listSites(), ...workspaceSites]
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
