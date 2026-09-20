const elements = {
	list: document.getElementById("inquiry-list"),
	count: document.getElementById("inquiry-count"),
	search: document.getElementById("inquiry-search"),
	filter: document.getElementById("status-filter"),
	stats: document.getElementById("stats"),
	refresh: document.getElementById("refresh"),
	saveState: document.getElementById("save-state"),
	empty: document.getElementById("empty-state"),
	detail: document.getElementById("detail"),
	received: document.getElementById("detail-received"),
	name: document.getElementById("detail-name"),
	email: document.getElementById("detail-email"),
	service: document.getElementById("detail-service"),
	timeline: document.getElementById("detail-timeline"),
	status: document.getElementById("detail-status"),
	message: document.getElementById("detail-message"),
	notes: document.getElementById("detail-notes"),
	saveNotes: document.getElementById("save-notes"),
	deleteButton: document.getElementById("delete-inquiry"),
	copyEmail: document.getElementById("copy-email"),
	replyLink: document.getElementById("reply-link"),
};

const state = { inquiries: [], selectedId: null, search: "", status: "all" };

function setState(message, tone = "") {
	elements.saveState.textContent = message;
	elements.saveState.className = tone ? `save-state ${tone}` : "save-state";
}

function formatDate(value) {
	if (!value) return "Unknown date";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function visibleInquiries() {
	const term = state.search.trim().toLowerCase();
	return state.inquiries.filter((inquiry) => {
		if (state.status !== "all" && inquiry.status !== state.status) return false;
		if (!term) return true;
		return [inquiry.name, inquiry.email, inquiry.service, inquiry.message, inquiry.notes]
			.join(" ")
			.toLowerCase()
			.includes(term);
	});
}

function renderList() {
	const inquiries = visibleInquiries();
	elements.count.textContent = `${inquiries.length} ${inquiries.length === 1 ? "entry" : "entries"}`;
	elements.list.replaceChildren();

	if (!inquiries.length) {
		const empty = document.createElement("p");
		empty.className = "list-empty";
		empty.textContent = state.inquiries.length ? "No inquiries match this filter." : "No inquiries yet.";
		elements.list.append(empty);
		return;
	}

	for (const inquiry of inquiries) {
		const item = document.createElement("button");
		item.type = "button";
		item.className = `inquiry-item${inquiry.id === state.selectedId ? " is-selected" : ""}`;
		item.dataset.id = inquiry.id;

		const heading = document.createElement("span");
		heading.className = "inquiry-item-name";
		heading.textContent = inquiry.name || "(no name)";

		const badge = document.createElement("span");
		badge.className = `badge badge-${inquiry.status}`;
		badge.textContent = inquiry.status;

		const meta = document.createElement("span");
		meta.className = "inquiry-item-meta";
		meta.textContent = `${inquiry.service || "—"} · ${formatDate(inquiry.submittedAt)}`;

		const preview = document.createElement("span");
		preview.className = "inquiry-item-preview";
		preview.textContent = inquiry.message.slice(0, 110);

		const topRow = document.createElement("span");
		topRow.className = "inquiry-item-top";
		topRow.append(heading, badge);

		item.append(topRow, meta, preview);
		item.addEventListener("click", () => select(inquiry.id));
		elements.list.append(item);
	}
}

function renderStats(stats) {
	elements.stats.replaceChildren();
	const entries = [
		["Total", stats.total],
		["New", stats.new],
		["Replied", stats.replied],
	];
	for (const [label, value] of entries) {
		const chip = document.createElement("span");
		chip.className = "stat-chip";
		chip.textContent = `${label}: ${value}`;
		elements.stats.append(chip);
	}
}

function renderDetail() {
	const inquiry = state.inquiries.find((entry) => entry.id === state.selectedId);
	if (!inquiry) {
		elements.detail.hidden = true;
		elements.empty.hidden = false;
		return;
	}

	elements.empty.hidden = true;
	elements.detail.hidden = false;
	elements.received.textContent = `Received ${formatDate(inquiry.submittedAt)}`;
	elements.name.textContent = inquiry.name || "(no name)";
	elements.email.textContent = inquiry.email || "—";
	elements.service.textContent = inquiry.service || "—";
	elements.timeline.textContent = inquiry.timeline || "—";
	elements.status.value = inquiry.status;
	elements.message.textContent = inquiry.message;
	elements.notes.value = inquiry.notes;
	elements.replyLink.href = inquiry.email
		? `mailto:${encodeURIComponent(inquiry.email)}?subject=${encodeURIComponent(`Re: your ${inquiry.service || "project"} inquiry`)}`
		: "#";
}

async function select(id) {
	state.selectedId = id;
	renderList();
	renderDetail();

	const inquiry = state.inquiries.find((entry) => entry.id === id);
	if (inquiry && inquiry.status === "new") {
		await updateInquiry(id, { status: "read" });
	}
}

async function updateInquiry(id, patch) {
	try {
		const updated = await window.inquiriesAPI.update(id, patch);
		const index = state.inquiries.findIndex((entry) => entry.id === id);
		if (index !== -1) state.inquiries[index] = updated;
		renderList();
		renderDetail();
		await refreshStats();
		setState("Saved");
	} catch (error) {
		setState(error.message, "dirty");
	}
}

async function refreshStats() {
	try {
		renderStats(await window.inquiriesAPI.stats());
	} catch {
		elements.stats.replaceChildren();
	}
}

async function load() {
	try {
		state.inquiries = await window.inquiriesAPI.list();
		if (!state.inquiries.some((entry) => entry.id === state.selectedId)) state.selectedId = null;
		renderList();
		renderDetail();
		await refreshStats();
		setState("Ready");
	} catch (error) {
		setState(error.message, "dirty");
	}
}

elements.search.addEventListener("input", (event) => {
	state.search = event.target.value;
	renderList();
});

elements.filter.addEventListener("click", (event) => {
	const button = event.target.closest("button[data-status]");
	if (!button) return;
	state.status = button.dataset.status;
	for (const chip of elements.filter.querySelectorAll("button")) {
		chip.classList.toggle("is-active", chip === button);
	}
	renderList();
});

elements.status.addEventListener("change", () => {
	if (state.selectedId) updateInquiry(state.selectedId, { status: elements.status.value });
});

elements.saveNotes.addEventListener("click", () => {
	if (state.selectedId) updateInquiry(state.selectedId, { notes: elements.notes.value });
});

elements.deleteButton.addEventListener("click", async () => {
	if (!state.selectedId || !confirm("Delete this inquiry permanently?")) return;
	try {
		await window.inquiriesAPI.remove(state.selectedId);
		state.selectedId = null;
		await load();
		setState("Deleted");
	} catch (error) {
		setState(error.message, "dirty");
	}
});

elements.copyEmail.addEventListener("click", async () => {
	const inquiry = state.inquiries.find((entry) => entry.id === state.selectedId);
	if (!inquiry?.email) return;
	try {
		await navigator.clipboard.writeText(inquiry.email);
		setState("Email copied");
	} catch {
		setState("Could not copy email", "dirty");
	}
});

elements.refresh.addEventListener("click", load);
load();
