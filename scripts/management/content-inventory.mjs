#!/usr/bin/env node
// Display detailed content inventory across all sites

import { getContentInventory, getContentByType, CONTENT_TYPES } from "../../ritesGlobal/content-inventory.mjs";
import fs from "node:fs";
import path from "node:path";

console.log("\n╔════════════════════════════════════════════════════════════════╗");
console.log("║             Content Inventory - Detailed Report               ║");
console.log("╚════════════════════════════════════════════════════════════════╝\n");

const inventory = getContentInventory();

// Group by content type
console.log("📑 CONTENT TYPES ACROSS ALL SITES");
console.log("─".repeat(65));

Object.values(CONTENT_TYPES).forEach((contentType) => {
	const byType = getContentByType(contentType);

	if (byType.length === 0) return;

	console.log(`\n${contentType.toUpperCase()}`);
	byType.forEach((item) => {
		if (item.content) {
			console.log(`  📌 ${item.label}`);
			const files = item.content.files || [];
			const folder = item.content.folder;

			if (folder) {
				const folderPath = path.join(inventory.find((s) => s.slug === item.site).dir, folder);
				let fileList = [];

				try {
					if (fs.existsSync(folderPath)) {
						fileList = fs
							.readdirSync(folderPath)
							.filter((f) => !f.startsWith("."))
							.slice(0, 5); // Show first 5
					}
				} catch (e) {
					// Silently handle errors
				}

				if (fileList.length > 0) {
					console.log(`     Folder: ${folder}`);
					fileList.forEach((f) => console.log(`       ├─ ${f}`));
					if (fileList.length > 5) {
						console.log(`       └─ ... and more`);
					}
				}
			}

			files.forEach((file) => {
				console.log(`     File: ${file}`);
			});

			console.log(`     Status: ${item.content.label}`);
		}
	});
});

// Show site-by-site breakdown
console.log("\n\n📂 CONTENT BY SITE");
console.log("─".repeat(65));

inventory.forEach((site) => {
	console.log(`\n${site.label} (${site.slug})`);
	console.log("─".repeat(65));
	console.log(`Location: ${site.dir}`);
	console.log(`Last Updated: ${new Date(site.metadata.lastUpdated).toLocaleString()}\n`);

	Object.entries(site.contentTypes).forEach(([typeKey, typeConfig]) => {
		const folder = typeConfig.folder;
		let fileCount = typeConfig.files ? typeConfig.files.length : 0;

		console.log(`  📄 ${typeConfig.label}`);

		if (folder) {
			const folderPath = path.join(site.dir, folder);
			try {
				if (fs.existsSync(folderPath)) {
					const files = fs.readdirSync(folderPath).filter((f) => !f.startsWith("."));
					console.log(`     Directory: ${folder}`);
					console.log(`     Files: ${files.length}`);
					files.slice(0, 3).forEach((f) => {
						console.log(`       • ${f}`);
					});
					if (files.length > 3) {
						console.log(`       • ... and ${files.length - 3} more`);
					}
				}
			} catch (e) {
				console.log(`     Directory: ${folder} (Not found)`);
			}
		}

		if (typeConfig.files && typeConfig.files.length > 0) {
			console.log(`     Configuration Files:`);
			typeConfig.files.forEach((f) => {
				const fullPath = path.join(site.dir, f);
				const exists = fs.existsSync(fullPath) ? "✓" : "✗";
				console.log(`       ${exists} ${f}`);
			});
		}

		console.log();
	});
});

console.log("💡 TIP: Use these paths to add new management apps for content editing\n");
