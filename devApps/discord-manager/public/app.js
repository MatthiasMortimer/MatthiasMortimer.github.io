const $ = (selector, root = document) => root.querySelector(selector);
const state = { servers: [], destinationConfigs: {}, currentId: null, config: null, templates: [], roleMentions: new Map(), inviteUrl: null, selectedMemberId: null };
const fontDefinitions = {
	normal: null,
	bold: { upper: 0x1d400, lower: 0x1d41a, digit: 0x1d7ce },
	italic: { upper: 0x1d434, lower: 0x1d44e, exceptions: { h: "ℎ" } },
	boldItalic: { upper: 0x1d468, lower: 0x1d482 },
	monospace: { upper: 0x1d670, lower: 0x1d68a, digit: 0x1d7f6 },
	doubleStruck: { upper: 0x1d538, lower: 0x1d552, digit: 0x1d7d8, exceptions: { C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" } },
};
const reverseFontGlyphs = new Map();
for (const definition of Object.values(fontDefinitions)) {
	if (!definition) continue;
	for (const character of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789") {
		const base = character >= "A" && character <= "Z" ? definition.upper : character >= "a" && character <= "z" ? definition.lower : definition.digit;
		if (!definition.exceptions?.[character] && base === undefined) continue;
		const offset = character >= "A" && character <= "Z" ? character.charCodeAt(0) - 65 : character >= "a" && character <= "z" ? character.charCodeAt(0) - 97 : Number(character);
		const glyph = definition.exceptions?.[character] ?? String.fromCodePoint(base + offset);
		reverseFontGlyphs.set(glyph, character);
	}
}
function mapFontText(text, style) {
	const definition = fontDefinitions[style];
	return [...text].map((character) => {
		const plain = reverseFontGlyphs.get(character) ?? character;
		if (!definition) return plain;
		if (definition.exceptions?.[plain]) return definition.exceptions[plain];
		if (plain >= "A" && plain <= "Z" && definition.upper) return String.fromCodePoint(definition.upper + plain.charCodeAt(0) - 65);
		if (plain >= "a" && plain <= "z" && definition.lower) return String.fromCodePoint(definition.lower + plain.charCodeAt(0) - 97);
		if (plain >= "0" && plain <= "9" && definition.digit) return String.fromCodePoint(definition.digit + Number(plain));
		return plain;
	}).join("");
}
function mapTextOutsideRoleMentions(text, style) {
	return text.split(/(<@&\d+>)/gu).map((part) => /^<@&\d+>$/u.test(part) ? part : mapFontText(part, style)).join("");
}
const rolePermissionOptions = [
	["ManageChannels", "Manage channels"], ["ManageRoles", "Manage roles"], ["ManageMessages", "Manage messages"],
	["ManageThreads", "Manage threads"], ["ModerateMembers", "Timeout members"], ["ViewAuditLog", "View audit log"],
	["KickMembers", "Kick members"], ["BanMembers", "Ban members"], ["ManageEvents", "Manage events"],
];

async function request(path, options = {}) {
	const signal = options.signal ?? (path === "api/invites/resolve" ? AbortSignal.timeout(12000) : undefined);
	const response = await fetch(path, { ...options, signal, headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers } });
	const result = await response.json();
	if (!response.ok) throw new Error(result.message || "Request failed");
	return result;
}

function setFeedback(element, message, kind = "") {
	element.textContent = message;
	element.className = `feedback ${kind}`.trim();
}

function toast(message) {
	const el = $("#toast"); el.textContent = message; el.classList.add("show");
	clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 3200);
}

async function refresh() {
	try {
		const [status, result, templateResult] = await Promise.all([request("api/status"), request("api/servers"), request("api/templates")]);
		state.inviteUrl = status.inviteUrl;
		const invite = $("#invite-bot"); invite.href = status.inviteUrl ?? "#"; invite.hidden = !status.inviteUrl;
		const badge = $("#bot-status");
	if (status.connected) { badge.textContent = status.error ? `Connected · action needed` : `Connected · ${status.serverCount} server(s)`; badge.className = `save-state ${status.error ? "error" : "ready"}`; if (status.error) badge.title = status.error; else badge.removeAttribute("title"); }
		else if (status.configured) { badge.textContent = status.error ? "Connection error" : "Connecting…"; badge.className = `save-state ${status.error ? "error" : ""}`; }
		else { badge.textContent = "Token needed"; badge.className = "save-state"; }
		state.servers = result.servers;
		state.templates = templateResult.templates;
		renderServers();
		if (!state.currentId && state.servers.length) {
			const remembered = localStorage.getItem("discord-manager.server");
			selectServer(state.servers.some((server) => server.id === remembered) ? remembered : state.servers[0].id);
		}
		if (status.error) toast(status.error);
		state.destinationConfigs = Object.fromEntries(await Promise.all(state.servers.map(async (server) => {
			try { return [server.id, await request(`api/config?guildId=${encodeURIComponent(server.id)}`)]; }
			catch { return [server.id, null]; }
		})));
		renderDestinationServers();
	} catch (error) { $("#bot-status").textContent = "Manager unavailable"; }
}

function renderServers() {
	$("#server-count").textContent = `${state.servers.length} connected`;
	const list = $("#server-list");
	// Rebuilding the strip during the periodic refresh can cancel a touch scroll that started on it.
	const listKey = JSON.stringify([state.currentId, state.servers]);
	if (list.dataset.key !== listKey) list.replaceChildren();
	for (const server of list.dataset.key === listKey ? [] : state.servers) {
		const button = document.createElement("button"); button.className = `server-item ${server.id === state.currentId ? "active" : ""}`; button.type = "button";
		const icon = document.createElement("span"); icon.className = "server-icon";
		if (server.icon) { const img = document.createElement("img"); img.src = server.icon; img.alt = ""; icon.append(img); } else icon.textContent = server.name.slice(0, 1).toUpperCase();
		const name = document.createElement("span"); name.textContent = server.name; button.append(icon, name);
		button.addEventListener("click", () => selectServer(server.id)); list.append(button);
	}
	list.dataset.key = listKey;
	$("#no-server").hidden = state.servers.length > 0;
	$("#server-workspace").hidden = !state.currentId || !state.servers.some((s) => s.id === state.currentId);
	$("#mobile-sections").hidden = $("#server-workspace").hidden;
	if (state.currentId && !state.servers.some((s) => s.id === state.currentId)) { state.currentId = null; state.config = null; }
	renderDestinationServers();
}

