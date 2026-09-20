if (!window.postsAPI) {
	async function request(path, options) {
		const response = await fetch(path, options);
		const data = await response.json();
		if (!response.ok) throw new Error(data.message || "Request failed");
		return data;
	}

	window.postsAPI = {
		list: () => request("api/posts"),
		read: (slug) => request(`api/posts/${encodeURIComponent(slug)}`),
		save: (post) => request("api/posts", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(post),
		}),
		remove: (slug) => request(`api/posts/${encodeURIComponent(slug)}`, { method: "DELETE" }),
	};
}