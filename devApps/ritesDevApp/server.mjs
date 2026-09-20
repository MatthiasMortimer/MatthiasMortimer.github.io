import express from "express";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 4605;
const GLOBAL_STYLES_DIR = path.resolve(__dirname, "../../ritesGlobal/styles");
const MEDIA_DIR = path.resolve(__dirname, "../../public/media");
const DEVAPPS_DIR = path.resolve(__dirname, "..");
const SELF_DIR_NAME = path.basename(__dirname);
const PORT_CHECK_TIMEOUT_MS = 200;
let mobileModeEnabled = false;

// Store running processes
const processes = new Map();

// Embedded apps run inside this process: their handler and static server are
// created once and reused, so switching tabs never starts another app.
const embeddedApps = new Map();

function getAppDir(appId) {
	const appDir = path.join(DEVAPPS_DIR, appId);
	if (!appDir.startsWith(`${DEVAPPS_DIR}${path.sep}`)) return null;
	return fs.existsSync(path.join(appDir, "devapp.api.mjs")) ? appDir : null;
}

async function getEmbeddedApp(appId) {
	if (embeddedApps.has(appId)) return embeddedApps.get(appId);

	const appDir = getAppDir(appId);
	if (!appDir) return null;

	const loading = import(pathToFileURL(path.join(appDir, "devapp.api.mjs")).href)
		.then((module) => ({
			handleApi: module.createApiHandler(),
			static: express.static(path.join(appDir, "public"), { index: "index.html" }),
		}))
		.catch((error) => {
			embeddedApps.delete(appId);
			throw error;
		});

	embeddedApps.set(appId, loading);
	return loading;
}

function getManagedProcess(appId) {
	const proc = processes.get(appId);
	if (!proc) return null;

	try {
		process.kill(proc.pid, 0);
		return proc;
	} catch {
		processes.delete(appId);
		return null;
	}
}

function findProcessesByCwd(targetPath) {
	if (process.platform !== "linux") return [];

	const matches = [];
	let entries;
	try {
		entries = fs.readdirSync("/proc", { withFileTypes: true });
	} catch {
		return matches;
	}

	for (const entry of entries) {
		if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;

		const pid = Number(entry.name);
		if (pid === process.pid) continue;

		try {
			const cwd = fs.realpathSync(`/proc/${pid}/cwd`);
			if (cwd !== targetPath) continue;

			const cmdline = fs
				.readFileSync(`/proc/${pid}/cmdline`, "utf8")
				.split("\0")
				.filter(Boolean)
				.join(" ");

			matches.push({ pid, cmdline });
		} catch {
			// Processes can exit or deny /proc access while we are scanning.
		}
	}

	return matches;
}

function isPortOpen(port) {
	if (!port) return Promise.resolve(false);

	return new Promise((resolve) => {
		const socket = net.createConnection({ host: "127.0.0.1", port });
		let settled = false;

		function finish(isOpen) {
			if (settled) return;
			settled = true;
			socket.destroy();
			resolve(isOpen);
		}

		socket.setTimeout(PORT_CHECK_TIMEOUT_MS);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
	});
}

async function waitForPort(port, timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs;
	do {
		if (await isPortOpen(port)) return true;
		await new Promise((resolve) => setTimeout(resolve, 150));
	} while (Date.now() < deadline);
	return false;
}

async function getRuntimeStatus(appId, appPath, port) {
	const managedProcess = getManagedProcess(appId);
	if (managedProcess) {
		return { isRunning: true, source: "managed", pid: managedProcess.pid };
	}

	const cwdProcesses = findProcessesByCwd(appPath);
	if (cwdProcesses.length > 0) {
		return { isRunning: true, source: "external", pid: cwdProcesses[0].pid };
	}

	if (await isPortOpen(port)) {
		return { isRunning: true, source: "port", pid: null };
	}

	return { isRunning: false, source: "none", pid: null };
}

