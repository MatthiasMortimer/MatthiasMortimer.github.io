import type { APIRoute } from "astro";
import { createInquiryStore } from "@ritesGlobal/inquiry-store.mjs";

export const prerender = false;

const store = createInquiryStore();

export const POST: APIRoute = async ({ request }) => {
	let payload: Record<string, unknown>;
	try {
		payload = await request.json();
	} catch {
		return Response.json({ success: false, message: "Invalid request body." }, { status: 400 });
	}

	if (payload["bot-field"]) {
		// Honeypot tripped: report success without recording anything.
		return Response.json({ success: true });
	}

	try {
		const record = await store.add(payload);
		return Response.json({ success: true, id: record.id });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unable to save your message.";
		const isValidation = /required|valid email/i.test(message);
		return Response.json({ success: false, message }, { status: isValidation ? 400 : 500 });
	}
};
