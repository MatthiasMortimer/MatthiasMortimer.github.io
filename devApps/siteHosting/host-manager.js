const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");

const runtimeEnv = require("../../ritesGlobal/runtime-env.cjs");
const config = buildConfig(require("./host-config.json"));

const REPO_ROOT = path.resolve(__dirname, "../..");
const ASTRO_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "astro");
const BUILD_STAMP = path.join(REPO_ROOT, "dist", ".rites-build.json");
const TRAFFIC_DIR = path.join(REPO_ROOT, "dev", "traffic");
const MAX_LOG_LINES = 200;
const MAX_TRAFFIC_ENTRIES = 500;
const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 200;

// Build inputs: anything that changes the built site
const BUILD_INPUT_DIRS = ["sites", "ritesGlobal", "public", "scripts", "src"];
const BUILD_INPUT_FILES = ["astro.config.mjs", "package.json", "package-lock.json", "tsconfig.json"];
const BUILD_SKIP_DIRS = new Set(["node_modules", "generated", ".astro"]);

// Config
	// Test copies (see ritesGlobal/runtime-env.cjs) shift ports and never run the public tunnel.
function buildConfig(base) {
	const productionPort = runtimeEnv.port(base.productionPort);
	const devInternalPort = runtimeEnv.port(base.devInternalPort);
	const localUrl = `http://127.0.0.1:${productionPort}`;
	return {
		...base,
		env: runtimeEnv.name,
		tunnelEnabled: !runtimeEnv.isTest,
		productionPort,
		devInternalPort,
		legacyDevGatewayPort: runtimeEnv.port(base.legacyDevGatewayPort),
		localUrl,
		devLocalUrl: `http://127.0.0.1:${devInternalPort}/`,
		publicUrl: runtimeEnv.isTest ? localUrl : base.publicUrl,
	};
}

class HostManager extends EventEmitter {
	constructor() {
		super();
		this.state = "stopped";
		this.devState = "stopped";
		this.productionServer = null;
		this.devPid = null;
		this.tunnel = null;
		this.logs = [];
		this.trafficEntries = loadTodayTraffic();
		this.transition = null;
		this.devTransition = null;
	}

	log(message, level = "info") {
		const entry = { time: new Date().toISOString(), level, message: String(message).trimEnd() };
		this.logs.push(entry);
		if (this.logs.length > MAX_LOG_LINES) this.logs.splice(0, this.logs.length - MAX_LOG_LINES);
		this.emit("log", entry);
	}