function isLoopbackRequest(req) {
	const address = req.socket.remoteAddress || "";
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function getLanAddress() {
	for (const interfaces of Object.values(os.networkInterfaces())) {
		for (const address of interfaces || []) {
			if (address.family === "IPv4" && !address.internal) return address.address;
		}
	}
	return null;
}

function getMobileModeStatus() {
	const lanAddress = getLanAddress();
	return {
		enabled: mobileModeEnabled,
		lanAddress,
		url: mobileModeEnabled && lanAddress ? `http://${lanAddress}:${PORT}` : null,
	};
}

// Middleware
app.use((req, res, next) => {
	if (isLoopbackRequest(req) || mobileModeEnabled) return next();
	return res.status(403).json({ success: false, message: "Mobile mode is disabled" });
});
app.use(express.static("public"));
app.use("/theme", express.static(GLOBAL_STYLES_DIR));
app.use("/media", express.static(MEDIA_DIR));
app.use("/ritesGlobal/styles", express.static(GLOBAL_STYLES_DIR));
app.use("/public/media", express.static(MEDIA_DIR));
app.use("/mobile/apps/:appId", async (req, res) => {
	const apps = await discoverApps();
	const targetApp = apps.find((candidate) => candidate.id === req.params.appId);
	if (targetApp?.embedded) {
		return res.redirect(targetApp.entryUrl);
	}

	if (!targetApp?.mobilePort) {
		return res.status(404).json({ success: false, message: "This app does not support mobile mode" });
	}

	if (!(await waitForPort(targetApp.mobilePort))) {
		return res.status(503).json({ success: false, message: "The app is not ready yet" });
	}

	const proxyRequest = http.request(
		{
			host: "127.0.0.1",
			port: targetApp.mobilePort,
			path: req.url || "/",
			method: req.method,
			headers: { ...req.headers, host: `127.0.0.1:${targetApp.mobilePort}` },
		},
		(proxyResponse) => {
			res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
			proxyResponse.pipe(res);
		},
	);
	proxyRequest.on("error", (error) => {
		if (!res.headersSent) res.status(502).json({ success: false, message: error.message });
	});
	req.pipe(proxyRequest);
});
app.use(express.json());

/**
 * Embedded dev apps: served from this process at /apps/<id>/ so the launcher can
 * show them as instant tabs instead of spawning a separate Electron app each time.
 */
app.use("/apps/:appId", async (req, res, next) => {
	let embedded;
	try {
		embedded = await getEmbeddedApp(req.params.appId);
	} catch (error) {
		console.error(`[embedded] ${req.params.appId} failed to load:`, error);
		return res.status(500).json({ success: false, message: error.message });
	}

	if (!embedded) return res.status(404).json({ success: false, message: "Unknown app" });

	const requestUrl = new URL(req.url, "http://127.0.0.1");
	if (requestUrl.pathname === "/" && !req.originalUrl.split("?")[0].endsWith("/")) {
		return res.redirect(`/apps/${encodeURIComponent(req.params.appId)}/`);
	}

	if (!requestUrl.pathname.startsWith("/api/")) {
		return embedded.static(req, res, next);
	}

	try {
		const result = await embedded.handleApi({
			method: req.method,
			pathname: requestUrl.pathname,
			searchParams: requestUrl.searchParams,
			body: req.body ?? null,
		});
		res.status(result?.status || 200).json(result?.data ?? result);
	} catch (error) {
		res.status(error.statusCode || 400).json({ success: false, message: error.message });
	}
});

/**
 * Discover dev apps by scanning devApps/ directly — a folder only shows up if
 * it actually exists and self-describes itself via devapp.meta.json, so
 * removed/renamed apps disappear automatically and new ones appear without
 * any registry edits.
 */
async function discoverApps() {
	let entries;
	try {
		entries = fs.readdirSync(DEVAPPS_DIR, { withFileTypes: true });
	} catch (error) {
		console.error("Error reading devApps directory:", error);
		return [];
	}

	const apps = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		if (entry.name === SELF_DIR_NAME) continue; // don't list the launcher within itself

		const appPath = path.join(DEVAPPS_DIR, entry.name);
		const metaPath = path.join(appPath, "devapp.meta.json");
		if (!fs.existsSync(metaPath)) continue; // only real, self-described devApps

		let meta;
		try {
			meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
		} catch (error) {
			console.error(`Invalid devapp.meta.json in ${entry.name}:`, error.message);
			continue;
		}

		const id = meta.slug || entry.name;
		const pkgPath = path.join(appPath, "package.json");
		const canEmbed =
			meta.embed !== false &&
			fs.existsSync(path.join(appPath, "devapp.api.mjs")) &&
			fs.existsSync(path.join(appPath, "public", "index.html"));
		const runtimeStatus = canEmbed ? null : await getRuntimeStatus(id, appPath, meta.port || null);
		const mobileReady = canEmbed ? true : await isPortOpen(meta.mobilePort || null);

		apps.push({
			id,
			name: meta.name || entry.name,
			type: meta.type || "app",
			description: meta.description || "",
			port: meta.port || null,
			mobilePort: meta.mobilePort || null,
			mobileReady,
			embedded: canEmbed,
			entryUrl: canEmbed ? `/apps/${encodeURIComponent(entry.name)}/` : null,
			tabOrder: Number.isFinite(meta.tabOrder) ? meta.tabOrder : 99,
			manages: meta.manages || [],
			contentTypes: meta.contentTypes || [],
			runtime: meta.runtime || "web",
			basePath: entry.name,
			folderExists: true,
			hasMeta: true,
			hasPkg: fs.existsSync(pkgPath),
			isRunning: canEmbed ? true : runtimeStatus.isRunning,
			runningSource: canEmbed ? "embedded" : runtimeStatus.source,
			pid: canEmbed ? null : runtimeStatus.pid,
			command: meta.command || "npm start",
			env: meta.env || {},
		});
	}

	return apps.sort((first, second) => first.tabOrder - second.tabOrder || first.name.localeCompare(second.name));
}

