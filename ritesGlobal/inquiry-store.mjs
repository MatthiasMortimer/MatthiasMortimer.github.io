// Shared storage for "Send an Inquiry" submissions.
// The RitesDev site appends entries here; the Inquiry Manager dev app reads/updates them.
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_INQUIRY_FILE = path.resolve(__dirname, "..", "dev", "contact-submissions.jsonl");
export const INQUIRY_STATUSES = ["new", "read", "replied", "archived"];

const LIMITS = { name: 120, email: 160, service: 80, timeline: 120, message: 5000, notes: 5000 };

function clean(value, limit) {
	return String(value ?? "")
		// Strip control characters so a single record can never break the JSONL format.
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.trim()
		.slice(0, limit);
}

function isEmail(value) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateInquiry(input) {
	const inquiry = {
		name: clean(input?.name, LIMITS.name),
		email: clean(input?.email, LIMITS.email),
		service: clean(input?.service, LIMITS.service),
		timeline: clean(input?.timeline, LIMITS.timeline),
		message: String(input?.message ?? "").replace(/\r\n/g, "\n").trim().slice(0, LIMITS.message),
	};

	if (!inquiry.name || !inquiry.email || !inquiry.service || !inquiry.message) {
		throw new Error("Please fill out all required fields before sending.");
	}

	if (!isEmail(inquiry.email)) {
		throw new Error("Please enter a valid email address.");
	}

	return inquiry;
}

function normalize(record, index) {
	const status = INQUIRY_STATUSES.includes(record?.status) ? record.status : "new";
	return {
		id: record?.id || `legacy-${index}-${record?.submittedAt || "unknown"}`,
		name: record?.name ?? "",
		email: record?.email ?? "",
		service: record?.service ?? "",
		timeline: record?.timeline ?? "",
		message: record?.message ?? "",
		status,
		notes: record?.notes ?? "",
		submittedAt: record?.submittedAt ?? "",
		updatedAt: record?.updatedAt ?? record?.submittedAt ?? "",
	};
}

export function createInquiryStore(filePath = DEFAULT_INQUIRY_FILE) {
	const file = path.resolve(filePath);

	// Reads and rewrites run one at a time: a read during a rewrite used to see a truncated file.
	let queue = Promise.resolve();
	function withLock(operation) {
		const result = queue.then(operation);
		queue = result.catch(() => {});
		return result;
	}

	async function readAll() {
		let source;
		try {
			source = await fsp.readFile(file, "utf8");
		} catch (error) {
			if (error.code === "ENOENT") return [];
			throw error;
		}

		return source
			.split("\n")
			.filter((line) => line.trim())
			.map((line) => {
				try {
					return JSON.parse(line);
				} catch {
					return null;
				}
			})
			.filter(Boolean)
			.map(normalize);
	}

	async function writeAll(records) {
		await fsp.mkdir(path.dirname(file), { recursive: true });
		const output = records.map((record) => JSON.stringify(record)).join("\n");
		const tempFile = `${file}.${process.pid}.tmp`;
		await fsp.writeFile(tempFile, output ? `${output}\n` : "", "utf8");
		await fsp.rename(tempFile, file);
	}

	async function list() {
		const records = await withLock(readAll);
		return records.sort((first, second) => String(second.submittedAt).localeCompare(String(first.submittedAt)));
	}

	async function add(input) {
		const inquiry = validateInquiry(input);
		const now = new Date().toISOString();
		const record = {
			id: crypto.randomUUID(),
			...inquiry,
			status: "new",
			notes: "",
			submittedAt: now,
			updatedAt: now,
		};

		await withLock(async () => {
			await fsp.mkdir(path.dirname(file), { recursive: true });
			await fsp.appendFile(file, `${JSON.stringify(record)}\n`, "utf8");
		});
		return record;
	}

	// Synchronous append so the Astro no-JavaScript fallback can stay simple.
	function addSync(input) {
		const inquiry = validateInquiry(input);
		const now = new Date().toISOString();
		const record = { id: crypto.randomUUID(), ...inquiry, status: "new", notes: "", submittedAt: now, updatedAt: now };
		fs.mkdirSync(path.dirname(file), { recursive: true });
		fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
		return record;
	}

	async function update(id, patch = {}) {
		return withLock(async () => {
			const records = await readAll();
			const index = records.findIndex((record) => record.id === id);
			if (index === -1) throw new Error("Inquiry not found.");

			const record = records[index];
			if (patch.status !== undefined) {
				if (!INQUIRY_STATUSES.includes(patch.status)) throw new Error("Unknown inquiry status.");
				record.status = patch.status;
			}

			if (patch.notes !== undefined) {
				record.notes = String(patch.notes).slice(0, LIMITS.notes);
			}

			record.updatedAt = new Date().toISOString();
			records[index] = record;
			await writeAll(records);
			return record;
		});
	}

	async function remove(id) {
		return withLock(async () => {
			const records = await readAll();
			const remaining = records.filter((record) => record.id !== id);
			if (remaining.length === records.length) throw new Error("Inquiry not found.");
			await writeAll(remaining);
			return { id };
		});
	}

	async function stats() {
		const records = await withLock(readAll);
		const counts = Object.fromEntries(INQUIRY_STATUSES.map((status) => [status, 0]));
		for (const record of records) counts[record.status] += 1;
		return { total: records.length, ...counts };
	}

	return { file, list, add, addSync, update, remove, stats };
}
