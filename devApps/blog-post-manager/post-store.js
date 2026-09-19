const fs = require("node:fs/promises");
const path = require("node:path");
const matter = require("gray-matter");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function createPostStore(postsDirectory) {
	function postPath(slug) {
		if (!SLUG_PATTERN.test(slug)) {
			throw new Error("Slug must contain lowercase letters, numbers, and single hyphens only.");
		}

		return path.join(postsDirectory, `${slug}.mdx`);
	}

	async function read(slug) {
		const source = await fs.readFile(postPath(slug), "utf8");
		const parsed = matter(source);
		const image = parsed.data.image || {};

		return {
			slug,
			title: parsed.data.title || "",
			pubDate: formatDate(parsed.data.pubDate),
			description: parsed.data.description || "",
			author: parsed.data.author || "",
			imageUrl: image.url || "",
			imageAlt: image.alt || "",
			tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.join(", ") : "",
			content: parsed.content.trim(),
		};
	}

	async function list() {
		await fs.mkdir(postsDirectory, { recursive: true });
		const entries = await fs.readdir(postsDirectory, { withFileTypes: true });
		const posts = await Promise.all(
			entries
				.filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))
				.map((entry) => read(entry.name.slice(0, -4)))
		);

		return posts
			.map(({ content, ...summary }) => summary)
			.sort((first, second) => second.pubDate.localeCompare(first.pubDate));
	}

	async function save(post) {
		const targetPath = postPath(post.slug);
		const originalPath = post.originalSlug ? postPath(post.originalSlug) : null;
		const isRename = originalPath && originalPath !== targetPath;

		if (!post.title.trim() || !post.pubDate || !post.description.trim() || !post.author.trim()) {
			throw new Error("Title, publish date, description, and author are required.");
		}

		if (isRename && (await exists(targetPath))) {
			throw new Error(`A post named ${post.slug} already exists.`);
		}

		const data = {
			title: post.title.trim(),
			pubDate: post.pubDate,
			description: post.description.trim(),
			author: post.author.trim(),
		};

		if (post.imageUrl.trim() || post.imageAlt.trim()) {
			data.image = { url: post.imageUrl.trim(), alt: post.imageAlt.trim() };
		}

		data.tags = post.tags
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);

		await fs.mkdir(postsDirectory, { recursive: true });
		const output = matter.stringify(`${post.content.trim()}\n`, data);
		await fs.writeFile(targetPath, output, "utf8");

		if (isRename) {
			await fs.unlink(originalPath);
		}

		return read(post.slug);
	}

	async function remove(slug) {
		await fs.unlink(postPath(slug));
		return { slug };
	}

	return { list, read, save, remove };
}

async function exists(filePath) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function formatDate(value) {
	if (!value) return "";
	if (value instanceof Date) return value.toISOString().slice(0, 10);
	return String(value).slice(0, 10);
}

module.exports = { createPostStore };