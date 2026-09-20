let allApps = [];
let refreshInterval;
const cardsById = new Map();
const tabsById = new Map();
const viewsById = new Map();
let activeTab = localStorage.getItem("ritesdev.activeTab") || "home";
let lastAppsSignature = null;
let refreshInFlight = false;
let refreshQueued = false;
let mobileMode = { enabled: false, canConfigure: true, url: null };

/**
 * Initialize the launcher
 */
document.addEventListener("DOMContentLoaded", () => {
	initializeTabs();
	initializeMobileMode();
	refreshApps();

	refreshInterval = setInterval(refreshApps, 1000);
	window.addEventListener("focus", refreshApps);
	document.addEventListener("visibilitychange", () => {
		if (!document.hidden) refreshApps();
	});
});

function initializeTabs() {
	tabsById.set("home", document.querySelector('.tab[data-tab="home"]'));
	viewsById.set("home", document.getElementById("view-home"));
	tabsById.get("home").addEventListener("click", () => activateTab("home"));

	document.addEventListener("keydown", (event) => {
		if (!event.ctrlKey || event.altKey || event.shiftKey) return;
		const index = Number(event.key) - 1;
		if (!Number.isInteger(index) || index < 0) return;
		const id = [...tabsById.keys()][index];
		if (!id) return;
		event.preventDefault();
		activateTab(id);
	});

	// Embedded apps live in iframes, so their key presses never reach this document.
	window.addEventListener("message", (event) => {
		if (event.data?.type === "ritesdev:activate-tab") activateTab(event.data.tabId);
	});
}

/**
 * Render one tab + hidden iframe per embedded app. Iframes are created once and
 * kept alive, so switching tabs is instant and no extra processes are started.
 */
function renderTabs(apps) {
	const tabbar = document.getElementById("tabbar");
	const views = document.getElementById("views");
	const seen = new Set(["home"]);

	apps.forEach((app, index) => {
		seen.add(app.id);

		if (!tabsById.has(app.id)) {
			const tab = document.createElement("button");
			tab.type = "button";
			tab.className = "tab";
			tab.dataset.tab = app.id;
			tab.title = app.description || app.name;
			tab.addEventListener("click", () => activateTab(app.id));
			tabbar.appendChild(tab);
			tabsById.set(app.id, tab);

			const view = document.createElement("section");
			view.className = "view";
			view.id = `view-${app.id}`;

			const frame = document.createElement("iframe");
			frame.className = "app-frame";
			frame.src = app.entryUrl;
			frame.title = app.name;
			view.appendChild(frame);
			views.appendChild(view);
			viewsById.set(app.id, view);
		}

		const tab = tabsById.get(app.id);
		tab.innerHTML = "";
		const name = document.createElement("span");
		name.className = "tab-name";
		name.textContent = app.name;
		const hint = document.createElement("span");
		hint.className = "tab-hint";
		hint.textContent = `Ctrl+${index + 2}`;
		tab.append(name, hint);
	});

	for (const [id, tab] of tabsById) {
		if (seen.has(id)) continue;
		tab.remove();
		viewsById.get(id)?.remove();
		tabsById.delete(id);
		viewsById.delete(id);
		if (activeTab === id) activateTab("home");
	}

	if (!tabsById.has(activeTab)) activeTab = "home";
	activateTab(activeTab);
}

function activateTab(tabId) {
	if (!tabsById.has(tabId)) return;
	activeTab = tabId;
	localStorage.setItem("ritesdev.activeTab", tabId);

	for (const [id, tab] of tabsById) {
		const isActive = id === tabId;
		tab.classList.toggle("is-active", isActive);
		tab.setAttribute("aria-current", isActive ? "page" : "false");
		viewsById.get(id)?.classList.toggle("is-active", isActive);
	}
}