async function selectServer(id) {
	if (layoutIsDirty() && !window.confirm("Switch servers and lose unsaved layout edits? Choose Save draft first to keep them.")) return;
	state.currentId = id; renderServers();
	localStorage.setItem("discord-manager.server", id);
	try {
		const config = await request(`api/config?guildId=${encodeURIComponent(id)}&includeMembers=1`);
		if (state.currentId !== id) return;
		state.config = config;
		state.originalConfig = structuredClone(config);
		if (config.layoutDraft) {
			state.config.layout = structuredClone(config.layoutDraft.layout);
			state.layoutOrigin = "Editing your saved draft";
		} else state.layoutOrigin = "Editing the current server setup";
		$("#active-server-name").textContent = state.config.guildName;
		renderConfig(); captureLayoutBaseline();
	} catch (error) { toast(error.message); }
}

// Editors add empty member maps and null access while rendering; ignore them when detecting edits.
function stableStringify(value) {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.keys(value).filter((key) => value[key] != null && !(typeof value[key] === "object" && !Array.isArray(value[key]) && !Object.keys(value[key]).length)).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
	return JSON.stringify(value ?? null);
}

function normalizeEditorLayout(layout) {
	return {
		...layout,
		categories: (layout?.categories ?? []).map((category) => ({ ...category, channels: (category.channels ?? []).map((channel) => typeof channel === "string" ? { name: channel, topic: "", type: "text", tags: [], access: null } : { ...channel, topic: channel.topic ?? "", type: channel.type ?? "text", tags: channel.tags ?? [], access: channel.access ?? null }) })),
		roles: (layout?.roles ?? []).map((role) => ({ ...role, permissions: role.permissions ?? [] })),
		categoryAccess: layout?.categoryAccess ?? {},
	};
}

// Captured after the saved layout renders, so defaults the editors fill in do not count as edits.
function captureLayoutBaseline() {
	state.layoutBaseline = state.config ? stableStringify(state.config.layout) : null;
	updateLayoutStatus();
}

function layoutIsDirty() {
	return Boolean(state.config && state.layoutBaseline) && stableStringify(state.config.layout) !== state.layoutBaseline;
}

