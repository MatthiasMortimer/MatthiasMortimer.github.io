import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { checkVaultDocs } from "../check-vault-docs.mjs";

function fixture(t, home, page) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "ritesdev-docs-"));
	t.after(() => fs.rmSync(root, { recursive: true, force: true }));
	fs.mkdirSync(path.join(root, "RitesDev/Ecosystem Docs"), { recursive: true });
	fs.writeFileSync(path.join(root, "RitesDev/Ecosystem Docs.md"), home);
	fs.writeFileSync(path.join(root, "RitesDev/Ecosystem Docs/Page.md"), page);
	return root;
}

const back = "Back to [[RitesDev/Ecosystem Docs|Ecosystem Docs]].";

test("vault docs resolve wiki aliases, heading links, local files and backlinks", (t) => {
	const root = fixture(t, "[[RitesDev/Ecosystem Docs/Page#How it works|Start]]", `${back}\n## How it works\n[[#How it works]]`);
	const asset = path.join(root, "local file.md");
	fs.writeFileSync(asset, "# Local");
	fs.appendFileSync(path.join(root, "RitesDev/Ecosystem Docs/Page.md"), `\n[Source](${pathToFileURL(asset).href})`);
	assert.deepEqual(checkVaultDocs(root), { files: 2, problems: [] });
});

test("vault docs report missing notes, headings, files and relative Markdown links", (t) => {
	const root = fixture(t, "[[RitesDev/Ecosystem Docs/Page#Wrong]]", `${back}
[[RitesDev/Ecosystem Docs/Missing]]
[Missing](file:///nonexistent-ritesdev-docs-test/source.md)
[Relative](page.md)`);
	const { problems } = checkVaultDocs(root);
	assert.equal(problems.length, 4);
	for (const expected of ["missing note", "missing heading", "missing local file", "use wiki links"]) {
		assert.ok(problems.some((problem) => problem.includes(expected)), expected);
	}
});

test("vault docs flag orphan notes and missing backlinks", (t) => {
	const root = fixture(t, "# Home", "# Orphan");
	assert.equal(checkVaultDocs(root).problems.length, 2);
});

test("vault docs ignore example links in fenced code, inline code and comments", (t) => {
	const root = fixture(t, "[[RitesDev/Ecosystem Docs/Page]]", `${back}
\`\`\`md
[[Missing]]
\`\`\`
~~~md
[[Missing]]
~~~
\`[[Missing]]\`
<!-- [[Missing]] -->`);
	assert.deepEqual(checkVaultDocs(root).problems, []);
});

test("vault docs reject wiki links escaping the vault", (t) => {
	const root = fixture(t, "[[RitesDev/Ecosystem Docs/Page]]", `${back}\n[[../outside]]`);
	assert.match(checkVaultDocs(root).problems[0], /outside the vault/);
});

test("vault docs fail explicitly for a missing handbook", (t) => {
	const root = fixture(t, "# Home", back);
	fs.unlinkSync(path.join(root, "RitesDev/Ecosystem Docs.md"));
	assert.throws(() => checkVaultDocs(root), /ENOENT/);
});
