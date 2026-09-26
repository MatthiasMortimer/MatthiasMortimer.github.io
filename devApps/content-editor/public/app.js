import { createArrayItem, getValueAtPath, setValueAtPath } from "./structured-values.js";

const siteSelect = document.querySelector("#site-select");
const fileList = document.querySelector("#file-list");
const searchInput = document.querySelector("#file-search");
const form = document.querySelector("#content-form");
const emptyState = document.querySelector("#empty-state");
const fieldsSection = document.querySelector("#fields-section");
const fieldsEditor = document.querySelector("#fields-editor");
const bodySection = document.querySelector("#body-section");
const bodyEditor = document.querySelector("#body-editor");
const saveState = document.querySelector("#save-state");

let sites = [];
let activeSite = null;
let activeFile = null;
let activeDocument = null;
let dirty = false;
let toastTimer;

async function loadInventory() {
	if (!canDiscardChanges()) return;
	try {
		sites = await window.contentAPI.list();
		document.querySelector("#site-count").textContent = `${sites.length} ${sites.length === 1 ? "website" : "websites"}`;
		renderSites();
		if (activeSite) activeSite = sites.find((site) => site.slug === activeSite.slug) || null;
		if (!activeSite && sites.length) activeSite = sites[0];
		renderSites();
		renderFiles();
		setDirty(false);
	} catch (error) {
		showToast(error.message, true);
	}
}

function renderSites() {
	siteSelect.replaceChildren();
	for (const site of sites) {
		const option = document.createElement("option");
		option.value = site.slug;
		option.textContent = site.label;
		option.selected = site.slug === activeSite?.slug;
		siteSelect.append(option);
	}
	siteSelect.disabled = sites.length === 0;
}

function selectSite(siteSlug) {
	if (siteSlug === activeSite?.slug) return;
	if (!canDiscardChanges()) {
		renderSites();
		return;
	}
	activeSite = sites.find((site) => site.slug === siteSlug);
	activeFile = null;
	activeDocument = null;
	form.hidden = true;
	emptyState.hidden = false;
	searchInput.value = "";
	renderSites();
	renderFiles();
	setDirty(false);
}

function renderFiles() {
	document.querySelector("#site-title").textContent = activeSite?.label || "Select a website";
	fileList.replaceChildren();
	if (!activeSite) return;

	const query = searchInput.value.trim().toLowerCase();
	const total = activeSite.groups.reduce((count, group) => count + group.files.length, 0);
	document.querySelector("#file-count").textContent = `${total} ${total === 1 ? "file" : "files"}`;

	for (const group of activeSite.groups) {
		const files = group.files.filter((file) =>
			`${file.name} ${file.relativePath} ${group.label}`.toLowerCase().includes(query),
		);
		if (!files.length) continue;

		const section = document.createElement("section");
		section.className = "file-group";
		const heading = document.createElement("h3");
		heading.textContent = group.label;
		section.append(heading);

		for (const file of files) {
			const button = document.createElement("button");
			button.type = "button";
			button.className = `file-item${file.relativePath === activeFile?.relativePath ? " active" : ""}`;
			const name = document.createElement("strong");
			name.textContent = humanize(file.name);
			const path = document.createElement("span");
			path.textContent = `${file.extension} · ${file.relativePath}`;
			button.append(name, path);
			button.addEventListener("click", () => openFile(file, group));
			section.append(button);
		}
		fileList.append(section);
	}
}

async function openFile(file, group) {
	if (!canDiscardChanges()) return;
	try {
		activeDocument = await window.contentAPI.read(activeSite.slug, file.relativePath);
		activeFile = { ...file, groupLabel: group.label };
		renderEditor();
		renderFiles();
		setDirty(false);
	} catch (error) {
		showToast(error.message, true);
	}
}

