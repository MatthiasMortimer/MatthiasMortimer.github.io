import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.resolve(appDir, "../../scripts/discord/guild-config.json");
const layoutPath = path.resolve(appDir, "../../scripts/discord/server-layout.json");
const draftPath = path.resolve(appDir, "../../scripts/discord/layout-drafts.json");
const envPath = path.resolve(appDir, "../../.env");
let client = null;
let discordModule = null;
let loginPromise = null;
let botError = null;
let saveQueue = Promise.resolve();
let draftQueue = Promise.resolve();
const templatePostLocks = new Map();
// Role permissions the layout editor controls. Apply leaves every other permission on an existing role untouched.
const layoutRolePermissions = ["ManageGuild", "ManageChannels", "ManageRoles", "ManageMessages", "ManageThreads", "ModerateMembers", "ViewAuditLog", "KickMembers", "BanMembers", "ManageEvents"];
const botChannelPermissions = ["ViewChannel", "SendMessages", "SendMessagesInThreads", "ReadMessageHistory", "EmbedLinks", "AttachFiles", "MentionEveryone", "CreatePrivateThreads", "ManageThreads", "ManageMessages", "ManageChannels"];
const ticketRetentionTimers = new Map();
const defaultTicketTypes = [
	{ id: "new-client-inquiry", label: "New Client Inquiry" },
	{ id: "project-support", label: "Project Support" },
	{ id: "billing", label: "Billing" },
	{ id: "partnership", label: "Partnership" },
];
const messageTemplates = [
	{ id: "start-here", name: "#start-here", content: "Welcome to RitesDev.\n\nThis server is for professional networking, client collaboration, and project delivery.\n\n1. Read #rules.\n2. Introduce yourself in #introductions.\n3. Use #apply-or-contact for access or business inquiries.\n4. Use #support-desk for private assistance.\n\nClient and project areas are private and available only to assigned members." },
	{ id: "rules", name: "#rules", content: "1. Communicate respectfully and professionally.\n2. Do not share client information, credentials, private files, or project details outside authorized spaces.\n3. Use #support-desk for private requests. Do not post sensitive matters publicly.\n4. No unsolicited direct messages, spam, or unrelated promotion.\n5. Keep messages and files in their appropriate project or client area.\n6. Respect moderator and project-manager decisions.\n7. Report concerns privately through a ticket." },
	{ id: "server-information", name: "#server-information", content: "RitesDev provides freelance software development, technical consulting, and developer education.\n\nCommunity areas support professional networking and focused project discussion. For new work, client support, or partnerships, open a request through #support-desk." },
	{ id: "apply-or-contact", name: "#apply-or-contact", content: "Need access, want to collaborate, or have a project inquiry?\n\nOpen a ticket in #support-desk and choose the option that best fits your request. A RitesDev team member will follow up privately." },
	{ id: "launch-announcement", name: "#announcements Launch Post", content: "@everyone\n\nRitesDev Client & Project Hub is now open.\n\nThis is a professional space for developer networking, client collaboration, project delivery, and technical growth.\n\nStart in #start-here, then use #support-desk for any private inquiry or project need." },
];

export function createApiHandler() {
	startBot().catch((error) => { botError = error.message; console.error("[discord-manager] Bot startup failed:", error.message); });
	return async function handleApi({ method, pathname, searchParams, body }) {
		// Embedded app requests normally arrive with the mount path stripped. Also
		// accept the full path so invite resolution works if a host passes it through.
		const routePath = pathname.replace(/^\/apps\/discord-manager(?=\/api\/)/u, "");
		if (method === "GET" && routePath === "/api/status") return status();
		if (method === "POST" && routePath === "/api/invites/resolve") return resolveServerInvite(body?.inviteUrl);
		if (method === "PUT" && routePath === "/api/credentials") {
			if (typeof body?.token !== "string" || !body.token.trim()) throw new Error("Enter a bot token.");
			await writeToken(body.token.trim());
			await restartBot();
			return { success: true, message: "Bot token saved. Connecting to Discord…" };
		}
		if (method === "GET" && routePath === "/api/servers") return { servers: getServers() };
		if (method === "GET" && routePath === "/api/templates") return { templates: messageTemplates.map(({ id, name, content }) => ({ id, name, content })) };
		if (method === "GET" && routePath === "/api/config") {
			const guildId = searchParams?.get("guildId") ?? body?.guildId;
			if (!guildId) throw new Error("Choose a server first.");
			return getConfig(guildId, searchParams?.get("includeMembers") === "1");
		}
		if (method === "PUT" && routePath === "/api/config") {
			const config = validateConfig(body);
			await saveConfig(config);
			return { success: true, message: "Server settings saved." };
		}
		if (method === "GET" && routePath === "/api/layout/default") return { layout: await readDefaultLayout() };
		if (method === "PUT" && routePath === "/api/layout/draft") return saveLayoutDraft(body?.guildId, body?.layout);
		if (method === "DELETE" && routePath === "/api/layout/draft") return deleteLayoutDraft(searchParams?.get("guildId") ?? body?.guildId);
		if (method === "POST" && routePath === "/api/setup/apply") {
			const result = await applySetup(body?.guildId, body?.config ?? null);
			await deleteLayoutDraft(body?.guildId);
			return result;
		}
		if (method === "POST" && routePath === "/api/members/roles") return updateMemberRoles(body);
		if (method === "POST" && routePath === "/api/templates/post") return postManagedTemplate(body);
		if (method === "POST" && routePath === "/api/announcements/send") return sendAnnouncement(body);
		if (method === "POST" && routePath === "/api/tickets/panel") return sendTicketPanel(body?.guildId);
		if (method === "POST" && routePath === "/api/commands/sync") return syncCommands();
		return { status: 404, data: { success: false, message: `Not found: ${method} ${pathname}` } };
	};
}

export function disposeApiHandler() {
	const activeClient = client;
	client = null;
	for (const timer of ticketRetentionTimers.values()) clearTimeout(timer);
	ticketRetentionTimers.clear();
	activeClient?.destroy();
}

async function startBot() {
	const { token } = await readCredentials();
	if (!token || client?.isReady() || loginPromise) return;
	discordModule ??= await import("discord.js");
	const { Client, GatewayIntentBits, Partials } = discordModule;
	client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });
	client.on("error", (error) => { botError = error.message; });
	client.on("ready", () => {
		botError = null;
		console.log(`[discord-manager] Connected as ${client.user.tag} in ${client.guilds.cache.size} server(s).`);
		syncCommands().catch((error) => { botError = `Connected, but slash-command registration failed: ${error.message}`; });
		scheduleStoredTicketRemovals().catch((error) => console.error("[discord-manager] Could not schedule ticket requester removals:", error.message));
	});
	client.on("interactionCreate", handleInteraction);
	client.on("guildMemberAdd", (member) => handleMemberJoin(member).catch((error) => console.error(`[discord-manager] Could not assign Pending role in ${member.guild.name}:`, error.message)));
	loginPromise = client.login(token).catch((error) => { botError = error.message; client?.destroy(); client = null; throw error; }).finally(() => { loginPromise = null; });
	await loginPromise;
}

async function restartBot() {
	if (client) { client.destroy(); client = null; }
	loginPromise = null;
	botError = null;
	await startBot();
}

function getServers() {
	return client?.guilds.cache.map((guild) => ({ id: guild.id, name: guild.name, icon: guild.iconURL({ size: 64 }) })) ?? [];
}

async function status() {
	const { token } = await readCredentials();
	const inviteUrl = client?.user ? new URL("https://discord.com/oauth2/authorize") : null;
	if (inviteUrl) {
		inviteUrl.searchParams.set("client_id", client.user.id);
		inviteUrl.searchParams.set("permissions", "8");
		// The bot scope includes application commands; let Discord use the
		// application's configured install context instead of overriding it here.
		inviteUrl.searchParams.set("scope", "bot");
	}
	return { configured: Boolean(token), connected: Boolean(client?.isReady()), error: botError, bot: client?.user ? { id: client.user.id, username: client.user.username, avatar: client.user.displayAvatarURL() } : null, inviteUrl: inviteUrl?.href ?? null, serverCount: client?.guilds.cache.size ?? 0 };
}

