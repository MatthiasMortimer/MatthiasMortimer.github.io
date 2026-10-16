#!/usr/bin/env node
// Production server: built Astro site + traffic log
	// Wraps the @astrojs/node standalone handler so prerendered pages are logged too.
	// Usage: HOST=127.0.0.1 PORT=4321 node scripts/serve-production.mjs
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createTrafficLogger } from "../ritesGlobal/traffic-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 4321);

	// Stop the entry from starting its own server; we only want its handler.
process.env.ASTRO_NODE_AUTOSTART = "disabled";
const { handler } = await import(pathToFileURL(path.join(ROOT, "dist", "server", "entry.mjs")).href);
if (typeof handler !== "function") throw new Error("dist/server/entry.mjs did not export a request handler");

const traffic = createTrafficLogger({ dir: process.env.RITES_TRAFFIC_DIR || path.join(ROOT, "dev", "traffic") });

const server = http.createServer((request, response) => {
	traffic.track(request, response);
	handler(request, response);
});

server.listen(PORT, HOST, () => {
	console.log(`Production server listening on http://${HOST}:${PORT}`);
});

function shutdown() {
	traffic.close();
	server.close(() => process.exit(0));
	setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
