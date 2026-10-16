const fs = require("node:fs");
const path = require("node:path");

// Runtime environment: "live" (default) or "test"
	// Test copies are marked by RITES_ENV=test or a gitignored `.rites-env` file containing "test".
	// Test mode shifts every port by +100 and never touches the public tunnel.
const REPO_ROOT = path.resolve(__dirname, "..");
const TEST_PORT_OFFSET = 100;

function readMarker() {
	try {
		return fs.readFileSync(path.join(REPO_ROOT, ".rites-env"), "utf8").trim();
	} catch {
		return "";
	}
}

const name = (process.env.RITES_ENV || readMarker()) === "test" ? "test" : "live";
const isTest = name === "test";

function port(basePort) {
	if (!Number.isFinite(basePort)) return basePort ?? null;
	return isTest ? basePort + TEST_PORT_OFFSET : basePort;
}

module.exports = { name, isTest, port, REPO_ROOT, TEST_PORT_OFFSET };