async function initializeMobileMode() {
	const toggle = document.getElementById("mobile-mode-toggle");
	toggle.addEventListener("change", async () => {
		toggle.disabled = true;
		try {
			const response = await fetch("/api/mobile-mode", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ enabled: toggle.checked }),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.message || "Could not change mobile mode");
			mobileMode = { ...mobileMode, ...data };
			renderMobileMode();
			lastAppsSignature = null;
			refreshApps();
		} catch (error) {
			toggle.checked = mobileMode.enabled;
			showNotification(error.message, "error");
		} finally {
			toggle.disabled = false;
		}
	});

	document.getElementById("copy-mobile-address").addEventListener("click", async () => {
		if (!mobileMode.url) return;
		await navigator.clipboard.writeText(mobileMode.url);
		showNotification("Mobile address copied", "success");
	});

	try {
		const response = await fetch("/api/mobile-mode");
		mobileMode = await response.json();
		renderMobileMode();
	} catch (error) {
		showNotification("Could not load mobile mode", "error");
	}
}

function renderMobileMode() {
	const toggle = document.getElementById("mobile-mode-toggle");
	const control = document.getElementById("mobile-mode-control");
	const summary = document.getElementById("mobile-mode-summary");
	const panel = document.getElementById("mobile-address-panel");
	const address = document.getElementById("mobile-address");

	toggle.checked = mobileMode.enabled;
	control.hidden = !mobileMode.canConfigure;
	summary.textContent = mobileMode.canConfigure
		? mobileMode.enabled && mobileMode.url
			? "Available on your local network"
			: mobileMode.enabled ? "No local network address found" : "Only this PC can connect"
		: "Connected from this device";
	panel.hidden = !mobileMode.enabled || !mobileMode.url;
	address.textContent = mobileMode.url || "";
	address.href = mobileMode.url || "#";
}

/**
 * Fetch and display all apps
 */
async function refreshApps() {
	if (refreshInFlight) {
		refreshQueued = true;
		return;
	}

	refreshInFlight = true;
	try {
		const response = await fetch("/api/apps");
		const data = await response.json();
		const apps = data.apps || [];

		// Skip re-render entirely if nothing changed, to avoid flicker on every poll
		const signature = JSON.stringify(apps);
		if (signature === lastAppsSignature) {
			return;
		}
		lastAppsSignature = signature;
		allApps = apps;

		// Render apps
		displayApps(allApps);

		// Update running apps sidebar
		updateRunningAppsList();
	} catch (error) {
		console.error("Error fetching apps:", error);
		showError("Failed to load apps");
	} finally {
		refreshInFlight = false;
		if (refreshQueued) {
			refreshQueued = false;
			refreshApps();
		}
	}
}

/**
 * Display apps in the grid, patching existing cards in place instead of
 * tearing down the whole grid every refresh (which caused flicker).
 */
function displayApps(apps) {
	const grid = document.getElementById("apps-grid");
	const template = document.getElementById("app-card-template");

	renderTabs(apps.filter((app) => app.embedded));
	const standaloneApps = apps.filter((app) => !app.embedded);

	if (standaloneApps.length === 0) {
		cardsById.clear();
		grid.innerHTML =
			'<div class="empty-state"><p>No standalone apps. Add a folder to devApps/ to add another app.</p></div>';
		return;
	}

	grid.querySelector(".loading, .empty-state")?.remove();

	const seenIds = new Set();

	standaloneApps.forEach((app) => {
		seenIds.add(app.id);
		let card = cardsById.get(app.id);

		if (!card) {
			const clone = template.content.cloneNode(true);
			card = clone.firstElementChild;
			cardsById.set(app.id, card);
			grid.appendChild(card);
		}

		updateCard(card, app);
	});

	// Remove cards for apps that no longer exist
	for (const [id, card] of cardsById) {
		if (!seenIds.has(id)) {
			card.remove();
			cardsById.delete(id);
		}
	}
}

/**
 * Patch a single app card's contents/state in place
 */
