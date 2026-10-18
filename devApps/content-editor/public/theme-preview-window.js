import {
	PREVIEW_MESSAGE, PREVIEW_READY, PREVIEW_REATTACH, VIEWPORT_PRESETS,
	isThemePreviewSnapshot, validateViewportSize,
} from "./theme-preview.js";
import { createLiveWebsitePreview } from "./live-website-preview.js";

const viewport = document.querySelector("#preview-viewport");
const preset = document.querySelector("#viewport-preset");
const widthInput = document.querySelector("#viewport-width");
const heightInput = document.querySelector("#viewport-height");
const status = document.querySelector("#preview-status");
const reattach = document.querySelector("#reattach-preview");
const opener = window.opener;
const targetOrigin = location.origin === "null" ? "*" : location.origin;
let preview = null;
let siteSlug = null;

window.addEventListener("message", (event) => {
	if (!opener || event.source !== opener || event.origin !== location.origin || event.data?.type !== PREVIEW_MESSAGE) return;
	const snapshot = event.data.snapshot;
	if (snapshot === null) {
		preview?.dispose();
		viewport.replaceChildren();
		preview = null;
		siteSlug = null;
		document.title = "Theme preview";
		document.querySelector("#preview-title").textContent = "Theme preview";
		status.textContent = "Select Theme colors in the editor to preview a website.";
		return;
	}
	if (!isThemePreviewSnapshot(snapshot)) {
		status.textContent = "The editor sent invalid preview data. Reattach and open the preview again.";
		return;
	}
	if (!preview || snapshot.siteSlug !== siteSlug) {
		preview?.dispose();
		preview = createLiveWebsitePreview();
		viewport.replaceChildren(preview.element);
		siteSlug = snapshot.siteSlug;
	}
	preview.update(snapshot);
	document.querySelector("#preview-title").textContent = snapshot.title;
	document.title = `${snapshot.label} - Theme preview`;
	status.textContent = `Live dev website for ${snapshot.label}. Colors are autosaved by the editor.`;
});

function updateSizeLabel() {
	const measured = viewport.querySelector("iframe") || viewport;
	document.querySelector("#viewport-size").textContent =
		`${Math.round(measured.getBoundingClientRect().width)} x ${Math.round(measured.getBoundingClientRect().height)} px`;
}

function setViewport(size) {
	viewport.style.width = size ? `${size.width}px` : "100%";
	viewport.style.height = size ? "auto" : "100%";
	viewport.toggleAttribute("data-fixed", Boolean(size));
	viewport.style.setProperty("--preview-frame-height", size ? `${size.height}px` : "auto");
	updateSizeLabel();
}

preset.addEventListener("change", () => {
	if (preset.value === "fit") {
		setViewport(null);
	} else if (Object.hasOwn(VIEWPORT_PRESETS, preset.value)) {
		const size = VIEWPORT_PRESETS[preset.value];
		widthInput.value = size.width;
		heightInput.value = size.height;
		setViewport(size);
	}
});

document.querySelector("#viewport-form").addEventListener("submit", (event) => {
	event.preventDefault();
	try {
		const size = validateViewportSize(Number(widthInput.value), Number(heightInput.value));
		preset.value = "custom";
		setViewport(size);
	} catch (error) {
		status.textContent = error.message;
	}
});

reattach.addEventListener("click", () => {
	if (!opener || opener.closed) {
		status.textContent = "The editor is no longer open. Close this preview and reopen it from the editor.";
		return;
	}
	opener.postMessage({ type: PREVIEW_REATTACH }, targetOrigin);
});

const resizeObserver = new ResizeObserver(updateSizeLabel);
resizeObserver.observe(viewport);
if (opener && !opener.closed) {
	opener.postMessage({ type: PREVIEW_READY }, targetOrigin);
} else {
	reattach.disabled = true;
	status.textContent = "Open this preview using Detach preview in the content editor.";
}

const connectionTimer = setInterval(() => {
	if (opener && opener.closed) {
		status.textContent = "The editor has closed. This preview is no longer live.";
		reattach.disabled = true;
		clearInterval(connectionTimer);
	}
}, 1000);

window.addEventListener("pagehide", () => {
	preview?.dispose();
	clearInterval(connectionTimer);
	resizeObserver.disconnect();
});
