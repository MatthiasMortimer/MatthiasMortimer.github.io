import versions from "./versions.json" with { type: "json" };

// Shared repo/site version info reused across every RitesDev site.
export const gitversion = versions.gitversion;
export const siteVersions = versions.sites;

export function getSiteVersion(slug) {
	return versions.sites[slug]?.version;
}
