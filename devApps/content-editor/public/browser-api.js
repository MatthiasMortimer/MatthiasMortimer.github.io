if (!window.contentAPI) {
	async function request(path, body) {
		const response = await fetch(path, body === undefined ? undefined : {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		const data = await response.json();
		if (!response.ok) throw new Error(data.message || "Request failed");
		return data;
	}

	window.contentAPI = {
		list: () => request("api/content"),
		read: (siteSlug, relativePath) => request("api/content/read", { siteSlug, relativePath }),
		save: (siteSlug, relativePath, document) =>
			request("api/content/save", { siteSlug, relativePath, document }),
	};
}