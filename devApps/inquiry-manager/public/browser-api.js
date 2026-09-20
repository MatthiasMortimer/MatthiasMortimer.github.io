if (!window.inquiriesAPI) {
	async function request(path, options) {
		const response = await fetch(path, options);
		const data = await response.json();
		if (!response.ok) throw new Error(data.message || "Request failed");
		return data;
	}

	window.inquiriesAPI = {
		list: () => request("api/inquiries"),
		stats: () => request("api/stats"),
		update: (id, patch) => request(`api/inquiries/${encodeURIComponent(id)}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(patch),
		}),
		remove: (id) => request(`api/inquiries/${encodeURIComponent(id)}`, { method: "DELETE" }),
	};
}
