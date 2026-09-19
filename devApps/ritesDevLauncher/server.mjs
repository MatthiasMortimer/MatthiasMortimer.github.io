import express from "express";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 4605;
const GLOBAL_STYLES_DIR = path.resolve(__dirname, "../../ritesGlobal/styles");
const MEDIA_DIR = path.resolve(__dirname, "../../public/media");
const DEVAPPS_DIR = path.resolve(__dirname, "..");
const SELF_DIR_NAME = path.basename(__dirname);

// Store running processes
const processes = new Map();

// Middleware
app.use(express.static("public"));
app.use("/theme", express.static(GLOBAL_STYLES_DIR));
app.use("/media", express.static(MEDIA_DIR));
app.use(express.json());

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

		apps.push({
			id,
			name: meta.name || entry.name,
			type: meta.type || "app",
			description: meta.description || "",
			port: meta.port || null,
			manages: meta.manages || [],
			contentTypes: meta.contentTypes || [],
			runtime: meta.runtime || "web",
			basePath: entry.name,
			folderExists: true,
			hasMeta: true,
			hasPkg: fs.existsSync(pkgPath),
			isRunning: processes.has(id),
			command: meta.command || "npm start",
			env: meta.env || {},
		});
	}

	return apps;
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
function stopApp(appId) {
	const proc = processes.get(appId);
	if (!proc) {
		return { success: false, message: "App not running" };
	}

	try {
		const { process: child, pid } = proc;

		if (process.platform === "win32") {
			// Windows
			spawn("taskkill", ["/PID", pid.toString(), "/F"]);
		} else {
			// Unix - kill process group
			process.kill(-pid);
		}

		processes.delete(appId);
		console.log(`[${new Date().toLocaleTimeString()}] Stopped ${appId} (PID: ${pid})`);

		return { success: true, message: `Stopped ${appId}` };
	} catch (error) {
		processes.delete(appId);
		return { success: true, message: `Stopped ${appId}` };
	}
}

// API Routes

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

	if (app.isRunning) {
		return res.status(400).json({ success: false, message: "App already running" });
	}

	if (!app.folderExists) {
		return res.status(400).json({ success: false, message: "App folder not found" });
	}

	const result = startApp(appId, app.command, app.basePath);
	res.json(result);
});

/**
 * POST /api/apps/:appId/stop - Stop an app
 */
app.post("/api/apps/:appId/stop", async (req, res) => {
	const { appId } = req.params;
	const result = stopApp(appId);
	res.json(result);
});

/**
 * POST /api/apps/:appId/restart - Restart an app
 */
app.post("/api/apps/:appId/restart", async (req, res) => {
	const { appId } = req.params;

	stopApp(appId);

	// Give it a moment to shut down
	await new Promise((resolve) => setTimeout(resolve, 500));

	const apps = await discoverApps();
	const app = apps.find((a) => a.id === appId);

	if (!app) {
		return res.status(404).json({ success: false, message: "App not found" });
	}

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

// Server startup
app.listen(PORT, () => {
	console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
	console.log(`║           RitesDev Launcher - Ready on Port ${PORT}              ║`);
	console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
	console.log(`🚀 Launcher UI:  http://localhost:${PORT}`);
	console.log(`📊 API Status:   http://localhost:${PORT}/api/status\n`);
});

// Graceful shutdown
process.on("SIGINT", () => {
	console.log("\n\n🛑 Shutting down launcher...");

	// Stop all running apps
	for (const [appId, proc] of processes) {
		stopApp(appId);
	}

	setTimeout(() => {
		process.exit(0);
	}, 1000);
});
