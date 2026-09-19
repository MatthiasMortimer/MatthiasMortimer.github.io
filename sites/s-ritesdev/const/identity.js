import site from "../content/site.json";
import { getSiteVersion, gitversion } from "@ritesGlobal/versions.js";

export const identity = site.identity;
export const siteMetadata = site.metadata;
export const version = getSiteVersion("ritesdev");
export { gitversion };
