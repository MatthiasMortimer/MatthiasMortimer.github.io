import assert from "node:assert/strict";
import test from "node:test";
import {
	createArrayItem,
	createBlankValue,
	getValueAtPath,
	setValueAtPath,
} from "../public/structured-values.js";

test("creates a blank entry from an existing object schema", () => {
	const entry = createArrayItem([{
		id: "service",
		title: "Service",
		deliverables: ["One"],
		popular: true,
	}], ["services", "items"]);

	assert.deepEqual(entry, {
		id: "",
		title: "",
		deliverables: [],
		popular: false,
	});
});

test("provides schemas for empty repeatable sections", () => {
	assert.deepEqual(createArrayItem([], ["process", "steps"]), {
		number: "",
		title: "",
		body: "",
	});
	assert.deepEqual(createArrayItem([], ["faqs"]), {
		question: "",
		answer: "",
	});
});

test("reads and replaces nested array values", () => {
	const content = { process: { steps: [{ number: "01", title: "One", body: "Body" }] } };
	assert.equal(getValueAtPath(content, ["process", "steps", 0, "title"]), "One");
	setValueAtPath(content, ["process", "steps", 0, "title"], "Updated");
	assert.equal(content.process.steps[0].title, "Updated");
	assert.deepEqual(createBlankValue(content.process.steps[0]), { number: "", title: "", body: "" });
});