async function resolveServerInvite(value) {
	if (typeof value !== "string" || !value.trim() || value.length > 500) throw new Error("Paste a valid Discord server invite link.");
	const raw = value.trim();
	let code = /^[a-z0-9-]+$/iu.test(raw) ? raw : "";
	let inviteUrl;
	if (!code) {
		try { inviteUrl = new URL(/^https?:\/\//iu.test(raw) ? raw : `https://${raw}`); }
		catch { throw new Error("Paste a valid Discord server invite link or code."); }
		const host = inviteUrl.hostname.toLowerCase();
		const pathParts = inviteUrl.pathname.split("/").filter(Boolean);
		const isShortInvite = ["discord.gg", "www.discord.gg"].includes(host) && pathParts.length === 1;
		const isDiscordInvite = ["discord.com", "www.discord.com", "discordapp.com", "www.discordapp.com"].includes(host) && pathParts.length === 2 && pathParts[0] === "invite";
		code = isShortInvite ? pathParts[0] : isDiscordInvite ? pathParts[1] : "";
	}
	if (!/^[a-z0-9-]+$/iu.test(code)) throw new Error("Use a discord.gg or discord.com/invite server link.");
	let response;
	try {
		response = await fetch(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=false`, { signal: AbortSignal.timeout(10000) });
	} catch (error) {
		if (error.name === "TimeoutError" || error.name === "AbortError") {
			throw new Error("Discord invite lookup timed out. You can still open the bot authorization page and choose the server there.");
		}
		throw new Error(`Could not reach Discord to check that invite. You can still open the bot authorization page and choose the server there. (${error.message})`);
	}
	if (!response.ok) throw new Error("That invite is invalid, expired, or unavailable.");
	const invite = await response.json();
	if (!invite.guild?.id) throw new Error("That invite does not identify a Discord server.");
	return { guildId: invite.guild.id, guildName: invite.guild.name ?? "Discord server" };
}

async function readConfigStore() {
	try { return JSON.parse(await fs.readFile(dataPath, "utf8")); }
	catch (error) { if (error.code !== "ENOENT") throw error; return {}; }
}

async function getConfig(guildId, includeMembers = false) {
	const guild = client?.guilds.cache.get(String(guildId));
	if (!guild) throw new Error("That server is not connected to this bot.");
	const store = await readConfigStore();
	const config = store[guild.id] ?? await initialConfig(guild);
	config.layout = normalizeLayout(config.layout);
	config.tickets = normalizeTickets(config.tickets);
	// The gateway keeps these caches current; repeated REST fetches during periodic refreshes hit rate limits.
	const channels = guild.channels.cache.size ? guild.channels.cache : await guild.channels.fetch();
	const roles = guild.roles.cache.size ? guild.roles.cache : await guild.roles.fetch();
	const needsMemberFetch = includeMembers && guild.members.cache.size < guild.memberCount;
	// Discord rate-limits member list requests; use cached members rather than stalling or failing the layout load.
	const members = !includeMembers ? null : !needsMemberFetch ? guild.members.cache : await Promise.race([guild.members.fetch({ time: 8000 }), new Promise((_, reject) => setTimeout(() => reject(new Error("Member list timed out.")), 5000).unref?.())]).catch(() => guild.members.cache);
	const layoutDraft = (await readDraftStore())[guild.id] ?? null;
	return {
		...config,
		layoutDraft: layoutDraft ? { layout: normalizeLayout(layoutDraft.layout), savedAt: layoutDraft.savedAt } : null,
		guildId: guild.id,
		guildName: guild.name,
		channels: channels.filter((c) => c && [discordModule.ChannelType.GuildText, discordModule.ChannelType.GuildAnnouncement, discordModule.ChannelType.GuildForum].includes(c.type)).map((c) => ({ id: c.id, name: c.name, type: c.type, parentName: c.parent?.name ?? "" })),
		categories: channels.filter((c) => c?.type === discordModule.ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name })),
		availableRoles: roles.filter((r) => r && r.id !== guild.id).map((r) => ({ id: r.id, name: r.name })),
		...(members ? { availableMembers: members.filter((member) => member && !member.user.bot).map((member) => ({ id: member.id, name: member.displayName, username: member.user.username, roleIds: member.roles.cache.filter((role) => role.id !== guild.id).map((role) => role.id) })) } : {}),
	};
}

async function initialConfig(guild) {
	return {
		guildId: guild.id,
		guildName: guild.name,
		layout: await readDefaultLayout(),
		managedIds: { categoryIds: [], channelIds: [], roleIds: [] },
		announcementChannelId: null,
		tickets: {
			enabled: true,
			channelId: null,
			logChannelId: null,
			retentionHours: 168,
			types: defaultTicketTypes,
			openingMessage: "Click the button below to open a private support ticket.",
			welcomeMessage: "Thanks for contacting the team. A moderator will review your ticket shortly.",
			moderatorRoleIds: [],
			records: {},
		},
	};
}

async function readDefaultLayout() {
	return normalizeLayout(JSON.parse(await fs.readFile(layoutPath, "utf8")));
}
async function readDraftStore() {
	try { return JSON.parse(await fs.readFile(draftPath, "utf8")); }
	catch (error) { if (error.code !== "ENOENT") throw error; return {}; }
}

function updateDraftStore(change) {
	const task = draftQueue.then(async () => {
		const store = await readDraftStore();
		const result = change(store);
		await fs.mkdir(path.dirname(draftPath), { recursive: true });
		await fs.writeFile(draftPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
		return result;
	});
	draftQueue = task.catch(() => {});
	return task;
}

async function saveLayoutDraft(guildId, layout) {
	const id = String(guildId ?? "");
	if (!/^\d{17,20}$/u.test(id)) throw new Error("Choose a valid server.");
	if (!client?.guilds.cache.has(id)) throw new Error("That server is not connected to this bot.");
	const normalized = validateLayout(layout);
	const savedAt = new Date().toISOString();
	await updateDraftStore((store) => { store[id] = { layout: normalized, savedAt }; });
	return { success: true, message: "Layout draft saved. Choose Apply setup when it is ready.", savedAt };
}

async function deleteLayoutDraft(guildId) {
	const id = String(guildId ?? "");
	if (!/^\d{17,20}$/u.test(id)) throw new Error("Choose a valid server.");
	if (!((await readDraftStore())[id])) return { success: true, message: "No saved draft to discard." };
	await updateDraftStore((store) => { delete store[id]; });
	return { success: true, message: "Saved draft discarded." };
}

function validateLayout(input) {
	if (!input || typeof input !== "object" || !Array.isArray(input.categories) || !Array.isArray(input.roles)) throw new Error("Server layout is incomplete.");
	const layout = normalizeLayout(structuredClone(input));
	if (layout.categories.some((c) => !c.name?.trim() || !Array.isArray(c.channels) || c.channels.some((ch) => !ch.name?.trim() || !["text", "announcement", "forum"].includes(ch.type) || ch.tags.some((tag) => !String(tag).trim()) || !validChannelAccess(ch.access)) || !validCategoryAccess(layout.categoryAccess?.[c.name]))) throw new Error("Every category and channel needs a name, a supported channel type, and valid access settings.");
	if (layout.roles.some((role) => !role.name?.trim())) throw new Error("Every role needs a name.");
	if (new Set(layout.roles.map((role) => role.name.trim().toLowerCase())).size !== layout.roles.length) throw new Error("Role names must be unique so permissions and hierarchy are unambiguous.");
	return layout;
}

function normalizeLayout(layout) {
	return {
		...layout,
		categories: (layout.categories ?? []).map((category) => ({
			...category,
			channels: (category.channels ?? []).map((channel) => typeof channel === "string" ? { name: channel, topic: "", type: "text", tags: [], access: null } : { ...channel, topic: channel.topic ?? "", type: channel.type ?? "text", tags: Array.isArray(channel.tags) ? channel.tags : [], access: channel.access && typeof channel.access === "object" ? channel.access : null }),
		})),
		roles: (layout.roles ?? []).map((role) => ({ ...role, permissions: Array.isArray(role.permissions) ? role.permissions : [] })),
		categoryAccess: layout.categoryAccess ?? {},
	};
}

function normalizeTickets(tickets = {}) {
	const retentionHours = Number(tickets.retentionHours ?? 168);
	const types = Array.isArray(tickets.types) ? tickets.types : defaultTicketTypes;
	return {
		enabled: tickets.enabled !== false,
		channelId: tickets.channelId || tickets.supportChannelId || null,
		logChannelId: tickets.logChannelId || null,
		retentionHours: Number.isInteger(retentionHours) && retentionHours >= 1 && retentionHours <= 8760 ? retentionHours : 168,
		types: types.map((type) => ({ id: String(type.id ?? ""), label: String(type.label ?? "") })),
		openingMessage: typeof tickets.openingMessage === "string" && tickets.openingMessage ? tickets.openingMessage : "Click the button below to open a private support ticket.",
		welcomeMessage: typeof tickets.welcomeMessage === "string" && tickets.welcomeMessage ? tickets.welcomeMessage : "Thanks for contacting the team. A moderator will review your ticket shortly.",
		moderatorRoleIds: Array.isArray(tickets.moderatorRoleIds) ? tickets.moderatorRoleIds : (tickets.staffRoleIds ?? []),
		records: tickets.records && typeof tickets.records === "object" ? tickets.records : {},
	};
}

function validateConfig(input) {
	if (!input || !/^\d{17,20}$/.test(String(input.guildId))) throw new Error("Choose a valid server.");
	const config = structuredClone(input);
	if (typeof config.guildName !== "string") throw new Error("Server layout is incomplete.");
	config.layout = validateLayout(config.layout);
	config.announcementChannelId ||= null;
	config.managedIds = {
		categoryIds: Array.isArray(config.managedIds?.categoryIds) ? config.managedIds.categoryIds.map(String) : [],
		channelIds: Array.isArray(config.managedIds?.channelIds) ? config.managedIds.channelIds.map(String) : [],
		roleIds: Array.isArray(config.managedIds?.roleIds) ? config.managedIds.roleIds.map(String) : [],
	};
	config.tickets ??= {};
	config.tickets = normalizeTickets(config.tickets);
	if (config.tickets.logChannelId != null && !/^\d{17,20}$/u.test(String(config.tickets.logChannelId))) throw new Error("Choose a valid ticket log channel.");
	const retentionHours = Number(input.tickets?.retentionHours ?? 168);
	if (!Number.isInteger(retentionHours) || retentionHours < 1 || retentionHours > 8760) throw new Error("Ticket retention must be between 1 and 8,760 hours.");
	config.tickets.retentionHours = retentionHours;
	if (!Array.isArray(input.tickets?.types) || input.tickets.types.length < 1 || input.tickets.types.length > 25) throw new Error("Keep between 1 and 25 ticket types so the panel fits Discord's button limits.");
	if (config.tickets.types.some((type) => !/^[a-z0-9_-]{1,40}$/u.test(type.id) || !type.label.trim() || type.label.length > 80) || new Set(config.tickets.types.map((type) => type.id)).size !== config.tickets.types.length) throw new Error("Ticket types need unique IDs and labels of 1–80 characters.");
	if (new Set(config.tickets.types.map((type) => type.label.trim().toLowerCase())).size !== config.tickets.types.length) throw new Error("Ticket type labels must be unique.");
	if (config.tickets.openingMessage.length > 2000 || config.tickets.welcomeMessage.length > 1700) throw new Error("Keep the ticket panel under 2,000 characters and the welcome message under 1,700 characters.");
	return config;
}

function validCategoryAccess(access) {
	if (access == null) return true;
	if (typeof access !== "object" || Array.isArray(access)) return false;
	if (access.everyone != null && !["view", "hidden"].includes(access.everyone)) return false;
	if (access.roles != null && (typeof access.roles !== "object" || Array.isArray(access.roles) || Object.values(access.roles).some((value) => !["view", "hidden"].includes(value)))) return false;
	return access.members == null || (typeof access.members === "object" && !Array.isArray(access.members) && Object.entries(access.members).every(([id, value]) => /^\d{17,20}$/u.test(id) && ["view", "hidden"].includes(value)));
}

async function saveConfig(config) {
	const task = saveQueue.then(async () => {
		const store = await readConfigStore();
		const { channels, categories, availableRoles, availableMembers, layoutDraft, ...persisted } = config;
		store[persisted.guildId] = persisted;
		await fs.mkdir(path.dirname(dataPath), { recursive: true });
		await fs.writeFile(dataPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
	});
	saveQueue = task.catch(() => {});
	await task;
}

async function postManagedTemplate(input) {
	if (!client?.isReady()) throw new Error("The bot is not connected.");
	const guildId = String(input?.guildId ?? "");
	const templateId = String(input?.templateId ?? "");
	const channelId = String(input?.channelId ?? "");
	const template = messageTemplates.find((item) => item.id === templateId);
	if (!/^\d{17,20}$/u.test(guildId) || !/^\d{17,20}$/u.test(channelId) || !template) throw new Error("Choose a message template and destination channel.");
	const previous = templatePostLocks.get(guildId) ?? Promise.resolve();
	const operation = previous.catch(() => {}).then(() => postManagedTemplateOnce(guildId, channelId, template));
	templatePostLocks.set(guildId, operation);
	try { return await operation; }
	finally { if (templatePostLocks.get(guildId) === operation) templatePostLocks.delete(guildId); }
}

async function postManagedTemplateOnce(guildId, channelId, template) {
	const guild = client.guilds.cache.get(guildId);
	if (!guild) throw new Error("That server is not connected to this bot.");
	const channel = await guild.channels.fetch(channelId).catch(() => null);
	if (!channel || channel.guildId !== guild.id || ![discordModule.ChannelType.GuildText, discordModule.ChannelType.GuildAnnouncement].includes(channel.type)) throw new Error("Choose a text or announcement channel in the selected server.");
	const me = await guild.members.fetchMe();
	const permissions = channel.permissionsFor(me);
	if (!permissions?.has(["ViewChannel", "SendMessages", "ReadMessageHistory"])) throw new Error("The bot needs View Channel, Send Messages, and Read Message History permissions in the destination.");

	const config = (await readConfigStore())[guild.id] ?? await initialConfig(guild);
	config.templatePosts ??= {};
	config.templatePosts[template.id] ??= {};
	const previousMessageId = config.templatePosts[template.id][channel.id];
	let message = previousMessageId ? await channel.messages.fetch(previousMessageId).catch(() => null) : null;
	if (message && message.author.id !== client.user.id) message = null;
	if (!message) {
		const recentMessages = await channel.messages.fetch({ limit: 100 });
		message = recentMessages.find((candidate) => candidate.author.id === client.user.id && candidate.content === template.content) ?? null;
	}
	const messageOptions = { content: template.content, allowedMentions: { parse: [] } };
	const created = !message;
	if (message) await message.edit(messageOptions);
	if (created) {
		message = await channel.send(messageOptions);
	}
	if (config.templatePosts[template.id][channel.id] !== message.id) {
		config.templatePosts[template.id][channel.id] = message.id;
		await saveConfig(config);
	}
	return { success: true, created, message: created ? `Posted ${template.name} in #${channel.name}.` : `Updated the existing ${template.name} post in #${channel.name}.` };
}

async function applySetup(guildId, proposedConfig = null) {
	const guild = client?.guilds.cache.get(String(guildId));
	if (!guild) throw new Error("That server is not connected to this bot.");
	const stored = (await readConfigStore())[guild.id] ?? await initialConfig(guild);
	const config = proposedConfig ? validateConfig(proposedConfig) : await getConfig(guild.id);
	if (config.guildId !== guild.id) throw new Error("The server configuration does not match the selected server.");
	const me = await guild.members.fetchMe();
	if (!me.permissions.has(["ManageChannels", "ManageRoles"])) throw new Error("The bot needs Manage Channels and Manage Roles permissions in that server.");
	const { ChannelType, PermissionFlagsBits, PermissionsBitField } = discordModule;
	const roles = new Map();
	const roleIds = [];
	for (const spec of config.layout.roles) {
		const existing = (spec.roleId && guild.roles.cache.get(spec.roleId)) ?? guild.roles.cache.find((role) => role.name.toLowerCase() === spec.name.toLowerCase());
		// Leave the bot's own and integration roles as they are, so Apply can never remove the bot's own permissions.
		if (existing && (existing.managed || me.roles.cache.has(existing.id))) {
			spec.roleId = existing.id;
			roles.set(spec.name, existing);
			roleIds.push(existing.id);
			continue;
		}
		if (existing && guild.roles.comparePositions(existing, me.roles.highest) >= 0) throw new Error(`Move the bot's highest role above "${existing.name}" in Server Settings → Roles, then apply again.`);
		let role;
		if (existing) {
			const permissions = new PermissionsBitField(existing.permissions).remove(layoutRolePermissions).add(spec.permissions ?? []);
			role = existing.name === spec.name && existing.permissions.bitfield === permissions.bitfield ? existing : await existing.edit({ name: spec.name, permissions, reason: "RitesDev server setup" });
		} else role = await guild.roles.create({ name: spec.name, permissions: new PermissionsBitField(spec.permissions ?? []), reason: "RitesDev server setup" });
		spec.roleId = role.id;
		roles.set(spec.name, role);
		roleIds.push(role.id);
	}
	await applyRoleOrder(guild, config.layout.roles.map((spec) => roles.get(spec.name)).filter((role) => !role.managed && !me.roles.cache.has(role.id)));
	const existingChannels = await guild.channels.fetch();
	const categoryIds = [];
	const channelIds = [];
	for (const catSpec of config.layout.categories) {
		let category = (catSpec.categoryId && existingChannels.get(catSpec.categoryId)) ?? existingChannels.find((channel) => channel?.type === ChannelType.GuildCategory && channel.name.toLowerCase() === catSpec.name.toLowerCase());
			if (!category) category = await guild.channels.create({ name: catSpec.name, type: ChannelType.GuildCategory });
		else if (category.name !== catSpec.name) await category.setName(catSpec.name);
		catSpec.categoryId = category.id;
		categoryIds.push(category.id);
		const access = config.layout.categoryAccess?.[catSpec.name] ?? { everyone: "view", roles: {} };
		const visiblePermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];
		const overwrites = [{ id: guild.roles.everyone.id, allow: access.everyone === "view" ? visiblePermissions : [], deny: access.everyone === "hidden" ? [PermissionFlagsBits.ViewChannel] : [] }, botOverwrite(me)];
		for (const [roleName, visibility] of Object.entries(access.roles ?? {})) {
			const role = roles.get(roleName);
			if (!role) throw new Error(`Category "${catSpec.name}" refers to missing role "${roleName}".`);
			overwrites.push({ id: role.id, allow: visibility === "view" ? visiblePermissions : [], deny: visibility === "hidden" ? [PermissionFlagsBits.ViewChannel] : [] });
		}
		for (const [memberId, visibility] of Object.entries(access.members ?? {})) {
			const member = await guild.members.fetch(memberId).catch(() => null);
			if (!member) throw new Error(`Member ${memberId} is no longer in this server. Remove their category access before applying setup.`);
			overwrites.push({ id: member.id, type: 1, allow: visibility === "view" ? visiblePermissions : [], deny: visibility === "hidden" ? [PermissionFlagsBits.ViewChannel] : [] });
		}
		await category.permissionOverwrites.set(overwrites, "Apply RitesDev category access settings");
		for (const channelSpec of catSpec.channels) {
			let channel = (channelSpec.channelId && existingChannels.get(channelSpec.channelId)) ?? existingChannels.find((item) => item?.parentId === category.id && item.name.toLowerCase() === channelSpec.name.toLowerCase());
			const desiredType = channelSpec.type === "forum" ? ChannelType.GuildForum : channelSpec.type === "announcement" ? ChannelType.GuildAnnouncement : ChannelType.GuildText;
			if (channel && channel.type !== desiredType) {
				if (!oldManagedChannel(config, channel.id)) throw new Error(`#${channel.name} already exists with a different channel type. Remove or rename that channel before applying this layout.`);
				await channel.delete("Replace managed channel with requested channel type");
				channel = null;
			}
			const availableTags = desiredType === ChannelType.GuildForum ? channelSpec.tags.slice(0, 20).map((name) => ({ name: String(name).trim().slice(0, 20), moderated: false })) : undefined;
			if (!channel) channel = await guild.channels.create({ name: channelSpec.name, type: desiredType, parent: category.id, ...(channelSpec.topic ? { topic: channelSpec.topic } : {}), ...(availableTags ? { availableTags } : {}) });
			else if (channel.name !== channelSpec.name || channel.parentId !== category.id || channel.topic !== (channelSpec.topic ?? null) || (desiredType === ChannelType.GuildForum && JSON.stringify(channel.availableTags.map((tag) => tag.name)) !== JSON.stringify(availableTags.map((tag) => tag.name)))) await channel.edit({ name: channelSpec.name, parent: category.id, ...(channelSpec.topic ? { topic: channelSpec.topic } : {}), ...(desiredType === ChannelType.GuildForum ? { availableTags } : {}) });
			await applyChannelAccess(channel, category, channelSpec.access, roles, guild, me);
			channelSpec.channelId = channel.id;
			channelIds.push(channel.id);
		}
	}
	const oldCategoryIds = stored.managedIds?.categoryIds ?? stored.layout.categories.map((category) => category.categoryId).filter(Boolean);
	const oldChannelIds = stored.managedIds?.channelIds ?? stored.layout.categories.flatMap((category) => category.channels.map((channel) => channel.channelId)).filter(Boolean);
	let removedChannels = 0;
	for (const id of oldChannelIds) {
		if (channelIds.includes(id)) continue;
		const channel = await guild.channels.fetch(id).catch(() => null);
		if (channel) { await channel.delete("Removed from RitesDev server layout"); removedChannels++; }
	}
	let removedCategories = 0;
	for (const id of oldCategoryIds) {
		if (categoryIds.includes(id)) continue;
		const category = await guild.channels.fetch(id).catch(() => null);
		if (!category || category.type !== ChannelType.GuildCategory) continue;
		const currentChannels = await guild.channels.fetch();
		const hasUnmanagedChildren = currentChannels.some((channel) => channel?.parentId === id);
		if (!hasUnmanagedChildren) { await category.delete("Removed from RitesDev server layout"); removedCategories++; }
	}
	const oldRoleIds = stored.managedIds?.roleIds ?? stored.layout.roles.map((role) => role.roleId).filter(Boolean);
	let removedRoles = 0;
	for (const id of oldRoleIds) {
		if (roleIds.includes(id)) continue;
		const role = await guild.roles.fetch(id).catch(() => null);
		if (role && role.id !== guild.roles.everyone.id && !role.managed && !me.roles.cache.has(role.id)) { await role.delete("Removed from RitesDev server layout"); removedRoles++; }
	}
	config.managedIds = { categoryIds, channelIds, roleIds };
	await saveConfig(config);
	return { success: true, message: `Server layout applied. Removed ${removedChannels} channel(s), ${removedCategories} empty categor${removedCategories === 1 ? "y" : "ies"}, and ${removedRoles} role(s).`, config };
}

async function applyRoleOrder(guild, orderedRoles) {
	if (!orderedRoles.length) return;
	const me = await guild.members.fetchMe();
	const botPosition = me.roles.highest.position;
	const blocked = orderedRoles.find((role) => guild.roles.comparePositions(role, me.roles.highest) >= 0);
	if (blocked) throw new Error(`The bot's highest role must be above "${blocked.name}" before it can enforce the configured role order.`);
	const positions = orderedRoles.map((role) => role.position).sort((a, b) => b - a);
	// Roles created in the same request can share a position; spread them out below the bot's role.
	if (new Set(positions).size !== positions.length || positions.some((position) => position >= botPosition)) {
		if (botPosition <= orderedRoles.length) throw new Error("Drag the bot's role to the top of Server Settings → Roles so Discord can order the layout roles below it, then apply again.");
		positions.splice(0, positions.length, ...orderedRoles.map((_, index) => botPosition - 1 - index));
	}
	await guild.roles.setPositions(orderedRoles.map((role, index) => ({ role: role.id, position: positions[index] })), "Apply RitesDev role hierarchy");
}

async function updateMemberRoles(input) {
	if (!client?.isReady()) throw new Error("The bot is not connected.");
	const guild = client.guilds.cache.get(String(input?.guildId));
	if (!guild) throw new Error("That server is not connected to this bot.");
	if (!/^\\d{17,20}$/u.test(String(input?.memberId)) || !Array.isArray(input?.roleIds)) throw new Error("Choose a valid member and role selection.");
	const member = await guild.members.fetch(input.memberId).catch(() => null);
	if (!member || member.user.bot) throw new Error("Choose a current, non-bot server member.");
	if (member.id === guild.ownerId) throw new Error("The server owner's roles cannot be changed by the bot.");
	const config = (await readConfigStore())[guild.id] ?? await initialConfig(guild);
	const managedRoleIds = config.layout.roles.map((role) => role.roleId).filter(Boolean);
	let selected = [...new Set(input.roleIds.map(String))];
	if (input.approve === true) {
		const pending = config.layout.roles.find((role) => role.name.toLowerCase() === "pending")?.roleId;
		const approved = config.layout.roles.find((role) => role.name.toLowerCase() === "network member")?.roleId;
		if (!pending || !approved) throw new Error("Apply a layout containing both Pending and Network Member roles before approving members.");
		selected = [...new Set([...selected.filter((id) => id !== pending), approved])];
	}
	if (selected.some((id) => !managedRoleIds.includes(id))) throw new Error("Only roles in this server's saved layout can be assigned here. Apply the layout first.");
	const roles = await guild.roles.fetch();
	const me = await guild.members.fetchMe();
	if (!me.permissions.has("ManageRoles")) throw new Error("The bot needs Manage Roles permission in that server.");
	for (const id of selected) {
		const role = roles.get(id);
		if (!role || role.managed || role.position >= me.roles.highest.position) throw new Error("The bot cannot assign one or more selected roles. Move its highest role above them and try again.");
	}
	const preserve = member.roles.cache.filter((role) => role.id !== guild.id && !managedRoleIds.includes(role.id)).map((role) => role.id);
	await member.roles.set([...preserve, ...selected], "Update member roles from RitesDev Discord Manager");
	return { success: true, message: input.approve === true ? `Approved ${member.displayName} as a Network Member.` : `Updated roles for ${member.displayName}.`, roleIds: selected };
}

async function handleMemberJoin(member) {
	if (member.user.bot) return;
	const config = (await readConfigStore())[member.guild.id];
	const pendingRole = config?.layout?.roles?.find((role) => role.name.toLowerCase() === "pending" && role.roleId);
	if (!pendingRole) return;
	const role = await member.guild.roles.fetch(pendingRole.roleId).catch(() => null);
	if (!role) return;
	const me = await member.guild.members.fetchMe();
	if (!me.permissions.has("ManageRoles") || role.position >= me.roles.highest.position) throw new Error("Move the bot's highest role above the Pending role and grant it Manage Roles.");
	await member.roles.add(role, "Assign Pending role to new server member");
}

function validChannelAccess(access) {
	if (access == null) return true;
	if (typeof access !== "object" || Array.isArray(access)) return false;
	if (access.everyone != null && !["inherit", "hidden", "read", "view"].includes(access.everyone)) return false;
	if (access.bot != null && !["inherit", "hidden", "read", "view"].includes(access.bot)) return false;
	if (access.roles != null && (typeof access.roles !== "object" || Array.isArray(access.roles) || Object.values(access.roles).some((value) => !["inherit", "hidden", "read", "view"].includes(value)))) return false;
	return access.members == null || (typeof access.members === "object" && !Array.isArray(access.members) && Object.entries(access.members).every(([id, value]) => /^\d{17,20}$/u.test(id) && ["hidden", "read", "view"].includes(value)));
}

// The bot always keeps access to channels it manages; otherwise a hidden category locks it out of its own layout, tickets, and posts.
function botOverwrite(me) {
	return { id: me.id, type: 1, allow: botChannelPermissions.filter((permission) => me.permissions.has(permission)), deny: [] };
}

async function applyChannelAccess(channel, category, access, roles, guild, me) {
	const roleRules = access?.roles ?? {};
	const memberRules = access?.members ?? {};
	const hasRules = [access?.everyone, ...Object.values(roleRules), ...Object.values(memberRules)].some((rule) => rule && rule !== "inherit");
	if (!hasRules) {
		await channel.lockPermissions();
		return;
	}
	const { PermissionFlagsBits } = discordModule;
	const viewPermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
	const visiblePermissions = [...viewPermissions, PermissionFlagsBits.SendMessages];
	const overwrites = new Map(category.permissionOverwrites.cache.map((overwrite) => [overwrite.id, { id: overwrite.id, type: overwrite.type, allow: overwrite.allow.bitfield, deny: overwrite.deny.bitfield }]));
	const putRule = (id, rule, type = 0) => {
		if (!rule || rule === "inherit") return;
		overwrites.set(id, { id, type, allow: rule === "view" ? visiblePermissions : rule === "read" ? viewPermissions : [], deny: rule === "hidden" ? [PermissionFlagsBits.ViewChannel] : rule === "read" ? [PermissionFlagsBits.SendMessages] : [] });
	};
	putRule(guild.roles.everyone.id, access?.everyone, 0);
	for (const [roleName, rule] of Object.entries(roleRules)) {
		const role = roles.get(roleName);
		if (!role) throw new Error(`Channel "#${channel.name}" refers to missing role "${roleName}".`);
		putRule(role.id, rule, 0);
	}
	for (const [memberId, rule] of Object.entries(memberRules)) {
		const member = await guild.members.fetch(memberId).catch(() => null);
		if (!member) throw new Error(`Member ${memberId} is no longer in this server. Remove their channel access before applying setup.`);
		putRule(member.id, rule, 1);
	}
	overwrites.set(me.id, botOverwrite(me));
	await channel.permissionOverwrites.set([...overwrites.values()], "Apply RitesDev channel access settings");
}

function oldManagedChannel(config, id) {
	return (config.managedIds?.channelIds ?? []).includes(id) || config.layout.categories.some((category) => category.channels.some((channel) => channel.channelId === id));
}

async function sendAnnouncement(input) {
	if (!client?.isReady()) throw new Error("The bot is not connected.");
	if (!input || typeof input.message !== "string" || !input.message.trim() || input.message.length > 2000) throw new Error("Write an announcement of 1–2,000 characters.");
	const guildIds = input.allServers ? client.guilds.cache.map((g) => g.id) : [...new Set((input.guildIds ?? []).map(String))];
	if (!guildIds.length) throw new Error("Select at least one server.");
	const channelIds = new Set((input.channelIds ?? []).map(String));
	const results = [];
	for (const guildId of guildIds) {
		const guild = client.guilds.cache.get(guildId);
		if (!guild) { results.push({ guildId, success: false, message: "Bot is not in this server." }); continue; }
		try {
			const config = (await readConfigStore())[guildId] ?? await initialConfig(guild);
			const allowMentions = input.allowMentions === true;
			const roleMentioned = allowMentions
				? await resolveRoleMentions(input.message.trim(), input.roleMentions ?? [], guild)
				: { content: input.message.trim().replace(/<@&(\d{17,20})>/gu, (mention, id) => {
					const role = (input.roleMentions ?? []).find((item) => String(item.id) === id);
					return role?.name ? `@${role.name}` : mention;
				}), roleIds: [] };
			const hasBroadcastMention = allowMentions && (/@(everyone|here)\b/iu.test(roleMentioned.content) || roleMentioned.roleIds.length > 0);
			let targets;
			if (input.allChannels) targets = (await guild.channels.fetch()).filter((channel) => channel && [discordModule.ChannelType.GuildText, discordModule.ChannelType.GuildAnnouncement].includes(channel.type) && channel.permissionsFor(client.user).has("SendMessages"));
			else if (channelIds.size) targets = [...channelIds].map((id) => guild.channels.cache.get(id)).filter((channel) => channel?.guildId === guildId && [discordModule.ChannelType.GuildText, discordModule.ChannelType.GuildAnnouncement].includes(channel.type));
			else if (config.announcementChannelId) targets = [await guild.channels.fetch(config.announcementChannelId).catch(() => null)].filter(Boolean);
			else throw new Error("Set a default announcement channel or select channels.");
			if (hasBroadcastMention) {
				const unauthorized = [...targets].filter((channel) => !channel?.permissionsFor(client.user).has(discordModule.PermissionFlagsBits.MentionEveryone));
				if (unauthorized.length) throw new Error(`The bot needs Mention Everyone permission in every selected destination before it can send role, @everyone, or @here mentions. Missing: ${unauthorized.map((channel) => `#${channel.name}`).join(", ")}.`);
			}
			let sent = 0;
			for (const channel of targets) {
				if (!channel || ![discordModule.ChannelType.GuildText, discordModule.ChannelType.GuildAnnouncement].includes(channel.type) || !channel.permissionsFor(client.user).has("SendMessages")) continue;
				await channel.send({ content: roleMentioned.content, allowedMentions: allowMentions
					? { parse: ["everyone"], roles: roleMentioned.roleIds }
					: { parse: [], roles: [] } }); sent++;
			}
			results.push({ guildId, guildName: guild.name, success: sent > 0, sent, message: sent ? `Sent to ${sent} channel(s).` : "No writable channels selected." });
		} catch (error) { results.push({ guildId, guildName: guild.name, success: false, message: error.message }); }
	}
	return { results };
}

async function resolveRoleMentions(message, mentions, guild) {
	const roles = await guild.roles.fetch();
	const metadata = new Map((Array.isArray(mentions) ? mentions : []).map((role) => [String(role.id), role]));
	const usedIds = new Set([...message.matchAll(/<@&(\d{17,20})>/g)].map((match) => match[1]));
	const roleIds = new Set();
	let content = message;
	for (const sourceId of usedIds) {
		const source = metadata.get(sourceId);
		let role = source?.guildId === guild.id ? roles.get(sourceId) : null;
		if (!role && source?.name) role = roles.find((candidate) => candidate.name.toLocaleLowerCase() === String(source.name).toLocaleLowerCase()) ?? null;
		if (!source && !role) role = roles.get(sourceId) ?? null;
		if (role) {
			roleIds.add(role.id);
			content = content.replaceAll(`<@&${sourceId}>`, `<@&${role.id}>`);
		} else if (source) content = content.replaceAll(`<@&${sourceId}>`, `@${source.name}`);
	}
	return { content, roleIds: [...roleIds] };
}

async function sendTicketPanel(guildId) {
	const guild = client?.guilds.cache.get(String(guildId));
	if (!guild) throw new Error("That server is not connected to this bot.");
	const config = (await readConfigStore())[guild.id] ?? await initialConfig(guild);
	config.tickets = normalizeTickets(config.tickets);
	const channel = config.tickets?.channelId ? await guild.channels.fetch(config.tickets.channelId).catch(() => null) : null;
	if (!channel || channel.type !== discordModule.ChannelType.GuildText) throw new Error("Choose and save a regular text channel in Ticket setup first.");
	const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = discordModule;
	const types = config.tickets.types?.length ? config.tickets.types : defaultTicketTypes;
	const rows = [];
	for (let index = 0; index < types.length; index += 5) {
		rows.push(new ActionRowBuilder().addComponents(types.slice(index, index + 5).map((type) => new ButtonBuilder().setCustomId(`rites_ticket_open:${type.id}`).setLabel(type.label.slice(0, 80)).setStyle(ButtonStyle.Primary))));
	}
	await channel.send({ content: config.tickets.openingMessage, components: rows });
	return { success: true, message: `Ticket panel posted in #${channel.name}.` };
}

async function handleInteraction(interaction) {
	try {
		if (interaction.isChatInputCommand() && interaction.commandName === "riteserver") {
			if (!interaction.guild) return interaction.reply({ content: "Use this command inside a server.", ephemeral: true });
			if (!interaction.memberPermissions?.has("ManageGuild")) return interaction.reply({ content: "You need Manage Server permission to change RitesDev server settings.", ephemeral: true });
			const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = discordModule;
			return interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder().setTitle("RitesDev Server Manager").setDescription("Use these controls to configure this server or send an announcement to the configured channels across your servers.").setColor(0x7c8aa8)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("rites_admin_announcement").setLabel("Set announcement channel").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("rites_admin_setup").setLabel("Apply server layout").setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId("rites_admin_ticket_panel").setLabel("Post ticket panel").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("rites_admin_broadcast").setLabel("Send announcement").setStyle(ButtonStyle.Success))] });
		}
		if (interaction.isButton() && interaction.customId.startsWith("rites_admin_")) return handleAdminButton(interaction);
		if (interaction.isChannelSelectMenu() && interaction.customId === "rites_admin_announcement_select") return saveDefaultAnnouncementChannel(interaction);
		if (interaction.isButton() && interaction.customId.startsWith("rites_ticket_open")) return openTicket(interaction, interaction.customId.split(":")[1]);
		if (interaction.isButton() && interaction.customId === "rites_ticket_close") return showCloseTicketModal(interaction);
		if (interaction.isButton() && interaction.customId === "rites_ticket_triage") return showTriageModal(interaction);
		if (interaction.isModalSubmit() && interaction.customId === "rites_ticket_close_modal") return closeTicket(interaction);
		if (interaction.isModalSubmit() && interaction.customId === "rites_ticket_triage_modal") return createForumPostFromTicket(interaction);
		if (interaction.isModalSubmit() && interaction.customId === "rites_admin_broadcast_modal") return handleBroadcastModal(interaction);
	} catch (error) {
		const payload = { content: error.message, ephemeral: true };
		if (interaction.deferred) await interaction.editReply(payload).catch(() => {});
		else if (interaction.replied) await interaction.followUp(payload).catch(() => {});
		else await interaction.reply(payload).catch(() => {});
	}
}

