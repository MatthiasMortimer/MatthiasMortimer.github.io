const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const { createPostStore } = require("./post-store");

const postsDirectory = process.env.RITESDEV_POSTS_DIR
	? path.resolve(process.env.RITESDEV_POSTS_DIR)
	: path.resolve(__dirname, "../../sites/s-blog/pages/posts");
const postStore = createPostStore(postsDirectory);

function createWindow() {
	const mainWindow = new BrowserWindow({
		width: 1280,
		height: 820,
		minWidth: 940,
		minHeight: 640,
		backgroundColor: "#f7f5fa",
		title: "RitesDev Blog Post Manager",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	mainWindow.loadFile(path.join(__dirname, "public/index.html"));
	mainWindow.removeMenu();
	mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());

	if (process.argv.includes("--dev")) {
		mainWindow.webContents.openDevTools();
	}
}

ipcMain.handle("posts:list", () => postStore.list());
ipcMain.handle("posts:read", (_event, slug) => postStore.read(slug));
ipcMain.handle("posts:save", (_event, post) => postStore.save(post));
ipcMain.handle("posts:delete", (_event, slug) => postStore.remove(slug));

app.whenReady().then(() => {
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});