/**
 * Start an app process
 */
function startApp(appId, command, basePath) {
	if (processes.has(appId)) {
		return { success: false, message: "App already running" };
	}

	const appPath = path.resolve(__dirname, "..", basePath);

	try {
		// Parse command
		const [cmd, ...args] = command.split(" ");

		const child = spawn(cmd, args, {
			cwd: appPath,
			stdio: ["ignore", "pipe", "pipe"],
			detached: process.platform !== "win32",
		});

		processes.set(appId, {
			process: child,
			startTime: new Date(),
			pid: child.pid,
		});

		console.log(`[${new Date().toLocaleTimeString()}] Started ${appId} (PID: ${child.pid})`);

		// Handle process exit
		child.on("exit", (code) => {
			processes.delete(appId);
			console.log(`[${new Date().toLocaleTimeString()}] ${appId} exited with code ${code}`);
		});

		// Capture output for logging
		child.stdout?.on("data", (data) => {
			console.log(`[${appId}] ${data.toString().trim()}`);
		});

		child.stderr?.on("data", (data) => {
			console.error(`[${appId}] ${data.toString().trim()}`);
		});

		return { success: true, message: `Started ${appId}`, pid: child.pid };
	} catch (error) {
		return { success: false, message: error.message };
	}
}

/**
 * Stop an app process
 */
async function stopApp(appId) {
	const proc = getManagedProcess(appId);
	if (!proc) {
		return { success: false, message: "App not running" };
	}

	try {
		const { process: child, pid } = proc;

		if (process.platform === "win32") {
			// Windows
			spawn("taskkill", ["/PID", pid.toString(), "/F"]);
		} else {
			// Unix: npm can leave Electron as a reparented descendant.
			killDescendants(pid);
			try {
				process.kill(-pid);
			} catch {
				process.kill(pid, "SIGTERM");
			}
		}
function killDescendants(pid) {
	const children = spawnSync("pgrep", ["-P", String(pid)], { encoding: "utf8" }).stdout
		.split(/\s+/)
		.filter(Boolean)
		.map(Number);

	for (const childPid of children) {
		killDescendants(childPid);
		try {
			process.kill(childPid, "SIGTERM");
		} catch {
			// The child may have exited while the process tree was being read.
		}
	}
}

		processes.delete(appId);
		await waitForProcessExit(pid);
		console.log(`[${new Date().toLocaleTimeString()}] Stopped ${appId} (PID: ${pid})`);

		return { success: true, message: `Stopped ${appId}` };
	} catch (error) {
		processes.delete(appId);
		return { success: true, message: `Stopped ${appId}` };
	}
}

