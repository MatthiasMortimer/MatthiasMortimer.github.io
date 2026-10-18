import assert from "node:assert/strict";
import test from "node:test";
import { createThemeAutosave } from "../public/theme-autosave.js";

function fixture(save = async (value) => value) {
	const callbacks = new Map();
	let id = 0;
	const saved = [];
	const errors = [];
	const states = [];
	const autosave = createThemeAutosave({
		save,
		onSaved: (value) => saved.push(value),
		onError: (error) => errors.push(error),
		onState: (value) => states.push(value),
		timers: {
			setTimeout(callback) { callbacks.set(++id, callback); return id; },
			clearTimeout(key) { callbacks.delete(key); },
		},
	});
	async function tick() {
		const handlers = [...callbacks.values()];
		callbacks.clear();
		for (const handler of handlers) await handler();
	}
	return { autosave, saved, errors, states, tick, callbacks };
}

test("rapid valid edits coalesce to the latest palette, invalid edits cancel queued saves", async () => {
	const f = fixture();
	f.autosave.schedule({ accent: "#123456" });
	f.autosave.schedule({ accent: "#abcdef" });
	assert.equal(f.callbacks.size, 1);
	await f.tick();
	assert.deepEqual(f.saved, [{ accent: "#abcdef" }]);
	f.autosave.schedule({ accent: "#111111" });
	f.autosave.schedule(null);
	await f.tick();
	assert.equal(f.saved.length, 1);
});

test("saves serialize and stale responses never mark newer edits as saved", async () => {
	let release;
	const writes = [];
	const f = fixture((value) => {
		writes.push(value);
		return new Promise((resolve) => { release = () => resolve(value); });
	});
	f.autosave.schedule("one");
	const first = f.tick();
	f.autosave.schedule("two");
	await f.tick();
	assert.deepEqual(writes, ["one"]);
	release();
	await first;
	assert.deepEqual(f.saved, []);
	const second = f.tick();
	assert.deepEqual(writes, ["one", "two"]);
	release();
	await second;
	assert.deepEqual(f.saved, ["two"]);
});

test("save failures surface errors and explicit flush retries without silent success", async () => {
	let fail = true;
	const f = fixture(async (value) => {
		if (fail) throw new Error("disk full");
		return value;
	});
	f.autosave.schedule("one");
	await f.tick();
	assert.equal(f.errors[0].message, "disk full");
	assert.deepEqual(f.saved, []);
	fail = false;
	await f.autosave.flush("one");
	assert.deepEqual(f.saved, ["one"]);
});

test("switching documents cancels delayed saves, and invalid edits during a save remain unsaved", async () => {
	const f = fixture();
	f.autosave.schedule("discarded");
	f.autosave.cancel();
	await f.tick();
	assert.deepEqual(f.saved, []);
	let release;
	const g = fixture(() => new Promise((resolve) => { release = resolve; }));
	g.autosave.schedule("valid");
	const saving = g.tick();
	g.autosave.schedule(null);
	release("valid");
	await saving;
	assert.deepEqual(g.saved, []);
});
