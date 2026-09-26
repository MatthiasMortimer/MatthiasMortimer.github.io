if (!window.hosting) {
	async function request(path, method = "GET") {
		const response = await fetch(path, { method });
		const data = await response.json();
		if (!response.ok) throw new Error(data.message || "Request failed");
		return data;
	}

	window.hosting = {
		start: () => request("api/host/start", "POST"),
		stop: () => request("api/host/stop", "POST"),
		restart: () => request("api/host/restart", "POST"),
		startDevelopment: () => request("api/host/dev/start", "POST"),
		stopDevelopment: () => request("api/host/dev/stop", "POST"),
		status: () => request("api/host/status"),
		logs: () => request("api/host/logs"),
		config: () => request("api/host/config"),
		openExternal: (url) => window.open(url, "_blank", "noopener"),
		onLog: () => {},
		onState: () => {},
		onDevState: () => {},
	};
}