async function handleAdminButton(interaction) {
	if (!interaction.guild || !interaction.memberPermissions?.has("ManageGuild")) return interaction.reply({ content: "You need Manage Server permission to use this control.", ephemeral: true });
	if (interaction.customId === "rites_admin_announcement") {
		const { ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType } = discordModule;
		const picker = new ChannelSelectMenuBuilder().setCustomId("rites_admin_announcement_select").setPlaceholder("Choose this server's announcement channel").setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
		return interaction.reply({ content: "Select the default RitesDev announcement channel for this server.", components: [new ActionRowBuilder().addComponents(picker)], ephemeral: true });
	}
	if (interaction.customId === "rites_admin_setup") {
		await interaction.deferReply({ ephemeral: true });
		const result = await applySetup(interaction.guildId);
		return interaction.editReply(result.message);
	}
	if (interaction.customId === "rites_admin_ticket_panel") {
		await interaction.deferReply({ ephemeral: true });
		const result = await sendTicketPanel(interaction.guildId);
		return interaction.editReply(result.message);
	}
	if (interaction.customId === "rites_admin_broadcast") {
		const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = discordModule;
		const modal = new ModalBuilder().setCustomId("rites_admin_broadcast_modal").setTitle("Send RitesDev announcement");
		const message = new TextInputBuilder().setCustomId("message").setLabel("Message to default channels across servers").setStyle(TextInputStyle.Paragraph).setMaxLength(2000).setRequired(true);
		modal.addComponents(new ActionRowBuilder().addComponents(message));
		return interaction.showModal(modal);
	}
}

