import { readFile } from "node:fs/promises";
import "dotenv/config";

const layoutUrl = new URL("./server-layout.json", import.meta.url);
const layout = JSON.parse(await readFile(layoutUrl, "utf8"));
const dryRun = process.argv.includes("--dry-run");
const guildId = process.env.DISCORD_GUILD_ID;

if (process.argv.includes("--help")) {
	console.log("Usage: DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... npm run discord:setup [-- --dry-run]");
	console.log("Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID in your local environment. Use --dry-run to preview changes.");
	process.exit(0);
}

if (!guildId) {
	console.error("Missing DISCORD_GUILD_ID. Set it to the ID of the server you want to configure.");
	process.exit(1);
}

if (!dryRun && !process.env.DISCORD_BOT_TOKEN) {
	console.error("Missing DISCORD_BOT_TOKEN. Set it in your local environment; do not commit or share the token.");
	process.exit(1);
}

let discord;
if (!dryRun) {
	try {
		discord = await import("discord.js");
	} catch {
		console.error("discord.js is not installed. Run: npm install discord.js");
		process.exit(1);
	}
}

const planned = layout.categories.flatMap((category) => category.channels.map((channel) => ({
	category: category.name,
	channel: typeof channel === "string" ? { name: channel } : channel,
})));

if (dryRun) {
	console.log(`Dry run for guild ${guildId}:`);
	for (const category of layout.categories) {
		console.log(`\n[${category.name}]`);
		for (const entry of planned.filter((item) => item.category === category.name)) {
			console.log(`# ${entry.channel.name}`);
		}
	}
	console.log(`\nRoles to create or update: ${layout.roles.map((role) => role.name).join(", ")}`);
	console.log("Category access rules will be applied from server-layout.json.");
	process.exit(0);
}

const { Client, GatewayIntentBits, ChannelType, PermissionsBitField } = discord;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

try {
	await client.login(process.env.DISCORD_BOT_TOKEN);
	const guild = await client.guilds.fetch(guildId);
	const me = await guild.members.fetchMe();
	if (!me.permissions.has(["ManageChannels", "ManageRoles"])) {
		throw new Error("The bot needs Manage Channels and Manage Roles permissions in the target server.");
	}

	const everyone = guild.roles.everyone;
	const roles = new Map();
	for (const roleSpec of layout.roles) {
		const existingRole = guild.roles.cache.find((role) => role.name.toLowerCase() === roleSpec.name.toLowerCase());
		const permissions = new PermissionsBitField(roleSpec.permissions);
		const role = existingRole
			? await existingRole.edit({ permissions, reason: "Apply RitesDev server setup role configuration" })
			: await guild.roles.create({
				name: roleSpec.name,
				permissions,
				reason: "Create RitesDev server setup roles",
			});
		roles.set(roleSpec.name, role);
		console.log(`${existingRole ? "Updated" : "Created"} role: ${role.name}`);
	}

	// Keep managed roles below the bot's top role, in the order in server-layout.json.
	const botTopRole = me.roles.highest;
	for (const [index, roleSpec] of layout.roles.entries()) {
		const role = roles.get(roleSpec.name);
		if (role.position >= botTopRole.position) {
			throw new Error(`Move the bot role above "${role.name}" in Server Settings → Roles, then rerun setup.`);
		}
		await role.setPosition(Math.max(1, botTopRole.position - index - 1));
	}

	const existingChannels = await guild.channels.fetch();
	for (const categorySpec of layout.categories) {
		const categoryOverwrites = await makeCategoryOverwrites(categorySpec.name, everyone, roles, layout.categoryAccess, guild);
		let category = existingChannels.find((channel) =>
			channel?.type === ChannelType.GuildCategory && channel.name.toLowerCase() === categorySpec.name.toLowerCase(),
		);
		if (!category) {
			category = await guild.channels.create({
				name: categorySpec.name,
				type: ChannelType.GuildCategory,
				permissionOverwrites: categoryOverwrites,
			});
			console.log(`Created category: ${category.name}`);
		} else {
			await category.permissionOverwrites.set(categoryOverwrites);
			console.log(`Using category: ${category.name}`);
		}

		for (const channelSpec of categorySpec.channels) {
			const config = typeof channelSpec === "string" ? { name: channelSpec, type: "text", tags: [] } : { ...channelSpec, type: channelSpec.type ?? "text", tags: channelSpec.tags ?? [] };
			const existing = existingChannels.find((channel) =>
				channel?.parentId === category.id && channel.name.toLowerCase() === config.name.toLowerCase(),
			);
			if (existing) {
				await applyChannelAccess(existing, category, config.access, everyone, roles, guild, client.user.id);
				console.log(`  Exists: #${existing.name}`);
				continue;
			}
			const created = await guild.channels.create({
				name: config.name,
				type: config.type === "forum" ? ChannelType.GuildForum : config.type === "announcement" ? ChannelType.GuildAnnouncement : ChannelType.GuildText,
				parent: category.id,
				...(config.topic ? { topic: config.topic } : {}),
				...(config.type === "forum" ? { availableTags: config.tags.slice(0, 20).map((name) => ({ name: String(name).trim().slice(0, 20), moderated: false })) } : {}),
			});
			await applyChannelAccess(created, category, config.access, everyone, roles, guild, client.user.id);
			existingChannels.set(created.id, created);
			console.log(`  Created: #${created.name}`);
		}
	}

	console.log("Server setup complete. Assign members to roles and add individual client/project access before inviting clients.");
} catch (error) {
	console.error(`Discord setup failed: ${error.message}`);
	process.exitCode = 1;
} finally {
	client?.destroy();
}