function renderEditor() {
	emptyState.hidden = true;
	form.hidden = false;
	document.querySelector("#document-path").textContent = `${activeSite.label} / ${activeFile.relativePath}`;
	document.querySelector("#document-title").textContent = getDocumentTitle();
	fieldsEditor.replaceChildren();

	const hasFields = activeDocument.mode !== "source";
	fieldsSection.hidden = !hasFields;
	if (hasFields) renderValue(activeDocument.fields, [], fieldsEditor, true);

	bodySection.hidden = activeDocument.mode === "structured";
	bodyEditor.value = activeDocument.body || "";
	document.querySelector("#body-label").textContent = activeDocument.mode === "source" ? "Source code" : "Page body";
	document.querySelector("#body-format").textContent = activeDocument.mode === "source" ? activeFile.extension : "Markdown";
	bodyEditor.spellcheck = activeDocument.mode !== "source";
}

function renderValue(value, path, parent, isRoot = false) {
	if (Array.isArray(value)) {
		renderArray(value, path, parent);
		return;
	}

	if (value && typeof value === "object" && !Array.isArray(value)) {
		const container = document.createElement(isRoot ? "div" : "fieldset");
		container.className = isRoot ? "field-grid" : "field-group";
		if (!isRoot) {
			const legend = document.createElement("legend");
			legend.textContent = humanize(path.at(-1));
			container.append(legend);
		}
		for (const [key, child] of Object.entries(value)) renderValue(child, [...path, key], container);
		parent.append(container);
		return;
	}

	const label = document.createElement("label");
	label.className = "field";
	const caption = document.createElement("span");
	caption.textContent = humanize(path.at(-1) || "Content");
	const input = createInput(value, path);
	input.dataset.path = JSON.stringify(path);
	label.append(caption, input);
	parent.append(label);
}

function renderArray(value, path, parent) {
	const container = document.createElement("section");
	container.className = "field-array";

	const header = document.createElement("div");
	header.className = "field-array-header";
	const heading = document.createElement("div");
	const title = document.createElement("h4");
	title.textContent = humanize(path.at(-1) || activeFile?.name || "Items");
	const count = document.createElement("span");
	count.textContent = `${value.length} ${value.length === 1 ? "entry" : "entries"}`;
	heading.append(title, count);

	const addButton = document.createElement("button");
	addButton.type = "button";
	addButton.className = "array-add-button";
	addButton.textContent = `+ Add ${singularize(path.at(-1) || "item")}`;
	addButton.addEventListener("click", () => addArrayItem(path));
	header.append(heading, addButton);
	container.append(header);

	const items = document.createElement("div");
	items.className = "field-array-items";
	if (!value.length) {
		const empty = document.createElement("p");
		empty.className = "array-empty";
		empty.textContent = "No entries yet";
		items.append(empty);
	}

	value.forEach((item, index) => {
		const itemContainer = document.createElement("article");
		itemContainer.className = "field-array-item";
		const itemHeader = document.createElement("div");
		itemHeader.className = "array-item-header";
		const itemTitle = document.createElement("strong");
		itemTitle.textContent = getArrayItemTitle(item, index, path);
		const removeButton = document.createElement("button");
		removeButton.type = "button";
		removeButton.className = "array-remove-button";
		removeButton.textContent = "×";
		removeButton.title = `Remove ${singularize(path.at(-1) || "item")} ${index + 1}`;
		removeButton.setAttribute("aria-label", removeButton.title);
		removeButton.addEventListener("click", () => removeArrayItem(path, index));
		itemHeader.append(itemTitle, removeButton);
		itemContainer.append(itemHeader);

		const itemBody = document.createElement("div");
		itemBody.className = "array-item-fields";
		renderValue(item, [...path, index], itemBody, true);
		itemContainer.append(itemBody);
		items.append(itemContainer);
	});

	container.append(items);
	parent.append(container);
}

