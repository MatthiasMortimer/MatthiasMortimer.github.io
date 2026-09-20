import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createInquiryStore } from "../../../ritesGlobal/inquiry-store.mjs";

async function withStore(run) {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "inquiry-store-"));
	try {
		await run(createInquiryStore(path.join(dir, "contact-submissions.jsonl")));
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}

const sample = {
	name: "Sarah Jenkins",
	email: "sarah@example.com",
	service: "web-development",
	timeline: "Next month",
	message: "I need a marketing site.",
};

test("list returns an empty array when nothing has been submitted", async () => {
	await withStore(async (store) => {
		assert.deepEqual(await store.list(), []);
		assert.deepEqual(await store.stats(), { total: 0, new: 0, read: 0, replied: 0, archived: 0 });
	});
});

test("add stores an inquiry with an id and new status", async () => {
	await withStore(async (store) => {
		const record = await store.add(sample);
		assert.ok(record.id);
		assert.equal(record.status, "new");

		const [stored] = await store.list();
		assert.equal(stored.name, "Sarah Jenkins");
		assert.equal(stored.message, "I need a marketing site.");
	});
});

test("add rejects missing fields and malformed emails", async () => {
	await withStore(async (store) => {
		await assert.rejects(() => store.add({ ...sample, name: "  " }), /required/i);
		await assert.rejects(() => store.add({ ...sample, email: "not-an-email" }), /valid email/i);
	});
});

test("add strips control characters so one record cannot break the file", async () => {
	await withStore(async (store) => {
		await store.add({ ...sample, name: "Line\nBreak" });
		const [stored] = await store.list();
		assert.equal(stored.name, "Line Break");
		assert.equal((await store.list()).length, 1);
	});
});

test("update changes status and notes, remove deletes the record", async () => {
	await withStore(async (store) => {
		const record = await store.add(sample);
		const updated = await store.update(record.id, { status: "replied", notes: "Quoted $2k" });
		assert.equal(updated.status, "replied");
		assert.equal(updated.notes, "Quoted $2k");
		assert.deepEqual(await store.stats(), { total: 1, new: 0, read: 0, replied: 1, archived: 0 });

		await assert.rejects(() => store.update(record.id, { status: "nonsense" }), /status/i);

		await store.remove(record.id);
		assert.deepEqual(await store.list(), []);
		await assert.rejects(() => store.remove(record.id), /not found/i);
	});
});

test("legacy lines without an id are still readable and updatable", async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "inquiry-store-"));
	try {
		const file = path.join(dir, "contact-submissions.jsonl");
		await fs.writeFile(file, `${JSON.stringify({ ...sample, submittedAt: "2026-09-19T00:00:00.000Z" })}\n`, "utf8");
		const store = createInquiryStore(file);
		const [legacy] = await store.list();
		assert.ok(legacy.id.startsWith("legacy-"));
		assert.equal(legacy.status, "new");

		const updated = await store.update(legacy.id, { status: "archived" });
		assert.equal(updated.status, "archived");
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

test("addSync appends without async APIs for the no-JavaScript fallback", async () => {
	await withStore(async (store) => {
		store.addSync(sample);
		assert.equal((await store.list()).length, 1);
	});
});

test("concurrent updates never drop records", async () => {
	await withStore(async (store) => {
		const records = [];
		for (let index = 0; index < 5; index += 1) {
			records.push(await store.add({ ...sample, name: `Client ${index}` }));
		}

		await Promise.all([
			...records.map((record) => store.update(record.id, { status: "read" })),
			...records.map((record) => store.update(record.id, { notes: "touched" })),
			store.list(),
			store.stats(),
		]);

		const stored = await store.list();
		assert.equal(stored.length, 5);
		assert.ok(stored.every((record) => record.notes === "touched"));
	});
});
