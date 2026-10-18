const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const COLOR_SCHEMES = new Set(["light", "dark"]);

const SITE_THEME_DEFINITIONS = {
	blog: {
		path: "content/theme.json",
		label: "Theme colors",
		help: "Update the blog palette here. Main colors cover the most visible parts of the site, and Advanced colors lets you fine-tune the full supported palette.",
		previewTitle: "Blog preview",
		defaultColorScheme: "light",
		groups: [
			{
				id: "surface",
				label: "Surface colors",
				fields: [
					{ key: "bg", cssVar: "--color-bg", label: "Page background", default: "#f4efe5", simple: true },
					{ key: "surface", cssVar: "--color-surface", label: "Card background", default: "#faf6ee", simple: true },
					{ key: "bgSecondary", cssVar: "--color-bg-secondary", label: "Section background", default: "#eee6d8" },
					{ key: "surfaceHover", cssVar: "--color-surface-hover", label: "Hover surface", default: "#e8dece" },
					{ key: "border", cssVar: "--color-border", label: "Border", default: "#d4c7b5" },
					{ key: "borderLight", cssVar: "--color-border-light", label: "Strong border", default: "#baa78e" },
				],
			},
			{
				id: "text",
				label: "Text colors",
				fields: [
					{ key: "text", cssVar: "--color-text", label: "Heading text", default: "#382f27", simple: true },
					{ key: "textMuted", cssVar: "--color-text-muted", label: "Body text", default: "#5e5347" },
					{ key: "textDim", cssVar: "--color-text-dim", label: "Muted text", default: "#716354" },
				],
			},
			{
				id: "accent",
				label: "Accent colors",
				fields: [
					{ key: "accent", cssVar: "--color-accent", label: "Primary accent", default: "#705039", simple: true },
					{ key: "accentHover", cssVar: "--color-accent-hover", label: "Primary accent hover", default: "#503923" },
					{ key: "accentSecondary", cssVar: "--color-accent-secondary", label: "Secondary accent", default: "#596347", simple: true },
					{ key: "accentGreen", cssVar: "--color-accent-green", label: "Highlight accent", default: "#536246" },
				],
			},
		],
	},
	ritesdev: {
		path: "content/theme.json",
		label: "Theme colors",
		help: "Update the RitesDev site palette here. Main colors cover the primary branding, while Advanced colors exposes the full supported site palette.",
		previewTitle: "RitesDev preview",
		defaultColorScheme: "dark",
		groups: [
			{
				id: "surface",
				label: "Surface colors",
				fields: [
					{ key: "bg", cssVar: "--color-bg", label: "Page background", default: "#0b0f19", simple: true },
					{ key: "surface", cssVar: "--color-surface", label: "Card background", default: "#1f2937", simple: true },
					{ key: "bgSecondary", cssVar: "--color-bg-secondary", label: "Section background", default: "#111827" },
					{ key: "surfaceHover", cssVar: "--color-surface-hover", label: "Hover surface", default: "#374151" },
					{ key: "border", cssVar: "--color-border", label: "Border", default: "#2d3748" },
					{ key: "borderLight", cssVar: "--color-border-light", label: "Strong border", default: "#4b5563" },
					{ key: "mediaFrame", cssVar: "--color-media-frame", label: "Media frame", default: "#0f172a" },
				],
			},
			{
				id: "text",
				label: "Text colors",
				fields: [
					{ key: "text", cssVar: "--color-text", label: "Heading text", default: "#f3f4f6", simple: true },
					{ key: "textMuted", cssVar: "--color-text-muted", label: "Body text", default: "#9ca3af" },
					{ key: "textDim", cssVar: "--color-text-dim", label: "Muted text", default: "#6b7280" },
				],
			},
			{
				id: "accent",
				label: "Accent colors",
				fields: [
					{ key: "accent", cssVar: "--color-accent", label: "Primary accent", default: "#38bdf8", simple: true },
					{ key: "accentHover", cssVar: "--color-accent-hover", label: "Primary accent hover", default: "#0284c7" },
					{ key: "buttonHover", cssVar: "--color-button-hover", label: "Primary button hover", default: "#7dd3fc" },
					{ key: "accentContrast", cssVar: "--color-accent-contrast", label: "Text on primary accent", default: "#000000" },
					{ key: "accentSecondary", cssVar: "--color-accent-secondary", label: "Secondary accent", default: "#a855f7", simple: true },
					{ key: "accentSecondaryHover", cssVar: "--color-accent-secondary-hover", label: "Secondary accent hover", default: "#c084fc" },
					{ key: "accentGreen", cssVar: "--color-accent-green", label: "Highlight accent", default: "#10b981" },
				],
			},
		],
	},
};

