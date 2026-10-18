import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { getLivePreview } from "../live-preview.js";
import hostingConfig from "../../../ritesGlobal/hosting-config.cjs";
import { isLocalPreviewUrl } from "../public/live-website-preview.js";

const sites = [{ slug: "blog", basePath: "/blog" }, { slug: "ritesdev", basePath: "/" }];

test("preview discovery uses the hosting dev server, never the production server", async () => {
	for (const site of sites) {
		const result = await getLivePreview(site.slug, {
			sites,
			fetchImpl: async (url, options) => {
				const config = hostingConfig.buildHostingConfig();
				assert.equal(url.origin, new URL(config.devLocalUrl).origin);
				assert.notEqual(url.origin, new URL(config.localUrl).origin);
				assert.equal(url.pathname, `${site.basePath.replace(/\/$/, "")}/`);
				assert.equal(options.redirect, "error");
				assert.ok(options.signal instanceof AbortSignal);
				return new Response("dev page");
			},
		});
		assert.ok(result.available);
		assert.ok(isLocalPreviewUrl(result.url));
	}
	await assert.rejects(() => getLivePreview("global", { sites }), /does not support/);
	await assert.rejects(() => getLivePreview("http://example.com", { sites }), /does not support/);
});

test("unavailable dev servers return actionable errors and failed pages do not look successful", async () => {
	for (const error of [new Error("connection refused"), Object.assign(new Error(), { name: "TimeoutError" })]) {
		const result = await getLivePreview("blog", { sites, fetchImpl: async () => { throw error; } });
		assert.equal(result.available, false);
		assert.match(result.message, /Site Hosting.*Reload dev preview/);
	}
	const result = await getLivePreview("blog", { sites, fetchImpl: async () => new Response("error", { status: 500 }) });
	assert.equal(result.available, false);
	assert.match(result.message, /HTTP 500/);
});

test("test-mode hosting config offsets ports and disables the public tunnel", () => {
	const modulePath = new URL("../../../ritesGlobal/hosting-config.cjs", import.meta.url).pathname;
	const result = JSON.parse(execFileSync(process.execPath, [
		"-e", `console.log(JSON.stringify(require(${JSON.stringify(modulePath)}).buildHostingConfig()))`,
	], { env: { ...process.env, RITES_ENV: "test" }, encoding: "utf8" }));
	assert.equal(result.devLocalUrl, "http://127.0.0.1:4425/");
	assert.equal(result.localUrl, "http://127.0.0.1:4421");
	assert.equal(result.tunnelEnabled, false);
});

test("preview URL validation rejects remote hosts, credentials and scripts", () => {
	for (const value of ["http://127.0.0.1:4325/blog/", "http://localhost:4425/"]) assert.ok(isLocalPreviewUrl(value));
	for (const value of ["https://example.com", "javascript:alert(1)", "http://user:pass@127.0.0.1:4325", "http://127.0.0.1.example.com"]) {
		assert.equal(isLocalPreviewUrl(value), false);
	}
});
