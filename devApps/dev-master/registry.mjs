// Discovers every tool under /devApps (any sibling folder with a devapp.meta.json).
// Adding a new devApps/<name>/devapp.meta.json is enough for it to show up here.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEVAPPS_DIR = path.resolve(__dirname, "..");

export function listDevApps() {
	return fs
		.readdirSync(DEVAPPS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name !== path.basename(__dirname))
		.map((entry) => {
			const dir = path.join(DEVAPPS_DIR, entry.name);
			const metaPath = path.join(dir, "devapp.meta.json");
			if (!fs.existsSync(metaPath)) return null;
			const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
			return { ...meta, folder: entry.name, dir };
		})
		.filter(Boolean)
		.sort((a, b) => a.name.localeCompare(b.name));
}