async function saveDefaultAnnouncementChannel(interaction) {
	if (!interaction.guild || !interaction.memberPermissions?.has("ManageGuild")) return interaction.reply({ content: "You need Manage Server permission to change this setting.", ephemeral: true });
	const channel = await interaction.guild.channels.fetch(interaction.values[0]).catch(() => null);
	if (!channel || ![discordModule.ChannelType.GuildText, discordModule.ChannelType.GuildAnnouncement].includes(channel.type)) return interaction.reply({ content: "Choose a text or announcement channel in this server.", ephemeral: true });
	const store = await readConfigStore();
	const config = store[interaction.guildId] ?? await initialConfig(interaction.guild);
	config.announcementChannelId = channel.id;
	await saveConfig(config);
	return interaction.reply({ content: `Default RitesDev announcement channel set to <#${channel.id}>.`, ephemeral: true });
}

async function handleBroadcastModal(interaction) {
	if (!interaction.guild || !interaction.memberPermissions?.has("ManageGuild")) return interaction.reply({ content: "You need Manage Server permission to send announcements.", ephemeral: true });
	await interaction.deferReply({ ephemeral: true });
	const result = await sendAnnouncement({ message: interaction.fields.getTextInputValue("message"), allServers: true, allChannels: false });
	const summary = result.results.map((item) => `${item.success ? "✓" : "×"} ${item.guildName ?? item.guildId}: ${item.message}`).join("\n");
	await interaction.editReply(summary || "No servers are connected.");
}

