import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const helpers = vm.runInNewContext(`${source.slice(source.indexOf("// Editors add empty member maps"), source.indexOf("function updateLayoutStatus()"))}
${source.slice(source.indexOf("// Templates without Discord IDs"), source.indexOf("async function loadLayout("))}
({ stableStringify, normalizeEditorLayout, adoptAppliedIds });`, { state: {} });

test("dirty check ignores key order and empty editor defaults", () => {
	assert.equal(helpers.stableStringify({ b: 1, a: { everyone: "view", members: {} }, c: null }), helpers.stableStringify({ a: { everyone: "view" }, b: 1 }));
	assert.notEqual(helpers.stableStringify({ a: { roles: { Admin: "view" } } }), helpers.stableStringify({ a: {} }));
});

test("loading the default layout reuses applied Discord IDs by name", () => {
	const applied = {
		roles: [{ name: "Admin", roleId: "1" }],
		categories: [{ name: "START HERE", categoryId: "2", channels: [{ name: "start-here", channelId: "3" }] }],
	};
	const layout = helpers.adoptAppliedIds(helpers.normalizeEditorLayout({
		roles: [{ name: "admin" }, { name: "Guest" }],
		categories: [{ name: "Start Here", channels: ["start-here", "rules"] }, { name: "NEW", channels: [] }],
	}), applied);
	assert.equal(layout.roles[0].roleId, "1");
	assert.equal(layout.roles[1].roleId, undefined);
	assert.equal(layout.categories[0].categoryId, "2");
	assert.equal(layout.categories[0].channels[0].channelId, "3");
	assert.equal(layout.categories[0].channels[1].channelId, undefined);
	assert.equal(layout.categories[1].categoryId, undefined);
});