async function waitForProcessExit(pid, timeoutMs = 5_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			process.kill(pid, 0);
			await new Promise((resolve) => setTimeout(resolve, 100));
		} catch {
			return true;
		}
	}
	return false;
}

// API Routes

app.get("/api/mobile-mode", (req, res) => {
	res.json({ ...getMobileModeStatus(), canConfigure: isLoopbackRequest(req) });
});

app.post("/api/mobile-mode", (req, res) => {
	if (!isLoopbackRequest(req)) {
		return res.status(403).json({ success: false, message: "Mobile mode can only be changed on this PC" });
	}

	mobileModeEnabled = req.body?.enabled === true;
	res.json({ success: true, ...getMobileModeStatus() });
});

/**
 * GET /api/apps - List all discovered apps
 */
app.get("/api/apps", async (req, res) => {
	const apps = await discoverApps();
	res.json({ apps });
});

/**
 * POST /api/apps/:appId/start - Start an app
 */
app.post("/api/apps/:appId/start", async (req, res) => {
	const { appId } = req.params;
	const apps = await discoverApps();
	const app = apps.find((a) => a.id === appId);

	if (!app) {
		return res.status(404).json({ success: false, message: "App not found" });
	}

	if (app.embedded) {
		return res.status(400).json({ success: false, message: "This app only runs as a tab in RitesDev App" });
	}

	if (app.isRunning && (!mobileModeEnabled || app.mobileReady)) {
		return res.status(400).json({ success: false, message: "App already running" });
	}

	if (!app.folderExists) {
		return res.status(400).json({ success: false, message: "App folder not found" });
	}

	const result = startApp(appId, app.command, app.basePath);
	if (result.success && app.mobilePort && !(await waitForPort(app.mobilePort))) {
		return res.status(503).json({
			success: false,
			message: `${app.name} started but its control panel did not become ready on port ${app.mobilePort}`,
		});
	}
	res.json(result);
});

/**
 * POST /api/apps/:appId/stop - Stop an app
 */
app.post("/api/apps/:appId/stop", async (req, res) => {
	const { appId } = req.params;
	const apps = await discoverApps();
	const app = apps.find((candidate) => candidate.id === appId);

	if (app?.isRunning && app.runningSource !== "managed") {
		return res.status(400).json({
			success: false,
			message: "App is already open outside the launcher",
		});
	}

	const result = await stopApp(appId);
	res.json(result);
});

/**
 * POST /api/apps/:appId/restart - Restart an app
 */
app.post("/api/apps/:appId/restart", async (req, res) => {
	const { appId } = req.params;

	const apps = await discoverApps();
	const app = apps.find((a) => a.id === appId);

	if (!app) {
		return res.status(404).json({ success: false, message: "App not found" });
	}

	if (app.embedded) {
		return res.status(400).json({ success: false, message: "This app only runs as a tab in RitesDev App" });
	}

	if (app.isRunning && app.runningSource !== "managed") {
		return res.status(400).json({
			success: false,
			message: "App is already open outside the launcher",
		});
	}

	await stopApp(appId);

	// Give it a moment to shut down
	await new Promise((resolve) => setTimeout(resolve, 500));

	const result = startApp(appId, app.command, app.basePath);
	res.json(result);
});

/**
 * GET /api/status - Health check
 */
app.get("/api/status", (req, res) => {
	res.json({
		status: "running",
		timestamp: new Date().toISOString(),
		runningApps: Array.from(processes.keys()),
	});
});

export function startLauncherServer(port = PORT) {
	return app.listen(port, () => {
		const actualPort = this?.address?.()?.port || port;
		console.log(`RitesDev App ready at http://localhost:${actualPort}`);
	});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	startLauncherServer();
}

export { app as launcherApp };

function shutdown() {
	console.log("Shutting down RitesDev App...");

	Promise.all([...processes.keys()].map((appId) => stopApp(appId))).finally(() => {
		setTimeout(() => process.exit(0), 500);
	});
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
