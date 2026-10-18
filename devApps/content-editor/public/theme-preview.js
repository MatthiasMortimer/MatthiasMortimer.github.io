import { isThemeHex, normalizeThemeHex } from "./theme-values.js";

export const PREVIEW_MESSAGE = "ritesdev-theme-preview";
export const PREVIEW_READY = "ritesdev-theme-preview-ready";
export const PREVIEW_REATTACH = "ritesdev-theme-preview-reattach";
export const VIEWPORT_PRESETS = {
	mobile: { width: 375, height: 812 },
	tablet: { width: 768, height: 1024 },
	desktop: { width: 1280, height: 800 },
};

export function createThemePreviewSnapshot(site, fields, editor, previous) {
	const colors = {};
	for (const section of editor.advancedSections) {
		for (const field of section.fields) {
			const value = fields.colors[field.key];
			colors[field.cssVar] = isThemeHex(value)
				? normalizeThemeHex(value)
				: (previous?.siteSlug === site.slug ? previous.colors[field.cssVar] : null) ?? field.default;
		}
	}
	return {
		siteSlug: site.slug,
		label: site.label,
		title: editor.previewTitle,
		colorScheme: fields.colorScheme,
		colors,
	};
}

export function isThemePreviewSnapshot(value) {
	return Boolean(
		value && typeof value === "object" &&
		typeof value.siteSlug === "string" && typeof value.label === "string" &&
		typeof value.title === "string" && ["light", "dark"].includes(value.colorScheme) &&
		value.colors && typeof value.colors === "object" && !Array.isArray(value.colors) &&
		Object.entries(value.colors).length > 0 &&
		Object.entries(value.colors).every(([key, color]) => /^--color-[a-z-]+$/.test(key) && isThemeHex(color)),
	);
}

export function validateViewportSize(width, height) {
	if (!Number.isInteger(width) || width < 240 || width > 2560 ||
		!Number.isInteger(height) || height < 240 || height > 2160) {
		throw new Error("Use a width from 240 to 2560 and a height from 240 to 2160 pixels.");
	}
	return { width, height };
}

export function createPreviewWindowController({ onChange, onError, host = window }) {
	let child = null;
	let snapshot = null;
	let closeTimer = null;
	const targetOrigin = host.location.origin === "null" ? "*" : host.location.origin;

	function send() {
		if (child && !child.closed) child.postMessage({ type: PREVIEW_MESSAGE, snapshot }, targetOrigin);
	}

	function clearChild() {
		child = null;
		host.clearInterval(closeTimer);
		closeTimer = null;
		onChange(false);
	}

	function close() {
		if (child && !child.closed) child.close();
		clearChild();
	}

	function handleMessage(event) {
		if (!child || event.source !== child || event.origin !== host.location.origin) return;
		if (event.data?.type === PREVIEW_READY) send();
		if (event.data?.type === PREVIEW_REATTACH) close();
	}
	host.addEventListener("message", handleMessage);
	host.addEventListener("pagehide", close);

	return {
		get isOpen() {
			return Boolean(child && !child.closed);
		},
		open(value) {
			snapshot = value;
			if (child && !child.closed) {
				child.focus();
				send();
				return;
			}
			if (child) clearChild();
			child = host.open(new URL("theme-preview.html", host.location.href).href, "_blank",
				"popup=yes,width=1120,height=820,resizable=yes,scrollbars=yes");
			if (!child) {
				onError("The preview window was blocked. Allow pop-ups for this editor and try again.");
				return;
			}
			onChange(true);
			closeTimer = host.setInterval(() => {
				if (child?.closed) clearChild();
			}, 500);
		},
		update(value) {
			snapshot = value;
			send();
		},
		close,
	};
}
