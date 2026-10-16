// Shared API routing for this app: used by the launcher's embedded tab and by
// the standalone Electron window's mobile bridge.
import { getContentInventory } from "../../ritesGlobal/content-inventory.mjs";
import { createContentStore } from "./content-store.js";

export function createApiHandler() {
	let inventoryCache = null;
	const CACHE_TTL_MS = 5_000;

	function getCachedInventory() {
		if (inventoryCache && inventoryCache.expiresAt > Date.now()) return inventoryCache.value;
		const value = getContentInventory();
		inventoryCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
		return value;
	}

	function clearInventoryCache() {
		inventoryCache = null;
	}

	const contentStore = createContentStore(getCachedInventory);

	return async function handleApi({ method, pathname, body }) {
		if (method === "GET" && pathname === "/api/content") return contentStore.list();
		if (method === "POST" && pathname === "/api/content/read") {
			return contentStore.read(body.siteSlug, body.relativePath);
		}
		if (method === "POST" && pathname === "/api/content/save") {
			const result = await contentStore.save(body.siteSlug, body.relativePath, body.document);
			clearInventoryCache();
			return result;
		}
		return { status: 404, data: { success: false, message: "Not found" } };
	};
}
