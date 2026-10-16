import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getContentInventory } from "../../../ritesGlobal/content-inventory.mjs";
import { createContentStore } from "../content-store.js";
import { homeCardGroup } from "../public/home-cards.js";

test("Home card shortcuts are Blog-only and leave full-document editing available", async () => {
	const store = createContentStore(getContentInventory);
	const sites = await store.list();
	const blog = sites.find((site) => site.slug === "blog");
	const originalGroups = structuredClone(blog.groups);
	const shortcuts = homeCardGroup(blog);
	assert.equal(shortcuts.label, "Home cards");
	assert.equal(shortcuts.files.length, 2);
	assert.deepEqual(Object.keys(shortcuts.files[0].card.fields), ["title", "body"]);
	assert.deepEqual(Object.keys(shortcuts.files[1].card.fields), ["title", "intro", "hobbies"]);
	assert.deepEqual(blog.groups, originalGroups);
	assert.equal(homeCardGroup(sites.find((site) => site.slug === "ritesdev")), null);
	assert.equal(homeCardGroup({ slug: "blog", groups: [] }), null);
});

test("About card edits preserve SEO, project heading, and Markdown body", async (context) => {
	const inventory = getContentInventory();
	const blog = inventory.find((site) => site.slug === "blog");
	const relativePath = "content/pages/about.md";
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-about-card-"));
	context.after(() => fs.rm(dir, { recursive: true, force: true }));
	await fs.mkdir(path.join(dir, "content/pages"), { recursive: true });
	await fs.copyFile(path.join(blog.dir, relativePath), path.join(dir, relativePath));
	const store = createContentStore(() => [{ ...blog, dir }]);
	const before = await store.read("blog", relativePath);
	const fields = { ...before.fields, title: "About the author", intro: "A new biography.", hobbies: "Reading and coding." };
	await store.save("blog", relativePath, { fields, body: before.body });
	const saved = await store.read("blog", relativePath);
	assert.equal(saved.fields.intro, fields.intro);
	assert.equal(saved.fields.hobbies, fields.hobbies);
	assert.deepEqual(saved.fields.seo, before.fields.seo);
	assert.equal(saved.fields.projectsTitle, before.fields.projectsTitle);
	assert.equal(saved.body, before.body);
});

test("Blog Home information is discoverable and supports blank or populated cards", async (context) => {
	const inventory = getContentInventory();
	const store = createContentStore(() => inventory);
	const blog = (await store.list()).find((site) => site.slug === "blog");
	assert.ok(blog.groups.some((group) => group.files.some((file) => file.relativePath === "content/home-info.json")));
	const original = await store.read("blog", "content/home-info.json");
	assert.equal(typeof original.fields.title, "string");
	assert.equal(typeof original.fields.body, "string");

	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-home-info-"));
	context.after(() => fs.rm(dir, { recursive: true, force: true }));
	await fs.mkdir(path.join(dir, "content"));
	const blank = { title: "", body: "" };
	await fs.writeFile(path.join(dir, "content/home-info.json"), JSON.stringify(blank));
	const editable = createContentStore(() => [{
		...inventory.find((site) => site.slug === "blog"),
		dir,
	}]);
	assert.deepEqual((await editable.read("blog", "content/home-info.json")).fields, blank);
	const fields = { title: "Useful information", body: "Welcome to the blog.\nNew posts appear here." };
	await editable.save("blog", "content/home-info.json", { fields });
	assert.deepEqual((await editable.read("blog", "content/home-info.json")).fields, fields);
	assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, "content/home-info.json.bak"), "utf8")), blank);
});
