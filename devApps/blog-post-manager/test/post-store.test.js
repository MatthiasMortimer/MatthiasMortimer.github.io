const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createPostStore } = require("../post-store");

test("creates, reads, renames, lists, and deletes an MDX post", async (context) => {
	const postsDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ritesdev-posts-"));
	context.after(() => fs.rm(postsDirectory, { recursive: true, force: true }));
	const store = createPostStore(postsDirectory);

	const post = {
		originalSlug: null,
		slug: "first-post",
		title: "First post",
		pubDate: "2026-09-19",
		description: "A test post",
		author: "RitesDev",
		imageUrl: "https://example.com/image.png",
		imageAlt: "Example",
		tags: "astro, testing",
		content: "# Hello\n\nPost body.",
	};

	await store.save(post);
	const created = await store.read("first-post");
	assert.equal(created.title, post.title);
	assert.equal(created.tags, "astro, testing");
	assert.equal(created.content, post.content);

	await store.save({ ...post, originalSlug: "first-post", slug: "renamed-post" });
	await assert.rejects(() => store.read("first-post"), /ENOENT/);
	assert.deepEqual((await store.list()).map(({ slug }) => slug), ["renamed-post"]);

	await assert.rejects(() => store.read("../outside"), /Slug must contain/);
	await store.remove("renamed-post");
	assert.deepEqual(await store.list(), []);
});