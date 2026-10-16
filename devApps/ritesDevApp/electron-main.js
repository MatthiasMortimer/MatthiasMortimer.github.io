const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const net = require("net");
const runtimeEnv = require("../../ritesGlobal/runtime-env.cjs");

let mainWindow;
let serverProcess;
const appPort = runtimeEnv.port(4605);
const isDev = process.env.NODE_ENV === "development" || process.argv.includes("--dev");

if (runtimeEnv.isTest) app.setPath("userData", `${app.getPath("userData")}-test`);

/**
 * Start the Express server
 */
function startServer() {
	const serverPath = path.join(__dirname, "server.mjs");

	// Use node to run the ES module
	serverProcess = spawn("node", [serverPath], {
		cwd: __dirname,
		env: { ...process.env, RITES_ENV: runtimeEnv.name },
		stdio: ["ignore", "pipe", "pipe"],
	});

	serverProcess.stdout?.on("data", (data) => {
		console.log(`[Server] ${data}`);
	});

	serverProcess.stderr?.on("data", (data) => {
		console.error(`[Server] ${data}`);
	});

	serverProcess.on("exit", (code) => {
		console.log(`[Server] Exited with code ${code}`);
		serverProcess = null;
	});

	console.log("[Main] Server started (PID: " + serverProcess.pid + ")");

	return waitForServer(appPort);
}

function waitForServer(port, timeoutMs = 10_000) {
	const deadline = Date.now() + timeoutMs;

	return new Promise((resolve, reject) => {
		function check() {
			if (!serverProcess) {
				reject(new Error("RitesDev App server exited before it became ready."));
				return;
			}

			const socket = net.createConnection({ host: "127.0.0.1", port });
			let settled = false;
			const finish = (error) => {
				if (settled) return;
				settled = true;
				socket.destroy();

				if (!error) {
					resolve();
					return;
				}

				if (Date.now() >= deadline) {
					reject(new Error(`RitesDev App server did not open port ${port} within ${timeoutMs}ms.`));
					return;
				}

				setTimeout(check, 100);
			};

			socket.setTimeout(500);
			socket.once("connect", () => finish());
			socket.once("timeout", () => finish(new Error("Server is still starting.")));
			socket.once("error", () => finish(new Error("Server is still starting.")));
		}

		check();
	});
}

/**
 * Create the main Electron window
 */
function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 900,
		minHeight: 640,
		title: runtimeEnv.isTest ? "RitesDev App (TEST)" : "RitesDev App",
		backgroundColor: "#f7f5fa",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
			enableRemoteModule: false,
		},
	});

	// Load a lightweight shell immediately while the app server starts.
	mainWindow
		.loadURL(`data:text/html,${encodeURIComponent(`
			<!doctype html>
			<meta charset="utf-8" />
			<title>RitesDev App</title>
			<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f7f5fa;color:#2f243f;display:grid;place-items:center;height:100vh;margin:0;">
				<div style="text-align:center">
					<h1 style="margin:0 0 .5rem">Launching RitesDev App…</h1>
					<p style="margin:0;color:#5f5374">Starting internal services.</p>
				</div>
			</body>
		`)}`)
		.catch((err) => console.error("[Main] Failed to show launch screen:", err));

	// Open DevTools in development
	if (isDev) {
		mainWindow.webContents.openDevTools();
	}

	// Handle window closed
	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	// Remove menu on Linux
	mainWindow.removeMenu();
}

/**
 * Create application menu
 */
function createMenu() {
	const template = [
		{
			label: "File",
			submenu: [
				{
					label: "Exit",
					accelerator: "CmdOrCtrl+Q",
					click: () => {
						app.quit();
					},
				},
			],
		},
		{
			label: "View",
			submenu: [
				{
					label: "Reload",
					accelerator: "CmdOrCtrl+R",
					click: () => {
						if (mainWindow) mainWindow.reload();
					},
				},
				{
					label: "Toggle DevTools",
					accelerator: "CmdOrCtrl+Shift+I",
					click: () => {
						if (mainWindow) mainWindow.webContents.toggleDevTools();
					},
				},
			],
		},
	];

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

/**
 * App event handlers
 */
app.on("ready", async () => {
	createWindow();
	createMenu();

	try {
		await startServer();
		await mainWindow?.loadURL(`http://localhost:${appPort}`);
	} catch (error) {
		console.error("[Main] Failed to start server:", error);
		app.quit();
		return;
	}

	console.log(
		"\n╔════════════════════════════════════════════════════════════════╗"
	);
	console.log(
		"║                    RitesDev App Ready                           ║"
	);
	console.log(
		"╚════════════════════════════════════════════════════════════════╝\n"
	);
});

app.on("window-all-closed", () => {
	// On macOS, keep app running until explicitly quit
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	// On macOS, re-create window when app is activated
	if (mainWindow === null) {
		createWindow();
	}
});

/**
 * IPC handlers for app communication
 */
ipcMain.handle("get-app-path", () => {
	return app.getAppPath();
});

ipcMain.handle("get-user-data-path", () => {
	return app.getPath("userData");
});

// Graceful shutdown
app.on("before-quit", () => {
	console.log("[Main] Shutting down...");

	// Kill server process
	if (serverProcess) {
		console.log("[Main] Stopping server...");
		serverProcess.kill("SIGTERM");
		serverProcess = null;
	}

	if (mainWindow) {
		mainWindow.destroy();
	}
});