function updateLayoutStatus() {
	const status = $("#layout-status");
	if (!state.config) { status.textContent = ""; return; }
	const draft = state.config.layoutDraft;
	const savedAt = draft?.savedAt ? new Date(draft.savedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : null;
	const dirty = layoutIsDirty();
	status.textContent = `${state.layoutOrigin ?? "Editing the current server setup"}.${savedAt ? ` Draft saved ${savedAt}.` : " No saved draft yet."}${dirty ? " Unsaved changes." : ""}`;
	status.classList.toggle("dirty", dirty);
	$("#layout-source").querySelector("option[value='draft']").disabled = !draft;
	if (!draft && $("#layout-source").value === "draft") $("#layout-source").value = "default";
	$("#discard-draft").disabled = !draft;
}
let layoutStatusFrame = 0;
function queueLayoutStatus() {
	cancelAnimationFrame(layoutStatusFrame);
	layoutStatusFrame = requestAnimationFrame(updateLayoutStatus);
}

// Templates without Discord IDs reuse the IDs already applied to this server, so loading the
// default layout matches existing channels and roles by name instead of looking like deletions.
function adoptAppliedIds(layout, applied) {
	const roleIds = new Map((applied?.roles ?? []).filter((role) => role.roleId).map((role) => [role.name.toLowerCase(), role.roleId]));
	for (const role of layout.roles) role.roleId ??= roleIds.get(role.name.toLowerCase());
	const appliedCategories = new Map((applied?.categories ?? []).map((category) => [category.name.toLowerCase(), category]));
	for (const category of layout.categories) {
		const match = appliedCategories.get(category.name.toLowerCase());
		if (!match) continue;
		category.categoryId ??= match.categoryId;
		const channelIds = new Map((match.channels ?? []).filter((channel) => channel.channelId).map((channel) => [channel.name.toLowerCase(), channel.channelId]));
		for (const channel of category.channels) channel.channelId ??= channelIds.get(channel.name.toLowerCase());
	}
	return layout;
}

async function loadLayout(source) {
	if (!state.config) return;
	if (layoutIsDirty() && !window.confirm("Replace your unsaved layout edits with this template?")) return;
	const button = $("#load-layout"); button.disabled = true;
	try {
		if (source === "draft") {
			if (!state.config.layoutDraft) throw new Error("This server has no saved draft yet.");
			state.config.layout = structuredClone(state.config.layoutDraft.layout);
			state.layoutOrigin = "Editing your saved draft";
		} else if (source === "default") {
			const { layout } = await request("api/layout/default");
			state.config.layout = adoptAppliedIds(normalizeEditorLayout(layout), state.originalConfig.layout);
			state.layoutOrigin = "Editing the Rites default setup";
		} else {
			state.config.layout = structuredClone(state.originalConfig.layout);
			state.layoutOrigin = "Editing the current server setup";
		}
		renderCategories(); renderRoles(); renderMemberRoleTools(); updateLayoutStatus();
		toast("Template loaded. Choose Save draft to keep it.");
	} catch (error) { toast(error.message); }
	finally { button.disabled = false; }
}

async function saveLayoutDraft() {
	if (!state.config) return;
	const layout = structuredClone(state.config.layout);
	const result = await request("api/layout/draft", { method: "PUT", body: JSON.stringify({ guildId: state.currentId, layout }) });
	state.config.layoutDraft = { layout, savedAt: result.savedAt };
	if (!/draft/u.test(state.layoutOrigin ?? "")) state.layoutOrigin = "Editing your saved draft";
	await saveConfig();
	captureLayoutBaseline();
	toast(result.message);
}

async function discardLayoutDraft() {
	if (!state.config?.layoutDraft || !window.confirm("Discard the saved draft for this server and reload the current server setup?")) return;
	try {
		const result = await request(`api/layout/draft?guildId=${encodeURIComponent(state.currentId)}`, { method: "DELETE" });
		state.config.layoutDraft = null;
		state.config.layout = structuredClone(state.originalConfig.layout);
		state.layoutOrigin = "Editing the current server setup";
		renderCategories(); renderRoles(); renderMemberRoleTools(); captureLayoutBaseline();
		toast(result.message);
	} catch (error) { toast(error.message); }
}

function option(value, label, selected = false) {
	const opt = document.createElement("option"); opt.value = value; opt.textContent = label; opt.selected = selected; return opt;
}

function makeMemberAccessEditor(access, mode) {
	const editor = document.createElement("div"); editor.className = "member-access-editor";
	access.members ??= {};
	const choices = mode === "category" ? [["view", "View and send"], ["hidden", "No access"]] : [["view", "View and send"], ["read", "Read only"], ["hidden", "No access"]];
	const render = () => {
		editor.replaceChildren();
		const list = document.createElement("div"); list.className = "member-access-list";
		for (const [memberId, rule] of Object.entries(access.members)) {
			const row = document.createElement("div"); row.className = "member-access-row";
			const member = state.config.availableMembers?.find((candidate) => candidate.id === memberId);
			const label = document.createElement("span"); label.textContent = member ? `${member.name} · ${member.username} · ${memberId}` : `Member ${memberId} (not loaded)`;
			const select = document.createElement("select"); select.setAttribute("aria-label", `Access for ${member?.name ?? memberId}`);
			for (const [value, text] of choices) select.append(option(value, text, rule === value));
			select.addEventListener("change", () => { access.members[memberId] = select.value; });
			const remove = makeButton("Remove access", "small-button danger", () => { delete access.members[memberId]; render(); });
			row.append(label, select, remove); list.append(row);
		}
		const addRow = document.createElement("div"); addRow.className = "member-access-add";
		const picker = document.createElement("select"); picker.setAttribute("aria-label", "Choose a server member"); picker.append(option("", "Choose a member…"));
		for (const member of state.config.availableMembers ?? []) {
			if (Object.hasOwn(access.members, member.id)) continue;
			picker.append(option(member.id, `${member.name} · ${member.username} · ${member.id}`));
		}
		const add = makeButton("Grant access", "small-button", () => {
			if (!picker.value) return;
			access.members[picker.value] = "view";
			render();
		});
		addRow.append(picker, add);
		const note = document.createElement("span"); note.className = "field-hint"; note.textContent = "Remove a member here to revoke this explicit override.";
		editor.append(list, addRow, note);
	};
	render();
	return editor;
}

function fillChannelSelect(select, selectedId, includeDefault = true, channels = state.config.channels) {
	select.replaceChildren();
	if (includeDefault) select.append(option("", "Use server default / not set", !selectedId));
	for (const channel of channels) select.append(option(channel.id, `# ${channel.name}${channel.parentName ? ` · ${channel.parentName}` : ""}${channel.type === 5 ? " · announcements" : ""}`, channel.id === selectedId));
}

function renderConfig() {
	if (!state.config) return;
	fillChannelSelect($("#default-announcement"), state.config.announcementChannelId, true, state.config.channels.filter((channel) => channel.type === 0 || channel.type === 5));
	fillChannelSelect($("#ticket-support"), state.config.tickets.channelId, true, state.config.channels.filter((channel) => channel.type === 0));
	fillChannelSelect($("#ticket-log"), state.config.tickets.logChannelId, true, state.config.channels.filter((channel) => channel.type === 0));
	const rolesSelect = $("#ticket-staff"); rolesSelect.replaceChildren();
	for (const role of state.config.availableRoles) {
		const label = document.createElement("label"); const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.value = role.id; checkbox.checked = state.config.tickets.moderatorRoleIds.includes(role.id);
		const text = document.createElement("span"); text.textContent = role.name; label.append(checkbox, text); rolesSelect.append(label);
	}
	$("#ticket-opening").value = state.config.tickets.openingMessage;
	$("#ticket-welcome").value = state.config.tickets.welcomeMessage;
	$("#ticket-retention").value = state.config.tickets.retentionHours ?? 168;
	renderTicketTypes();
	renderCategories(); renderRoles(); renderMemberRoleTools(); renderDestinationServers(); renderMessageTemplates(); updateLayoutStatus();
}

function renderTicketTypes() {
	const list = $("#ticket-types"); list.replaceChildren();
	state.config.tickets.types ??= [
		{ id: "new-client-inquiry", label: "New Client Inquiry" },
		{ id: "project-support", label: "Project Support" },
		{ id: "billing", label: "Billing" },
		{ id: "partnership", label: "Partnership" },
	];
	state.config.tickets.types.forEach((type, index) => {
		const row = document.createElement("div"); row.className = "ticket-type-row";
		const label = document.createElement("input"); label.value = type.label; label.maxLength = 80; label.setAttribute("aria-label", `Ticket type ${index + 1}`); label.addEventListener("input", () => { type.label = label.value; });
		const remove = makeButton("Remove", "small-button danger", () => { state.config.tickets.types.splice(index, 1); renderTicketTypes(); }); remove.disabled = state.config.tickets.types.length === 1;
		row.append(label, remove); list.append(row);
	});
	$("#add-ticket-type").disabled = state.config.tickets.types.length >= 25;
}

function renderMessageTemplates() {
	const templateSelect = $("#message-template");
	const selectedTemplateId = templateSelect.value;
	templateSelect.replaceChildren(option("", "Choose a message…"));
	for (const template of state.templates) templateSelect.append(option(template.id, template.name, template.id === selectedTemplateId));
	const template = state.templates.find((item) => item.id === templateSelect.value);
	$("#message-preview").value = template?.content ?? "";
	$("#copy-message-template").disabled = !template;
	const channelSelect = $("#message-channel");
	const selectedChannelId = channelSelect.value;
	channelSelect.replaceChildren(option("", "Choose a destination channel…"));
	for (const channel of state.config.channels.filter((item) => item.type === 0 || item.type === 5)) {
		channelSelect.append(option(channel.id, `#${channel.name}${channel.parentName ? ` · ${channel.parentName}` : ""}`, channel.id === selectedChannelId));
	}
	$("#post-message-template").disabled = !template || !channelSelect.value;
}

function renderMemberRoleTools() {
	const picker = $("#managed-member"); const options = $("#managed-member-roles");
	if (!picker || !options) return;
	const members = state.config.availableMembers ?? [];
	picker.replaceChildren(option("", members.length ? "Choose a member…" : "No members found"));
	for (const member of members) picker.append(option(member.id, `${member.name} · ${member.username}`, member.id === state.selectedMemberId));
	if (!members.some((member) => member.id === state.selectedMemberId)) state.selectedMemberId = members[0]?.id ?? null;
	if (state.selectedMemberId) picker.value = state.selectedMemberId;
	const renderOptions = () => {
		state.selectedMemberId = picker.value || null;
		const member = members.find((candidate) => candidate.id === state.selectedMemberId);
		options.replaceChildren();
		for (const role of state.config.layout.roles) {
			const label = document.createElement("label"); const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.value = role.roleId ?? ""; checkbox.checked = Boolean(role.roleId && member?.roleIds.includes(role.roleId)); checkbox.disabled = !role.roleId || !member;
			const text = document.createElement("span"); text.textContent = role.roleId ? role.name : `${role.name} · apply layout first`; label.append(checkbox, text); options.append(label);
		}
		$("#save-member-roles").disabled = !member;
		$("#approve-member").disabled = !member || !state.config.layout.roles.some((role) => role.name.toLowerCase() === "pending" && role.roleId) || !state.config.layout.roles.some((role) => role.name.toLowerCase() === "network member" && role.roleId);
	};
	picker.onchange = renderOptions;
	renderOptions();
}

async function saveMemberRoles(approve = false) {
	const memberId = $("#managed-member").value;
	const roleIds = [...$("#managed-member-roles").querySelectorAll("input:checked")].map((checkbox) => checkbox.value);
	const feedback = $("#member-role-feedback");
	try {
		const result = await request("api/members/roles", { method: "POST", body: JSON.stringify({ guildId: state.currentId, memberId, roleIds, approve }) });
		const member = (state.config.availableMembers ?? []).find((candidate) => candidate.id === memberId);
		member.roleIds = result.roleIds;
		setFeedback(feedback, result.message, "success"); renderMemberRoleTools();
	} catch (error) { setFeedback(feedback, error.message, "error"); }
}

function renderCategories(focusTarget = null) {
	const pageScrollTop = window.scrollY;
	const panel = $(".main-panel");
	const panelScrollTop = panel.scrollTop;
	const activeElement = document.activeElement;
	const focusKey = focusTarget ?? activeElement?.dataset.focusKey ?? null;
	const selection = activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement
		? [activeElement.selectionStart, activeElement.selectionEnd]
		: null;
	const container = $("#categories");
	const openDetails = [...container.querySelectorAll("details[open][data-details-key]")].map((item) => item.dataset.detailsKey);
	container.replaceChildren();
	state.config.layout.categories.forEach((category, categoryIndex) => {
		const card = document.createElement("div"); card.className = "category-card";
		const head = document.createElement("div"); head.className = "category-head";
		category.channels = category.channels.map((channel) => typeof channel === "string" ? { name: channel, topic: "", type: "text", tags: [], access: null } : { ...channel, type: channel.type ?? "text", tags: channel.tags ?? [], access: channel.access ?? null });
		let previousName = category.name;
		const name = document.createElement("input"); name.value = category.name; name.setAttribute("aria-label", "Category name"); name.dataset.categoryName = categoryIndex; name.dataset.focusKey = `category-name-${categoryIndex}`;
		name.addEventListener("input", () => {
			category.name = name.value;
			const access = state.config.layout.categoryAccess ??= {};
			if (access[previousName] && previousName !== name.value) { access[name.value] = access[previousName]; delete access[previousName]; }
			previousName = name.value;
		});
		name.addEventListener("change", () => { renderCategories(); renderMemberRoleTools(); });
		const add = makeButton("+ Channel", "small-button", () => { const newIndex = category.channels.length; category.channels.push({ name: "new-channel", topic: "", type: "text", tags: [], access: null }); renderCategories(`channel-name-${categoryIndex}-${newIndex}`); });
		add.dataset.focusKey = `add-channel-${categoryIndex}`;
		const remove = makeButton("Remove", "small-button danger", () => { state.config.layout.categories.splice(categoryIndex, 1); delete (state.config.layout.categoryAccess ?? {})[category.name]; const nextIndex = Math.min(categoryIndex, state.config.layout.categories.length - 1); renderCategories(nextIndex >= 0 ? `category-name-${nextIndex}` : "add-category"); });
		head.append(name, add, remove); card.append(head);
		const access = state.config.layout.categoryAccess ??= {};
		const accessRule = access[category.name] ??= { everyone: "view", roles: {} };
		const categoryAccessDetails = document.createElement("details"); categoryAccessDetails.className = "category-access-details"; categoryAccessDetails.dataset.detailsKey = `category-access-${categoryIndex}`;
		const categoryAccessSummary = document.createElement("summary"); categoryAccessSummary.textContent = "Category access settings"; categoryAccessDetails.append(categoryAccessSummary);
		const accessControls = document.createElement("div"); accessControls.className = "access-controls";
		const visibility = document.createElement("select"); visibility.setAttribute("aria-label", "Category visibility");
		visibility.append(option("view", "Visible to everyone", accessRule.everyone !== "hidden"), option("hidden", "Private from everyone", accessRule.everyone === "hidden"));
		visibility.addEventListener("change", () => accessRule.everyone = visibility.value);
		const visibleRoles = document.createElement("div"); visibleRoles.className = "access-role-list";
		for (const role of state.config.layout.roles) {
			const label = document.createElement("label"); const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = accessRule.roles?.[role.name] === "view";
			checkbox.addEventListener("change", () => { accessRule.roles ??= {}; if (checkbox.checked) accessRule.roles[role.name] = "view"; else delete accessRule.roles[role.name]; });
			const text = document.createElement("span"); text.textContent = role.name; label.append(checkbox, text); visibleRoles.append(label);
		}
		const roleLabel = document.createElement("span"); roleLabel.textContent = "Roles with access";
		accessControls.append(visibility, roleLabel, visibleRoles); categoryAccessDetails.append(accessControls);
		const categoryMembers = document.createElement("details"); categoryMembers.className = "member-access-details"; categoryMembers.dataset.detailsKey = `category-members-${categoryIndex}`;
		const categoryMembersSummary = document.createElement("summary"); categoryMembersSummary.textContent = "Named member access";
		categoryMembers.append(categoryMembersSummary, makeMemberAccessEditor(accessRule, "category")); categoryAccessDetails.append(categoryMembers); card.append(categoryAccessDetails);
		const channelList = document.createElement("div"); channelList.className = "channel-list";
		category.channels.forEach((channel, channelIndex) => {
			const channelItem = document.createElement("div"); channelItem.className = "channel-item";
			const row = document.createElement("div"); row.className = "channel-row";
			const channelAccess = channel.access ??= { everyone: "inherit", roles: {} };
			const channelName = document.createElement("input"); channelName.value = channel.name; channelName.placeholder = "channel-name"; channelName.setAttribute("aria-label", "Channel name"); channelName.dataset.channelName = `${categoryIndex}-${channelIndex}`; channelName.dataset.focusKey = `channel-name-${categoryIndex}-${channelIndex}`;
			channelName.addEventListener("input", () => { channel.name = channelName.value; });
			const type = document.createElement("select"); type.setAttribute("aria-label", "Channel type"); type.dataset.channelType = `${categoryIndex}-${channelIndex}`; type.dataset.focusKey = `channel-type-${categoryIndex}-${channelIndex}`;
			type.append(option("text", "Text", channel.type === "text"), option("announcement", "Announcement", channel.type === "announcement"), option("forum", "Forum", channel.type === "forum"));
			type.addEventListener("change", () => { channel.type = type.value; renderCategories(`channel-type-${categoryIndex}-${channelIndex}`); });
			const topic = document.createElement("input"); topic.className = "channel-topic"; topic.value = channel.topic ?? ""; topic.placeholder = "Optional channel description"; topic.setAttribute("aria-label", "Channel description");
			topic.addEventListener("input", () => { channel.topic = topic.value; });
			let tags = null;
			if (channel.type === "forum") {
				tags = document.createElement("input"); tags.className = "channel-tags"; tags.value = channel.tags.join(", "); tags.placeholder = "Forum tags, comma separated"; tags.setAttribute("aria-label", "Forum tags");
				tags.addEventListener("input", () => { channel.tags = tags.value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20); });
			}
			const advanced = document.createElement("details"); advanced.className = "channel-advanced"; advanced.dataset.detailsKey = `channel-advanced-${categoryIndex}-${channelIndex}`;
			const advancedSummary = document.createElement("summary"); advancedSummary.textContent = channel.type === "forum" ? "Description and forum tags" : "Channel description"; advanced.append(advancedSummary, topic); if (tags) advanced.append(tags);
			const del = makeButton("Delete", "small-button danger", () => { category.channels.splice(channelIndex, 1); const nextIndex = Math.min(channelIndex, category.channels.length - 1); renderCategories(nextIndex >= 0 ? `channel-name-${categoryIndex}-${nextIndex}` : `category-name-${categoryIndex}`); }); del.setAttribute("aria-label", "Remove channel");
			row.append(channelName, type, advanced, del); channelItem.append(row);
			const accessDetails = document.createElement("details"); accessDetails.className = "channel-access"; accessDetails.dataset.detailsKey = `channel-access-${categoryIndex}-${channelIndex}`;
			const accessSummary = document.createElement("summary"); accessSummary.textContent = "Channel access overrides"; accessDetails.append(accessSummary); const botHint = document.createElement("p"); botHint.className = "field-hint"; botHint.textContent = "The bot always keeps access to channels it manages."; accessDetails.append(botHint);
			const accessGrid = document.createElement("div"); accessGrid.className = "channel-access-grid";
			const everyoneLabel = document.createElement("label"); everyoneLabel.textContent = "@everyone";
			const everyoneSelect = document.createElement("select"); everyoneSelect.setAttribute("aria-label", "Channel access for everyone");
			everyoneSelect.append(option("inherit", "Use category defaults", !channelAccess.everyone || channelAccess.everyone === "inherit"), option("read", "Read only", channelAccess.everyone === "read"), option("view", "View and send", channelAccess.everyone === "view"), option("hidden", "No access", channelAccess.everyone === "hidden"));
			everyoneSelect.addEventListener("change", () => { channelAccess.everyone = everyoneSelect.value; }); everyoneLabel.append(everyoneSelect); accessGrid.append(everyoneLabel);
			for (const role of state.config.layout.roles) {
				const label = document.createElement("label"); label.textContent = role.name;
				const select = document.createElement("select"); select.setAttribute("aria-label", `Channel access for ${role.name}`);
				const rule = channelAccess.roles?.[role.name] ?? "inherit";
				select.append(option("inherit", "Use category defaults", rule === "inherit"), option("read", "Read only", rule === "read"), option("view", "View and send", rule === "view"), option("hidden", "No access", rule === "hidden"));
				select.addEventListener("change", () => { channelAccess.roles ??= {}; channelAccess.roles[role.name] = select.value; }); label.append(select); accessGrid.append(label);
			}
			accessDetails.append(accessGrid, makeMemberAccessEditor(channelAccess, "channel")); channelItem.append(accessDetails); channelList.append(channelItem);
		});
		card.append(channelList); container.append(card);
	});
	for (const key of openDetails) {
		const details = [...container.querySelectorAll("details[data-details-key]")].find((item) => item.dataset.detailsKey === key);
		if (details) details.open = true;
	}
	if (focusKey === "add-category") $("#add-category")?.focus({ preventScroll: true });
	else if (focusKey) {
		const nextFocus = [...container.querySelectorAll("[data-focus-key]")].find((item) => item.dataset.focusKey === focusKey);
		nextFocus?.focus({ preventScroll: true });
		if (selection && nextFocus instanceof HTMLInputElement) nextFocus.setSelectionRange(...selection);
	}
	window.scrollTo({ top: pageScrollTop, behavior: "instant" });
	panel.scrollTop = panelScrollTop;
}

