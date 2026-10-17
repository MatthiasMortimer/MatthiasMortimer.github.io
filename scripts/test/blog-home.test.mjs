import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Blog Home starts with latest posts instead of the whoami card", async () => {
	const html = await readFile(new URL("../../dist/client/blog/index.html", import.meta.url), "utf8");
	assert.doesNotMatch(html, /class="hero"|hero__eyebrow|\/\/ whoami/);
	assert.match(html, /<h1 id="latest-title"/);
	assert.match(html, /class="home-info"/);
	assert.match(html, /class="home-info home-about"/);
	assert.match(html, /class="projects"/);
	assert.match(html, /<footer/);
	assert.equal((html.match(/<h1\b/g) || []).length, 1);
});

test("Blog Home renders independent information sections before posts with readable no-JS content", async () => {
	const html = await readFile(new URL("../../dist/client/blog/index.html", import.meta.url), "utf8");
	const cards = [...html.matchAll(/<aside\b[^>]*data-home-card[^>]*>[\s\S]*?<\/aside>/g)]
		.map(([card]) => card);
	assert.equal(cards.length, 2);
	for (const card of cards) {
		assert.match(card, /<details open>/);
		assert.match(card, /<summary class="home-card__summary">/);
		assert.match(card, /class="home-card__body"/);
		assert.doesNotMatch(card, /<details\b[^>]*\bname=/);
	}
	assert.ok(html.indexOf(cards[0]) < html.indexOf(cards[1]));
	assert.ok(html.indexOf(cards[1]) < html.indexOf('id="latest-title"'));
	assert.ok(html.indexOf('class="projects"') < html.indexOf("<footer"));
	assert.equal((html.match(/id="about-title"/g) || []).length, 1);
});
