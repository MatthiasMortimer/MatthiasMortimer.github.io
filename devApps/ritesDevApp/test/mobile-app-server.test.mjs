import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import mobileServer from "../../../ritesGlobal/mobile-app-server.cjs";

const { startMobileAppServer } = mobileServer;

test("mobile app server serves static files and JSON operations", async (context) => {
	const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), "ritesdev-mobile-app-"));
	await fs.writeFile(path.join(publicDir, "index.html"), "<h1>Mobile app</h1>");
	context.after(() => fs.rm(publicDir, { recursive: true, force: true }));

	const server = startMobileAppServer({
		port: 0,
		publicDir,
		handleApi: async ({ method, pathname, body }) => ({ method, pathname, body }),
	});
	await new Promise((resolve) => server.once("listening", resolve));
	context.after(() => server.close());
	const baseUrl = `http://127.0.0.1:${server.address().port}`;

	const page = await fetch(`${baseUrl}/`).then((response) => response.text());
	assert.equal(page, "<h1>Mobile app</h1>");

	const result = await fetch(`${baseUrl}/api/example`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ value: 42 }),
	}).then((response) => response.json());
	assert.deepEqual(result, { method: "POST", pathname: "/api/example", body: { value: 42 } });
});
