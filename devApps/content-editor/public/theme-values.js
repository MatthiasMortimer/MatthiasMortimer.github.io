export function isThemeHex(value) {
	return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

export function normalizeThemeHex(value) {
	if (!isThemeHex(value)) throw new Error("Use a 3- or 6-digit hex color.");
	const hex = value.toLowerCase();
	return hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
}
