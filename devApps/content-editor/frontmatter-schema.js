import schemas from "./frontmatter-schemas.json" with { type: "json" };

function matchesType(value, type) {
	if (Array.isArray(type)) return type.some((candidate) => matchesType(value, candidate));

	switch (type) {
		case "array":
			return Array.isArray(value);
		case "object":
			return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
		case "boolean":
		case "number":
		case "string":
			return typeof value === type;
		default:
			return true;
	}
}

function validateValue(value, schema, location, errors) {
	if (schema.format === "date") {
		const validDate =
			(value instanceof Date && !Number.isNaN(value.getTime())) ||
			(typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value)));
		if (!validDate) {
			errors.push(`${location} must be a valid date.`);
			return;
		}
	} else if (schema.type && !matchesType(value, schema.type)) {
		errors.push(`${location} must be ${schema.type}.`);
		return;
	}

	if (schema.type === "object") {
		for (const key of schema.required || []) {
			if (!Object.hasOwn(value, key)) errors.push(`${location}.${key} is required.`);
		}

		for (const [key, propertySchema] of Object.entries(schema.properties || {})) {
			if (Object.hasOwn(value, key)) validateValue(value[key], propertySchema, `${location}.${key}`, errors);
		}

		if (schema.additionalProperties === false) {
			for (const key of Object.keys(value)) {
				if (!Object.hasOwn(schema.properties || {}, key)) errors.push(`${location}.${key} is not allowed.`);
			}
		} else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
			for (const [key, propertyValue] of Object.entries(value)) {
				if (!Object.hasOwn(schema.properties || {}, key)) {
					validateValue(propertyValue, schema.additionalProperties, `${location}.${key}`, errors);
				}
			}
		}
	}

	if (schema.type === "array") {
		for (const [index, item] of value.entries()) {
			validateValue(item, schema.items || {}, `${location}[${index}]`, errors);
		}
	}
}

function schemaFor(siteSlug, relativePath) {
	const key = `${siteSlug}/${relativePath}`;
	if (schemas[key]) return schemas[key];
	if (siteSlug === "blog" && relativePath.startsWith("content/posts/") && relativePath.endsWith(".mdx")) {
		return schemas["blog/content/posts/*.mdx"];
	}
	return null;
}

export function validateFrontmatter(siteSlug, relativePath, frontmatter) {
	const schema = schemaFor(siteSlug, relativePath);
	if (!schema) return;

	const errors = [];
	validateValue(frontmatter, schema, "frontmatter", errors);
	if (errors.length) {
		throw new Error(`Invalid frontmatter for ${siteSlug}/${relativePath}: ${errors.join(" ")}`);
	}
}
