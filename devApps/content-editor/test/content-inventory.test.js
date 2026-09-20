import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getContentInventory } from "../../../ritesGlobal/content-inventory.mjs";
import { createContentStore } from "../content-store.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("exposes structured ecosystem global content", () => {
	const global = getContentInventory().find((site) => site.slug === "global");
	assert.ok(global);
	assert.deepEqual(global.contentTypes.identity.files, ["contact.json"]);
	assert.deepEqual(global.contentTypes.projects.files, ["projects.json"]);
	assert.deepEqual(global.contentTypes.versions.files, ["versions.json"]);
});

test("discovers site content only from each content folder", () => {
	const sites = getContentInventory().filter((site) => site.slug !== "global");
	for (const site of sites) {
		const files = Object.values(site.contentTypes).flatMap((group) => group.files);
		assert.ok(files.length > 0, `${site.label} has no discovered content`);
		assert.ok(files.every((file) => file.startsWith("content/")), `${site.label} has content outside content/`);
		assert.ok(files.includes("content/site.json"), `${site.label} has no reusable site settings`);
	}
});

test("every top-level site route has matching page content", async () => {
	for (const site of getContentInventory().filter((entry) => entry.slug !== "global")) {
		const pagesDir = path.join(rootDir, "sites", site.folder, "pages");
		const routeFiles = (await fs.readdir(pagesDir, { withFileTypes: true }))
			.filter((entry) => entry.isFile() && entry.name.endsWith(".astro"))
			.map((entry) => entry.name.replace(/\.astro$/, ".md"))
			.sort();
		const contentFiles = (site.contentTypes.page?.files || []).map((file) => path.basename(file)).sort();
		assert.deepEqual(contentFiles, routeFiles, `${site.label} page content is incomplete`);
	}
});

test("discovers Blog post bodies and card content", () => {
	const blog = getContentInventory().find((site) => site.slug === "blog");
	assert.deepEqual(blog.contentTypes.blog_post.files, [
		"content/posts/post-1.mdx",
		"content/posts/post-2.mdx",
	]);
	assert.ok(blog.contentTypes.config.files.includes("content/posts.json"));
});

test("uses consistent schemas for repeatable steps and FAQs", async () => {
	const store = createContentStore(getContentInventory);
	const services = await store.read("ritesdev", "content/pages/services.md");
	const contact = await store.read("ritesdev", "content/pages/contact.md");

	for (const step of services.fields.process.steps) {
		assert.deepEqual(Object.keys(step), ["number", "title", "body"]);
	}
	for (const faq of contact.fields.faqs) {
		assert.deepEqual(Object.keys(faq), ["question", "answer"]);
	}
});