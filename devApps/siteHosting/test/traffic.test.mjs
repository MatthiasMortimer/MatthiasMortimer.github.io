import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { createTrafficLogger, describeVisit } from "../../../ritesGlobal/traffic-log.mjs";

function fixture(context) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rites-traffic-"));
	context.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	return dir;
}

function loggerAt(dir) {
	return createTrafficLogger({ dir, now: () => new Date("2026-10-23T12:00:00Z"), log() {} });
}

function visit(logger, userAgent, url = "/", ip = "192.0.2.1") {
	return logger.record({
		method: "GET", url, status: 200,
		headers: { "user-agent": userAgent, "cf-connecting-ip": ip },
	});
}

const browser = "Mozilla/5.0 Firefox/144.0";

test("bots and users are independently numbered, grouped, persisted, and resumed", async (context) => {
	const dir = fixture(context);
	const logger = loggerAt(dir);
	const bot = visit(logger, "Googlebot/2.1");
	const human = visit(logger, browser);
	assert.equal(bot.visitor, 1);
	assert.equal(human.visitor, 1);
	assert.equal(bot.kind, "bot");
	assert.equal(human.kind, "human");
	assert.equal(visit(logger, "Googlebot/2.1", "/blog", "192.0.2.2").visitor, 1);
	assert.equal(visit(logger, browser, "/blog").visitor, 1);
	assert.equal(visit(logger, browser, "/", "192.0.2.2").visitor, 2);
	assert.equal(visit(logger, "bingbot/2.0").visitor, 2);
	assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "state.json"))), { nextHuman: 3, nextBot: 3 });
	await logger.close();
	const file = path.join(dir, "2026-10-23.jsonl");
	const text = fs.readFileSync(file, "utf8");
	assert.equal(text.trim().split("\n").length, 6);
	assert.equal(JSON.parse(text.split("\n")[0]).path, "/");
	const resumed = loggerAt(dir);
	assert.equal(visit(resumed, browser).visitor, 3);
	assert.equal(visit(resumed, "Googlebot/2.1").visitor, 3);
	await resumed.close();
});

test("legacy state is accepted, while corrupt state is surfaced", async (context) => {
	const dir = fixture(context);
	const state = path.join(dir, "state.json");
	fs.writeFileSync(state, JSON.stringify({ nextVisitor: 42 }));
	const logger = loggerAt(dir);
	assert.equal(fs.existsSync(path.join(dir, "2026-10-23.jsonl")), false);
	assert.equal(visit(logger, browser).visitor, 42);
	assert.equal(visit(logger, "Googlebot/2.1").visitor, 1);
	await logger.close();
	fs.writeFileSync(state, "{invalid");
	assert.throws(() => loggerAt(dir), SyntaxError);
	fs.writeFileSync(state, JSON.stringify({ nextHuman: 0, nextBot: 1 }));
	assert.throws(() => loggerAt(dir), /Invalid human traffic counter/);
});

test("health probes, previews, assets, and writes stay out of traffic", (context) => {
	const logger = loggerAt(fixture(context));
	assert.equal(visit(logger, browser, "/_astro/main.js"), null);
	assert.equal(visit(logger, browser, "/?preview=1"), null);
	assert.equal(logger.record({ method: "POST", url: "/", headers: {}, status: 200 }), null);
	assert.equal(logger.record({ method: "GET", url: "/", headers: { "x-rites-probe": "1" }, status: 200 }), null);
	logger.close();
});

test("visit descriptions show /home without changing other paths", () => {
	assert.equal(describeVisit({ kind: "human", visitor: 1, path: "/", status: 200 }), "User 1 (person) viewed /home");
	assert.equal(describeVisit({ kind: "bot", bot: "Googlebot", visitor: 1, path: "/blog", status: 404 }), "Googlebot (bot 1) viewed /blog → 404");
});

function trafficUi() {
	const elements = new Map();
	function element() {
		return {
			textContent: "", children: [], scrollHeight: 0,
			append(...children) { this.children.push(...children); },
			replaceChildren(...children) { this.children = children; },
		};
	}
	const context = vm.createContext({
		document: {
			getElementById(id) {
				if (!elements.has(id)) elements.set(id, element());
				return elements.get(id);
			},
			createElement: element,
			createTextNode: (text) => ({ textContent: text }),
		},
		window: { hosting: { config: () => new Promise(() => {}) } },
	});
	vm.runInContext(fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8"), context);
	return {
		elements,
		render(entries) { context.entries = entries; vm.runInContext("renderTraffic(entries)", context); },
		append(entry) { context.entry = entry; vm.runInContext("appendTraffic(entry)", context); },
	};
}

test("traffic UI separates counts and rows, preserves local/error labels, and displays /home", () => {
	const ui = trafficUi();
	const entry = { time: "2026-10-23T12:00:00Z", kind: "human", visitor: 1, path: "/", status: 200 };
	ui.render([entry, { ...entry, path: "/blog", local: true, status: 404 }, { ...entry, kind: "bot", bot: "Googlebot" }]);
	assert.equal(ui.elements.get("traffic-users-title").textContent, "Users: 1 visitors · 2 views");
	assert.equal(ui.elements.get("traffic-bots-title").textContent, "Bots: 1 bots · 1 requests");
	const users = ui.elements.get("traffic-users").children;
	assert.equal(users[0].children[1].textContent, "User 1 → /home");
	assert.equal(users[1].children[1].textContent, "User 1 (local) → /blog (404)");
	assert.equal(ui.elements.get("traffic-bots").children[0].children[1].textContent, "Bot 1 (Googlebot) → /home");
	ui.append({ ...entry, kind: "bot", visitor: 2, bot: "Bingbot" });
	assert.equal(ui.elements.get("traffic-bots-title").textContent, "Bots: 2 bots · 2 requests");
	ui.render([]);
	assert.equal(ui.elements.get("traffic-users").children.length, 0);
	assert.equal(ui.elements.get("traffic-bots-title").textContent, "Bots: 0 bots · 0 requests");
});

test("traffic UI counts only the latest 500 requests and updates after eviction", () => {
	const ui = trafficUi();
	const entry = { time: "2026-10-23T12:00:00Z", kind: "human", path: "/", status: 200 };
	ui.render(Array.from({ length: 501 }, (_, visitor) => ({ ...entry, visitor })));
	assert.equal(ui.elements.get("traffic-users").children.length, 500);
	assert.equal(ui.elements.get("traffic-users-title").textContent, "Users: 500 visitors · 500 views");
	ui.append({ ...entry, visitor: 500 });
	assert.equal(ui.elements.get("traffic-users-title").textContent, "Users: 499 visitors · 500 views");
});
