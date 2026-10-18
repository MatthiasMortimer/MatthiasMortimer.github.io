import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createContentStore } from "../content-store.js";
import {
	createDefaultSiteTheme,
	getSiteThemeDefinition,
	getThemeEditorConfig,
	renderSiteThemeCss,
	validateSiteTheme,
} from "../../../ritesGlobal/site-theme.mjs";
import { isThemeHex, normalizeThemeHex } from "../public/theme-values.js";

async function createFixture(context) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "theme-content-"));
	context.after(() => fs.rm(dir, { recursive: true, force: true }));
	const inventory = [];
	for (const slug of ["blog", "ritesdev"]) {
		const siteDir = path.join(dir, slug);
		await fs.mkdir(path.join(siteDir, "content"), { recursive: true });
		await fs.writeFile(path.join(siteDir, "content/theme.json"), JSON.stringify(createDefaultSiteTheme(slug)));
		inventory.push({
			slug,
			label: slug,
			dir: siteDir,
			contentTypes: { theme: { label: "Theme colors", files: ["content/theme.json"] } },
		});
	}
	return { store: createContentStore(() => inventory), dir };
}

test("lists and reads both site themes with independent defaults and complete editor metadata", async (context) => {
	const { store } = await createFixture(context);
	for (const site of await store.list()) {
		assert.equal(site.groups[0].files[0].editor.kind, "theme");
		const document = await store.read(site.slug, "content/theme.json");
		assert.equal(document.editor.kind, "theme");
		assert.deepEqual(document.fields, createDefaultSiteTheme(site.slug));
		assert.deepEqual(document.editor.defaults, document.fields);
		assert.equal(document.editor.simpleFields.length, 5);
		const simpleKeys = document.editor.simpleFields.map((field) => field.key);
		const advancedKeys = document.editor.advancedSections.flatMap((section) =>
			section.fields.filter((field) => !field.simple).map((field) => field.key),
		);
		assert.equal(new Set([...simpleKeys, ...advancedKeys]).size, Object.keys(document.fields.colors).length);
		assert.ok(advancedKeys.every((key) => !simpleKeys.includes(key)));
	}
});

test("saves normalized colors, backs up the previous file, isolates sites, and supports resetting defaults", async (context) => {
	const { store, dir } = await createFixture(context);
	const before = await store.read("blog", "content/theme.json");
	const ritesdevBefore = await store.read("ritesdev", "content/theme.json");
	const fields = structuredClone(before.fields);
	fields.colors.bg = "#aBc";
	fields.colors.accent = "#123456";
	const saved = await store.save("blog", "content/theme.json", { fields });
	assert.equal(saved.fields.colors.bg, "#aabbcc");
	assert.equal(saved.fields.colors.accent, "#123456");
	const backupPath = path.join(dir, "blog/content/theme.json.bak");
	assert.deepEqual(JSON.parse(await fs.readFile(backupPath, "utf8")), before.fields);
	assert.deepEqual((await store.read("ritesdev", "content/theme.json")).fields, ritesdevBefore.fields);
	const reset = await store.save("blog", "content/theme.json", { fields: saved.editor.defaults });
	assert.deepEqual(reset.fields, before.fields);
});

test("invalid themes never overwrite or back up the source", async (context) => {
	const { store, dir } = await createFixture(context);
	const filePath = path.join(dir, "blog/content/theme.json");
	const original = await fs.readFile(filePath, "utf8");
	const invalidThemes = [
		{ ...createDefaultSiteTheme("blog"), colorScheme: "automatic" },
		{ ...createDefaultSiteTheme("blog"), extra: true },
		{ colorScheme: "light", colors: [] },
		{ colorScheme: "light", colors: {} },
	];
	for (const value of ["", "beige", "#1234", "#12345678", null, 123, "#123456; } body { display:none"]) {
		const fields = createDefaultSiteTheme("blog");
		fields.colors.bg = value;
		invalidThemes.push(fields);
	}
	const unknownColor = createDefaultSiteTheme("blog");
	unknownColor.colors.unknown = "#123456";
	invalidThemes.push(unknownColor);
	for (const fields of invalidThemes) {
		await assert.rejects(() => store.save("blog", "content/theme.json", { fields }), /Theme/);
		assert.equal(await fs.readFile(filePath, "utf8"), original);
		await assert.rejects(fs.access(`${filePath}.bak`));
	}
	await assert.rejects(() => store.read("blog", "../theme.json"), /not registered/);
});

test("themes generate scoped root variables, and changed colors change the generated CSS", () => {
	for (const slug of ["blog", "ritesdev"]) {
		const defaults = createDefaultSiteTheme(slug);
		const original = renderSiteThemeCss(slug, defaults);
		assert.match(original, /^:root \{\n/);
		for (const section of getThemeEditorConfig(slug).advancedSections) {
			for (const field of section.fields) {
				assert.ok(original.includes(`${field.cssVar}: ${defaults.colors[field.key]};`));
			}
		}
		const changed = structuredClone(defaults);
		changed.colors.accent = "#112233";
		assert.notEqual(renderSiteThemeCss(slug, changed), original);
		assert.match(renderSiteThemeCss(slug, changed), /--color-accent: #112233;/);
		assert.deepEqual(createDefaultSiteTheme(slug), defaults);
	}
});

test("unknown sites are not offered theme editing and definitions cannot mutate stored defaults", () => {
	for (const slug of ["global", "contractor", "constructor", "toString", "__proto__"]) {
		assert.equal(getSiteThemeDefinition(slug), null);
		assert.equal(getThemeEditorConfig(slug), null);
		assert.throws(() => validateSiteTheme(slug, {}), /does not support/);
	}
	const editor = getThemeEditorConfig("blog");
	editor.defaults.colors.bg = "#000000";
	assert.equal(createDefaultSiteTheme("blog").colors.bg, "#f4efe5");
});

test("browser hex validation matches server validation and never silently substitutes a color", () => {
	for (const value of ["#abc", "#ABCDEF", "#123456", "#AbC"]) {
		assert.ok(isThemeHex(value));
		const theme = createDefaultSiteTheme("blog");
		theme.colors.bg = value;
		assert.equal(normalizeThemeHex(value), validateSiteTheme("blog", theme).colors.bg);
	}
	for (const value of ["", "red", " #123456", "#12345", "#12345678", null]) {
		assert.equal(isThemeHex(value), false);
		assert.throws(() => normalizeThemeHex(value), /hex/);
	}
});
