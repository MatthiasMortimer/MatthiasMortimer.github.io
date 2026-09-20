const { app, BrowserWindow, Menu, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");

let mainWindow;
let serverProcess;
const isDev = process.env.NODE_ENV === "development" || process.argv.includes("--dev");

/**
 * Start the Express server
 */
function startServer() {
	const serverPath = path.join(__dirname, "server.mjs");

	// Use node to run the ES module
	serverProcess = spawn("node", [serverPath], {
		cwd: __dirname,
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

	return waitForServer(4605);
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
		title: "RitesDev App",
		backgroundColor: "#f7f5fa",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
			enableRemoteModule: false,
		},
	});

	// Load the app from the Express server (serves public/ in both dev and prod)
	const startUrl = "http://localhost:4605";

	mainWindow.loadURL(startUrl).catch((err) => {
		console.error("[Main] Failed to load URL:", err);
	});

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
	try {
		await startServer();
	} catch (error) {
		console.error("[Main] Failed to start server:", error);
		app.quit();
		return;
	}

	// Create the window
	createWindow();
	createMenu();

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
