const { spawn, spawnSync } = require("node:child_process");
const { EventEmitter } = require("node:events");
const path = require("node:path");

const config = require("./host-config.json");

const REPO_ROOT = path.resolve(__dirname, "../..");
const MAX_LOG_LINES = 200;
const ASTRO_READY_TIMEOUT_MS = 60_000;

class HostManager extends EventEmitter {
	constructor() {
		super();
		this.state = "stopped";
		// Astro 7 daemonizes `astro dev`, so we only ever hold its reported pid
		this.astroPid = null;
		this.tunnel = null;
		this.logs = [];
		this.transition = null;
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
		spawnSync("npx", ["astro", "dev", "stop"], { cwd: REPO_ROOT, stdio: "ignore", timeout: 15_000 });
		spawnSync("fuser", ["-k", `${config.astroPort}/tcp`], { stdio: "ignore" });
		this.astroPid = null;
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
		this.log("Cleaning up any stray Astro/cloudflared processes…");
		this.reapStrays();
		await delay(500);

		try {
			this.log(`Starting Astro dev on ${config.localUrl}…`);
			await this.launchAstro();

			const ready = await this.waitForAstro();
			if (!ready) {
				this.log("Astro never became reachable — aborting start", "error");
				await this.stop();
				this.setState("error");
				return { success: false, message: "Astro dev server did not start" };
			}
			this.log(`Astro dev ready${this.astroPid ? ` (pid ${this.astroPid})` : ""}`);

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
			return { success: true, message: "Hosting started" };
		} catch (error) {
			this.log(`Start failed: ${error.message}`, "error");
			await this.stop();
			this.setState("error");
			return { success: false, message: error.message };
		}
	}

	/**
	 * `astro dev --background` daemonizes, so the npm command returns immediately;
	 * we wait for it to finish and scrape the background server's pid from its output.
	 */
	launchAstro() {
		return new Promise((resolve, reject) => {
			const child = spawn(
				"npm",
				[
					"run",
					"dev",
					"--",
					"--host",
					"127.0.0.1",
					"--port",
					String(config.astroPort),
					"--force",
					"--background",
				],
				{ cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
			);

			const scrapePid = (data) => {
				const match = /\(pid (\d+)/.exec(data.toString());
				if (match) this.astroPid = Number(match[1]);
			};
			child.stdout?.on("data", scrapePid);
			child.stderr?.on("data", scrapePid);
			this.pipeOutput(child, "astro");

			child.on("error", reject);
			child.on("exit", (code) => {
				if (code === 0) resolve();
				else reject(new Error(`npm run dev exited with code ${code}`));
			});
		});
	}

	async waitForAstro() {
		const deadline = Date.now() + ASTRO_READY_TIMEOUT_MS;
		while (Date.now() < deadline) {
			const result = await probe(config.localUrl);
			if (result.ok) return true;
			await delay(1000);
		}
		return false;
	}

	async stop() {
		this.log("Stopping hosting…");
		this.killChild(this.tunnel);
		this.tunnel = null;
		await delay(400);
		this.reapStrays();
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
		const [local, publicSite] = await Promise.all([probe(config.localUrl), probe(config.publicUrl)]);
		return {
			state: this.state,
			config,
			astroPid: local.ok ? this.astroPid : null,
			tunnelPid: this.tunnel?.pid ?? null,
			local,
			public: publicSite,
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

// cloudflared writes everything to stderr, so use its own level tag instead
function levelForLine(line, fallback) {
	if (/\bERR\b|\bFTL\b/.test(line)) return "error";
	if (/\bWRN\b/.test(line)) return "warn";
	if (/\bINF\b|\bDBG\b/.test(line)) return "info";
	return fallback;
}

module.exports = { HostManager, config };