function updateCard(card, app) {
	card.querySelector(".app-name").textContent = app.name;
	card.querySelector(".app-type").textContent = app.type;
	card.querySelector(".app-description").textContent = app.description;
	card.querySelector(".port").textContent =
		app.runtime === "desktop" ? "Desktop window" : `http://localhost:${app.port}`;
	card.querySelector(".type").textContent = app.type;

	// Status badge
	const statusBadge = card.querySelector(".status-badge");
	statusBadge.classList.toggle("running", app.isRunning);
	statusBadge.classList.toggle("stopped", !app.isRunning);
	statusBadge.textContent = app.isRunning ? "● Running" : "○ Stopped";

	// Managed sites
	const managesList = card.querySelector(".manages-list");
	managesList.innerHTML = "";
	if (app.manages && app.manages.length > 0) {
		app.manages.forEach((site) => {
			const span = document.createElement("span");
			span.textContent = site;
			managesList.appendChild(span);
		});
	} else {
		managesList.innerHTML = "<span>All sites</span>";
	}

	// Buttons
	const launchBtn = card.querySelector(".btn-launch");
	const stopBtn = card.querySelector(".btn-stop");
	const restartBtn = card.querySelector(".btn-restart");

	launchBtn.dataset.appId = app.id;
	stopBtn.dataset.appId = app.id;
	restartBtn.dataset.appId = app.id;
	const isExternallyRunning = app.isRunning && app.runningSource !== "managed";
	const isMobileClient = mobileMode.enabled && !mobileMode.canConfigure;

	// Don't fight buttons that are mid-action (e.g. "Launching..."), only
	// sync visibility/disabled state once we know the definitive server status
	if (!launchBtn.classList.contains("is-busy")) {
		launchBtn.style.display = isMobileClient && app.mobilePort ? "flex" : app.isRunning ? "none" : "flex";
		stopBtn.style.display = isMobileClient ? "none" : app.isRunning ? "flex" : "none";
		restartBtn.style.display = isMobileClient ? "none" : app.isRunning ? "flex" : "none";
		launchBtn.disabled = false;
		launchBtn.textContent = isMobileClient && app.mobileReady ? "Open" : "Launch";
		stopBtn.disabled = isExternallyRunning;
		stopBtn.textContent = isExternallyRunning ? "Already Open" : "Stop";
		restartBtn.disabled = isExternallyRunning;
		restartBtn.title = isExternallyRunning
			? "This app was opened outside the launcher. Close it there before restarting."
			: "";
	}

	if (!app.folderExists) {
		launchBtn.disabled = true;
		launchBtn.textContent = "❌ Folder Missing";
		stopBtn.disabled = true;
		restartBtn.disabled = true;
	}

	if (isMobileClient && !app.mobilePort) {
		launchBtn.disabled = true;
		launchBtn.textContent = "Desktop only";
	}
}

/**
 * Update the running apps sidebar
 */
function updateRunningAppsList() {
	const runningApps = allApps.filter((app) => app.isRunning && !app.embedded);
	const count = document.getElementById("running-count");
	const list = document.getElementById("running-list");

	count.textContent = runningApps.length;

	if (runningApps.length === 0) {
		list.innerHTML = '<li style="text-align: center; color: var(--color-primary);">No apps running</li>';
		return;
	}

	list.innerHTML = "";
	runningApps.forEach((app) => {
		const li = document.createElement("li");
		const location = app.runtime === "desktop" ? "Desktop window" : `Port: ${app.port}`;
		li.innerHTML = `
			<div style="font-weight: 600; color: var(--color-dark);">${app.name}</div>
			<div class="app-pid">${location}</div>
		`;
		list.appendChild(li);
	});
}

/**
 * Launch an app
 */
async function launchApp(event) {
	const appId = event.currentTarget.dataset.appId;
	const app = allApps.find((a) => a.id === appId);

	if (!app) return;

	const btn = event.currentTarget;
	const isMobileClient = mobileMode.enabled && !mobileMode.canConfigure;
	const mobileTab = isMobileClient ? window.open("about:blank", "_blank") : null;
	if (mobileTab) {
		mobileTab.document.title = `Opening ${app.name}`;
		mobileTab.document.body.textContent = `Opening ${app.name}...`;
	}
	btn.disabled = true;
	btn.classList.add("is-busy");
	btn.textContent = "Launching...";

	try {
		const appUiIsReady = isMobileClient ? app.mobileReady : app.isRunning;
		const data = appUiIsReady
			? { success: true }
			: await fetch(`/api/apps/${appId}/start`, { method: "POST" }).then((response) => response.json());

		if (data.success) {
			showNotification(`✓ ${app.name} launched!`, "success");
			if (mobileTab) mobileTab.location.href = `/mobile/apps/${encodeURIComponent(appId)}/`;
			await new Promise((resolve) => setTimeout(resolve, 500));
		} else {
			mobileTab?.close();
			showNotification(`✗ Failed: ${data.message}`, "error");
			btn.textContent = "Launch";
		}
	} catch (error) {
		mobileTab?.close();
		console.error("Error launching app:", error);
		showNotification("Error launching app", "error");
		btn.textContent = "Launch";
	} finally {
		btn.disabled = false;
		btn.classList.remove("is-busy");
		lastAppsSignature = null; // force the next poll to re-render with fresh state
		refreshApps();
	}
}

