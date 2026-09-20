const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const CONTENT_TYPES = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
};

function startMobileAppServer({ port, publicDir, handleApi }) {
	const server = http.createServer(async (request, response) => {
		try {
			const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
			if (url.pathname.startsWith("/api/")) {
				const body = await readJsonBody(request);
				const result = await handleApi({
					method: request.method,
					pathname: url.pathname,
					searchParams: url.searchParams,
					body,
				});
				return sendJson(response, result?.status || 200, result?.data ?? result);
			}

			// Electron loads the shared theme over file://; browser mode needs an HTTP route for it.
			if (url.pathname === "/theme/app-theme.css") {
				return serveStatic(response, path.join(__dirname, "styles"), "/app-theme.css");
			}

			serveStatic(response, publicDir, url.pathname);
		} catch (error) {
			sendJson(response, error.statusCode || 400, { success: false, message: error.message });
		}
	});

	server.on("error", (error) => console.error(`[Mobile] Server error on port ${port}: ${error.message}`));
	server.listen(port, "127.0.0.1", () => {
		console.log(`[Mobile] Browser bridge ready on http://127.0.0.1:${port}`);
	});
	return server;
}

function serveStatic(response, publicDir, pathname) {
	const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
	const filePath = path.resolve(publicDir, relativePath);
	if (!filePath.startsWith(`${path.resolve(publicDir)}${path.sep}`)) {
		return sendJson(response, 403, { success: false, message: "Invalid path" });
	}

	fs.stat(filePath, (statError, stats) => {
		if (statError || !stats.isFile()) return sendJson(response, 404, { success: false, message: "Not found" });
		response.writeHead(200, {
			"Content-Type": CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
			"Cache-Control": "no-store",
		});
		fs.createReadStream(filePath).pipe(response);
	});
}

function readJsonBody(request) {
	if (request.method === "GET" || request.method === "HEAD") return Promise.resolve(null);
	return new Promise((resolve, reject) => {
		let source = "";
		request.setEncoding("utf8");
		request.on("data", (chunk) => {
			source += chunk;
			if (source.length > 1_000_000) reject(Object.assign(new Error("Request body is too large"), { statusCode: 413 }));
		});
		request.on("end", () => {
			try {
				resolve(source ? JSON.parse(source) : null);
			} catch {
				reject(new Error("Invalid JSON body"));
			}
		});
		request.on("error", reject);
	});
}

function sendJson(response, status, data) {
	if (response.headersSent) return;
	response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
	response.end(JSON.stringify(data));
}

module.exports = { startMobileAppServer };
