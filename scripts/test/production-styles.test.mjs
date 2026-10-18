import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderSiteThemeCss } from "../../ritesGlobal/site-theme.mjs";

const clientDir = new URL("../../dist/client/", import.meta.url);

for (const page of ["index.html", "blog/index.html", "blog/posts/post-1/index.html"]) {
	test(`${page} uses existing fingerprinted production styles`, async () => {
		const html = await readFile(new URL(page, clientDir), "utf8");
		assert.doesNotMatch(html, /href=["']\/generated\/(?:blog|ritesdev)\.css/);
		assert.doesNotMatch(html, /theme-preview-bridge|mountThemePreviewBridge|data-editor-port/);
		const links = [...html.matchAll(/<link\b[^>]*>/g)]
			.map(([tag]) => tag)
			.filter((tag) => /\brel="stylesheet"/.test(tag))
			.map((tag) => /\bhref="([^"]+)"/.exec(tag)?.[1]);
		assert.ok(links.length > 0, "Expected bundled stylesheets");
		const css = [];
		for (const href of links) {
			assert.match(href, /^\/generated\/(?:blog|ritesdev)\.[a-f0-9]{16}\.css$/);
			const content = await readFile(new URL(href.slice(1), clientDir), "utf8");
			const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
			assert.ok(href.endsWith(`.${hash}.css`), "Stylesheet name must match its contents");
			css.push(content);
		}
		const styles = css.join("\n");
		const slug = page.startsWith("blog/") ? "blog" : "ritesdev";
		const theme = JSON.parse(await readFile(new URL(`../../sites/s-${slug}/content/theme.json`, import.meta.url), "utf8"));
		assert.ok(styles.includes(renderSiteThemeCss(slug, theme)), "Production CSS must include the saved site theme");
		assert.match(styles, /\.site-nav__mobile-menu/);
		if (page === "blog/index.html") {
			assert.match(styles, /\.home-layout/);
			assert.match(styles, /\.home-info/);
			assert.match(styles, /\.home-content/);
		}
	});
}
