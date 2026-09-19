const els = {
	statePill: document.getElementById("state-pill"),
	stateText: document.getElementById("state-text"),
	start: document.getElementById("btn-start"),
	stop: document.getElementById("btn-stop"),
	restart: document.getElementById("btn-restart"),
	refreshPreview: document.getElementById("btn-refresh-preview"),
	openExternal: document.getElementById("btn-open-external"),
	checkLocal: document.getElementById("check-local"),
	checkPublic: document.getElementById("check-public"),
	localUrl: document.getElementById("local-url"),
	publicUrl: document.getElementById("public-url"),
	astroPid: document.getElementById("astro-pid"),
	tunnelPid: document.getElementById("tunnel-pid"),
	log: document.getElementById("log"),
	preview: document.getElementById("preview"),
	previewOverlay: document.getElementById("preview-overlay"),
	previewMessage: document.getElementById("preview-message"),
	previewTarget: document.getElementById("preview-target"),
};

const STATE_LABELS = {
	stopped: "Stopped",
	starting: "Starting…",
	running: "Running",
	error: "Error",
};

let config = null;
let busy = false;
let previewLoaded = false;

init();

async function init() {
	config = await window.hosting.config();
	els.localUrl.textContent = config.localUrl;
	els.publicUrl.textContent = config.publicUrl;
	els.previewTarget.textContent = config.publicUrl;

	for (const entry of await window.hosting.logs()) appendLog(entry);

	window.hosting.onLog(appendLog);
	window.hosting.onState(() => refreshStatus());

	els.start.addEventListener("click", () => runAction("start", window.hosting.start));
	els.stop.addEventListener("click", () => runAction("stop", window.hosting.stop));
	els.restart.addEventListener("click", () => runAction("restart", window.hosting.restart));
	els.refreshPreview.addEventListener("click", () => {
		previewLoaded = false;
		refreshStatus();
	});
	els.openExternal.addEventListener("click", () => window.hosting.openExternal(config.publicUrl));
	for (const link of [els.localUrl, els.publicUrl]) {
		link.addEventListener("click", (event) => {
			event.preventDefault();
			window.hosting.openExternal(link.textContent);
		});
	}

	refreshStatus();
	setInterval(refreshStatus, 3000);
}

async function runAction(name, action) {
	if (busy) return;
	busy = true;
	setButtonsDisabled(true);
	previewLoaded = false;
	try {
		const result = await action();
		if (!result?.success) appendLog({ time: new Date().toISOString(), level: "error", message: result?.message || `${name} failed` });
	} finally {
		busy = false;
		await refreshStatus();
	}
}

function setButtonsDisabled(disabled) {
	els.start.disabled = disabled;
	els.stop.disabled = disabled;
	els.restart.disabled = disabled;
}

async function refreshStatus() {
	const status = await window.hosting.status();

	els.statePill.dataset.state = status.state;
	els.stateText.textContent = STATE_LABELS[status.state] || status.state;
	els.astroPid.textContent = status.astroPid ?? "—";
	els.tunnelPid.textContent = status.tunnelPid ?? "—";

	renderCheck(els.checkLocal, status.local);
	renderCheck(els.checkPublic, status.public);

	if (!busy) {
		const running = status.state === "running" || status.state === "starting";
		els.start.disabled = running;
		els.stop.disabled = status.state === "stopped";
		els.restart.disabled = status.state === "stopped";
	}

	updatePreview(status);
}

function renderCheck(element, result) {
	const statusEl = element.querySelector(".check-status");
	if (result.ok) {
		element.dataset.health = "ok";
		statusEl.textContent = `${result.status} OK`;
	} else if (result.status) {
		element.dataset.health = result.status === 502 || result.status >= 500 ? "bad" : "warn";
		statusEl.textContent = `${result.status} ${httpLabel(result.status)}`;
	} else {
		element.dataset.health = "bad";
		statusEl.textContent = result.error === "timeout" ? "Timed out" : "Unreachable";
	}
}

function httpLabel(status) {
	if (status === 502) return "Bad Gateway";
	if (status === 503) return "Service Unavailable";
	if (status === 504) return "Gateway Timeout";
	if (status === 404) return "Not Found";
	if (status >= 500) return "Server Error";
	return "Error";
}

function updatePreview(status) {
	if (status.public.ok) {
		if (!previewLoaded) {
			els.preview.src = `${config.publicUrl}/?preview=${Date.now()}`;
			previewLoaded = true;
		}
		els.previewOverlay.hidden = true;
		return;
	}

	previewLoaded = false;
	els.preview.removeAttribute("src");
	els.previewOverlay.hidden = false;
	els.previewOverlay.classList.toggle("is-error", status.state !== "stopped");

	if (status.state === "stopped") {
		els.previewMessage.textContent = "Hosting is stopped — start it to preview the live site.";
	} else if (status.state === "starting") {
		els.previewMessage.textContent = "Starting Astro and the tunnel…";
	} else if (status.public.status) {
		els.previewMessage.textContent = `${config.publicUrl} returned ${status.public.status} ${httpLabel(status.public.status)}`;
	} else {
		els.previewMessage.textContent = `${config.publicUrl} is unreachable (${status.public.error || "no response"})`;
	}
}

function appendLog(entry) {
	const li = document.createElement("li");
	li.className = entry.level;
	const time = document.createElement("span");
	time.className = "log-time";
	time.textContent = new Date(entry.time).toLocaleTimeString();
	li.append(time, document.createTextNode(entry.message));
	els.log.appendChild(li);
	while (els.log.children.length > 200) els.log.removeChild(els.log.firstChild);
	els.log.scrollTop = els.log.scrollHeight;
}
