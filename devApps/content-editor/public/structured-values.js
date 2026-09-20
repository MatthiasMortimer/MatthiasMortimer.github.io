const EMPTY_ARRAY_ITEM_SCHEMAS = {
	steps: { number: "", title: "", body: "" },
	faqs: { question: "", answer: "" },
	navigation: { label: "", href: "" },
	projects: { name: "", description: "" },
};

export function createBlankValue(value) {
	if (Array.isArray(value)) return [];
	if (value && typeof value === "object") {
		return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, createBlankValue(child)]));
	}
	if (typeof value === "boolean") return false;
	if (typeof value === "number") return 0;
	return "";
}

export function createArrayItem(array, path) {
	if (array.length) return createBlankValue(array[0]);
	const fieldName = String(path.at(-1) || "").toLowerCase();
	return structuredClone(EMPTY_ARRAY_ITEM_SCHEMAS[fieldName] ?? "");
}

export function getValueAtPath(target, path) {
	return path.reduce((value, key) => value?.[key], target);
}

export function setValueAtPath(target, path, value) {
	if (!path.length) return value;
	let cursor = target;
	for (const key of path.slice(0, -1)) cursor = cursor[key];
	cursor[path.at(-1)] = value;
	return target;
}