function renderRoles(focusRole = null) {
	const pageScrollTop = window.scrollY;
	const panel = $(".main-panel");
	const panelScrollTop = panel.scrollTop;
	const container = $("#roles"); container.replaceChildren();
	state.config.layout.roles.forEach((role, index) => {
		const row = document.createElement("div"); row.className = "role-row";
		let previousName = role.name;
		const name = document.createElement("input"); name.value = role.name; name.placeholder = "Role name"; name.setAttribute("aria-label", "Role name"); name.dataset.roleName = index; name.addEventListener("input", () => {
			role.name = name.value;
			for (const rules of Object.values(state.config.layout.categoryAccess ?? {})) {
				if (rules.roles?.[previousName]) { rules.roles[name.value] = rules.roles[previousName]; delete rules.roles[previousName]; }
			}
			for (const category of state.config.layout.categories) for (const channel of category.channels) {
				if (channel.access?.roles?.[previousName]) { channel.access.roles[name.value] = channel.access.roles[previousName]; delete channel.access.roles[previousName]; }
			}
			previousName = name.value;
		});
		name.addEventListener("change", renderCategories);
		const permissions = document.createElement("div"); permissions.className = "permission-options"; permissions.setAttribute("aria-label", "Role permissions");
		for (const [value, labelText] of rolePermissionOptions) {
			const label = document.createElement("label"); const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = (role.permissions ?? []).includes(value);
			checkbox.addEventListener("change", () => { role.permissions ??= []; role.permissions = checkbox.checked ? [...new Set([...role.permissions, value])] : role.permissions.filter((permission) => permission !== value); });
			const text = document.createElement("span"); text.textContent = labelText; label.append(checkbox, text); permissions.append(label);
		}
		const del = makeButton("Remove", "small-button danger", () => {
			state.config.layout.roles.splice(index, 1);
			for (const rules of Object.values(state.config.layout.categoryAccess ?? {})) delete rules.roles?.[role.name];
			for (const category of state.config.layout.categories) for (const channel of category.channels) delete channel.access?.roles?.[role.name];
			const nextIndex = Math.min(index, state.config.layout.roles.length - 1);
			renderRoles(nextIndex >= 0 ? nextIndex : null); renderCategories(); renderMemberRoleTools();
		});
		const moveUp = makeButton("↑", "small-button", () => { if (index === 0) return; [state.config.layout.roles[index - 1], state.config.layout.roles[index]] = [state.config.layout.roles[index], state.config.layout.roles[index - 1]]; renderRoles(index - 1); renderCategories(); renderMemberRoleTools(); });
		const moveDown = makeButton("↓", "small-button", () => { if (index >= state.config.layout.roles.length - 1) return; [state.config.layout.roles[index + 1], state.config.layout.roles[index]] = [state.config.layout.roles[index], state.config.layout.roles[index + 1]]; renderRoles(index + 1); renderCategories(); renderMemberRoleTools(); });
		moveUp.setAttribute("aria-label", "Move role up"); moveDown.setAttribute("aria-label", "Move role down");
		moveUp.disabled = index === 0; moveDown.disabled = index === state.config.layout.roles.length - 1;
		row.append(name, permissions, moveUp, moveDown, del); container.append(row);
	});
	if (focusRole !== null) container.querySelector(`[data-role-name="${focusRole}"]`)?.focus({ preventScroll: true });
	window.scrollTo({ top: pageScrollTop, behavior: "instant" });
	panel.scrollTop = panelScrollTop;
}

