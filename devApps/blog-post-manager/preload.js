const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("postsAPI", {
	list: () => ipcRenderer.invoke("posts:list"),
	read: (slug) => ipcRenderer.invoke("posts:read", slug),
	save: (post) => ipcRenderer.invoke("posts:save", post),
	remove: (slug) => ipcRenderer.invoke("posts:delete", slug),
});