async function openTicket(interaction, selectedTypeId) {
	if (!interaction.guild || !interaction.channel) throw new Error("Open tickets from a server ticket panel.");
	await interaction.deferReply({ ephemeral: true });
	const store = await readConfigStore();
	const config = store[interaction.guildId] ?? await initialConfig(interaction.guild);
	config.tickets = normalizeTickets(config.tickets);
	const panelChannel = config.tickets.channelId ? await interaction.guild.channels.fetch(config.tickets.channelId).catch(() => null) : null;
	if (panelChannel?.type !== discordModule.ChannelType.GuildText) throw new Error("Ticket setup needs a valid text channel. Ask a server manager to configure it in Discord Bot Manager.");
	if (panelChannel.id !== interaction.channel.id) throw new Error("Use a ticket type button from the current support panel.");
	const selectedType = (config.tickets.types?.length ? config.tickets.types : defaultTicketTypes).find((type) => type.id === (selectedTypeId || defaultTicketTypes[0].id));
	if (!selectedType) throw new Error("This ticket type is no longer configured. Ask a server manager to repost the support panel.");
	const records = config.tickets.records ??= {};
	const existing = Object.values(records).find((ticket) => ticket.memberId === interaction.user.id && !ticket.closedAt);
	if (existing) {
		const thread = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
		if (thread?.isThread() && !thread.archived) return interaction.editReply(`You already have an open ticket: ${thread}`);
		existing.closedAt = new Date().toISOString(); existing.closedById = client.user.id; existing.resolved = false; existing.closingNote = "Automatically closed stale ticket record.";
		existing.requesterRemovalAt = new Date(Date.now() + config.tickets.retentionHours * 60 * 60 * 1000).toISOString();
		scheduleRequesterRemoval(interaction.guildId, existing.channelId, existing.requesterRemovalAt);
	}
	const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = discordModule;
	const ticketNumber = Math.max(1000, ...Object.values(records).map((ticket) => Number(ticket.ticketNumber) || Number(ticket.channelName?.match(/^ticket-(\d+)/u)?.[1]) || 0)) + 1;
	const namePart = slugifyTicketName(interaction.user.username) || "member";
	const typePart = slugifyTicketName(selectedType.label) || selectedType.id;
	const channelName = `ticket-${ticketNumber}-${typePart}-${namePart}`.slice(0, 100);
	const thread = await panelChannel.threads.create({ name: channelName, type: discordModule.ChannelType.PrivateThread, invitable: false, reason: `RitesDev ${selectedType.label} ticket opened` });
	await thread.members.add(interaction.user.id);
	if (config.tickets.moderatorRoleIds.length) {
		const members = await interaction.guild.members.fetch();
		const moderatorIds = members.filter((member) => member.roles.cache.some((role) => config.tickets.moderatorRoleIds.includes(role.id))).map((member) => member.id);
		await Promise.all(moderatorIds.map((id) => thread.members.add(id).catch(() => {})));
	}
	records[thread.id] = { guildId: interaction.guildId, channelId: thread.id, channelName, ticketNumber, ticketTypeId: selectedType.id, ticketType: selectedType.label, memberId: interaction.user.id, memberName: interaction.user.username, openedAt: new Date().toISOString() };
	await saveConfig(config);
	await thread.send({ content: `${interaction.user} opened a **${selectedType.label}** ticket.\n\n${config.tickets.welcomeMessage}`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("rites_ticket_triage").setLabel("Create client request post").setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId("rites_ticket_close").setLabel("Close ticket").setStyle(ButtonStyle.Danger))] });
	await interaction.editReply(`Your private ticket is ready: ${thread}`);
}