function makeButton(text, className, action) { const button = document.createElement("button"); button.type = "button"; button.className = className; button.textContent = text; button.addEventListener("click", action); return button; }

function renderDestinationServers() {
	const container = $("#destination-servers"); if (!container) return;
	const previousServers = new Set([...container.querySelectorAll(".destination-server-check:checked")].map((x) => x.value));
	const previousChannels = new Set([...container.querySelectorAll(".destination-channel-check:checked")].map((x) => x.value));
	const hadSelections = container.childElementCount > 0;
	container.replaceChildren();
	for (const server of state.servers) {
		const card = document.createElement("div"); card.className = "destination-card";
		const title = document.createElement("label"); title.className = "destination-title";
		const check = document.createElement("input"); check.type = "checkbox"; check.className = "destination-server-check"; check.value = server.id; check.checked = server.id === state.currentId;
		check.disabled = $("#all-servers").checked;
		check.checked = hadSelections ? previousServers.has(server.id) : server.id === state.currentId;
		const name = document.createElement("span"); name.textContent = server.name; title.append(check, name); card.append(title);
		const channels = (state.destinationConfigs[server.id]?.channels ?? []).filter((channel) => channel.type === 0 || channel.type === 5);
		const channelWrap = document.createElement("div"); channelWrap.className = "destination-channels";
		if (channels.length) for (const channel of channels) {
			const label = document.createElement("label"); const box = document.createElement("input"); box.type = "checkbox"; box.className = "destination-channel-check"; box.value = channel.id; box.dataset.guildId = server.id; box.disabled = $("#all-channels").checked || $("#all-servers").checked; box.checked = previousChannels.has(channel.id);
			const text = document.createElement("span"); text.textContent = `#${channel.name}`; label.append(box, text); channelWrap.append(label);
		} else { const hint = document.createElement("span"); hint.className = "field-hint"; hint.textContent = "Load this server to choose individual channels; otherwise its default announcement channel is used."; channelWrap.append(hint); }
		card.append(channelWrap); container.append(card);
	}
}

