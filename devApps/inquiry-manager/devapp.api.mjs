// Shared API routing for this app: used by the launcher's embedded tab and by
// the standalone Electron window's mobile bridge.
import { createInquiryStore } from "../../ritesGlobal/inquiry-store.mjs";

export function createApiHandler() {
	const store = createInquiryStore();

	return async function handleApi({ method, pathname, body }) {
		if (method === "GET" && pathname === "/api/inquiries") return store.list();
		if (method === "GET" && pathname === "/api/stats") return store.stats();
		if (method === "PATCH" && pathname.startsWith("/api/inquiries/")) {
			// Wrapped because the bridge reads a bare `status` field as the HTTP status code.
			const record = await store.update(decodeURIComponent(pathname.slice("/api/inquiries/".length)), body || {});
			return { status: 200, data: record };
		}
		if (method === "DELETE" && pathname.startsWith("/api/inquiries/")) {
			return store.remove(decodeURIComponent(pathname.slice("/api/inquiries/".length)));
		}
		return { status: 404, data: { success: false, message: "Not found" } };
	};
}
