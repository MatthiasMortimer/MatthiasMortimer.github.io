import assert from "node:assert/strict";
import test from "node:test";
import { startLauncherServer } from "../server.mjs";

test("mobile mode can be enabled and disabled from loopback", async (context) => {
	const server = startLauncherServer(0);
	await new Promise((resolve) => server.once("listening", resolve));
	context.after(() => server.close());
	const baseUrl = `http://127.0.0.1:${server.address().port}`;

	const initial = await fetch(`${baseUrl}/api/mobile-mode`).then((response) => response.json());
	assert.equal(initial.enabled, false);
	assert.equal(initial.canConfigure, true);

	const enabled = await fetch(`${baseUrl}/api/mobile-mode`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ enabled: true }),
	}).then((response) => response.json());
	assert.equal(enabled.success, true);
	assert.equal(enabled.enabled, true);

	const disabled = await fetch(`${baseUrl}/api/mobile-mode`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ enabled: false }),
	}).then((response) => response.json());
	assert.equal(disabled.enabled, false);
});