function hideRoleSuggestions() {
	const list = $("#role-suggestions"); list.hidden = true; list.replaceChildren();
}

let previousAnnouncementValue = "";
let announcementSelection = { start: 0, end: 0 };
function saveAnnouncementSelection() {
	const input = $("#announcement-message");
	announcementSelection = { start: input.selectionStart, end: input.selectionEnd };
}
document.addEventListener("selectionchange", () => {
	if (document.activeElement === $("#announcement-message")) saveAnnouncementSelection();
});
function updateAnnouncementCount() {
	const length = $("#announcement-message").value.length;
	const count = $("#announcement-count");
	count.textContent = `${length.toLocaleString()} / 2,000 characters`;
	count.classList.toggle("over-limit", length > 2000);
}
function replaceAnnouncementSelection(style) {
	const input = $("#announcement-message");
	const { start, end } = announcementSelection;
	if (start === end) { input.focus(); input.setSelectionRange(start, end); return; }
	const selected = input.value.slice(start, end);
	const converted = mapTextOutsideRoleMentions(selected, style);
	input.setRangeText(converted, start, end, "select");
	previousAnnouncementValue = input.value;
	announcementSelection = { start, end: start + converted.length };
	updateAnnouncementCount();
	updateRoleSuggestions();
	input.focus();
}

function updateRoleSuggestions() {
	const input = $("#announcement-message");
	const beforeCursor = input.value.slice(0, input.selectionStart);
	const match = beforeCursor.match(/(^|\s)@([^\s@]*)$/u);
	const list = $("#role-suggestions");
	if (!match) return hideRoleSuggestions();
	const query = mapFontText(match[2], "normal").toLocaleLowerCase();
	const roles = (state.config?.availableRoles ?? []).filter((role) => role.name.toLocaleLowerCase().includes(query)).slice(0, 8);
	list.replaceChildren();
	if (!roles.length) {
		const empty = document.createElement("div"); empty.className = "role-suggestion-empty"; empty.textContent = state.currentId ? "No matching roles" : "Select a server to load roles"; list.append(empty);
	} else for (const role of roles) {
		const button = document.createElement("button"); button.type = "button"; button.className = "role-suggestion"; button.setAttribute("role", "option");
		const name = document.createElement("span"); name.textContent = role.name;
		const hint = document.createElement("small"); hint.textContent = "Mention role"; button.append(name, hint);
		button.addEventListener("mousedown", (event) => event.preventDefault());
		button.addEventListener("click", () => {
			const start = input.selectionStart;
			const startOfMention = start - match[2].length - 1;
			const token = `<@&${role.id}>`;
			const needsSpace = input.value[start] && !/\s/u.test(input.value[start]);
			const insertion = `${token}${needsSpace ? " " : ""}`;
			input.setRangeText(insertion, startOfMention, start, "end");
			state.roleMentions.set(role.id, { id: role.id, guildId: state.currentId, name: role.name });
			hideRoleSuggestions(); input.focus();
		});
		list.append(button);
	}
	list.hidden = false;
}

async function saveConfig() {
	if (!state.config) return;
	// The editor layout is a draft; only Apply setup replaces the server's saved layout.
	const config = { ...collectConfig(), layout: structuredClone(state.originalConfig.layout), layoutDraft: undefined };
	const result = await request("api/config", { method: "PUT", body: JSON.stringify(config) });
	state.originalConfig = structuredClone(config);
	toast(result.message); return result;
}

