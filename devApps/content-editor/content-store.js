import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);

export function createContentStore(getInventory) {
	function findSite(siteSlug) {
		const site = getInventory().find((candidate) => candidate.slug === siteSlug);
		if (!site) throw new Error(`Unknown website: ${siteSlug}`);
		return site;
	}

	function resolveContentFile(siteSlug, relativePath) {
		const site = findSite(siteSlug);
		const files = Object.values(site.contentTypes).flatMap((group) => group.files || []);
		if (!files.includes(relativePath)) throw new Error("This file is not registered as editable content.");

		const filePath = path.resolve(site.dir, relativePath);
		const relative = path.relative(site.dir, filePath);
		if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid content path.");
		return filePath;
	}

	async function list() {
		return getInventory().map((site) => ({
			slug: site.slug,
			label: site.label,
			folder: site.folder,
			groups: Object.entries(site.contentTypes).map(([type, group]) => ({
				type,
				label: group.label,
				files: (group.files || []).map((relativePath) => ({
					relativePath,
					name: path.basename(relativePath, path.extname(relativePath)),
					extension: path.extname(relativePath).slice(1).toUpperCase(),
				})),
			})),
		}));
	}

	async function read(siteSlug, relativePath) {
		const filePath = resolveContentFile(siteSlug, relativePath);
		const source = await fs.readFile(filePath, "utf8");
		const extension = path.extname(filePath).toLowerCase();
		const stats = await fs.stat(filePath);

		if (extension === ".json") {
			return { mode: "structured", fields: JSON.parse(source), body: "", modified: stats.mtime.toISOString() };
		}

		if (MARKDOWN_EXTENSIONS.has(extension)) {
			const parsed = matter(source);
			return { mode: "markdown", fields: parsed.data, body: parsed.content.trim(), modified: stats.mtime.toISOString() };
		}

		return { mode: "source", fields: {}, body: source, modified: stats.mtime.toISOString() };
	}

	async function save(siteSlug, relativePath, document) {
		const filePath = resolveContentFile(siteSlug, relativePath);
		const extension = path.extname(filePath).toLowerCase();
		let output;

		if (extension === ".json") {
			if (!document.fields || typeof document.fields !== "object") throw new Error("JSON content must be an object or array.");
			output = `${JSON.stringify(document.fields, null, 2)}\n`;
		} else if (MARKDOWN_EXTENSIONS.has(extension)) {
			if (!document.fields || Array.isArray(document.fields) || typeof document.fields !== "object") {
				throw new Error("Markdown frontmatter must be an object.");
			}
			output = matter.stringify(`${String(document.body || "").trim()}\n`, document.fields);
		} else {
			output = String(document.body || "");
		}

		await fs.copyFile(filePath, `${filePath}.bak`);
		await fs.writeFile(filePath, output, "utf8");
		return read(siteSlug, relativePath);
	}

	return { list, read, save };
}