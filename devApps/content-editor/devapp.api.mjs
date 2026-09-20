// Shared API routing for this app: used by the launcher's embedded tab and by
// the standalone Electron window's mobile bridge.
import { getContentInventory } from "../../ritesGlobal/content-inventory.mjs";
import { createContentStore } from "./content-store.js";

export function createApiHandler() {
	const contentStore = createContentStore(getContentInventory);

	return async function handleApi({ method, pathname, body }) {
		if (method === "GET" && pathname === "/api/content") return contentStore.list();
		if (method === "POST" && pathname === "/api/content/read") {
			return contentStore.read(body.siteSlug, body.relativePath);
		}
		if (method === "POST" && pathname === "/api/content/save") {
			return contentStore.save(body.siteSlug, body.relativePath, body.document);
		}
		return { status: 404, data: { success: false, message: "Not found" } };
	};
}
