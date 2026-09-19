const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hosting", {
	start: () => ipcRenderer.invoke("host:start"),
	stop: () => ipcRenderer.invoke("host:stop"),
	restart: () => ipcRenderer.invoke("host:restart"),
	status: () => ipcRenderer.invoke("host:status"),
	logs: () => ipcRenderer.invoke("host:logs"),
	config: () => ipcRenderer.invoke("host:config"),
	openExternal: (url) => ipcRenderer.invoke("host:openExternal", url),
	onLog: (callback) => ipcRenderer.on("host:log", (_event, entry) => callback(entry)),
	onState: (callback) => ipcRenderer.on("host:state", (_event, state) => callback(state)),
});