function collectConfig() {
	state.config.announcementChannelId = $("#default-announcement").value || null;
	state.config.tickets = {
		enabled: true,
		channelId: $("#ticket-support").value || null,
		logChannelId: $("#ticket-log").value || null,
		retentionHours: Number($("#ticket-retention").value),
		openingMessage: $("#ticket-opening").value,
		welcomeMessage: $("#ticket-welcome").value,
		types: state.config.tickets.types,
		moderatorRoleIds: [...document.querySelectorAll("#ticket-staff input:checked")].map((x) => x.value),
		records: state.config.tickets.records ?? {},
	};
	return structuredClone(state.config);
}

$("#refresh").addEventListener("click", refresh);
$("#settings-button").addEventListener("click", () => $("#token-dialog").showModal());
$("#invite-menu-button").addEventListener("click", () => $("#invite-dialog").showModal());
$("#close-invite-dialog").addEventListener("click", () => $("#invite-dialog").close());
$("#server-invite-link").addEventListener("input", () => {
	$("#authorize-bot").hidden = true;
	setFeedback($("#invite-feedback"), "");
});
$("#server-invite-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	const button = $("#resolve-server-invite");
	const feedback = $("#invite-feedback");
	const authorize = $("#authorize-bot");
	authorize.hidden = true;
	button.disabled = true;
	setFeedback(feedback, "Checking invite…");
	try {
		if (!state.inviteUrl) throw new Error("Connect the bot first, then paste the server invite again.");
		const server = await request("api/invites/resolve", { method: "POST", body: JSON.stringify({ inviteUrl: $("#server-invite-link").value }) });
		const authorization = new URL(state.inviteUrl);
		authorization.searchParams.set("guild_id", server.guildId);
		// The invite already identifies the destination; skip Discord's server
		// picker, which can glitch while opening in some browser setups.
		authorization.searchParams.set("disable_guild_select", "true");
		authorize.href = authorization.href;
		authorize.hidden = false;
		setFeedback(feedback, `Found ${server.guildName}. Continue to Discord to add the bot.`, "success");
	} catch (error) {
		if ((error.name === "TimeoutError" || error.name === "AbortError" || /invite lookup timed out|could not reach discord/i.test(error.message)) && state.inviteUrl) {
			authorize.href = state.inviteUrl;
			authorize.hidden = false;
			setFeedback(feedback, "Discord could not verify the invite. You can still authorize the bot and select the server in Discord.", "error");
		} else {
			setFeedback(feedback, error.message, "error");
		}
	} finally {
		button.disabled = false;
	}
});
$("#token-form").addEventListener("submit", async (event) => {
	event.preventDefault(); const feedback = $("#token-feedback");
	try { const result = await request("api/credentials", { method: "PUT", body: JSON.stringify({ token: $("#bot-token").value }) }); setFeedback(feedback, result.message, "success"); $("#bot-token").value = ""; setTimeout(() => $("#token-dialog").close(), 800); setTimeout(refresh, 1200); }
	catch (error) { setFeedback(feedback, error.message, "error"); }
});

const mobileNavigation = window.matchMedia("(max-width: 760px)");
function placeSectionNavigation() {
	const tabs = $("#section-tabs");
	if (mobileNavigation.matches) $("#mobile-sections").append(tabs);
	else $("#server-workspace").insertBefore(tabs, $("#layout-panel"));
}
mobileNavigation.addEventListener("change", placeSectionNavigation);
placeSectionNavigation();

document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
	document.querySelectorAll(".tab").forEach((item) => {
		item.classList.toggle("active", item === tab);
		item.setAttribute("aria-pressed", String(item === tab));
	});
	document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === tab.dataset.panel));
}));

$("#add-category").addEventListener("click", () => { const newIndex = state.config.layout.categories.length; state.config.layout.categories.push({ name: "NEW CATEGORY", channels: [] }); renderCategories(`category-name-${newIndex}`); });
$("#add-role").addEventListener("click", () => { const newIndex = state.config.layout.roles.length; state.config.layout.roles.push({ name: "New Role", permissions: [] }); renderRoles(newIndex); renderCategories(); renderMemberRoleTools(); });
$("#save-member-roles").addEventListener("click", () => saveMemberRoles());
$("#approve-member").addEventListener("click", () => {
	if (!window.confirm("Approve this member by removing Pending and assigning Network Member?")) return;
	saveMemberRoles(true);
});
$("#save-layout").addEventListener("click", async () => {
	const button = $("#save-layout"); button.disabled = true;
	try { await saveLayoutDraft(); } catch (error) { toast(error.message); } finally { button.disabled = false; }
});
$("#load-layout").addEventListener("click", () => loadLayout($("#layout-source").value));
$("#discard-draft").addEventListener("click", discardLayoutDraft);
for (const type of ["input", "change", "click"]) $("#layout-panel").addEventListener(type, queueLayoutStatus);
window.addEventListener("beforeunload", (event) => { if (layoutIsDirty()) event.preventDefault(); });
$("#save-tickets").addEventListener("click", async () => { try { await saveConfig(); setFeedback($("#ticket-feedback"), "Ticket setup saved.", "success"); } catch (error) { setFeedback($("#ticket-feedback"), error.message, "error"); } });
$("#add-ticket-type").addEventListener("click", () => {
	if (state.config.tickets.types.length >= 25) return;
	state.config.tickets.types.push({ id: `custom-${crypto.randomUUID().slice(0, 8)}`, label: "New ticket type" }); renderTicketTypes();
});
$("#apply-layout").addEventListener("click", async () => {
	const button = $("#apply-layout"); button.disabled = true;
	try {
		const config = collectConfig();
		const previousChannels = new Set(state.originalConfig?.managedIds?.channelIds ?? []);
		const nextChannels = new Set(config.layout.categories.flatMap((category) => category.channels.map((channel) => channel.channelId).filter(Boolean)));
		const previousCategories = new Set(state.originalConfig?.managedIds?.categoryIds ?? []);
		const nextCategories = new Set(config.layout.categories.map((category) => category.categoryId).filter(Boolean));
		const previousRoles = new Set(state.originalConfig?.managedIds?.roleIds ?? []);
		const nextRoles = new Set(config.layout.roles.map((role) => role.roleId).filter(Boolean));
		const willRemove = [...previousChannels].some((id) => !nextChannels.has(id)) || [...previousCategories].some((id) => !nextCategories.has(id)) || [...previousRoles].some((id) => !nextRoles.has(id));
		if (willRemove && !window.confirm("Apply these changes and delete managed channels and roles removed from this layout? Nonempty categories will be kept. Removing a role also removes it from its members.")) return;
		const result = await request("api/setup/apply", { method: "POST", body: JSON.stringify({ guildId: state.currentId, config }) });
		state.config = { ...state.config, ...result.config, layoutDraft: null }; state.originalConfig = structuredClone(state.config); state.layoutOrigin = "Editing the current server setup"; renderConfig(); captureLayoutBaseline(); toast(result.message);
	}
	catch (error) { toast(error.message); } finally { button.disabled = false; }
});
$("#sync-command").addEventListener("click", async () => { try { const result = await request("api/commands/sync", { method: "POST", body: "{}" }); toast(result.message); } catch (error) { toast(error.message); } });
$("#post-ticket-panel").addEventListener("click", async () => {
	if (!$("#ticket-support").value) {
		setFeedback($("#ticket-feedback"), "Choose a regular text channel above. The panel will be posted there.", "error");
		$("[data-panel='tickets-panel']").click(); $("#ticket-support").focus(); return;
	}
	try { await saveConfig(); const result = await request("api/tickets/panel", { method: "POST", body: JSON.stringify({ guildId: state.currentId }) }); setFeedback($("#ticket-feedback"), result.message, "success"); }
	catch (error) { setFeedback($("#ticket-feedback"), error.message, "error"); }
});

