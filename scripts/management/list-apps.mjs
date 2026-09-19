#!/usr/bin/env node
// List and describe all development management apps

import { DEV_APPS_REGISTRY, getActiveApps, getAppsByType, getAppPath } from "../../ritesGlobal/devapps-registry.mjs";
import fs from "node:fs";

console.log("\n╔════════════════════════════════════════════════════════════════╗");
console.log("║        Development Management Apps - Registry Report          ║");
console.log("╚════════════════════════════════════════════════════════════════╝\n");

const args = process.argv.slice(2);
const showInactive = args.includes("--all");

// Count apps
const allApps = Object.values(DEV_APPS_REGISTRY);
const activeApps = allApps.filter((a) => a.active);
const inactiveApps = allApps.filter((a) => !a.active);

console.log(`📊 STATISTICS`);
console.log("─".repeat(65));
console.log(`Total Apps: ${allApps.length}`);
console.log(`Active: ${activeApps.length}`);
console.log(`Inactive: ${inactiveApps.length}\n`);

// Show active apps
console.log("🚀 ACTIVE DEVELOPMENT APPS");
console.log("─".repeat(65));

activeApps.forEach((app) => {
	const appPath = getAppPath(app.id);
	const exists = fs.existsSync(appPath) ? "✓" : "✗";

	console.log(`\n${exists} ${app.name}`);
	console.log(`  ID:           ${app.basePath}`);
	console.log(`  Type:         ${app.type}`);
	console.log(`  Port:         ${app.port}`);
	console.log(`  Description:  ${app.description}`);
	console.log(`  Manages:      ${app.manages.join(", ")}`);

	if (app.contentTypes) {
		console.log(`  Content:      ${app.contentTypes.join(", ")}`);
	}

	if (app.basePath) {
		console.log(`  Location:     devApps/${app.basePath}/`);
	}
});

// Show inactive apps if requested
if (showInactive && inactiveApps.length > 0) {
	console.log("\n\n⊘ INACTIVE APPS (Legacy/Superseded)");
	console.log("─".repeat(65));

	inactiveApps.forEach((app) => {
		console.log(`\n⊘ ${app.name}`);
		console.log(`  Type:    ${app.type}`);
		console.log(`  Reason:  ${app.reason || "Superseded"}`);
		console.log(`  Info:    ${app.description}`);
	});
}

// Port mapping
console.log("\n\n🔌 PORT MAPPING");
console.log("─".repeat(65));

const ports = activeApps.sort((a, b) => a.port - b.port);
ports.forEach((app) => {
	console.log(`  Port ${app.port.toString().padEnd(5)} - ${app.name.padEnd(25)} (${app.basePath})`);
});

// Quick start guide
console.log("\n\n⚡ QUICK START");
console.log("─".repeat(65));
console.log("  npm run devapps          - Launch main app launcher");
console.log("  npm run editor           - Launch content editor");
console.log("  npm run post-manager     - Launch post manager (legacy)");
console.log("  npm run dev              - Start Astro dev server");
console.log("\n  npm run mgmt:setup       - Verify all apps are set up");
console.log("  npm run mgmt:status      - Show overall status");

// Show how to add new apps
console.log("\n\n📝 TO ADD A NEW MANAGEMENT APP:");
console.log("─".repeat(65));
console.log("  1. Create folder: devApps/your-app-name/");
console.log("  2. Create devapp.meta.json with app metadata");
console.log("  3. Register in ritesGlobal/devapps-registry.mjs");
console.log("  4. Add port: use next available (usually next after " + Math.max(...ports.map((a) => a.port)) + ")");
console.log("  5. Run: npm run mgmt:status to verify\n");
