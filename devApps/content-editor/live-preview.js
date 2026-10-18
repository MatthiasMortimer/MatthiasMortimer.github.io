import hostingConfig from "../../ritesGlobal/hosting-config.cjs";
import { listSites } from "../../ritesGlobal/sites.registry.mjs";
import { getSiteThemeDefinition } from "../../ritesGlobal/site-theme.mjs";

export async function getLivePreview(siteSlug, { fetchImpl = fetch, sites = listSites() } = {}) {
	const site = sites.find((entry) => entry.slug === siteSlug);
	if (!site || !getSiteThemeDefinition(siteSlug)) throw new Error("This website does not support live theme previews.");
	const config = hostingConfig.buildHostingConfig();
	const url = new URL(site.basePath, config.devLocalUrl);
	if (!url.pathname.endsWith("/")) url.pathname += "/";
	let response;
	try {
		response = await fetchImpl(url, { signal: AbortSignal.timeout(10000), redirect: "error" });
	} catch (error) {
		return {
			available: false,
			url: url.href,
			message: `Local development server unavailable (${error.name === "TimeoutError" ? "connection timed out" : error.message}). Turn on the dev server in Site Hosting, then select Reload dev preview.`,
		};
	}
	if (!response.ok) {
		await response.body?.cancel();
		return { available: false, url: url.href, message: `The local dev server returned HTTP ${response.status}. Check Site Hosting, then select Reload dev preview.` };
	}
	await response.body?.cancel();
	return { available: true, url: url.href, message: "Local development server ready. Valid color edits save automatically to the website." };
}
