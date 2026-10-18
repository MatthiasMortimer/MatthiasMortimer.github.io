import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { randomUUID } from "node:crypto";
import { validateFrontmatter } from "./frontmatter-schema.js";
import { getThemeEditorConfig, isSiteThemeFile, validateSiteTheme } from "../../ritesGlobal/site-theme.mjs";

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);

export function createContentStore(getInventory) {
	function getEditorConfig(siteSlug, relativePath) {
		const themeEditor = getThemeEditorConfig(siteSlug);
		return themeEditor && isSiteThemeFile(siteSlug, relativePath) ? themeEditor : null;
	}

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
				files: (group.files || []).map((relativePath) => {
					const editor = getEditorConfig(site.slug, relativePath);
					return {
						relativePath,
						name: path.basename(relativePath, path.extname(relativePath)),
						extension: path.extname(relativePath).slice(1).toUpperCase(),
						editor: editor ? { kind: "theme", label: editor.label } : null,
					};
				}),
			})),
		}));
	}

	async function read(siteSlug, relativePath) {
		const filePath = resolveContentFile(siteSlug, relativePath);
		const source = await fs.readFile(filePath, "utf8");
		const extension = path.extname(filePath).toLowerCase();
		const stats = await fs.stat(filePath);
		const editor = getEditorConfig(siteSlug, relativePath);

		if (extension === ".json") {
			const parsed = JSON.parse(source);
			return {
				mode: "structured",
				fields: editor ? validateSiteTheme(siteSlug, parsed) : parsed,
				body: "",
				modified: stats.mtime.toISOString(),
				editor,
			};
		}

		if (MARKDOWN_EXTENSIONS.has(extension)) {
			const parsed = matter(source);
			return { mode: "markdown", fields: parsed.data, body: parsed.content.trim(), modified: stats.mtime.toISOString(), editor };
		}

		return { mode: "source", fields: {}, body: source, modified: stats.mtime.toISOString(), editor };
	}

	async function save(siteSlug, relativePath, document) {
		const filePath = resolveContentFile(siteSlug, relativePath);
		const extension = path.extname(filePath).toLowerCase();
		const editor = getEditorConfig(siteSlug, relativePath);
		let output;

		if (extension === ".json") {
			if (!document.fields || typeof document.fields !== "object") throw new Error("JSON content must be an object or array.");
			const fields = editor ? validateSiteTheme(siteSlug, document.fields) : document.fields;
			output = `${JSON.stringify(fields, null, 2)}\n`;
		} else if (MARKDOWN_EXTENSIONS.has(extension)) {
			if (!document.fields || Array.isArray(document.fields) || typeof document.fields !== "object") {
				throw new Error("Markdown frontmatter must be an object.");
			}
			validateFrontmatter(siteSlug, relativePath, document.fields);
			output = matter.stringify(`${String(document.body || "").trim()}\n`, document.fields);
		} else {
			output = String(document.body || "");
		}

		await fs.copyFile(filePath, `${filePath}.bak`);
		if (editor) {
			const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
			try {
				await fs.writeFile(temporaryPath, output, { encoding: "utf8", flag: "wx" });
				await fs.rename(temporaryPath, filePath);
			} finally {
				await fs.rm(temporaryPath, { force: true });
			}
		} else {
			await fs.writeFile(filePath, output, "utf8");
		}
		return read(siteSlug, relativePath);
	}

	return { list, read, save };
}