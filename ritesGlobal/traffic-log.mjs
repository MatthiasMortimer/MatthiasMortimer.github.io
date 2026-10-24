import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { finished } from "node:stream/promises";

// Traffic log
	// One JSONL file per day: { time, visitor, kind, bot?, path, status, local? }.
	// Nothing identifying is stored. Visitors get sequential numbers; the IP+UA hash used to
	// group a person's page views stays in memory only (salted per process, pruned after a day).
	// Users and bots have separate numbering; known bots are grouped by name.

// Known crawlers, most specific first
const KNOWN_BOTS = [
	[/Google-CloudVertexBot/i, "Google Vertex AI"],
	[/GoogleOther/i, "GoogleOther (Google AI/research)"],
	[/Google-InspectionTool/i, "Google Search Console"],
	[/AdsBot-Google|Mediapartners-Google/i, "Google Ads"],
	[/Storebot-Google/i, "Google Storebot"],
	[/Googlebot/i, "Googlebot"],
	[/OAI-SearchBot/i, "OpenAI SearchBot"],
	[/ChatGPT-User/i, "ChatGPT (user fetch)"],
	[/GPTBot/i, "OpenAI GPTBot"],
	[/ClaudeBot|Claude-Web|Claude-User|Claude-SearchBot|anthropic-ai/i, "Anthropic Claude"],
	[/PerplexityBot|Perplexity-User/i, "Perplexity"],
	[/meta-externalagent|facebookexternalhit|facebookcatalog/i, "Meta"],
	[/Applebot/i, "Applebot"],
	[/bingbot|BingPreview|msnbot/i, "Bingbot"],
	[/DuckDuckBot|DuckAssistBot/i, "DuckDuckGo"],
	[/YandexBot/i, "YandexBot"],
	[/Baiduspider/i, "Baiduspider"],
	[/Bytespider/i, "ByteDance Bytespider"],
	[/Amazonbot/i, "Amazonbot"],
	[/CCBot/i, "Common Crawl"],
	[/cohere-ai/i, "Cohere"],
	[/Twitterbot/i, "Twitterbot"],
	[/LinkedInBot/i, "LinkedInBot"],
	[/Discordbot/i, "Discordbot"],
	[/Slackbot/i, "Slackbot"],
	[/TelegramBot/i, "TelegramBot"],
	[/WhatsApp/i, "WhatsApp"],
	[/AhrefsBot/i, "AhrefsBot"],
	[/SemrushBot/i, "SemrushBot"],
	[/MJ12bot/i, "Majestic"],
	[/DotBot/i, "Moz DotBot"],
	[/UptimeRobot/i, "UptimeRobot"],
];
const GENERIC_BOT = /bot\b|crawl|spider|slurp|scrap|preview|monitor|checker|curl\/|wget|python-|httpx|aiohttp|go-http-client|node-fetch|undici|axios|okhttp|java\/|libwww|headless|phantom|lighthouse|^node$/i;

const DAY_MS = 24 * 60 * 60 * 1000;

export function classifyUserAgent(userAgent) {
	const ua = String(userAgent || "").trim();
	if (!ua) return { kind: "bot", bot: "Unknown (no user agent)" };
	for (const [pattern, label] of KNOWN_BOTS) {
		if (pattern.test(ua)) return { kind: "bot", bot: label };
	}
	if (GENERIC_BOT.test(ua)) return { kind: "bot", bot: `Other bot (${ua.split(/[\s/;(]/)[0] || "unknown"})` };
	return { kind: "human" };
}

	// Pages only: no assets, no API calls. robots.txt + sitemaps are kept since they show crawler activity.
export function isTrackedPath(pathname) {
	if (pathname.startsWith("/_astro/") || pathname.startsWith("/api/")) return false;
	if (pathname === "/robots.txt" || /^\/sitemap[^/]*\.xml$/.test(pathname)) return true;
	const ext = path.posix.extname(pathname);
	return ext === "" || ext === ".html" || ext === ".htm";
}