function slugifyTicketName(value) {
	return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 36);
}

function isModerator(interaction, tickets) {
	if (interaction.memberPermissions?.has("Administrator")) return true;
	const roles = interaction.member?.roles;
	return Boolean(roles?.cache?.some((role) => tickets.moderatorRoleIds.includes(role.id)));
}

async function showCloseTicketModal(interaction) {
	const store = await readConfigStore();
	const config = store[interaction.guildId];
	if (!config || !isModerator(interaction, config.tickets)) return interaction.reply({ content: "Only configured moderators can close this ticket.", ephemeral: true });
	const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = discordModule;
	const modal = new ModalBuilder().setCustomId("rites_ticket_close_modal").setTitle("Close support ticket");
	const resolved = new TextInputBuilder().setCustomId("resolved").setLabel("Was this ticket resolved?").setStyle(TextInputStyle.Short).setPlaceholder("yes or no").setRequired(true);
	const note = new TextInputBuilder().setCustomId("note").setLabel("Optional moderator note").setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false);
	modal.addComponents(new ActionRowBuilder().addComponents(resolved), new ActionRowBuilder().addComponents(note));
	await interaction.showModal(modal);
}

async function showTriageModal(interaction) {
	const store = await readConfigStore();
	const config = store[interaction.guildId];
	if (!config || !isModerator(interaction, config.tickets)) return interaction.reply({ content: "Only configured moderators can create a client request post.", ephemeral: true });
	const record = config.tickets.records?.[interaction.channelId];
	if (!record || record.closedAt) return interaction.reply({ content: "This is not an open RitesDev ticket.", ephemeral: true });
	if (record.forumPostId) return interaction.reply({ content: `This ticket already links to <https://discord.com/channels/${interaction.guildId}/${record.forumPostId}>.`, ephemeral: true });
	const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = discordModule;
	const modal = new ModalBuilder().setCustomId("rites_ticket_triage_modal").setTitle("Create client request post");
	const title = new TextInputBuilder().setCustomId("title").setLabel("Forum post title").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true);
	const summary = new TextInputBuilder().setCustomId("summary").setLabel("Request summary (up to 1,900 characters)").setStyle(TextInputStyle.Paragraph).setMaxLength(1900).setRequired(true);
	modal.addComponents(new ActionRowBuilder().addComponents(title), new ActionRowBuilder().addComponents(summary));
	return interaction.showModal(modal);
}

