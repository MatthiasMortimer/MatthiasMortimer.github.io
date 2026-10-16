const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hosting", {
	start: () => ipcRenderer.invoke("host:start"),
	rebuild: () => ipcRenderer.invoke("host:rebuild"),
	traffic: () => ipcRenderer.invoke("host:traffic"),
	stop: () => ipcRenderer.invoke("host:stop"),
	restart: () => ipcRenderer.invoke("host:restart"),
	startDevelopment: () => ipcRenderer.invoke("host:dev:start"),
	stopDevelopment: () => ipcRenderer.invoke("host:dev:stop"),
	status: () => ipcRenderer.invoke("host:status"),
	logs: () => ipcRenderer.invoke("host:logs"),
	config: () => ipcRenderer.invoke("host:config"),
	openExternal: (url) => ipcRenderer.invoke("host:openExternal", url),
	onLog: (callback) => ipcRenderer.on("host:log", (_event, entry) => callback(entry)),
	onState: (callback) => ipcRenderer.on("host:state", (_event, state) => callback(state)),
	onTraffic: (callback) => ipcRenderer.on("host:traffic", (_event, entry) => callback(entry)),
	onDevState: (callback) => ipcRenderer.on("host:dev-state", (_event, state) => callback(state)),
});
