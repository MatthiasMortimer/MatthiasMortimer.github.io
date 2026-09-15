// Discovers every website under /sites (folders prefixed "s-") from their site.meta.json.
// Adding a new "s-<name>" folder with a site.meta.json is enough for it to show up everywhere.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SITES_DIR = path.resolve(__dirname, "..", "sites");

export function listSites() {
	if (!fs.existsSync(SITES_DIR)) return [];

	return fs
		.readdirSync(SITES_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name.startsWith("s-"))
		.map((entry) => {
			const dir = path.join(SITES_DIR, entry.name);
			const metaPath = path.join(dir, "site.meta.json");
			if (!fs.existsSync(metaPath)) return null;
			const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
			return { ...meta, folder: entry.name, dir };
		})
		.filter(Boolean)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