async function createForumPostFromTicket(interaction) {
	if (!interaction.guild || !interaction.channel) throw new Error("Create the request post from its ticket thread.");
	const store = await readConfigStore();
	const config = store[interaction.guildId];
	if (!config || !isModerator(interaction, config.tickets)) return interaction.reply({ content: "Only configured moderators can create a client request post.", ephemeral: true });
	const record = config.tickets.records?.[interaction.channelId];
	if (!record || record.closedAt) return interaction.reply({ content: "This is not an open RitesDev ticket.", ephemeral: true });
	if (record.forumPostId) return interaction.reply({ content: `This ticket already links to <https://discord.com/channels/${interaction.guildId}/${record.forumPostId}>.`, ephemeral: true });
	const channels = await interaction.guild.channels.fetch();
	const forum = channels.find((channel) => channel?.type === discordModule.ChannelType.GuildForum && channel.name.toLowerCase() === "client-requests");
	if (!forum) throw new Error("This server needs a #client-requests forum before ticket triage can create a linked post.");
	const title = interaction.fields.getTextInputValue("title").trim();
	const summary = interaction.fields.getTextInputValue("summary").trim();
	if (!title || !summary) throw new Error("Enter a title and request summary.");
	const newRequestTag = forum.availableTags.find((tag) => tag.name.toLowerCase() === "new request");
	const post = await forum.threads.create({ name: title.slice(0, 100), message: { content: `${summary}\n\nTicket: <#${interaction.channelId}>`, allowedMentions: { parse: [] } }, ...(newRequestTag ? { appliedTags: [newRequestTag.id] } : {}), reason: `Triage ticket ${record.ticketNumber ?? interaction.channelId}` });
	record.forumPostId = post.id;
	record.forumPostChannelId = forum.id;
	record.triagedAt = new Date().toISOString();
	record.triagedById = interaction.user.id;
	await saveConfig(config);
	return interaction.reply({ content: `Created and linked the client request post: <https://discord.com/channels/${interaction.guildId}/${post.id}>`, ephemeral: true });
}

