#!/usr/bin/env node
// Display status of all dev management apps and content

import { getAppSummary, getActiveApps, DEV_APPS_REGISTRY } from "../../ritesGlobal/devapps-registry.mjs";
import { getContentInventory } from "../../ritesGlobal/content-inventory.mjs";
import { listSites } from "../../ritesGlobal/sites.registry.mjs";

console.log("\n╔════════════════════════════════════════════════════════════════╗");
console.log("║         RitesDev Ecosystem - Management Status Report         ║");
console.log("╚════════════════════════════════════════════════════════════════╝\n");

// Show sites
console.log("📍 REGISTERED WEBSITES");
console.log("─".repeat(65));
const sites = listSites();
sites.forEach((site) => {
	console.log(`  ✓ ${site.label.padEnd(20)} [${site.slug}] - ${site.basePath}`);
});

// Show content inventory
console.log("\n📚 CONTENT INVENTORY");
console.log("─".repeat(65));
const inventory = getContentInventory();
inventory.forEach((site) => {
	const types = Object.keys(site.contentTypes);
	console.log(`\n  Site: ${site.label} (${site.slug})`);
	console.log(`  Last Updated: ${new Date(site.metadata.lastUpdated).toLocaleString()}`);
	Object.entries(site.contentTypes).forEach(([typeKey, typeConfig]) => {
		const fileCount = typeConfig.files ? typeConfig.files.length : 0;
		console.log(`    • ${typeConfig.label}: ${fileCount} files`);
	});
});

// Show dev apps
console.log("\n🚀 DEVELOPMENT MANAGEMENT APPS");
console.log("─".repeat(65));
const summary = getAppSummary();
console.log(`\n  Total Apps: ${summary.total} (Active: ${summary.active}, Inactive: ${summary.inactive})`);
console.log("\n  Active Apps:");
summary.apps
	.filter((app) => app.active)
	.forEach((app) => {
		const status = app.folderExists ? "✓" : "✗";
		console.log(`    ${status} ${app.name.padEnd(25)} [${app.type}] :${app.port}`);
		console.log(`       ${app.description}`);
		console.log(`       Manages: ${app.manages.join(", ")}`);
	});

console.log("\n  Inactive Apps:");
summary.apps
	.filter((app) => !app.active)
	.forEach((app) => {
		console.log(`    ⊘ ${app.name.padEnd(25)} [${app.type}]`);
	});

// Show next steps
console.log("\n💡 MANAGEMENT COMMANDS");
console.log("─".repeat(65));
console.log("  npm run mgmt:apps       - List all dev management apps");
console.log("  npm run mgmt:content    - Show detailed content inventory");
console.log("  npm run mgmt:status     - Display this status report");
console.log("  npm run mgmt:setup      - Verify environment setup");
console.log("\n  npm run devapps         - Launch dev master (app launcher)");
console.log("  npm run editor          - Launch content editor");
console.log("  npm run dev             - Start Astro dev server");
console.log("  npm run tunnel          - Start dev server + tunnel");

console.log("\n✨ Ready to add new dev management apps!\n");
