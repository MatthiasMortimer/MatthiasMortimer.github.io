const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const { HostManager, config } = require("./host-manager");
const { startMobileAppServer } = require("../../ritesGlobal/mobile-app-server.cjs");

const host = new HostManager();
let mainWindow = null;
let quitting = false;

startMobileAppServer({
	port: 4615,
	publicDir: path.join(__dirname, "public"),
	handleApi: async ({ method, pathname }) => {
		if (method === "GET" && pathname === "/api/host/config") return config;
		if (method === "GET" && pathname === "/api/host/logs") return host.logs;
		if (method === "GET" && pathname === "/api/host/status") return host.status();
		if (method === "POST" && pathname === "/api/host/start") return host.start();
		if (method === "POST" && pathname === "/api/host/stop") return host.stop();
		if (method === "POST" && pathname === "/api/host/restart") return host.restart();
		if (method === "POST" && pathname === "/api/host/dev/start") return host.startDevelopment();
		if (method === "POST" && pathname === "/api/host/dev/stop") return host.stopDevelopment();
		return { status: 404, data: { success: false, message: "Not found" } };
	},
});

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1360,
		height: 900,
		minWidth: 1020,
		minHeight: 680,
		backgroundColor: "#f7f5fa",
		title: "RitesDev Site Hosting",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	mainWindow.loadFile(path.join(__dirname, "public/index.html"));
	mainWindow.removeMenu();
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("https://")) shell.openExternal(url);
		return { action: "deny" };
	});

	if (process.argv.includes("--dev")) mainWindow.webContents.openDevTools();

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

function send(channel, payload) {
	if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

host.on("log", (entry) => send("host:log", entry));
host.on("state", (state) => send("host:state", state));
host.on("dev-state", (state) => send("host:dev-state", state));

ipcMain.handle("host:start", () => host.start());
ipcMain.handle("host:stop", () => host.stop());
ipcMain.handle("host:restart", () => host.restart());
ipcMain.handle("host:dev:start", () => host.startDevelopment());
ipcMain.handle("host:dev:stop", () => host.stopDevelopment());
ipcMain.handle("host:status", () => host.status());
ipcMain.handle("host:logs", () => host.logs);
ipcMain.handle("host:config", () => config);
ipcMain.handle("host:openExternal", (_event, url) => {
	if ([config.publicUrl, config.localUrl, config.devPublicUrl, config.devLocalUrl].includes(url)) shell.openExternal(url);
});

app.whenReady().then(() => {
	host.reapStrays(); // never inherit a duplicate tunnel from a previous session
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("before-quit", (event) => {
	if (quitting) return;
	event.preventDefault();
	quitting = true;
	host.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		host.stop().finally(() => app.exit(0));
	});
}
