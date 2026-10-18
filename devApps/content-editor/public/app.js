import { createArrayItem, getValueAtPath, setValueAtPath } from "./structured-values.js";
import { homeCardGroup } from "./home-cards.js";
import { isThemeHex, normalizeThemeHex } from "./theme-values.js";
import {
	createThemePreviewSnapshot, createPreviewWindowController,
} from "./theme-preview.js";
import { createLiveWebsitePreview } from "./live-website-preview.js";
import { createThemeAutosave } from "./theme-autosave.js";

const siteSelect = document.querySelector("#site-select");
const fileList = document.querySelector("#file-list");
const searchInput = document.querySelector("#file-search");
const form = document.querySelector("#content-form");
const emptyState = document.querySelector("#empty-state");
const fieldsSection = document.querySelector("#fields-section");
const fieldsHeading = document.querySelector("#fields-heading");
const fieldsSubtitle = document.querySelector("#fields-subtitle");
const fieldsEditor = document.querySelector("#fields-editor");
const bodySection = document.querySelector("#body-section");
const bodyEditor = document.querySelector("#body-editor");
const saveState = document.querySelector("#save-state");

const DEFAULT_FIELDS_HEADING = "Details";
const DEFAULT_FIELDS_SUBTITLE = "Structured fields";

let sites = [];
let activeSite = null;
let activeFile = null;
let activeDocument = null;
let dirty = false;
let busy = false;
let toastTimer;
let themePreviewSnapshot = null;
let livePreview = null;
const previewWindow = createPreviewWindowController({
	onChange: updatePreviewWindowControls,
	onError: (message) => showToast(message, true),
});
const themeAutosave = createThemeAutosave({
	save: ({ siteSlug, relativePath, document }) => window.contentAPI.save(siteSlug, relativePath, document),
	onState: (state) => {
		if (state === "saving") {
			setBusy(true);
			form.inert = false;
			saveState.textContent = "Saving colors...";
		} else if (state === "idle") {
			setBusy(false);
		}
	},
	onSaved: (saved) => {
		activeDocument = saved;
		setDirty(false);
		saveState.textContent = "Colors autosaved";
	},
	onError: (error) => {
		setDirty(true);
		saveState.textContent = "Save failed";
		showToast(`Colors were not saved: ${error.message}. Retry with Save changes.`, true);
	},
});

