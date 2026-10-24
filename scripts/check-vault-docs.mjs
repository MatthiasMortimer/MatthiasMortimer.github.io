import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HOME = "RitesDev/Ecosystem Docs.md";
const DIRECTORY = "RitesDev/Ecosystem Docs";

function markdownFiles(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const fullPath = path.join(directory, entry.name);
		if (entry.isDirectory()) return markdownFiles(fullPath);
		return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
	});
}

function prose(markdown) {
	return markdown.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*$/gm, "")
		.replace(/<!--[\s\S]*?-->/g, "").replace(/`+[^`\n]*`+/g, "");
}

function headingName(text) {
	return text.replace(/[*_`]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function checkVaultDocs(vaultRoot) {
	const root = path.resolve(vaultRoot);
	const home = path.join(root, HOME);
	const directory = path.join(root, DIRECTORY);
	const files = [home, ...markdownFiles(directory)];
	const problems = [];
	const links = new Map();
	const headings = new Map();
	const readHeadings = (file) => {
		if (!headings.has(file)) {
			const source = fs.readFileSync(file, "utf8");
			headings.set(file, new Set([...source.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)]
				.map(([, title]) => headingName(title))));
		}
		return headings.get(file);
	};

	for (const file of files) {
		const text = prose(fs.readFileSync(file, "utf8"));
		const outgoing = new Set();
		links.set(file, outgoing);
		const report = (target, reason) => problems.push(`${path.relative(root, file)} -> ${target}: ${reason}`);
		for (const [, raw] of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
			const [target] = raw.split("|");
			const [note, anchor] = target.split("#");
			const notePath = note.endsWith(".md") ? note : `${note}.md`;
			const resolved = note ? path.resolve(root, notePath) : file;
			const relative = path.relative(root, resolved);
			if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
				report(target, "wiki link is outside the vault");
			} else if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
				report(target, "missing note; use a vault-relative wiki path");
			} else {
				outgoing.add(resolved);
				if (anchor && !readHeadings(resolved).has(headingName(anchor))) report(target, "missing heading");
			}
		}
		for (const [, target] of text.matchAll(/\]\((?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\)/g)
			.map((match) => [match[0], match[1] || match[2]])) {
			if (target.startsWith("file:")) {
				const url = new URL(target);
				url.hash = "";
				if (!fs.existsSync(fileURLToPath(url))) report(target, "missing local file");
			} else if (!/^[a-z][a-z0-9+.-]*:/i.test(target)) {
				report(target, "use wiki links for notes or file: URLs for repository files");
			}
		}
	}
	const visited = new Set();
	const visit = (file) => {
		if (visited.has(file)) return;
		visited.add(file);
		for (const target of links.get(file) || []) {
			if (links.has(target)) visit(target);
		}
	};
	visit(home);
	for (const file of files.slice(1)) {
		if (!visited.has(file)) problems.push(`${path.relative(root, file)}: not reachable from the docs home`);
		if (!links.get(file).has(home)) problems.push(`${path.relative(root, file)}: missing Back to docs home wiki link`);
	}
	return { files: files.length, problems };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const root = process.argv[2] || process.env.RITESDEV_VAULT;
	if (!root) {
		console.error("Usage: npm run docs:vault:check -- /absolute/path/to/MasterVault (or set RITESDEV_VAULT)");
		process.exitCode = 1;
	} else {
		try {
			const { files, problems } = checkVaultDocs(root);
			if (problems.length) {
				console.error(problems.join("\n"));
				process.exitCode = 1;
			} else {
				console.log(`Checked ${files} handbook notes: wiki links, headings, local files, navigation and backlinks OK.`);
			}
		} catch (error) {
			console.error(`Could not check vault docs: ${error.message}`);
			process.exitCode = 1;
		}
	}
}