export function describeVisit(entry) {
	const who = entry.kind === "bot" ? `${entry.bot} (bot ${entry.visitor})` : `User ${entry.visitor} (person${entry.local ? ", local" : ""})`;
	return `${who} viewed ${entry.path === "/" ? "/home" : entry.path}${entry.status >= 400 ? ` → ${entry.status}` : ""}`;
}

export function createTrafficLogger({ dir, now = () => new Date(), log = console.log } = {}) {
	const salt = crypto.randomBytes(16);
	const visitors = new Map();
	const statePath = path.join(dir, "state.json");
	const nextVisitor = { human: 1, bot: 1 };
	let stream = null;
	let streamDay = null;

	fs.mkdirSync(dir, { recursive: true });
	try {
		const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
		for (const kind of ["human", "bot"]) {
			const next = state[kind === "human" ? "nextHuman" : "nextBot"] ?? (kind === "human" ? state.nextVisitor : 1);
			if (!Number.isInteger(next) || next < 1) throw new Error(`Invalid ${kind} traffic counter in ${statePath}`);
			nextVisitor[kind] = next;
		}
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}

	function visitorNumber(kind, key, time) {
		const hash = crypto.createHmac("sha256", salt).update(`${kind}:${key}`).digest("hex");
		const known = visitors.get(hash);
		if (known) {
			known.lastSeen = time;
			return known.id;
		}
		const id = nextVisitor[kind]++;
		visitors.set(hash, { id, lastSeen: time });
		fs.writeFileSync(statePath, JSON.stringify({ nextHuman: nextVisitor.human, nextBot: nextVisitor.bot }));
		return id;
	}

	function prune(time) {
		for (const [hash, visitor] of visitors) {
			if (time - visitor.lastSeen > DAY_MS) visitors.delete(hash);
		}
	}

	function write(entry) {
		const day = entry.time.slice(0, 10);
		if (day !== streamDay) {
			stream?.end();
			stream = fs.createWriteStream(path.join(dir, `${day}.jsonl`), { flags: "a" });
			streamDay = day;
			prune(Date.parse(entry.time));
		}
		stream.write(`${JSON.stringify(entry)}\n`);
	}

	function record({ method, url, headers, status }) {
		if (method !== "GET" && method !== "HEAD") return null;
		if (headers["x-rites-probe"]) return null;

		let pathname;
		let searchParams;
		try {
			({ pathname, searchParams } = new URL(url, "http://localhost"));
		} catch {
			return null;
		}
		if (!isTrackedPath(pathname) || searchParams.has("preview")) return null;

		const date = now();
		const clientIp = headers["cf-connecting-ip"] || headers["x-forwarded-for"]?.split(",")[0]?.trim() || "";
		const local = !headers["cf-connecting-ip"];
		const userAgent = headers["user-agent"] || "";
		const { kind, bot } = classifyUserAgent(userAgent);
		const key = kind === "bot" && !bot.startsWith("Other bot") && !bot.startsWith("Unknown") ? `bot:${bot}` : `${clientIp}|${userAgent}`;

		const entry = { time: date.toISOString(), visitor: visitorNumber(kind, key, date.getTime()), kind };
		if (bot) entry.bot = bot;
		entry.path = pathname;
		entry.status = status;
		if (local) entry.local = true;

		write(entry);
		log(`[traffic] ${JSON.stringify(entry)}`);
		return entry;
	}

	return {
		record,
		// Hook a Node request/response pair; logs once the response is sent.
		track(request, response) {
			response.once("finish", () => {
				record({ method: request.method, url: request.url, headers: request.headers, status: response.statusCode });
			});
		},
		close() {
			const closing = stream;
			closing?.end();
			stream = null;
			streamDay = null;
			return closing ? finished(closing) : Promise.resolve();
		},
	};
}
