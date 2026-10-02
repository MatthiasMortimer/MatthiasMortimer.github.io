import type { APIRoute } from "astro";
import { createInquiryStore } from "@ritesGlobal/inquiry-store.mjs";
import { rateLimit } from "@ritesGlobal/rate-limit.mjs";

export const prerender = false;

const store = createInquiryStore();

export const POST: APIRoute = async ({ request, clientAddress }) => {
	// Cheap per-IP throttle: 5 submissions per 10 minutes. Honeypot stops dumb
	// bots; this stops everything else from growing the JSONL without bound.
	// Behind cloudflared, the real client IP comes from the proxy headers.
	const ip =
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		clientAddress;
	const limit = rateLimit(`inquiry:${ip}`, { limit: 5, windowMs: 10 * 60 * 1000 });
	if (!limit.ok) {
		return Response.json(
			{ success: false, message: "Too many messages sent. Please wait a few minutes and try again." },
			{ status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
		);
	}

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
