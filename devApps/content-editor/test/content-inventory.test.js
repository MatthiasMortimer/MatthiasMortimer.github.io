import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { discoverGlobalContentFiles, getContentInventory } from "../../../ritesGlobal/content-inventory.mjs";
import { validateFrontmatter } from "../frontmatter-schema.js";
import projectRecords from "../../../ritesGlobal/projects.json" with { type: "json" };
import sharedTags from "../../../ritesGlobal/tags.json" with { type: "json" };
import { createContentStore } from "../content-store.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("exposes structured ecosystem global content", () => {
	const global = getContentInventory().find((site) => site.slug === "global");
	assert.ok(global);
	assert.deepEqual(global.contentTypes.identity.files, ["contact.json"]);
	assert.deepEqual(global.contentTypes.projects.files, ["projects.json"]);
	assert.deepEqual(global.contentTypes.tags.files, ["tags.json"]);
	assert.deepEqual(global.contentTypes.versions.files, ["versions.json"]);
	assert.ok(getContentInventory().some((site) => site.slug === "global"));
});

test("discovers root-level global JSON files while excluding hidden and package files", async (context) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rites-global-content-"));
	context.after(() => fs.rm(directory, { recursive: true, force: true }));
	await fs.writeFile(path.join(directory, "socials.json"), "{}");
	await fs.writeFile(path.join(directory, "package.json"), "{}");
	await fs.writeFile(path.join(directory, ".private.json"), "{}");
	await fs.mkdir(path.join(directory, "nested"));
	await fs.writeFile(path.join(directory, "nested", "nested.json"), "{}");

	assert.deepEqual(discoverGlobalContentFiles(directory), ["socials.json"]);
});

test("discovers editable content from top-level websites", () => {
	const inventory = getContentInventory();
	const expectedContent = {
		blog: "content/posts/post-1.mdx",
		contractor: "src/content/pages/index.md",
		monwye: "content/lore/index.md",
		wedding: "index.html",
	};

	for (const [slug, expectedFile] of Object.entries(expectedContent)) {
		const site = inventory.find((entry) => entry.slug === slug);
		assert.ok(site, `${slug} is not registered`);
		assert.ok(
			Object.values(site.contentTypes).flatMap((group) => group.files).includes(expectedFile),
			`${expectedFile} is not editable for ${slug}`,
		);
	}

	const contractor = inventory.find((entry) => entry.slug === "contractor");
	const contractorFiles = Object.values(contractor.contentTypes).flatMap((group) => group.files);
	assert.ok(contractorFiles.includes("src/content/site.json"));
	assert.deepEqual(
		contractorFiles.filter((file) => file.startsWith("src/content/pages/")).sort(),
		[
			"src/content/pages/about.md",
			"src/content/pages/blog.md",
			"src/content/pages/contact.md",
			"src/content/pages/index.md",
			"src/content/pages/services.md",
		],
	);
});

test("reads each top-level website through the content editor", async () => {
	const store = createContentStore(getContentInventory);
	assert.equal((await store.read("contractor", "src/content/site.json")).mode, "structured");
	assert.equal((await store.read("contractor", "src/content/pages/index.md")).mode, "markdown");
	assert.equal((await store.read("contractor", "src/data/payments.json")).mode, "structured");
	assert.equal((await store.read("monwye", "content/lore/index.md")).mode, "markdown");
	assert.equal((await store.read("wedding", "index.html")).mode, "source");
});

test("discovers site content only from each content folder", () => {
	const sites = getContentInventory().filter((site) => ["blog", "ritesdev"].includes(site.slug));
	for (const site of sites) {
		const files = Object.values(site.contentTypes).flatMap((group) => group.files);
		assert.ok(files.length > 0, `${site.label} has no discovered content`);
		assert.ok(files.every((file) => file.startsWith("content/")), `${site.label} has content outside content/`);
		assert.ok(files.includes("content/site.json"), `${site.label} has no reusable site settings`);
	}
});

test("every top-level site route has matching page content", async () => {
	for (const site of getContentInventory().filter((entry) => ["blog", "ritesdev"].includes(entry.slug))) {
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
	assert.ok(blog.contentTypes.blog_post.files.length >= 2);
	assert.ok(blog.contentTypes.blog_post.files.includes("content/posts/post-1.mdx"));
	assert.ok(blog.contentTypes.blog_post.files.includes("content/posts/post-2.mdx"));
	assert.ok(!blog.contentTypes.config.files.includes("content/posts.json"));
});

test("global projects and tags are editable through the content editor", async () => {
	const store = createContentStore(getContentInventory);
	const projects = await store.read("global", "projects.json");
	const tags = await store.read("global", "tags.json");
	assert.equal(projects.mode, "structured");
	assert.equal(projects.fields.length, 4);
	assert.equal(tags.mode, "structured");
	assert.ok(tags.fields.includes("Astro"));
});

test("all project and blog tags use canonical shared labels", async () => {
	const canonicalTags = new Set(sharedTags);
	const store = createContentStore(getContentInventory);
	const blog = getContentInventory().find((site) => site.slug === "blog");

	for (const project of projectRecords) {
		for (const tag of project.tags) assert.ok(canonicalTags.has(tag), `Unknown project tag: ${tag}`);
	}
	for (const postPath of blog.contentTypes.blog_post.files) {
		const post = await store.read("blog", postPath);
		for (const tag of post.fields.tags || []) assert.ok(canonicalTags.has(tag), `Unknown blog tag: ${tag}`);
	}
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

test("rejects invalid page frontmatter before replacing or backing up content", async (context) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rites-content-schema-"));
	context.after(() => fs.rm(directory, { recursive: true, force: true }));

	const relativePath = "content/pages/contact.md";
	const sourcePath = path.join(rootDir, "sites/s-ritesdev", relativePath);
	const filePath = path.join(directory, relativePath);
	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.copyFile(sourcePath, filePath);

	const store = createContentStore(() => [
		{
			slug: "ritesdev",
			dir: directory,
			contentTypes: { page: { files: [relativePath] } },
		},
	]);
	const original = await store.read("ritesdev", relativePath);
	const invalidFields = structuredClone(original.fields);
	invalidFields.faqs[0].question = 42;

	await assert.rejects(
		() => store.save("ritesdev", relativePath, { ...original, fields: invalidFields }),
		/frontmatter\.faqs\[0\]\.question must be string/,
	);
	assert.equal(await fs.readFile(filePath, "utf8"), await fs.readFile(sourcePath, "utf8"));
	await assert.rejects(fs.access(`${filePath}.bak`));
});

test("existing RitesDev and Blog page/post frontmatter satisfies its schema", async () => {
	const inventory = getContentInventory();
	const store = createContentStore(() => inventory);

	for (const site of inventory.filter((entry) => ["blog", "ritesdev"].includes(entry.slug))) {
		for (const [type, group] of Object.entries(site.contentTypes)) {
			if (type !== "page" && !(site.slug === "blog" && type === "blog_post")) continue;
			for (const relativePath of group.files) {
				const document = await store.read(site.slug, relativePath);
				validateFrontmatter(site.slug, relativePath, document.fields);
			}
		}
	}
});