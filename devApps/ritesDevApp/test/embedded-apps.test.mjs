import assert from "node:assert/strict";
import test from "node:test";
import { startLauncherServer } from "../server.mjs";

async function withLauncher(context) {
	const server = startLauncherServer(0);
	await new Promise((resolve) => server.once("listening", resolve));
	context.after(() => server.close());
	return `http://127.0.0.1:${server.address().port}`;
}

test("apps with a devapp.api.mjs are reported as embedded tabs", async (context) => {
	const baseUrl = await withLauncher(context);
	const { apps } = await fetch(`${baseUrl}/api/apps`).then((response) => response.json());

	const editor = apps.find((app) => app.id === "content-editor");
	assert.equal(editor.embedded, true);
	assert.equal(editor.entryUrl, "/apps/content-editor/");

	const hosting = apps.find((app) => app.id === "siteHosting");
	assert.equal(hosting.embedded, false);
	assert.equal(hosting.entryUrl, null);

	assert.deepEqual(
		apps.filter((app) => app.embedded).map((app) => app.id),
		["content-editor", "blog-post-manager", "inquiry-manager"],
	);
});

test("embedded apps serve their own UI and API from the launcher process", async (context) => {
	const baseUrl = await withLauncher(context);

	const page = await fetch(`${baseUrl}/apps/blog-post-manager/`);
	assert.equal(page.status, 200);
	assert.match(await page.text(), /Blog Post Manager/);

	const posts = await fetch(`${baseUrl}/apps/blog-post-manager/api/posts`);
	assert.equal(posts.status, 200);
	assert.ok(Array.isArray(await posts.json()));

	const unknownRoute = await fetch(`${baseUrl}/apps/blog-post-manager/api/nope`);
	assert.equal(unknownRoute.status, 404);

	const unknownApp = await fetch(`${baseUrl}/apps/not-an-app/api/posts`);
	assert.equal(unknownApp.status, 404);
});

test("a missing trailing slash redirects so relative assets resolve", async (context) => {
	const baseUrl = await withLauncher(context);
	const response = await fetch(`${baseUrl}/apps/inquiry-manager`, { redirect: "manual" });
	assert.equal(response.status, 302);
	assert.equal(response.headers.get("location"), "/apps/inquiry-manager/");
});
