export function isLocalPreviewUrl(value) {
	try {
		const url = new URL(value);
		return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname) &&
			!url.username && !url.password;
	} catch {
		return false;
	}
}

export function createLiveWebsitePreview() {
	const element = document.createElement("section");
	element.className = "live-website-preview";
	const toolbar = document.createElement("div");
	toolbar.className = "live-preview-toolbar";
	const status = document.createElement("p");
	status.className = "live-preview-status";
	status.setAttribute("role", "status");
	const address = document.createElement("a");
	address.className = "live-preview-address";
	address.textContent = "Open dev website in a browser";
	address.target = "_blank";
	address.rel = "noopener noreferrer";
	address.hidden = true;
	const frame = document.createElement("iframe");
	frame.className = "live-preview-frame";
	frame.title = "Live website theme preview";
	frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
	frame.referrerPolicy = "no-referrer";
	frame.hidden = true;
	let siteSlug = null;
	let request = null;
	let disposed = false;

	function setStatus(message, error = false) {
		status.textContent = message;
		status.classList.toggle("error", error);
	}

	async function connect() {
		request?.abort();
		if (!siteSlug || disposed) return;
		frame.hidden = true;
		frame.removeAttribute("src");
		address.hidden = true;
		request = new AbortController();
		const current = request;
		setStatus("Connecting to the development server...");
		try {
			const response = await fetch(new URL("api/theme/preview", location.href), {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ siteSlug }),
				signal: current.signal,
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || "Could not find the dev server. Restart the launcher to load the preview API.");
			if (disposed || current !== request) return;
			if (!result.available) {
				setStatus(result.message, true);
				return;
			}
			if (!isLocalPreviewUrl(result.url)) throw new Error("Preview URL must point to the local development server.");
			if (!["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)) {
				setStatus("Open the editor on the hosting PC to reach its local dev server.", true);
				return;
			}
			frame.src = result.url;
			frame.hidden = false;
			address.href = result.url;
			address.hidden = false;
			setStatus("Live dev website. Valid color edits save automatically; rebuild/restart hosting to publish. Forms are disabled in this frame.");
		} catch (error) {
			if (current.signal.aborted || disposed) return;
			setStatus(error.message, true);
		}
	}

	const retry = document.createElement("button");
	retry.type = "button";
	retry.textContent = "Reload dev preview";
	retry.addEventListener("click", connect);
	toolbar.append(retry, address);
	element.append(toolbar, status, frame);
	return {
		element,
		update(snapshot) {
			const nextSlug = snapshot?.siteSlug ?? null;
			if (nextSlug === siteSlug) return;
			siteSlug = nextSlug;
			if (siteSlug) void connect();
			else {
				request?.abort();
				frame.removeAttribute("src");
				frame.hidden = true;
				address.hidden = true;
				setStatus("Select Theme colors to open the dev website.");
			}
		},
		dispose() {
			disposed = true;
			request?.abort();
			frame.removeAttribute("src");
		},
	};
}
