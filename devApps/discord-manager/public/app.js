const layoutEditor = document.querySelector("#layout");
const feedback = document.querySelector("#feedback");
const credentialFeedback = document.querySelector("#credential-feedback");

async function request(path, options) {
	const response = await fetch(path, options);
	const result = await response.json();
	if (!response.ok) throw new Error(result.message || result.error || "Request failed");
	return result;
}

async function loadLayout() {
	feedback.textContent = "";
	try {
		const layout = await request("api/layout");
		layoutEditor.value = JSON.stringify(layout, null, 2);
	} catch (error) {
		setFeedback(error.message, "error");
	}
}

async function loadStatus() {
	const dot = document.querySelector("#connection-dot");
	const label = document.querySelector("#connection-status");
	try {
		const status = await request("api/status");
		if (status.connected && status.readyForSetup) {
			dot.classList.add("ready");
			label.textContent = `Connected to ${status.guild.name} as ${status.bot.username}`;
		} else if (status.connected) {
			dot.classList.remove("ready");
			label.textContent = `Connected · missing ${status.permissions.missing.join(", ")}`;
		} else if (status.configured && status.serverConfigured) {
			dot.classList.remove("ready");
			label.textContent = status.error || "Credentials configured · connection not checked";
		} else {
			dot.classList.remove("ready");
			label.textContent = "Add bot token and server ID in .env";
		}
	} catch {
		label.textContent = "Setup status unavailable";
	}
}

async function loadCredentials() {
	try {
		const credentials = await request("api/credentials");
		document.querySelector("#bot-token").value = credentials.token;
		document.querySelector("#guild-id").value = credentials.guildId;
	} catch (error) {
		setCredentialFeedback(error.message, "error");
	}
}

function setFeedback(message, state = "") {
	feedback.textContent = message;
	feedback.className = `feedback ${state}`.trim();
}

function setCredentialFeedback(message, state = "") {
	credentialFeedback.textContent = message;
	credentialFeedback.className = `feedback ${state}`.trim();
}

document.querySelector("#reload").addEventListener("click", loadLayout);
document.querySelector("#save").addEventListener("click", async () => {
	let layout;
	try {
		layout = JSON.parse(layoutEditor.value);
	} catch (error) {
		setFeedback(`Invalid JSON: ${error.message}`, "error");
		return;
	}
	try {
		const result = await request("api/layout", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(layout),
		});
		setFeedback(result.message, "success");
	} catch (error) {
		setFeedback(error.message, "error");
	}
});

document.querySelector("#save-credentials").addEventListener("click", async () => {
	try {
		const result = await request("api/credentials", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				token: document.querySelector("#bot-token").value,
				guildId: document.querySelector("#guild-id").value,
			}),
		});
		setCredentialFeedback(result.message, "success");
		loadStatus();
	} catch (error) {
		setCredentialFeedback(error.message, "error");
	}
});

document.querySelector("#check-connection").addEventListener("click", async (event) => {
	const button = event.currentTarget;
	const details = document.querySelector("#connection-details");
	button.disabled = true;
	button.textContent = "Checking…";
	try {
		const result = await request("api/connect", { method: "POST" });
		if (result.connected) {
			const missing = result.permissions.missing;
			details.innerHTML = "";
			const title = document.createElement("strong");
			title.textContent = result.readyForSetup ? "Bot connection is ready." : "Bot connected, but setup permissions are missing.";
			const info = document.createElement("span");
			info.textContent = `${result.bot.username} is in ${result.guild.name}. ${missing.length ? `Grant ${missing.join(" and ")} to the bot role.` : "Manage Channels and Manage Roles access confirmed."}`;
			details.append(title, info);
		} else {
			throw new Error(result.error || "Could not connect to Discord.");
		}
	} catch (error) {
		details.innerHTML = "";
		const title = document.createElement("strong");
		title.textContent = "Discord connection check failed.";
		const info = document.createElement("span");
		info.textContent = error.message;
		details.append(title, info);
	} finally {
		button.disabled = false;
		button.textContent = "Check Discord connection";
		loadStatus();
	}
});

loadLayout();
loadStatus();
loadCredentials();