	addTraffic(entry) {
		this.trafficEntries.push(entry);
		if (this.trafficEntries.length > MAX_TRAFFIC_ENTRIES) this.trafficEntries.splice(0, this.trafficEntries.length - MAX_TRAFFIC_ENTRIES);
		this.emit("traffic", entry);
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
	async reapStrays() {
		const jobs = [config.productionPort, config.devInternalPort, config.legacyDevGatewayPort].map((port) => run("fuser", ["-k", `${port}/tcp`]));
		if (config.tunnelEnabled) jobs.push(run("pkill", ["-f", `cloudflared tunnel run ${config.tunnelName}`]));
		await Promise.all(jobs);
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
				if (!line.trim()) continue;
				if (label === "production" && line.startsWith("[traffic] ")) {
					this.handleTrafficLine(line);
					continue;
				}
				this.log(`[${label}] ${line}`, levelForLine(line, fallback));
			}
		};
		child.stdout?.on("data", emit("info"));
		child.stderr?.on("data", emit("warn"));
	}

	handleTrafficLine(line) {
		try {
			this.addTraffic(JSON.parse(line.slice("[traffic] ".length)));
		} catch {
			this.log(line);
		}
	}

	async start({ forceBuild = false } = {}) {
		if (this.transition) return this.transition;
		if (this.state === "running") return { success: false, message: "Hosting is already running" };

		this.transition = this._start({ forceBuild }).finally(() => {
			this.transition = null;
		});
		return this.transition;
	}

	async _start({ forceBuild }) {
		const startedAt = Date.now();
		this.setState("starting");
		this.log("Cleaning up previous production server and tunnel processes…");
		await this.reapStrays();

		try {
			const fingerprint = await buildFingerprint();
			const stamp = readBuildStamp();
			const entryExists = fs.existsSync(path.join(REPO_ROOT, "dist", "server", "entry.mjs"));
			if (!forceBuild && entryExists && stamp?.fingerprint === fingerprint) {
				this.log(`No site changes since the last build (${new Date(stamp.builtAt).toLocaleString()}) — skipping build`);
			} else {
				this.log(forceBuild ? "Force rebuilding the production site…" : "Building the production site…");
				const buildStart = Date.now();
				await this.buildProduction();
				writeBuildStamp(await buildFingerprint());
				this.log(`Build finished in ${seconds(Date.now() - buildStart)}`);
			}

			this.log(`Starting built production site on ${config.localUrl}…`);
			this.launchProduction();

			const ready = await this.waitForUrl(config.localUrl, () => this.productionServer !== null);
			if (!ready) {
				this.log("Production server never became reachable — aborting start", "error");
				await this.stop();
				this.setState("error");
				return { success: false, message: "Production server did not start" };
			}
			this.log("Built production site is ready");

			if (config.tunnelEnabled) {
				this.launchTunnel();
			} else {
				this.log(`Test environment — public tunnel disabled; site is local-only at ${config.localUrl}`, "warn");
			}

			this.setState("running");
			this.log(`Hosting started in ${seconds(Date.now() - startedAt)}`);
			return { success: true, message: "Production hosting started" };
		} catch (error) {
			this.log(`Start failed: ${error.message}`, "error");
			await this.stop();
			this.setState("error");
			return { success: false, message: error.message };
		}
	}

	launchTunnel() {
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
		this.productionServer = spawn(process.env.RITES_NODE || "node", ["scripts/serve-production.mjs"], {
			cwd: REPO_ROOT,
			env: { ...process.env, HOST: "127.0.0.1", PORT: String(config.productionPort), RITES_TRAFFIC_DIR: TRAFFIC_DIR },
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
		if (this.devState === "running") return { success: false, message: "Development server is already running" };
		this.devTransition = this._startDevelopment().finally(() => { this.devTransition = null; });
		return this.devTransition;
	}

	async _startDevelopment() {
		this.setDevState("starting");
		try {
			this.log(`Starting local-only Astro development server at ${config.devLocalUrl}…`);
			await this.launchDevelopment();
			if (!await this.waitForUrl(config.devLocalUrl)) {
				throw new Error("Development server did not become reachable");
			}

			this.log(`Development server ready${this.devPid ? ` (pid ${this.devPid})` : ""}`);
			this.setDevState("running");
			return { success: true, message: `Local development server started at ${config.devLocalUrl}` };
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

		// keepWaiting: bail out early when the process we're waiting on has already died.
	async waitForUrl(url, keepWaiting = () => true) {
		const deadline = Date.now() + READY_TIMEOUT_MS;
		while (Date.now() < deadline && keepWaiting()) {
			const result = await probe(url, 2000);
			if (result.ok) return true;
			await delay(READY_POLL_MS);
		}
		return false;
	}

	async stopDevelopment() {
		if (this.devState !== "stopped" || this.devPid) {
			await run(ASTRO_BIN, ["dev", "stop", "--port", String(config.devInternalPort)], { cwd: REPO_ROOT, timeoutMs: 10_000 });
		}
		await Promise.all([
			run("fuser", ["-k", `${config.devInternalPort}/tcp`]),
			run("fuser", ["-k", `${config.legacyDevGatewayPort}/tcp`]),
		]);
		this.devPid = null;
		this.setDevState("stopped");
		return { success: true, message: "Development server stopped" };
	}

	async stop() {
		this.log("Stopping hosting…");
		this.killChild(this.tunnel);
		this.tunnel = null;
		if (config.tunnelEnabled) await run("pkill", ["-f", `cloudflared tunnel run ${config.tunnelName}`]);
		this.killChild(this.productionServer);
		this.productionServer = null;
		await delay(300);
		await this.stopDevelopment();
		await run("fuser", ["-k", `${config.productionPort}/tcp`]);
		this.setState("stopped");
		this.log("Hosting stopped");
		return { success: true, message: "Hosting stopped" };
	}

	async restart(options) {
		await this.stop();
		return this.start(options);
	}

	traffic() {
		return this.trafficEntries;
	}

	async status() {
		const devUnavailable = { ok: false, status: null, error: "stopped" };
		const [local, publicSite, devLocal] = await Promise.all([
			probe(config.localUrl),
			config.tunnelEnabled ? probe(config.publicUrl) : probe(config.localUrl),
			this.devState === "running" ? probe(config.devLocalUrl) : Promise.resolve(devUnavailable),
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
		};
	}
}

	// x-rites-probe keeps health checks out of the traffic log.
async function probe(url, timeoutMs = 6000) {
	try {
		const response = await fetch(url, {
			method: "GET",
			redirect: "manual",
			cache: "no-store",
			headers: { "x-rites-probe": "1" },
			signal: AbortSignal.timeout(timeoutMs),
		});
		return { ok: response.status < 400, status: response.status, error: null };
	} catch (error) {
		return { ok: false, status: null, error: error.name === "TimeoutError" ? "timeout" : error.message };
	}
}

	// Fire-and-wait helper that never throws; used for cleanup commands.
function run(command, args, { cwd, timeoutMs = 5000 } = {}) {
	return new Promise((resolve) => {
		let child;
		try {
			child = spawn(command, args, { cwd, stdio: "ignore" });
		} catch {
			resolve(null);
			return;
		}
		const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
		child.on("error", () => {
			clearTimeout(timer);
			resolve(null);
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			resolve(code);
		});
	});
}

// Build fingerprint
	// Hash of every input file's path + size + mtime; unchanged hash = skip the build.
async function buildFingerprint() {
	const hash = crypto.createHash("sha1");
	const files = [];

	async function walk(dir) {
		let entries;
		try {
			entries = await fs.promises.readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}
		await Promise.all(entries.map(async (entry) => {
			if (BUILD_SKIP_DIRS.has(entry.name)) return;
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) return walk(fullPath);
			if (entry.isFile()) files.push(fullPath);
		}));
	}

	await Promise.all(BUILD_INPUT_DIRS.map((dir) => walk(path.join(REPO_ROOT, dir))));
	for (const file of BUILD_INPUT_FILES) files.push(path.join(REPO_ROOT, file));
	const devAppsDir = path.join(REPO_ROOT, "devApps");
	for (const entry of await fs.promises.readdir(devAppsDir, { withFileTypes: true }).catch(() => [])) {
		if (entry.isDirectory()) files.push(path.join(devAppsDir, entry.name, "devapp.meta.json"));
	}

	const stats = await Promise.all(files.map(async (file) => [file, await fs.promises.stat(file).catch(() => null)]));
	for (const [file, stat] of stats.sort((a, b) => a[0].localeCompare(b[0]))) {
		if (stat) hash.update(`${path.relative(REPO_ROOT, file)}:${stat.size}:${stat.mtimeMs}\n`);
	}
	return hash.digest("hex");
}

function readBuildStamp() {
	try {
		return JSON.parse(fs.readFileSync(BUILD_STAMP, "utf8"));
	} catch {
		return null;
	}
}

function writeBuildStamp(fingerprint) {
	fs.writeFileSync(BUILD_STAMP, JSON.stringify({ fingerprint, builtAt: new Date().toISOString() }));
}

function loadTodayTraffic() {
	const file = path.join(TRAFFIC_DIR, `${new Date().toISOString().slice(0, 10)}.jsonl`);
	try {
		return fs.readFileSync(file, "utf8")
			.split("\n")
			.filter(Boolean)
			.slice(-MAX_TRAFFIC_ENTRIES)
			.map((line) => JSON.parse(line));
	} catch {
		return [];
	}
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function seconds(ms) {
	return `${(ms / 1000).toFixed(1)}s`;
}

// cloudflared writes everything to stderr, so use its own level tag instead
function levelForLine(line, fallback) {
	if (/\bERR\b|\bFTL\b/.test(line)) return "error";
	if (/\bWRN\b/.test(line)) return "warn";
	if (/\bINF\b|\bDBG\b/.test(line)) return "info";
	return fallback;
}

module.exports = { HostManager, config, buildFingerprint, TRAFFIC_DIR };
