// Dev Master: discovers devApps/*/devapp.meta.json tools and launches/stops them on demand.
import express from "express";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { listDevApps } from "./registry.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4600;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// folder -> { child, startedAt }
const launched = new Map();

function isPidAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function checkPortOpen(port, timeoutMs = 400) {
	return new Promise((resolve) => {
		const socket = new net.Socket();
		const done = (result) => {
			socket.destroy();
			resolve(result);
		};
		socket.setTimeout(timeoutMs);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
		socket.connect(port, "127.0.0.1");
	});
}

async function withStatus(devApp) {
	const entry = launched.get(devApp.folder);
	let running = false;

	if (devApp.type === "web" && devApp.port) {
		running = await checkPortOpen(devApp.port);
	} else if (entry) {
		running = isPidAlive(entry.child.pid);
	}

	return {
		folder: devApp.folder,
		name: devApp.name,
		description: devApp.description,
		type: devApp.type,
		url: devApp.url ?? null,
		running,
		launchedByDashboard: Boolean(entry),
	};
}

app.get("/api/apps", async (_req, res) => {
	const apps = await Promise.all(listDevApps().map(withStatus));
	res.json(apps);
});

app.post("/api/apps/:folder/launch", (req, res) => {
	const devApp = listDevApps().find((a) => a.folder === req.params.folder);
	if (!devApp) return res.status(404).json({ error: "Unknown app" });

	const existing = launched.get(devApp.folder);
	if (existing && isPidAlive(existing.child.pid)) {
		return res.json({ ok: true, alreadyRunning: true });
	}

	const child = spawn(devApp.command, {
		cwd: devApp.dir,
		shell: true,
		detached: true,
		stdio: "ignore",
	});
	child.unref();
	launched.set(devApp.folder, { child, startedAt: Date.now() });

	res.json({ ok: true });
});

app.post("/api/apps/:folder/stop", (req, res) => {
	const entry = launched.get(req.params.folder);
	if (!entry) {
		return res.status(400).json({ error: "This app wasn't launched from the dashboard, so it can't be stopped from here." });
	}

	try {
		process.kill(-entry.child.pid);
	} catch {
		try {
			process.kill(entry.child.pid);
		} catch {
			/* already gone */
		}
	}
	launched.delete(req.params.folder);
	res.json({ ok: true });
});

app.listen(PORT, () => {
	console.log(`Dev Master running at http://localhost:${PORT}`);
});
