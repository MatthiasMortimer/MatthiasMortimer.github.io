#!/usr/bin/env node
// Verify environment setup and readiness for dev management apps

import {
	DEV_APPS_REGISTRY,
	getActiveApps,
	getAppPath,
	listAppDirectories,
	getAppMetadata,
} from "../../ritesGlobal/devapps-registry.mjs";
import { getContentInventory, getSiteContent } from "../../ritesGlobal/content-inventory.mjs";
import { listSites } from "../../ritesGlobal/sites.registry.mjs";
import fs from "node:fs";
import path from "node:path";

console.log("\n╔════════════════════════════════════════════════════════════════╗");
console.log("║              Environment Setup Verification                   ║");
console.log("╚════════════════════════════════════════════════════════════════╝\n");

let issues = [];
let warnings = [];
let success = [];

// 1. Check sites registry
console.log("🔍 CHECKING SITES REGISTRY...");
try {
	const sites = listSites();
	if (sites.length > 0) {
		success.push(`Found ${sites.length} registered website(s)`);
		sites.forEach((site) => {
			const metaPath = path.join(site.dir, "site.meta.json");
			if (fs.existsSync(metaPath)) {
				success.push(`  ✓ ${site.label} (${site.slug})`);
			} else {
				issues.push(`  ✗ Missing site.meta.json for ${site.folder}`);
			}
		});
	} else {
		issues.push("No websites found in /sites directory");
	}
} catch (e) {
	issues.push(`Error reading sites: ${e.message}`);
}

// 2. Check content inventory
console.log("🔍 CHECKING CONTENT INVENTORY...");
try {
	const inventory = getContentInventory();
	if (inventory.length > 0) {
		success.push(`Content inventory loaded for ${inventory.length} site(s)`);
		inventory.forEach((site) => {
			const typeCount = Object.keys(site.contentTypes).length;
			success.push(`  ✓ ${site.label}: ${typeCount} content type(s)`);
		});
	} else {
		issues.push("No content inventory found");
	}
} catch (e) {
	issues.push(`Error loading content inventory: ${e.message}`);
}

// 3. Check dev apps
console.log("🔍 CHECKING DEV APPS...");
try {
	const activeApps = getActiveApps();
	const appDirs = listAppDirectories();

	success.push(`Dev apps directory contains ${appDirs.length} app(s)`);
	appDirs.forEach((appDir) => {
		success.push(`  ✓ Found folder: ${appDir}`);
	});

	console.log("\nChecking active apps:");
	activeApps.forEach((app) => {
		const appPath = getAppPath(app.id);
		const exists = fs.existsSync(appPath);

		if (exists) {
			success.push(`  ✓ ${app.name} (${app.id}) - directory exists`);

			// Check for devapp.meta.json
			const metaPath = path.join(appPath, "devapp.meta.json");
			if (fs.existsSync(metaPath)) {
				success.push(`     ✓ devapp.meta.json found`);
			} else {
				warnings.push(`     ⚠ Missing devapp.meta.json for ${app.name}`);
			}

			// Check for package.json (for Node apps)
			const pkgPath = path.join(appPath, "package.json");
			if (fs.existsSync(pkgPath)) {
				success.push(`     ✓ package.json found`);
			}

			// Check for node_modules
			const nmPath = path.join(appPath, "node_modules");
			if (!fs.existsSync(nmPath)) {
				warnings.push(`     ⚠ Missing node_modules (run 'npm install' in ${app.basePath})`);
			} else {
				success.push(`     ✓ node_modules installed`);
			}
		} else {
			issues.push(`  ✗ ${app.name} directory not found at ${appPath}`);
		}
	});
} catch (e) {
	issues.push(`Error checking dev apps: ${e.message}`);
}

// 4. Check management utilities
console.log("🔍 CHECKING MANAGEMENT UTILITIES...");
try {
	const utilities = [
		"ritesGlobal/content-inventory.mjs",
		"ritesGlobal/devapps-registry.mjs",
		"ritesGlobal/content-management.mjs",
		"ritesGlobal/sites.registry.mjs",
	];

	utilities.forEach((util) => {
		const utilPath = path.resolve(util);
		if (fs.existsSync(utilPath)) {
			success.push(`  ✓ ${util}`);
		} else {
			issues.push(`  ✗ Missing utility: ${util}`);
		}
	});
} catch (e) {
	issues.push(`Error checking utilities: ${e.message}`);
}

// 5. Check global registry files
console.log("🔍 CHECKING REGISTRY FILES...");
try {
	const registryFiles = [
		"ritesGlobal/contact.js",
		"ritesGlobal/contact.json",
		"ritesGlobal/projects.js",
		"ritesGlobal/tags.json",
		"ritesGlobal/sites.registry.mjs",
	];

	registryFiles.forEach((file) => {
		const filePath = path.resolve(file);
		if (fs.existsSync(filePath)) {
			success.push(`  ✓ ${file}`);
		} else {
			warnings.push(`  ⚠ Optional file missing: ${file}`);
		}
	});
} catch (e) {
	issues.push(`Error checking registry files: ${e.message}`);
}

// Print results
console.log("\n" + "═".repeat(65));
console.log("RESULTS");
console.log("═".repeat(65));

if (success.length > 0) {
	console.log("\n✅ SUCCESS");
	success.forEach((msg) => console.log(`  ${msg}`));
}

if (warnings.length > 0) {
	console.log("\n⚠️  WARNINGS");
	warnings.forEach((msg) => console.log(`  ${msg}`));
}

if (issues.length > 0) {
	console.log("\n❌ ISSUES");
	issues.forEach((msg) => console.log(`  ${msg}`));
}

console.log("\n" + "═".repeat(65));

if (issues.length === 0) {
	console.log("✨ Environment is ready for dev management apps!\n");
	process.exit(0);
} else {
	console.log("⚠️  Please resolve the issues above before adding new apps.\n");
	process.exit(1);
}