$("#message-template").addEventListener("change", renderMessageTemplates);
$("#message-channel").addEventListener("change", renderMessageTemplates);
$("#copy-message-template").addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText($("#message-preview").value);
		setFeedback($("#message-feedback"), "Message copied.", "success");
	} catch (error) { setFeedback($("#message-feedback"), `Could not copy this message: ${error.message}`, "error"); }
});
$("#post-message-template").addEventListener("click", async () => {
	const button = $("#post-message-template");
	button.disabled = true;
	try {
		const result = await request("api/templates/post", { method: "POST", body: JSON.stringify({ guildId: state.currentId, templateId: $("#message-template").value, channelId: $("#message-channel").value }) });
		setFeedback($("#message-feedback"), result.message, "success");
	} catch (error) { setFeedback($("#message-feedback"), error.message, "error"); }
	finally { button.disabled = false; renderMessageTemplates(); }
});

$("#all-servers").addEventListener("change", renderDestinationServers);
$("#all-channels").addEventListener("change", renderDestinationServers);
$("#announcement-message").addEventListener("blur", saveAnnouncementSelection);
$("#announcement-message").addEventListener("input", () => {
	const input = $("#announcement-message");
	const next = input.value;
	let start = 0;
	while (start < previousAnnouncementValue.length && start < next.length && previousAnnouncementValue[start] === next[start]) start++;
	let oldEnd = previousAnnouncementValue.length;
	let newEnd = next.length;
	while (oldEnd > start && newEnd > start && previousAnnouncementValue[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
	const insertion = next.slice(start, newEnd);
	const font = $("#announcement-font").value;
	if (insertion && font !== "normal") {
		const converted = mapTextOutsideRoleMentions(insertion, font);
		if (converted !== insertion) input.setRangeText(converted, start, newEnd, "end");
	}
	previousAnnouncementValue = input.value;
	saveAnnouncementSelection();
	updateAnnouncementCount();
	updateRoleSuggestions();
});
$("#announcement-message").addEventListener("keydown", (event) => { if (event.key === "Escape") hideRoleSuggestions(); });
$("#announcement-message").addEventListener("blur", () => setTimeout(hideRoleSuggestions, 120));
$("#announcement-font").addEventListener("change", () => {
	const input = $("#announcement-message");
	input.focus();
	input.setSelectionRange(announcementSelection.start, announcementSelection.end);
});
$("#apply-announcement-font").addEventListener("mousedown", (event) => event.preventDefault());
$("#apply-announcement-font").addEventListener("click", () => replaceAnnouncementSelection($("#announcement-font").value));
$("#send-announcement").addEventListener("click", async () => {
	const feedback = $("#announcement-feedback"); const results = $("#send-results"); results.replaceChildren();
	if ($("#announcement-message").value.length > 2000) { setFeedback(feedback, "Announcements must be 2,000 characters or fewer. Styled Unicode characters count toward the limit.", "error"); return; }
	const servers = [...document.querySelectorAll(".destination-server-check:checked")].map((x) => x.value);
	const channels = [...document.querySelectorAll(".destination-channel-check:checked")].map((x) => x.value);
	const button = $("#send-announcement"); button.disabled = true;
	try {
		const result = await request("api/announcements/send", { method: "POST", body: JSON.stringify({ message: $("#announcement-message").value, roleMentions: [...state.roleMentions.values()], allowMentions: $("#allow-announcement-mentions").checked, allServers: $("#all-servers").checked, allChannels: $("#all-channels").checked, guildIds: servers, channelIds: channels }) });
		setFeedback(feedback, "Announcement send completed.", "success");
		for (const item of result.results) { const line = document.createElement("div"); line.className = `result-line ${item.success ? "" : "error"}`; line.textContent = `${item.guildName ?? item.guildId}: ${item.message}`; results.append(line); }
	} catch (error) { setFeedback(feedback, error.message, "error"); } finally { button.disabled = false; }
});

let editorViewportHeight = null;
function updateEditorKeyboardState() {
	if (!document.body.classList.contains("editor-focused")) return;
	const viewport = window.visualViewport;
	if (!viewport) return;
	if (editorViewportHeight === null) editorViewportHeight = viewport.height;
	document.body.classList.toggle("keyboard-open", editorViewportHeight - viewport.height > 120);
}
document.addEventListener("focusin", (event) => {
	if (event.target.closest?.("#server-workspace") && event.target.matches?.("input,select,textarea")) {
		if (!document.body.classList.contains("editor-focused")) editorViewportHeight = window.visualViewport?.height ?? null;
		document.body.classList.add("editor-focused");
		requestAnimationFrame(updateEditorKeyboardState);
	}
});
document.addEventListener("focusout", () => {
	setTimeout(() => {
		if (!document.activeElement.closest?.("#server-workspace") || !document.activeElement.matches?.("input,select,textarea")) {
			document.body.classList.remove("editor-focused", "keyboard-open");
			editorViewportHeight = null;
		} else updateEditorKeyboardState();
	}, 0);
});
window.visualViewport?.addEventListener("resize", updateEditorKeyboardState);
window.visualViewport?.addEventListener("scroll", updateEditorKeyboardState);

refresh();
setInterval(refresh, 15000);