/**
 * Stop an app
 */
async function stopApp(event) {
	const appId = event.currentTarget.dataset.appId;
	const app = allApps.find((a) => a.id === appId);

	if (!app) return;

	const btn = event.currentTarget;
	btn.disabled = true;
	btn.classList.add("is-busy");
	btn.textContent = "Stopping...";

	try {
		const response = await fetch(`/api/apps/${appId}/stop`, { method: "POST" });
		const data = await response.json();

		if (data.success) {
			showNotification(`✓ ${app.name} stopped!`, "success");
			await new Promise((resolve) => setTimeout(resolve, 300));
		} else {
			showNotification(`✗ Failed: ${data.message}`, "error");
			btn.textContent = "Stop";
		}
	} catch (error) {
		console.error("Error stopping app:", error);
		showNotification("Error stopping app", "error");
		btn.textContent = "Stop";
	} finally {
		btn.disabled = false;
		btn.classList.remove("is-busy");
		lastAppsSignature = null;
		refreshApps();
	}
}

/**
 * Restart an app
 */
async function restartApp(event) {
	const appId = event.currentTarget.dataset.appId;
	const app = allApps.find((a) => a.id === appId);

	if (!app) return;

	const btn = event.currentTarget;
	btn.disabled = true;
	btn.classList.add("is-busy");

	try {
		const response = await fetch(`/api/apps/${appId}/restart`, { method: "POST" });
		const data = await response.json();

		if (data.success) {
			showNotification(`✓ ${app.name} restarted!`, "success");
			await new Promise((resolve) => setTimeout(resolve, 500));
		} else {
			showNotification(`✗ Failed: ${data.message}`, "error");
		}
	} catch (error) {
		console.error("Error restarting app:", error);
		showNotification("Error restarting app", "error");
	} finally {
		btn.disabled = false;
		btn.classList.remove("is-busy");
		lastAppsSignature = null;
		refreshApps();
	}
}

/**
 * Show notification
 */
function showNotification(message, type = "info") {
	// Create notification element
	const notification = document.createElement("div");
	notification.style.cssText = `
		position: fixed;
		top: 2rem;
		right: 2rem;
		padding: 1rem 1.5rem;
		border-radius: 8px;
		font-weight: 500;
		font-size: 0.95rem;
		animation: slideInRight 0.3s ease;
		z-index: 1000;
		max-width: 300px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	`;

	if (type === "success") {
		notification.style.backgroundColor = "var(--color-success)";
		notification.style.color = "white";
	} else if (type === "error") {
		notification.style.backgroundColor = "var(--color-danger)";
		notification.style.color = "white";
	} else {
		notification.style.backgroundColor = "var(--color-primary)";
		notification.style.color = "white";
	}

	notification.textContent = message;
	document.body.appendChild(notification);

	// Remove after 3 seconds
	setTimeout(() => {
		notification.style.animation = "slideOutRight 0.3s ease forwards";
		setTimeout(() => {
			document.body.removeChild(notification);
		}, 300);
	}, 3000);
}

/**
 * Show error
 */
function showError(message) {
	const grid = document.getElementById("apps-grid");
	grid.innerHTML = `
		<div class="empty-state">
			<p>⚠️ ${message}</p>
		</div>
	`;
}

// Add animation styles to document
const style = document.createElement("style");
style.textContent = `
	@keyframes slideInRight {
		from {
			transform: translateX(400px);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	@keyframes slideOutRight {
		from {
			transform: translateX(0);
			opacity: 1;
		}
		to {
			transform: translateX(400px);
			opacity: 0;
		}
	}
`;
document.head.appendChild(style);
