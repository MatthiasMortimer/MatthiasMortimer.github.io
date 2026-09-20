import contact from "./contact.json" with { type: "json" };
import { projects } from "./projects.js";
import { gitversion, siteVersions } from "./versions.js";
import { listSites } from "./sites.registry.mjs";

export const globalContent = {
	identity: contact,
	media: {
		logo: contact.logo,
		avatar: contact.avatar,
		blogLogo: "/media/blog-logo.png",
	},
	projects,
	versions: { gitversion, sites: siteVersions },
	sites: listSites(),
};

export const { identity, media } = globalContent;
