import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const layoutPath = path.resolve(appDir, "../../scripts/discord/server-layout.json");
const envPath = path.resolve(appDir, "../../.env");

export function createApiHandler() {
	let connectionStatus = { connected: false, checkedAt: null, error: null };
	return async function handleApi({ method, pathname, body }) {
		if ((method === "GET" || method === "PUT") && pathname === "/api/credentials") {
			if (method === "GET") return readCredentials();
			await writeCredentials(body);
			connectionStatus = { connected: false, checkedAt: null, error: null };
			return { success: true, message: "Bot credentials saved to the local .env file." };
		}

		if (method === "POST" && pathname === "/api/connect") {
			try {
				connectionStatus = await checkDiscordConnection();
				return connectionStatus;
			} catch (error) {
				connectionStatus = { connected: false, checkedAt: new Date().toISOString(), error: error.message };
				return { status: 400, data: connectionStatus };
			}
		}

		if (method === "GET" && pathname === "/api/status") {
			const credentials = await readCredentials();
			return {
				configured: Boolean(credentials.token),
				serverConfigured: Boolean(credentials.guildId),
				...connectionStatus,
				messagingEnabled: false,
			};
		}

		if (method === "GET" && pathname === "/api/layout") {
			return JSON.parse(await fs.readFile(layoutPath, "utf8"));
		}

		if (method === "PUT" && pathname === "/api/layout") {
			validateLayout(body);
			await fs.writeFile(layoutPath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
			return { success: true, message: "Discord server layout saved." };
		}

		return { status: 404, data: { success: false, message: "Not found" } };
	};
}

async function checkDiscordConnection() {
	const { token, guildId } = await readCredentials();
	if (!token) throw new Error("Enter the bot token before checking the connection.");
	if (!/^\d{17,20}$/.test(guildId)) throw new Error("Enter a valid Discord server ID.");

	const { REST, Routes } = await import("discord.js");
	const rest = new REST({ version: "10" }).setToken(token);
	let bot;
	try {
		bot = await rest.get(Routes.user());
	} catch (error) {
		if (error.status === 401) throw new Error("Discord rejected this bot token. Check the token in Bot Credentials.");
		throw new Error(`Could not authenticate with Discord: ${error.message}`);
	}

	let guild;
	try {
		guild = await rest.get(Routes.guild(guildId));
	} catch (error) {
		if (error.status === 404) throw new Error("The bot cannot find that server. Check the server ID and make sure the bot has been invited.");
		throw new Error(`Could not read the server from Discord: ${error.message}`);
	}

	const requiredPermissions = ["ManageChannels", "ManageRoles"];
	const missingPermissions = [];
	try {
		await rest.get(Routes.guildRoles(guildId));
	} catch (error) {
		if (error.status === 403) missingPermissions.push("ManageRoles");
		else throw new Error(`Could not check role access: ${error.message}`);
	}
	try {
		await rest.get(Routes.guildChannels(guildId));
	} catch (error) {
		if (error.status === 403) missingPermissions.push("ManageChannels");
		else throw new Error(`Could not check channel access: ${error.message}`);
	}
	const checkedAt = new Date().toISOString();
	return {
		connected: true,
		checkedAt,
		error: null,
		bot: { id: bot.id, username: bot.username, discriminator: bot.discriminator },
		guild: { id: guild.id, name: guild.name },
		permissions: { required: requiredPermissions, missing: missingPermissions },
		readyForSetup: missingPermissions.length === 0,
	};
}

async function readCredentials() {
	let envText = "";
	try { envText = await fs.readFile(envPath, "utf8"); } catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const values = Object.create(null);
	for (const line of envText.split(/\r?\n/)) {
		const match = line.match(/^\s*(DISCORD_BOT_TOKEN|DISCORD_GUILD_ID)\s*=\s*(.*)\s*$/);
		if (!match) continue;
		let value = match[2];
		if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
		values[match[1]] = value;
	}
	return { token: values.DISCORD_BOT_TOKEN ?? "", guildId: values.DISCORD_GUILD_ID ?? "" };
}

async function writeCredentials(body) {
	if (!body || typeof body.token !== "string" || typeof body.guildId !== "string") {
		throw new Error("Bot token and server ID must be text values.");
	}
	if (/[\r\n]/.test(body.token) || /[\r\n]/.test(body.guildId)) {
		throw new Error("Credentials cannot contain line breaks.");
	}
	let envText = "";
	try { envText = await fs.readFile(envPath, "utf8"); } catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	const values = { DISCORD_BOT_TOKEN: body.token, DISCORD_GUILD_ID: body.guildId };
	for (const [key, value] of Object.entries(values)) {
		const line = `${key}=${JSON.stringify(value)}`;
		const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
		if (pattern.test(envText)) envText = envText.replace(pattern, line);
		else envText = `${envText}${envText && !envText.endsWith("\n") ? "\n" : ""}${line}\n`;
	}
	await fs.writeFile(envPath, envText, { encoding: "utf8", mode: 0o600 });
	await fs.chmod(envPath, 0o600);
}

function validateLayout(value) {
	if (!value || typeof value !== "object" || typeof value.guildName !== "string" || !Array.isArray(value.categories) || !Array.isArray(value.roles) || !value.categoryAccess || typeof value.categoryAccess !== "object") {
		throw new Error("Layout must include guildName, categories, roles, and categoryAccess.");
	}
	if (!value.categories.length || value.categories.some((category) =>
		!category || typeof category.name !== "string" || !Array.isArray(category.channels) || category.channels.some((channel) =>
			typeof channel === "string" ? !channel.trim() : !channel || typeof channel.name !== "string" || !channel.name.trim(),
		),
	)) throw new Error("Each category needs a name and a list of named channels.");
	if (value.roles.some((role) => !role || typeof role.name !== "string" || !Array.isArray(role.permissions))) {
		throw new Error("Each role needs a name and a permissions list.");
	}
	for (const [category, rules] of Object.entries(value.categoryAccess)) {
		if (!value.categories.some((item) => item.name === category) || !rules || !["view", "hidden"].includes(rules.everyone)) {
			throw new Error(`Invalid category access configuration for ${category}.`);
		}
		for (const [role, access] of Object.entries(rules.roles ?? {})) {
			if (!value.roles.some((item) => item.name === role) || !["view", "hidden"].includes(access)) {
				throw new Error(`Invalid role access for ${category}: ${role}.`);
			}
		}
	}
}