async function makeCategoryOverwrites(categoryName, everyone, roles, accessConfig, guild) {
	const access = accessConfig[categoryName] ?? { everyone: "hidden" };
	const visible = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, Connect: true, Speak: true };
	const hidden = { ViewChannel: false };
	const overwrites = [{ id: everyone.id, type: 0, ...permissionsFor(access.everyone) }];
	for (const [roleName, rule] of Object.entries(access.roles ?? {})) {
		const role = roles.get(roleName);
		if (!role) throw new Error(`Category "${categoryName}" references unknown role "${roleName}".`);
		overwrites.push({ id: role.id, type: 0, ...permissionsFor(rule) });
	}
	for (const [memberId, rule] of Object.entries(access.members ?? {})) {
		const member = await guild.members.fetch(memberId).catch(() => null);
		if (!member) throw new Error(`Member ${memberId} is no longer in the server; remove their category access before setup.`);
		overwrites.push({ id: member.id, type: 1, ...permissionsFor(rule) });
	}
	return overwrites;

	function permissionsFor(rule) {
		return rule === "view" ? visible : hidden;
	}
}

async function applyChannelAccess(channel, category, access, everyone, roles, guild, botId) {
	const roleRules = access?.roles ?? {};
	const memberRules = access?.members ?? {};
	const hasRules = [access?.everyone, access?.bot, ...Object.values(roleRules), ...Object.values(memberRules)].some((rule) => rule && rule !== "inherit");
	if (!hasRules) { await channel.lockPermissions(); return; }
	const visible = ["ViewChannel", "ReadMessageHistory", "SendMessages"];
	const readOnly = ["ViewChannel", "ReadMessageHistory"];
	const overwrites = new Map(category.permissionOverwrites.cache.map((item) => [item.id, { id: item.id, type: item.type, allow: item.allow.bitfield, deny: item.deny.bitfield }]));
	const putRule = (id, type, rule) => {
		if (!rule || rule === "inherit") return;
		overwrites.set(id, { id, type, allow: rule === "view" ? visible : rule === "read" ? readOnly : [], deny: rule === "hidden" ? ["ViewChannel"] : rule === "read" ? ["SendMessages"] : [] });
	};
	putRule(everyone.id, 0, access?.everyone);
	putRule(botId, 1, access?.bot);
	for (const [roleName, rule] of Object.entries(roleRules)) {
		const role = roles.get(roleName);
		if (!role) throw new Error(`Channel "#${channel.name}" references unknown role "${roleName}".`);
		putRule(role.id, 0, rule);
	}
	for (const [memberId, rule] of Object.entries(memberRules)) {
		const member = await guild.members.fetch(memberId).catch(() => null);
		if (!member) throw new Error(`Member ${memberId} is no longer in the server; remove their channel access before setup.`);
		putRule(member.id, 1, rule);
	}
	await channel.permissionOverwrites.set([...overwrites.values()]);
}

