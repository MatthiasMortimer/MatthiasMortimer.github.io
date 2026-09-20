import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createContentStore } from "../content-store.js";

test("lists, reads, and saves each supported content format", async (context) => {
	const siteDir = await fs.mkdtemp(path.join(os.tmpdir(), "ritesdev-content-"));
	context.after(() => fs.rm(siteDir, { recursive: true, force: true }));
	await fs.mkdir(path.join(siteDir, "content"));
	await fs.writeFile(path.join(siteDir, "content/site.json"), '{"metadata":{"title":"Before"}}\n');
	await fs.writeFile(path.join(siteDir, "content/page.md"), "---\ntitle: Before\n---\nBody\n");
	await fs.writeFile(path.join(siteDir, "content/data.js"), "export const title = \"Before\";\n");

	const inventory = [{
		slug: "test",
		label: "Test site",
		folder: "s-test",
		dir: siteDir,
		contentTypes: {
			config: { label: "Data", files: ["content/site.json", "content/data.js"] },
			page: { label: "Pages", files: ["content/page.md"] },
		},
	}];
	const store = createContentStore(() => inventory);

	const sites = await store.list();
	assert.equal(sites[0].groups.flatMap((group) => group.files).length, 3);
	assert.equal((await store.read("test", "content/site.json")).fields.metadata.title, "Before");

	await store.save("test", "content/site.json", { fields: { metadata: { title: "After" } } });
	await store.save("test", "content/page.md", { fields: { title: "After" }, body: "Updated body" });
	await store.save("test", "content/data.js", { body: 'export const title = "After";\n' });

	assert.equal((await store.read("test", "content/site.json")).fields.metadata.title, "After");
	assert.equal((await store.read("test", "content/page.md")).body, "Updated body");
	assert.match((await store.read("test", "content/data.js")).body, /After/);
	await fs.access(path.join(siteDir, "content/page.md.bak"));
	await assert.rejects(() => store.read("test", "../outside.json"), /not registered/);
});