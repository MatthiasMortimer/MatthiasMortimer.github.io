// Shared API routing for this app: used by the launcher's embedded tab and by
// the standalone Electron window's mobile bridge.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { tags } from "../../ritesGlobal/tags.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createPostStore } = require("./post-store.js");

export function createApiHandler() {
	const postsDirectory = process.env.RITESDEV_POSTS_DIR
		? path.resolve(process.env.RITESDEV_POSTS_DIR)
		: path.resolve(__dirname, "../../sites/s-blog/content/posts");
	const postStore = createPostStore(postsDirectory);

	return async function handleApi({ method, pathname, body }) {
		if (method === "GET" && pathname === "/api/tags") return tags;
		if (method === "GET" && pathname === "/api/posts") return postStore.list();
		if (method === "GET" && pathname.startsWith("/api/posts/")) {
			return postStore.read(decodeURIComponent(pathname.slice("/api/posts/".length)));
		}
		if (method === "POST" && pathname === "/api/posts") return postStore.save(body);
		if (method === "DELETE" && pathname.startsWith("/api/posts/")) {
			return postStore.remove(decodeURIComponent(pathname.slice("/api/posts/".length)));
		}
		return { status: 404, data: { success: false, message: "Not found" } };
	};
}