function clone(value) {
	return structuredClone(value);
}

function normalizeHexColor(value) {
	if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) {
		throw new Error(`Theme colors must use 3- or 6-digit hex values. Received "${value}".`);
	}
	const raw = value.toLowerCase();
	if (raw.length === 4) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
	return raw;
}

function getDefinition(siteSlug) {
	return Object.hasOwn(SITE_THEME_DEFINITIONS, siteSlug) ? SITE_THEME_DEFINITIONS[siteSlug] : null;
}

function getAllFields(definition) {
	return definition.groups.flatMap((group) => group.fields);
}

function getFieldIndex(definition) {
	return new Map(getAllFields(definition).map((field) => [field.key, field]));
}

function toEditorField(field) {
	return {
		key: field.key,
		label: field.label,
		cssVar: field.cssVar,
		default: field.default,
		simple: Boolean(field.simple),
		path: ["colors", field.key],
	};
}

export function getSiteThemeDefinition(siteSlug) {
	const definition = getDefinition(siteSlug);
	return definition ? clone(definition) : null;
}

export function createDefaultSiteTheme(siteSlug) {
	const definition = getDefinition(siteSlug);
	if (!definition) return null;

	return {
		colorScheme: definition.defaultColorScheme,
		colors: Object.fromEntries(getAllFields(definition).map((field) => [field.key, field.default])),
	};
}

export function getThemeEditorConfig(siteSlug) {
	const definition = getDefinition(siteSlug);
	if (!definition) return null;

	return {
		kind: "theme",
		label: definition.label,
		title: definition.label,
		help: definition.help,
		path: definition.path,
		previewTitle: definition.previewTitle,
		defaults: createDefaultSiteTheme(siteSlug),
		simpleFields: getAllFields(definition).filter((field) => field.simple).map(toEditorField),
		advancedSections: definition.groups.map((group) => ({
			id: group.id,
			label: group.label,
			fields: group.fields.map(toEditorField),
		})),
	};
}

export function isSiteThemeFile(siteSlug, relativePath) {
	const definition = getDefinition(siteSlug);
	return Boolean(definition && relativePath === definition.path);
}

export function validateSiteTheme(siteSlug, document) {
	const definition = getDefinition(siteSlug);
	if (!definition) throw new Error(`Website "${siteSlug}" does not support theme editing.`);
	if (!document || typeof document !== "object" || Array.isArray(document)) {
		throw new Error("Theme data must be an object.");
	}
	const unknownFields = Object.keys(document).filter((key) => !["colorScheme", "colors"].includes(key));
	if (unknownFields.length) throw new Error(`Theme data contains unsupported fields: ${unknownFields.join(", ")}.`);

	const { colorScheme, colors } = document;
	if (!COLOR_SCHEMES.has(colorScheme)) {
		throw new Error(`Theme colorScheme must be one of: ${[...COLOR_SCHEMES].join(", ")}.`);
	}
	if (!colors || typeof colors !== "object" || Array.isArray(colors)) {
		throw new Error("Theme colors must be an object.");
	}

	const fieldIndex = getFieldIndex(definition);
	const unknownKeys = Object.keys(colors).filter((key) => !fieldIndex.has(key));
	if (unknownKeys.length) {
		throw new Error(`Theme colors contain unsupported keys: ${unknownKeys.join(", ")}.`);
	}

	const normalized = {};
	for (const field of getAllFields(definition)) {
		if (!Object.hasOwn(colors, field.key)) throw new Error(`Theme colors are missing "${field.key}".`);
		normalized[field.key] = normalizeHexColor(colors[field.key]);
	}

	return {
		colorScheme,
		colors: normalized,
	};
}

export function renderSiteThemeCss(siteSlug, document) {
	const definition = getDefinition(siteSlug);
	if (!definition) return "";
	const theme = validateSiteTheme(siteSlug, document ?? createDefaultSiteTheme(siteSlug));
	const lines = [":root {", `\tcolor-scheme: ${theme.colorScheme};`];
	for (const field of getAllFields(definition)) {
		lines.push(`\t${field.cssVar}: ${theme.colors[field.key]};`);
	}
	lines.push("}");
	return `${lines.join("\n")}\n`;
}