async function closeTicket(interaction) {
	const channel = interaction.channel;
	if (!channel?.isThread() || !interaction.guild) throw new Error("This is not a support ticket thread.");
	const store = await readConfigStore();
	const config = store[interaction.guildId] ?? await initialConfig(interaction.guild);
	config.tickets = normalizeTickets(config.tickets);
	if (!isModerator(interaction, config.tickets)) return interaction.reply({ content: "Only configured moderators can close this ticket.", ephemeral: true });
	const record = config.tickets.records?.[channel.id];
	if (!record || record.closedAt) return interaction.reply({ content: "This thread is not an open RitesDev ticket.", ephemeral: true });
	const logChannel = await resolveTicketLogChannel(interaction.guild, config.tickets);
	await interaction.deferReply();
	const resolved = /^y(es)?$/i.test(interaction.fields.getTextInputValue("resolved").trim());
	const note = interaction.fields.getTextInputValue("note").trim();
	const messages = await fetchAllMessages(channel);
	const html = renderTranscript(messages, channel.name);
	const { AttachmentBuilder } = discordModule;
	const attachment = new AttachmentBuilder(Buffer.from(html, "utf8"), { name: `ticket-${channel.id}.html` });
	const now = new Date();
	const retentionRemovalAt = new Date(now.getTime() + config.tickets.retentionHours * 60 * 60 * 1000);
	const status = `Ticket **${record.channelName ?? channel.name}** (${record.ticketType ?? "Support"}) closed by ${interaction.user.tag}.\nRequester: <@${record.memberId}>\nResolution: ${resolved ? "Resolved" : "Unresolved"}${note ? `\nNote: ${note}` : ""}${record.forumPostId ? `\nRequest post: <https://discord.com/channels/${interaction.guildId}/${record.forumPostId}>` : ""}`;
	await logChannel.send({ content: status, files: [attachment], allowedMentions: { parse: [] } });
	await channel.send(`Ticket closed. Transcript delivered to <#${logChannel.id}>. Requester access will be removed in ${config.tickets.retentionHours} hour(s).`);
	record.closedAt = now.toISOString(); record.closedById = interaction.user.id; record.resolved = resolved; record.closingNote = note; record.requesterRemovalAt = retentionRemovalAt.toISOString();
	await saveConfig(config);
	scheduleRequesterRemoval(interaction.guildId, channel.id, record.requesterRemovalAt);
	await interaction.editReply(`Ticket closed and transcript delivered to #${logChannel.name}. Requester removal is scheduled for ${retentionRemovalAt.toISOString()}.`);
	await channel.setArchived(true, "Ticket closed; transcript delivered to ticket log");
}

async function resolveTicketLogChannel(guild, tickets) {
	const channels = await guild.channels.fetch();
	const channel = tickets.logChannelId ? channels.get(tickets.logChannelId) : channels.find((item) => item?.type === discordModule.ChannelType.GuildText && item.name.toLowerCase() === "ticket-log");
	if (!channel || channel.type !== discordModule.ChannelType.GuildText) throw new Error("Choose a regular text channel for ticket transcripts, or create a #ticket-log channel.");
	if (!channel.permissionsFor(client.user).has(["ViewChannel", "SendMessages", "AttachFiles"])) throw new Error(`The bot needs View Channel, Send Messages, and Attach Files in #${channel.name}.`);
	return channel;
}

async function scheduleStoredTicketRemovals() {
	const store = await readConfigStore();
	for (const [guildId, config] of Object.entries(store)) {
		for (const [ticketId, record] of Object.entries(config.tickets?.records ?? {})) {
			if (!record.closedAt || record.requesterRemovedAt) continue;
			const removalAt = record.requesterRemovalAt ?? new Date(Date.parse(record.closedAt) + (config.tickets.retentionHours ?? 168) * 60 * 60 * 1000).toISOString();
			scheduleRequesterRemoval(guildId, ticketId, removalAt);
		}
	}
}

function scheduleRequesterRemoval(guildId, ticketId, removalAt) {
	const key = `${guildId}:${ticketId}`;
	const prior = ticketRetentionTimers.get(key);
	if (prior) clearTimeout(prior);
	const due = Date.parse(removalAt);
	if (!Number.isFinite(due)) return;
	const delay = Math.min(Math.max(0, due - Date.now()), 2_147_000_000);
	const timer = setTimeout(async () => {
		ticketRetentionTimers.delete(key);
		if (Date.now() < due) return scheduleRequesterRemoval(guildId, ticketId, removalAt);
		try { await removeTicketRequester(guildId, ticketId); }
		catch (error) {
			console.error(`[discord-manager] Requester removal failed for ticket ${ticketId}:`, error.message);
			scheduleRequesterRemoval(guildId, ticketId, new Date(Date.now() + 15 * 60 * 1000).toISOString());
		}
	}, delay);
	timer.unref?.();
	ticketRetentionTimers.set(key, timer);
}

async function removeTicketRequester(guildId, ticketId) {
	const guild = client?.guilds.cache.get(guildId);
	if (!guild) return;
	const store = await readConfigStore();
	const config = store[guildId];
	const record = config?.tickets?.records?.[ticketId];
	if (!record || record.requesterRemovedAt || !record.closedAt) return;
	const thread = await guild.channels.fetch(record.channelId ?? ticketId).catch(() => null);
	if (thread?.isThread() && thread.type === discordModule.ChannelType.PrivateThread) {
		if (thread.archived) await thread.setArchived(false, "Remove ticket requester after retention period");
		await thread.members.remove(record.memberId).catch((error) => { if (![10007, 10013].includes(error.code)) throw error; });
		await thread.setArchived(true, "Ticket requester access removed after retention period");
	}
	record.requesterRemovedAt = new Date().toISOString();
	await saveConfig(config);
}

async function fetchAllMessages(channel) {
	const messages = [];
	let before;
	while (true) {
		const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
		if (!page.size) break;
		messages.push(...page.values());
		before = page.last().id;
		if (page.size < 100) break;
	}
	return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

function renderTranscript(messages, title) {
	const rows = messages.map((message) => {
		const attachments = [...message.attachments.values()].map((item) => `<p><a href="${escapeHtml(item.url)}">${escapeHtml(item.name ?? "Attachment")}</a></p>`).join("");
		return `<article><header><strong>${escapeHtml(message.author.tag)}</strong><time>${new Date(message.createdTimestamp).toLocaleString("en-US", { timeZone: "UTC" })} UTC</time></header><p>${escapeHtml(message.content).replace(/\n/g, "<br>") || ""}</p>${attachments}</article>`;
	}).join("\n");
	return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)} transcript</title><style>body{margin:0;padding:24px;background:#f7f5fa;color:#4a475a;font:15px/1.5 system-ui,sans-serif}.page{max-width:850px;margin:auto}h1{font-size:22px}article{margin:12px 0;padding:14px 16px;border:1px solid #ded9e8;border-radius:12px;background:white}header{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px}time{color:#827d89;font-size:12px}p{margin:0;overflow-wrap:anywhere}a{color:#526c9b}</style><main class="page"><h1>${escapeHtml(title)} transcript</h1>${rows || "<p>No messages.</p>"}</main></html>`;
}

async function syncCommands() {
	if (!client?.isReady()) throw new Error("The bot is not connected.");
	const { SlashCommandBuilder } = discordModule;
	const command = new SlashCommandBuilder().setName("riteserver").setDescription("Open the RitesDev server setup dashboard");
	const registered = await client.application.commands.fetch();
	const existing = registered.find((item) => item.name === "riteserver");
	if (existing) await existing.edit(command.toJSON());
	else await client.application.commands.create(command);
	for (const legacyName of ["ticket-rites", "ticket", "ticket-panel"]) {
		const legacy = registered.find((item) => item.name === legacyName);
		if (legacy) await legacy.delete();
	}
	return { success: true, message: "The global /riteserver command was registered. It may take up to an hour to appear in every server." };
}

async function readCredentials() {
	let env = "";
	try { env = await fs.readFile(envPath, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
	const match = env.match(/^\s*DISCORD_BOT_TOKEN\s*=\s*(.*)\s*$/m);
	let token = match?.[1] ?? "";
	if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) token = token.slice(1, -1);
	return { token };
}

async function writeToken(token) {
	let env = "";
	try { env = await fs.readFile(envPath, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
	const line = `DISCORD_BOT_TOKEN=${JSON.stringify(token)}`;
	if (/^\s*DISCORD_BOT_TOKEN\s*=.*$/m.test(env)) env = env.replace(/^\s*DISCORD_BOT_TOKEN\s*=.*$/m, line);
	else env = `${env}${env && !env.endsWith("\n") ? "\n" : ""}${line}\n`;
	await fs.writeFile(envPath, env, { encoding: "utf8", mode: 0o600 });
	await fs.chmod(envPath, 0o600);
}
