import tagLabels from "./tags.json" with { type: "json" };

const tagsByKey = new Map(tagLabels.map((tag) => [tag.toLocaleLowerCase(), tag]));

export const tags = tagLabels;

export function normalizeTags(value) {
	const values = Array.isArray(value) ? value : value ? [value] : [];
	return [...new Set(values.map((tag) => {
		const label = String(tag).trim();
		return tagsByKey.get(label.toLocaleLowerCase()) || label;
	}).filter(Boolean))];
}