import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultSiteTheme, getThemeEditorConfig } from "../../../ritesGlobal/site-theme.mjs";
import {
	PREVIEW_MESSAGE, PREVIEW_READY, PREVIEW_REATTACH, VIEWPORT_PRESETS,
	createThemePreviewSnapshot, isThemePreviewSnapshot, validateViewportSize, createPreviewWindowController,
} from "../public/theme-preview.js";

function snapshot(slug = "blog", previous = null) {
	return createThemePreviewSnapshot({ slug, label: slug }, createDefaultSiteTheme(slug), getThemeEditorConfig(slug), previous);
}

function windowFixture(blocked = false) {
	const events = new Map();
	const timers = new Map();
	const messages = [];
	const changes = [];
	const errors = [];
	const children = [];
	let timerId = 0;
	const host = {
		location: { origin: "http://localhost:4605", href: "http://localhost:4605/apps/content-editor/" },
		addEventListener(type, handler) { events.set(type, handler); },
		setInterval(handler) { timers.set(++timerId, handler); return timerId; },
		clearInterval(id) { timers.delete(id); },
		open(url, target, features) {
			if (blocked) return null;
			const child = {
				url, target, features, closed: false, focusCount: 0,
				focus() { this.focusCount++; },
				close() { this.closed = true; },
				postMessage(message, origin) { messages.push({ message, origin }); },
			};
			children.push(child);
			return child;
		},
	};
	const controller = createPreviewWindowController({
		host,
		onChange: (value) => changes.push(value),
		onError: (message) => errors.push(message),
	});
	return { controller, host, events, timers, messages, changes, errors, children };
}

test("inline and detached previews use the same normalized snapshot, retaining last valid edits only within a site", () => {
	const before = snapshot();
	assert.ok(isThemePreviewSnapshot(before));
	const fields = createDefaultSiteTheme("blog");
	fields.colors.accent = "#aBc";
	let updated = createThemePreviewSnapshot({ slug: "blog", label: "Blog" }, fields, getThemeEditorConfig("blog"), before);
	assert.equal(updated.colors["--color-accent"], "#aabbcc");
	fields.colors.accent = "invalid";
	updated = createThemePreviewSnapshot({ slug: "blog", label: "Blog" }, fields, getThemeEditorConfig("blog"), updated);
	assert.equal(updated.colors["--color-accent"], "#aabbcc");
	assert.equal(snapshot("ritesdev", updated).colors["--color-accent"], "#38bdf8");
	assert.deepEqual(JSON.parse(JSON.stringify(updated)), updated);
	for (const invalid of [null, {}, { ...before, colorScheme: "auto" }, { ...before, colors: { color: "#fff" } },
		{ ...before, colors: { "--color-bg": "url(https://example.com)" } }]) {
		assert.equal(isThemePreviewSnapshot(invalid), false);
	}
});

test("viewport presets and custom sizes enforce the exact supported dimensions", () => {
	assert.deepEqual(VIEWPORT_PRESETS.mobile, { width: 375, height: 812 });
	assert.deepEqual(VIEWPORT_PRESETS.tablet, { width: 768, height: 1024 });
	assert.deepEqual(VIEWPORT_PRESETS.desktop, { width: 1280, height: 800 });
	for (const size of [...Object.values(VIEWPORT_PRESETS), { width: 240, height: 240 }, { width: 2560, height: 2160 }]) {
		assert.deepEqual(validateViewportSize(size.width, size.height), size);
	}
	for (const [width, height] of [[239, 812], [2561, 812], [375, 239], [375, 2161], [375.5, 812], [NaN, 812]]) {
		assert.throws(() => validateViewportSize(width, height), /240/);
	}
});

test("detachment opens one resizable local window, handshakes, streams updates, and reattaches", () => {
	const fixture = windowFixture();
	const { controller, children, changes, events, messages, host, timers } = fixture;
	const initial = snapshot();
	controller.open(initial);
	assert.equal(children.length, 1);
	assert.equal(controller.isOpen, true);
	assert.equal(children[0].url, "http://localhost:4605/apps/content-editor/theme-preview.html");
	assert.match(children[0].features, /resizable=yes/);
	assert.deepEqual(changes, [true]);
	events.get("message")({ source: {}, origin: host.location.origin, data: { type: PREVIEW_READY } });
	events.get("message")({ source: children[0], origin: "https://example.com", data: { type: PREVIEW_READY } });
	assert.equal(messages.length, 0);
	events.get("message")({ source: children[0], origin: host.location.origin, data: { type: PREVIEW_READY } });
	assert.deepEqual(messages[0], { message: { type: PREVIEW_MESSAGE, snapshot: initial }, origin: host.location.origin });
	controller.update(snapshot("ritesdev"));
	assert.equal(messages.at(-1).message.snapshot.siteSlug, "ritesdev");
	controller.update(null);
	assert.equal(messages.at(-1).message.snapshot, null);
	controller.open(initial);
	assert.equal(children.length, 1);
	assert.equal(children[0].focusCount, 1);
	events.get("message")({ source: children[0], origin: host.location.origin, data: { type: PREVIEW_REATTACH } });
	assert.equal(children[0].closed, true);
	assert.equal(controller.isOpen, false);
	assert.deepEqual(changes, [true, false]);
	assert.equal(timers.size, 0);
});

test("closing or reopening the popup restores inline state without leaking close timers", () => {
	const { controller, children, changes, timers, events } = windowFixture();
	controller.open(snapshot());
	children[0].closed = true;
	timers.values().next().value();
	assert.equal(controller.isOpen, false);
	assert.equal(timers.size, 0);
	assert.deepEqual(changes, [true, false]);
	controller.open(snapshot());
	children[1].closed = true;
	controller.open(snapshot());
	assert.equal(children.length, 3);
	assert.equal(timers.size, 1);
	events.get("pagehide")();
	assert.equal(children[2].closed, true);
	assert.equal(timers.size, 0);
});

test("a blocked popup reports an actionable error and keeps the inline preview available", () => {
	const { controller, changes, errors, timers } = windowFixture(true);
	controller.open(snapshot());
	assert.equal(controller.isOpen, false);
	assert.deepEqual(changes, []);
	assert.match(errors[0], /blocked.*Allow pop-ups/);
	assert.equal(timers.size, 0);
});
