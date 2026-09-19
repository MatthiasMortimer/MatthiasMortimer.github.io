const { contextBridge, ipcRenderer } = require("electron");

/**
 * Expose safe IPC methods to the renderer process
 */
contextBridge.exposeInMainWorld("electronAPI", {
	getAppPath: () => ipcRenderer.invoke("get-app-path"),
	getUserDataPath: () => ipcRenderer.invoke("get-user-data-path"),
});
