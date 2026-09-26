const { spawn, spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");

const config = require("./host-config.json");

const REPO_ROOT = path.resolve(__dirname, "../..");
const MAX_LOG_LINES = 200;
const ASTRO_READY_TIMEOUT_MS = 60_000;

class HostManager extends EventEmitter {
	constructor() {
		super();
		this.state = "stopped";
		this.devState = "stopped";
		this.productionServer = null;
		this.devPid = null;
		this.gateway = null;
		this.tunnel = null;
		this.logs = [];
		this.transition = null;
		this.devTransition = null;
	}

	log(message, level = "info") {
		const entry = { time: new Date().toISOString(), level, message: String(message).trimEnd() };
		this.logs.push(entry);
		if (this.logs.length > MAX_LOG_LINES) this.logs.splice(0, this.logs.length - MAX_LOG_LINES);
		this.emit("log", entry);
	}

	setState(state) {
		if (this.state === state) return;
		this.state = state;
		this.emit("state", state);
	}

	/**
	 * Kill anything left over from a previous run (crashed app, stale terminal
	 * script, duplicate tunnel) so we never end up with two tunnels or a port clash.
	 */
	reapStrays() {
		spawnSync("pkill", ["-f", `cloudflared tunnel run ${config.tunnelName}`], { stdio: "ignore" });
		spawnSync("npx", ["astro", "dev", "stop", "--port", String(config.devInternalPort)], { cwd: REPO_ROOT, stdio: "ignore", timeout: 15_000 });
		for (const port of [config.productionPort, config.devInternalPort, config.devPort]) {
			spawnSync("fuser", ["-k", `${port}/tcp`], { stdio: "ignore" });
		}
		this.productionServer = null;
		this.devPid = null;
	}

	killChild(child) {
		if (!child || child.killed || child.exitCode !== null) return;
		try {
			process.kill(-child.pid, "SIGTERM");
		} catch {
			try {
				child.kill("SIGTERM");
			} catch {
				/* already gone */
			}
		}
	}

	pipeOutput(child, label) {
		const emit = (fallback) => (data) => {
			for (const line of data.toString().split("\n")) {
				if (line.trim()) this.log(`[${label}] ${line}`, levelForLine(line, fallback));
			}
		};
		child.stdout?.on("data", emit("info"));
		child.stderr?.on("data", emit("warn"));
	}

	async start() {
		if (this.transition) return this.transition;
		if (this.state === "running") return { success: false, message: "Hosting is already running" };

		this.transition = this._start().finally(() => {
			this.transition = null;
		});
		return this.transition;
	}

	async _start() {
		this.setState("starting");
			this.log("Cleaning up previous production server and tunnel processes…");
		this.reapStrays();
		await delay(500);

		try {
			this.log("Building the production site…");
			await this.buildProduction();

			this.log(`Starting built production site on ${config.localUrl}…`);
			this.launchProduction();

			const ready = await this.waitForUrl(config.localUrl);
			if (!ready) {
				this.log("Production server never became reachable — aborting start", "error");
				await this.stop();
				this.setState("error");
				return { success: false, message: "Production server did not start" };
			}
			this.log("Built production site is ready");

			this.tunnel = spawn("cloudflared", ["tunnel", "run", config.tunnelName], {
				cwd: REPO_ROOT,
				detached: true,
				stdio: ["ignore", "pipe", "pipe"],
			});
			this.pipeOutput(this.tunnel, "tunnel");
			this.tunnel.on("exit", (code) => {
				this.log(`Tunnel exited (code ${code})`, code ? "error" : "info");
				this.tunnel = null;
				if (this.state === "running") this.setState("error");
			});
			this.tunnel.on("error", (error) => {
				this.log(`Could not launch cloudflared: ${error.message}`, "error");
			});
			this.log(`Cloudflare tunnel "${config.tunnelName}" starting (pid ${this.tunnel.pid})`);

			this.setState("running");
			return { success: true, message: "Production hosting started" };
		} catch (error) {
			this.log(`Start failed: ${error.message}`, "error");
			await this.stop();
			this.setState("error");
			return { success: false, message: error.message };
		}
	}

	buildProduction() {
		return new Promise((resolve, reject) => {
			const child = spawn("npm", ["run", "build"], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] });
			this.pipeOutput(child, "astro");
			child.on("error", reject);
			child.on("exit", (code) => {
				if (code === 0) resolve();
				else reject(new Error(`npm run build exited with code ${code}`));
			});
		});
	}

	launchProduction() {
		this.productionServer = spawn("node", ["dist/server/entry.mjs"], {
			cwd: REPO_ROOT,
			env: { ...process.env, HOST: "127.0.0.1", PORT: String(config.productionPort) },
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		this.pipeOutput(this.productionServer, "production");
		this.productionServer.on("exit", (code) => {
			this.log(`Production server exited (code ${code})`, code ? "error" : "info");
			this.productionServer = null;
			if (this.state === "running") this.setState("error");
		});
		this.productionServer.on("error", (error) => this.log(`Could not start production server: ${error.message}`, "error"));
	}

	async startDevelopment() {
		if (this.devTransition) return this.devTransition;
		if (this.state !== "running") return { success: false, message: "Start production hosting before starting the public development server" };
		if (this.devState === "running") return { success: false, message: "Development server is already running" };
		this.devTransition = this._startDevelopment().finally(() => { this.devTransition = null; });
		return this.devTransition;
	}

	async _startDevelopment() {
		this.setDevState("starting");
		try {
			this.log("Starting Astro development server on the internal port…");
			await this.launchDevelopment();
			if (!await this.waitForUrl(`http://127.0.0.1:${config.devInternalPort}/`)) {
				throw new Error("Development server did not become reachable");
			}

			this.log(`Starting workstation gateway at ${config.devPublicUrl}…`);
			await this.startGateway();
			if (!await this.waitForUrl(config.devLocalUrl)) throw new Error("Workstation gateway did not become reachable");

			this.log(`Development server ready${this.devPid ? ` (pid ${this.devPid})` : ""}`);
			this.setDevState("running");
			return { success: true, message: "Development server started" };
		} catch (error) {
			this.log(`Development server start failed: ${error.message}`, "error");
			await this.stopDevelopment();
			this.setDevState("error");
			return { success: false, message: error.message };
		}
	}

	setDevState(state) {
		if (this.devState === state) return;
		this.devState = state;
		this.emit("dev-state", state);
	}

	/**
	 * Astro runs at its normal root ('/') on a loopback-only port; hardcoded
	 * root-absolute asset paths in this codebase aren't reliably base-prefixed
	 * by Astro's dev server, so startGateway() fronts it instead of relying on
	 * Astro's `base` config for the public-facing /workstation path.
	 */
	launchDevelopment() {
		return new Promise((resolve, reject) => {
			const child = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(config.devInternalPort), "--force", "--background"], {
				cwd: REPO_ROOT,
				stdio: ["ignore", "pipe", "pipe"],
			});
			const scrapePid = (data) => {
				const match = /\(pid (\d+)/.exec(data.toString());
				if (match) this.devPid = Number(match[1]);
			};
			child.stdout?.on("data", scrapePid);
			child.stderr?.on("data", scrapePid);
			this.pipeOutput(child, "development");
			child.on("error", reject);
			child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`npm run dev exited with code ${code}`)));
		});
	}

	/**
	 * Reverse proxy that strips the `/workstation` prefix from inbound requests
	 * and rewrites root-absolute href/src/action/Location values in the
	 * response so the browser's follow-up requests stay under `/workstation`
	 * (otherwise Cloudflare would route them to production instead).
	 */
	startGateway() {
		return new Promise((resolve, reject) => {
			const proxy = http.createServer((req, res) => this.handleGatewayRequest(req, res));
			proxy.on("upgrade", (req, clientSocket, head) => this.handleGatewayUpgrade(req, clientSocket, head));
			proxy.once("error", reject);
			proxy.listen(config.devPort, "127.0.0.1", () => {
				proxy.removeListener("error", reject);
				proxy.on("error", (error) => this.log(`Workstation gateway error: ${error.message}`, "error"));
				this.gateway = proxy;
				resolve();
			});
		});
	}

	handleGatewayRequest(req, res) {
		const prefix = config.devBase;
		let targetPath = req.url === prefix ? "/" : req.url;
		if (targetPath.startsWith(`${prefix}/`) || targetPath.startsWith(`${prefix}?`)) targetPath = targetPath.slice(prefix.length);

		const upstream = http.request(
			{ host: "127.0.0.1", port: config.devInternalPort, path: targetPath, method: req.method, headers: req.headers },
			(upstreamRes) => {
				const headers = { ...upstreamRes.headers };
				if (typeof headers.location === "string" && headers.location.startsWith("/") && !headers.location.startsWith(prefix)) {
					headers.location = prefix + headers.location;
				}
				if ((headers["content-type"] || "").includes("text/html")) {
					const chunks = [];
					upstreamRes.on("data", (chunk) => chunks.push(chunk));
					upstreamRes.on("end", () => {
						const body = rewriteHtmlForPrefix(Buffer.concat(chunks).toString("utf8"), prefix);
						delete headers["content-length"];
						res.writeHead(upstreamRes.statusCode, headers);
						res.end(body);
					});
				} else {
					res.writeHead(upstreamRes.statusCode, headers);
					upstreamRes.pipe(res);
				}
			},
		);
		upstream.on("error", (error) => {
			if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
			res.end(`Workstation dev server unreachable: ${error.message}`);
		});
		req.pipe(upstream);
	}

	handleGatewayUpgrade(req, clientSocket, head) {
		const prefix = config.devBase;
		let targetPath = req.url;
		if (targetPath.startsWith(prefix)) targetPath = targetPath.slice(prefix.length) || "/";

		const upstreamSocket = net.connect(config.devInternalPort, "127.0.0.1", () => {
			const headerLines = [`GET ${targetPath} HTTP/1.1`];
			for (const [key, value] of Object.entries(req.headers)) headerLines.push(`${key}: ${value}`);
			upstreamSocket.write(`${headerLines.join("\r\n")}\r\n\r\n`);
			if (head?.length) upstreamSocket.write(head);
			upstreamSocket.pipe(clientSocket);
			clientSocket.pipe(upstreamSocket);
		});
		upstreamSocket.on("error", () => clientSocket.destroy());
		clientSocket.on("error", () => upstreamSocket.destroy());
	}

	stopGateway() {
		return new Promise((resolve) => {
			if (!this.gateway) return resolve();
			const gateway = this.gateway;
			this.gateway = null;
			gateway.close(() => resolve());
			gateway.closeAllConnections?.();
		});
	}

	async waitForUrl(url) {
		const deadline = Date.now() + ASTRO_READY_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const result = await probe(url);
			if (result.ok) return true;
			await delay(1000);
		}
		return false;
	}

	async stopDevelopment() {
		await this.stopGateway();
		spawnSync("npx", ["astro", "dev", "stop", "--port", String(config.devInternalPort)], { cwd: REPO_ROOT, stdio: "ignore", timeout: 15_000 });
		spawnSync("fuser", ["-k", `${config.devInternalPort}/tcp`], { stdio: "ignore" });
		spawnSync("fuser", ["-k", `${config.devPort}/tcp`], { stdio: "ignore" });
		this.devPid = null;
		this.setDevState("stopped");
		return { success: true, message: "Development server stopped" };
	}

	async stop() {
		this.log("Stopping hosting…");
		this.killChild(this.tunnel);
		this.tunnel = null;
		spawnSync("pkill", ["-f", `cloudflared tunnel run ${config.tunnelName}`], { stdio: "ignore" });
		this.killChild(this.productionServer);
		this.productionServer = null;
		await delay(400);
		await this.stopDevelopment();
		spawnSync("fuser", ["-k", `${config.productionPort}/tcp`], { stdio: "ignore" });
		this.setState("stopped");
		this.log("Hosting stopped");
		return { success: true, message: "Hosting stopped" };
	}

	async restart() {
		await this.stop();
		await delay(500);
		return this.start();
	}

	async status() {
		const devUnavailable = { ok: false, status: null, error: "stopped" };
		const [local, publicSite, devLocal, devPublic] = await Promise.all([
			probe(config.localUrl),
			probe(config.publicUrl),
			this.devState === "running" ? probe(config.devLocalUrl) : Promise.resolve(devUnavailable),
			this.devState === "running" ? probe(config.devPublicUrl) : Promise.resolve(devUnavailable),
		]);
		return {
			state: this.state,
			devState: this.devState,
			config,
			productionPid: local.ok ? this.productionServer?.pid ?? null : null,
			devPid: devLocal.ok ? this.devPid : null,
			tunnelPid: this.tunnel?.pid ?? null,
			local,
			public: publicSite,
			devLocal,
			devPublic,
		};
	}
}

async function probe(url) {
	try {
		const response = await fetch(url, {
			method: "GET",
			redirect: "manual",
			cache: "no-store",
			signal: AbortSignal.timeout(6000),
		});
		return { ok: response.status < 400, status: response.status, error: null };
	} catch (error) {
		return { ok: false, status: null, error: error.name === "TimeoutError" ? "timeout" : error.message };
	}
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Prefixes root-absolute href/src/action attributes so follow-up browser
// requests stay under the gateway's path instead of falling through to production.
function rewriteHtmlForPrefix(html, prefix) {
	const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const alreadyPrefixed = new RegExp(`^${escapedPrefix}(/|$)`);
	return html.replace(/(href|src|action)="(\/[^"]*)"/g, (match, attr, value) => {
		if (alreadyPrefixed.test(value) || value.startsWith("//")) return match;
		return `${attr}="${prefix}${value}"`;
	});
}

// cloudflared writes everything to stderr, so use its own level tag instead
function levelForLine(line, fallback) {
	if (/\bERR\b|\bFTL\b/.test(line)) return "error";
	if (/\bWRN\b/.test(line)) return "warn";
	if (/\bINF\b|\bDBG\b/.test(line)) return "info";
	return fallback;
}

module.exports = { HostManager, config };
