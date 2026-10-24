import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const navigation = source.slice(source.indexOf("const mobileNavigation ="), source.indexOf('$("#add-category").addEventListener'));
const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const panelIds = ["layout-panel", "tickets-panel", "announcements-panel", "messages-panel"];

test("roles and member assignments are in a collapsed disclosure before channels", () => {
	const roles = html.match(/<details id="roles-section" class="layout-details">([\s\S]*?)<\/details>/);
	assert.ok(roles, "Roles disclosure starts collapsed");
	assert.match(roles[1], /<summary><h4>Roles<\/h4>/);
	for (const id of ["add-role", "roles", "managed-member", "managed-member-roles", "save-member-roles", "approve-member"]) {
		assert.match(roles[1], new RegExp(`id="${id}"`));
		assert.equal(html.split(`id="${id}"`).length - 1, 1);
	}
	assert.ok(html.indexOf(roles[0]) < html.indexOf('id="categories"'));
});

function createNavigation(matches) {
	const tabs = panelIds.map((id, index) => ({
		dataset: { panel: id },
		active: index === 0,
		attributes: {},
		addEventListener(type, listener) { this[type] = listener; },
		setAttribute(name, value) { this.attributes[name] = value; },
	}));
	const panels = panelIds.map((id, index) => ({ id, active: index === 0 }));
	for (const element of [...tabs, ...panels]) {
		element.classList = { toggle(name, active) { element.active = active; } };
	}
	const nav = { parent: null };
	const mobile = { append(element) { element.parent = this; } };
	const workspace = {
		insertBefore(element, next) {
			assert.equal(next, panels[0]);
			element.parent = this;
		},
	};
	const elements = { "#section-tabs": nav, "#mobile-sections": mobile, "#server-workspace": workspace, "#layout-panel": panels[0] };
	const media = {
		matches,
		addEventListener(type, listener) {
			assert.equal(type, "change");
			this.change = listener;
		},
	};
	vm.runInNewContext(navigation, {
		$: (selector) => elements[selector],
		window: { matchMedia(query) { assert.equal(query, "(max-width: 760px)"); return media; } },
		document: { querySelectorAll(selector) { return selector === ".tab" ? tabs : panels; } },
	});
	return { tabs, panels, nav, mobile, workspace, media };
}

test("mobile menu has all four controls and lives directly below the server list", () => {
	assert.match(html, /id="server-list"[^>]*><\/div>\s*<div id="mobile-sections" hidden>/);
	for (const id of panelIds) assert.match(html, new RegExp(`data-panel="${id}" aria-controls="${id}" aria-pressed="(?:true|false)"`));
	const { nav, mobile } = createNavigation(true);
	assert.equal(nav.parent, mobile);
});

test("every section opens its panel with one selected button on mobile and desktop", () => {
	for (const matches of [true, false]) {
		const { tabs, panels, nav, mobile, workspace } = createNavigation(matches);
		assert.equal(nav.parent, matches ? mobile : workspace);
		for (const tab of tabs) {
			tab.click();
			assert.deepEqual(panels.filter((panel) => panel.active).map((panel) => panel.id), [tab.dataset.panel]);
			assert.deepEqual(tabs.filter((item) => item.active), [tab]);
			assert.equal(tab.attributes["aria-pressed"], "true");
			assert.ok(tabs.filter((item) => item !== tab).every((item) => item.attributes["aria-pressed"] === "false"));
		}
	}
});

test("resizing relocates the existing controls without resetting the section", () => {
	const { tabs, panels, nav, mobile, workspace, media } = createNavigation(false);
	tabs[2].click();
	media.matches = true;
	media.change();
	assert.equal(nav.parent, mobile);
	assert.equal(panels[2].active, true);
	media.matches = false;
	media.change();
	assert.equal(nav.parent, workspace);
	assert.equal(tabs[2].active, true);
});
