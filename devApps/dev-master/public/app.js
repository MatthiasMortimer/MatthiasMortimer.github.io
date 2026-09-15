const listEl = document.getElementById("app-list");
const pendingActions = new Set();

async function fetchJSON(url, options) {
	const res = await fetch(url, options);
	if (!res.ok) throw new Error(`${url} -> ${res.status}`);
	return res.json();
}

async function refresh() {
	const apps = await fetchJSON("/api/apps");
	render(apps);
}

function render(apps) {
	if (apps.length === 0) {
		listEl.innerHTML = `<p class="empty-state">No devApps found. Add a folder under devApps/ with a devapp.meta.json.</p>`;
		return;
	}

	listEl.innerHTML = "";
	for (const app of apps) {
		const card = document.createElement("article");
		card.className = "app-card";

		const busy = pendingActions.has(app.folder);

		card.innerHTML = `
			<div class="app-card__header">
				<h2>${escapeHtml(app.name)}</h2>
				<span class="status ${app.running ? "running" : ""}">${app.running ? "Running" : "Stopped"}</span>
			</div>
			<p class="app-card__desc">${escapeHtml(app.description ?? "")}</p>
			<div class="app-card__actions">
				<button type="button" class="primary" data-action="launch" ${app.running || busy ? "disabled" : ""}>Launch</button>
				${app.type === "web" && app.url ? `<a class="btn-link" href="${app.url}" target="_blank" rel="noopener noreferrer" ${app.running ? "" : "aria-disabled=\"true\" style=\"pointer-events:none;opacity:0.5;\""}>Open</a>` : ""}
				<button type="button" data-action="stop" ${(!app.launchedByDashboard && app.type !== "web") || busy ? "disabled" : ""}>Stop</button>
			</div>
		`;

		card.querySelector('[data-action="launch"]')?.addEventListener("click", () => runAction(app.folder, "launch"));
		card.querySelector('[data-action="stop"]')?.addEventListener("click", () => runAction(app.folder, "stop"));

		listEl.appendChild(card);
	}
}

async function runAction(folder, action) {
	pendingActions.add(folder);
	try {
		await fetchJSON(`/api/apps/${encodeURIComponent(folder)}/${action}`, { method: "POST" });
	} catch (err) {
		alert(`Failed to ${action} ${folder}: ${err.message}`);
	} finally {
		pendingActions.delete(folder);
		await refresh();
	}
}

function escapeHtml(str) {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

refresh();
setInterval(refresh, 3000);
