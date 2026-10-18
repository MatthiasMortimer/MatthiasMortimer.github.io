import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOCS_DIR = path.join(ROOT, "docs");
const SYSTEMS_DIR = path.join(DOCS_DIR, "systems");
const REQUIRED_SECTIONS = ["How it works", "Files", "Rules", "When it breaks", "Verify"];

function markdownFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) return markdownFiles(fullPath);
		return entry.name.endsWith(".md") ? [fullPath] : [];
	});
}

function withoutCode(markdown) {
	return markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "").replace(/<!--[\s\S]*?-->/g, "");
}

function headingSlugs(markdown) {
	return new Set([...withoutCode(markdown).matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, text]) =>
		text.trim().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-"),
	));
}

const docs = markdownFiles(DOCS_DIR).filter((file) => path.basename(file) !== "TEMPLATE.md");

test("every relative link in docs/ points to an existing file and heading", () => {
	const broken = [];
	for (const file of docs) {
		const markdown = fs.readFileSync(file, "utf8");
		for (const [, target] of withoutCode(markdown).matchAll(/\]\(([^)\s]+)\)/g)) {
			if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
			const [linkPath, anchor] = target.split("#");
			const resolved = linkPath ? path.resolve(path.dirname(file), linkPath) : file;
			const where = `${path.relative(ROOT, file)} → ${target}`;
			if (!fs.existsSync(resolved)) {
				broken.push(`${where} (missing file)`);
			} else if (anchor && resolved.endsWith(".md") && !headingSlugs(fs.readFileSync(resolved, "utf8")).has(anchor)) {
				broken.push(`${where} (missing heading)`);
			}
		}
	}
	assert.deepEqual(broken, [], `Update these doc links after moving or renaming files:\n${broken.join("\n")}`);
});

test("every system doc has the required sections and is listed in the docs index", () => {
	const index = fs.readFileSync(path.join(DOCS_DIR, "README.md"), "utf8");
	const problems = [];
	for (const file of markdownFiles(SYSTEMS_DIR)) {
		const name = path.basename(file);
		const sections = new Set([...withoutCode(fs.readFileSync(file, "utf8")).matchAll(/^##\s+(.+)$/gm)].map(([, text]) => text.trim()));
		for (const section of REQUIRED_SECTIONS) {
			if (!sections.has(section)) problems.push(`systems/${name} is missing "## ${section}"`);
		}
		if (!index.includes(`(systems/${name})`)) problems.push(`systems/${name} is not linked from docs/README.md`);
	}
	assert.deepEqual(problems, []);
});