function createInput(value, path) {
	if (value === null) {
		const textarea = document.createElement("textarea");
		textarea.rows = 3;
		textarea.value = JSON.stringify(value, null, 2);
		textarea.dataset.valueType = "json";
		return textarea;
	}

	const fieldName = String(path.at(-1) || "").toLowerCase();
	const isLongFormField = ["answer", "body", "description", "intro", "quote", "summary"].includes(fieldName);
	const input = typeof value === "string" && (isLongFormField || value.length > 90 || value.includes("\n"))
		? document.createElement("textarea")
		: document.createElement("input");
	if (input.tagName === "TEXTAREA") input.rows = 3;
	if (typeof value === "boolean") {
		input.type = "checkbox";
		input.checked = value;
		input.dataset.valueType = "boolean";
	} else {
		input.value = value;
		if (typeof value === "number") {
			input.type = "number";
			input.dataset.valueType = "number";
		}
	}
	return input;
}

function addArrayItem(path) {
	commitEditorDraft();
	const array = getValueAtPath(activeDocument.fields, path);
	array.push(createArrayItem(array, path));
	renderEditor();
	setDirty(true);
}

function removeArrayItem(path, index) {
	commitEditorDraft();
	const array = getValueAtPath(activeDocument.fields, path);
	array.splice(index, 1);
	renderEditor();
	setDirty(true);
}

function commitEditorDraft() {
	activeDocument.fields = collectFields();
	if (activeDocument.mode === "markdown") activeDocument.body = bodyEditor.value;
}

function collectFields() {
	let fields = structuredClone(activeDocument.fields);
	for (const input of fieldsEditor.querySelectorAll("[data-path]")) {
		let value = input.value;
		if (input.dataset.valueType === "boolean") value = input.checked;
		if (input.dataset.valueType === "number") value = Number(input.value);
		if (input.dataset.valueType === "json") value = JSON.parse(input.value);
		const path = JSON.parse(input.dataset.path);
		if (path.length) setAtPath(fields, path, value);
		else fields = value;
	}
	return fields;
}

function setAtPath(target, path, value) {
	setValueAtPath(target, path, value);
}

function getArrayItemTitle(item, index, path) {
	if (item && typeof item === "object" && !Array.isArray(item)) {
		return item.title || item.name || item.label || item.question || `${humanize(singularize(path.at(-1) || "item"))} ${index + 1}`;
	}
	return `${humanize(singularize(path.at(-1) || "item"))} ${index + 1}`;
}

function singularize(value) {
	const text = String(value || "item");
	if (text.toLowerCase() === "entries") return "entry";
	if (text.toLowerCase().endsWith("ies")) return `${text.slice(0, -3)}y`;
	if (text.toLowerCase().endsWith("s")) return text.slice(0, -1);
	return text;
}

function getDocumentTitle() {
	return activeDocument.fields?.metadata?.title || activeDocument.fields?.title || humanize(activeFile.name);
}

function humanize(value) {
	return String(value || "").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setDirty(value) {
	dirty = value;
	saveState.textContent = value ? "Unsaved changes" : activeFile ? "Saved" : "Ready";
	saveState.classList.toggle("dirty", value);
}

function canDiscardChanges() {
	return !dirty || window.confirm("Discard your unsaved changes?");
}

form.addEventListener("input", () => setDirty(true));
form.addEventListener("change", () => setDirty(true));
form.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!activeFile) return;
	saveState.textContent = "Saving...";
	try {
		const saved = await window.contentAPI.save(activeSite.slug, activeFile.relativePath, {
			fields: activeDocument.mode === "source" ? {} : collectFields(),
			body: bodyEditor.value,
		});
		activeDocument = saved;
		renderEditor();
		setDirty(false);
		showToast("Changes saved");
	} catch (error) {
		setDirty(true);
		showToast(error.message, true);
	}
});

searchInput.addEventListener("input", renderFiles);
siteSelect.addEventListener("change", () => selectSite(siteSelect.value));
document.querySelector("#refresh").addEventListener("click", loadInventory);
window.addEventListener("keydown", (event) => {
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
		event.preventDefault();
		if (!form.hidden) form.requestSubmit();
	}
});
window.addEventListener("beforeunload", (event) => {
	if (dirty) event.preventDefault();
});

function showToast(message, isError = false) {
	const toast = document.querySelector("#toast");
	clearTimeout(toastTimer);
	toast.textContent = message;
	toast.classList.toggle("error", isError);
	toast.classList.add("visible");
	toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

loadInventory();