async function loadInventory() {
	if (busy || !canDiscardChanges()) return;
	setBusy(true);
	try {
		sites = await window.contentAPI.list();
		document.querySelector("#site-count").textContent = `${sites.length} ${sites.length === 1 ? "website" : "websites"}`;
		renderSites();
		if (activeSite) activeSite = sites.find((site) => site.slug === activeSite.slug) || null;
		if (!activeSite && sites.length) activeSite = sites[0];
		activeFile = null;
		themeAutosave.cancel();
		activeDocument = null;
		clearThemePreview();
		form.hidden = true;
		emptyState.hidden = false;
		renderSites();
		renderFiles();
		setDirty(false);
	} catch (error) {
		showToast(error.message, true);
	} finally {
		setBusy(false);
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
	if (busy) return;
	if (siteSlug === activeSite?.slug) return;
	if (!canDiscardChanges()) {
		renderSites();
		return;
	}
	activeSite = sites.find((site) => site.slug === siteSlug);
	activeFile = null;
	themeAutosave.cancel();
	activeDocument = null;
	clearThemePreview();
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

	const cards = homeCardGroup(activeSite);
	const themeGroups = activeSite.groups.filter((group) => group.type === "theme");
	const contentGroups = activeSite.groups.filter((group) => group.type !== "theme");
	for (const group of [...themeGroups, ...(cards ? [cards] : []), ...contentGroups]) {
		const files = group.files.filter((file) =>
			`${file.card?.label || ""} ${file.editor?.label || ""} ${file.name} ${file.relativePath} ${group.label}`.toLowerCase().includes(query),
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
			const selected = file.relativePath === activeFile?.relativePath && file.card?.id === activeFile?.card?.id;
			button.className = `file-item${selected ? " active" : ""}`;
			const name = document.createElement("strong");
			name.textContent = file.card?.label || file.editor?.label || humanize(file.name);
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
	if (busy || !canDiscardChanges()) return;
	setBusy(true);
	try {
		themeAutosave.cancel();
		activeDocument = await window.contentAPI.read(activeSite.slug, file.relativePath);
		activeFile = { ...file, groupLabel: group.label };
		renderEditor();
		renderFiles();
		setDirty(false);
	} catch (error) {
		showToast(error.message, true);
	} finally {
		setBusy(false);
	}
}

function renderEditor() {
	emptyState.hidden = true;
	form.hidden = false;
	document.querySelector("#document-path").textContent = `${activeSite.label} / ${activeFile.relativePath}`;
	document.querySelector("#document-title").textContent = activeFile.card?.label || activeFile.editor?.label || getDocumentTitle();
	const help = document.querySelector("#document-help");
	const helpText = activeFile.card?.help || activeDocument.editor?.help || "";
	help.hidden = !helpText;
	help.textContent = helpText;
	form.classList.toggle("card-editor", Boolean(activeFile.card));
	form.classList.toggle("theme-editor", isThemeEditor());
	if (!isThemeEditor()) clearThemePreview();
	fieldsEditor.replaceChildren();

	fieldsHeading.textContent = DEFAULT_FIELDS_HEADING;
	fieldsSubtitle.textContent = DEFAULT_FIELDS_SUBTITLE;

	const hasFields = activeDocument.mode !== "source";
	fieldsSection.hidden = !hasFields;
	if (hasFields) {
		if (isThemeEditor()) {
			renderThemeEditor();
		} else if (activeFile.card) {
			for (const [key, label] of Object.entries(activeFile.card.fields)) {
				renderValue(activeDocument.fields[key], [key], fieldsEditor, false, label);
			}
		} else {
			renderValue(activeDocument.fields, [], fieldsEditor, true);
		}
	}

	bodySection.hidden = isThemeEditor() || Boolean(activeFile.card) || activeDocument.mode === "structured";
	bodyEditor.value = activeDocument.body || "";
	document.querySelector("#body-label").textContent = activeDocument.mode === "source" ? "Source code" : "Page body";
	document.querySelector("#body-format").textContent = activeDocument.mode === "source" ? activeFile.extension : "Markdown";
	bodyEditor.spellcheck = activeDocument.mode !== "source";
}

function renderThemeEditor() {
	fieldsHeading.textContent = "Theme colors";
	fieldsSubtitle.textContent = "Live preview and editable palette";

	const editor = activeDocument.editor;
	const wrapper = document.createElement("div");
	wrapper.className = "theme-editor-shell";

	const controls = document.createElement("section");
	controls.className = "theme-controls";
	const controlsHeader = document.createElement("div");
	controlsHeader.className = "theme-controls__header";
	const controlsCopy = document.createElement("div");
	const controlsTitle = document.createElement("h4");
	controlsTitle.textContent = "Main colors";
	const controlsSubtitle = document.createElement("p");
	controlsSubtitle.textContent = "Start here. Advanced colors fine-tunes the remaining palette.";
	controlsCopy.append(controlsTitle, controlsSubtitle);
	const resetButton = document.createElement("button");
	resetButton.type = "button";
	resetButton.className = "button secondary-button";
	resetButton.textContent = "Reset to site defaults";
	resetButton.addEventListener("click", resetThemeEditor);
	controlsHeader.append(controlsCopy, resetButton);
	controls.append(controlsHeader);

	const schemeField = document.createElement("label");
	schemeField.className = "field";
	const schemeCaption = document.createElement("span");
	schemeCaption.textContent = "Browser controls (does not replace your palette)";
	const schemeSelect = document.createElement("select");
	schemeSelect.dataset.path = JSON.stringify(["colorScheme"]);
	for (const value of ["light", "dark"]) {
		const option = document.createElement("option");
		option.value = value;
		option.textContent = humanize(value);
		option.selected = activeDocument.fields.colorScheme === value;
		schemeSelect.append(option);
	}
	schemeField.append(schemeCaption, schemeSelect);
	controls.append(schemeField);

	const simpleGrid = document.createElement("div");
	simpleGrid.className = "theme-color-grid";
	for (const field of editor.simpleFields) simpleGrid.append(renderThemeColorField(field));
	controls.append(simpleGrid);

	const preview = renderThemePreview(editor);

	const advanced = document.createElement("details");
	advanced.className = "theme-advanced";
	const summary = document.createElement("summary");
	summary.textContent = "Advanced colors";
	advanced.append(summary);
	for (const section of editor.advancedSections) {
		const advancedFields = section.fields.filter((field) => !field.simple);
		if (!advancedFields.length) continue;
		const sectionElement = document.createElement("section");
		sectionElement.className = "theme-advanced-section";
		const heading = document.createElement("div");
		heading.className = "theme-advanced-section__heading";
		const title = document.createElement("h4");
		title.textContent = section.label;
		heading.append(title);
		sectionElement.append(heading);

		const grid = document.createElement("div");
		grid.className = "theme-color-grid theme-color-grid--advanced";
		for (const field of advancedFields) grid.append(renderThemeColorField(field, true));
		sectionElement.append(grid);
		advanced.append(sectionElement);
	}

	wrapper.append(controls, preview, advanced);
	fieldsEditor.append(wrapper);
	updateThemePreview();
}

function renderThemeColorField(field, compact = false) {
	const article = document.createElement("article");
	article.className = `theme-color-field${compact ? " theme-color-field--compact" : ""}`;

	const heading = document.createElement("div");
	heading.className = "theme-color-field__heading";
	const title = document.createElement("strong");
	title.textContent = field.label;
	const token = document.createElement("span");
	token.textContent = field.cssVar;
	heading.append(title, token);

	const controls = document.createElement("div");
	controls.className = "theme-color-field__controls";
	const swatch = document.createElement("input");
	swatch.type = "color";
	swatch.className = "theme-color-swatch";
	swatch.value = normalizeThemeHex(getValueAtPath(activeDocument.fields, field.path) || field.default);
	swatch.setAttribute("aria-label", `${field.label} color picker`);

	const text = document.createElement("input");
	text.type = "text";
	text.className = "theme-color-text";
	text.value = getValueAtPath(activeDocument.fields, field.path) || field.default;
	text.dataset.path = JSON.stringify(field.path);
	text.spellcheck = false;
	text.autocomplete = "off";
	text.inputMode = "text";
	text.setAttribute("aria-label", field.label);
	text.required = true;
	text.setAttribute("pattern", "#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})");
	text.title = "Use a hex color such as #705039 or #abc.";
	const error = document.createElement("span");
	error.className = "theme-color-error";
	error.id = `theme-error-${field.key}`;
	error.setAttribute("aria-live", "polite");
	text.setAttribute("aria-describedby", error.id);

	function validateColor() {
		const valid = isThemeHex(text.value);
		text.setCustomValidity(valid ? "" : "Use a 3- or 6-digit hex color, such as #705039.");
		text.setAttribute("aria-invalid", String(!valid));
		error.textContent = valid ? "" : "Use #rgb or #rrggbb. Preview keeps the last valid color.";
		return valid;
	}

	swatch.addEventListener("input", () => {
		text.value = swatch.value;
		validateColor();
	});
	text.addEventListener("input", () => {
		if (validateColor()) swatch.value = normalizeThemeHex(text.value);
	});
	controls.append(swatch, text);
	article.append(heading, controls, error);
	return article;
}

function renderThemePreview(editor) {
	const section = document.createElement("section");
	section.className = "theme-preview-block";

	const heading = document.createElement("div");
	heading.className = "theme-preview-block__heading";
	const title = document.createElement("h4");
	title.textContent = editor.previewTitle || `${activeSite.label} preview`;
	const text = document.createElement("p");
	text.textContent = "This is Site Hosting's dev website. Valid color edits save automatically and update the dev server, including ordinary browser tabs. When finished, rebuild/restart hosting to publish. Forms are disabled in the preview frame.";
	heading.append(title, text);

	const actions = document.createElement("div");
	actions.className = "theme-preview-actions";
	const detach = document.createElement("button");
	detach.type = "button";
	detach.className = "button secondary-button";
	detach.dataset.detachPreview = "true";
	detach.textContent = "Detach preview";
	detach.addEventListener("click", () => previewWindow.open(themePreviewSnapshot));
	const reattach = document.createElement("button");
	reattach.type = "button";
	reattach.className = "button secondary-button";
	reattach.dataset.reattachPreview = "true";
	reattach.textContent = "Reattach preview";
	reattach.hidden = true;
	reattach.addEventListener("click", () => previewWindow.close());
	actions.append(detach, reattach);
	livePreview ??= createLiveWebsitePreview();
	const preview = livePreview.element;
	preview.dataset.inlinePreview = "true";
	section.append(heading, actions, preview);
	return section;
}

function resetThemeEditor() {
	activeDocument.fields = structuredClone(activeDocument.editor.defaults);
	renderEditor();
	setDirty(true);
	scheduleThemeSave();
	showToast("Site defaults restored and queued for autosave.");
}

function updateThemePreview() {
	if (!isThemeEditor()) return;
	if (!livePreview) return;
	themePreviewSnapshot = createThemePreviewSnapshot(activeSite, collectFields(), activeDocument.editor, themePreviewSnapshot);
	previewWindow.update(themePreviewSnapshot);
	updatePreviewWindowControls();
}

function clearThemePreview() {
	livePreview?.dispose();
	livePreview = null;
	themePreviewSnapshot = null;
	previewWindow.update(null);
}

function updatePreviewWindowControls() {
	const detached = previewWindow.isOpen;
	const preview = fieldsEditor.querySelector("[data-inline-preview]");
	if (preview) preview.hidden = detached;
	if (livePreview) livePreview.update(detached ? null : themePreviewSnapshot);
	const detach = fieldsEditor.querySelector("[data-detach-preview]");
	if (detach) detach.textContent = detached ? "Focus preview window" : "Detach preview";
	const reattach = fieldsEditor.querySelector("[data-reattach-preview]");
	if (reattach) reattach.hidden = !detached;
}

function renderValue(value, path, parent, isRoot = false, fieldLabel = "") {
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
	caption.textContent = fieldLabel || humanize(path.at(-1) || "Content");
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

function isThemeEditor() {
	return activeDocument?.editor?.kind === "theme";
}

function setDirty(value) {
	dirty = value;
	saveState.textContent = value ? "Unsaved changes" : activeFile ? "Saved" : "Ready";
	saveState.classList.toggle("dirty", value);
}

function setBusy(value) {
	busy = value;
	siteSelect.disabled = value || sites.length === 0;
	document.querySelector("#refresh").disabled = value;
	fileList.inert = value;
	form.inert = value;
	form.setAttribute("aria-busy", String(value));
}

function canDiscardChanges() {
	return !dirty || window.confirm("Discard your unsaved changes?");
}

function handleEditorMutation() {
	setDirty(true);
	updateThemePreview();
	if (isThemeEditor()) scheduleThemeSave();
}

function themeSaveRequest() {
	return {
		siteSlug: activeSite.slug,
		relativePath: activeFile.relativePath,
		document: { fields: collectFields(), body: "" },
	};
}

function scheduleThemeSave() {
	const valid = [...fieldsEditor.querySelectorAll("input, select")].every((input) => input.validity.valid);
	themeAutosave.schedule(valid ? themeSaveRequest() : null);
	if (!valid) saveState.textContent = "Fix invalid colors to autosave";
}

form.addEventListener("input", handleEditorMutation);
form.addEventListener("change", handleEditorMutation);
form.addEventListener("invalid", (event) => {
	const details = event.target.closest("details");
	if (details) details.open = true;
}, true);
form.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!activeFile) return;
	if (isThemeEditor()) {
		void themeAutosave.flush(themeSaveRequest());
		return;
	}
	if (busy) return;
	setBusy(true);
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
	} finally {
		setBusy(false);
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
