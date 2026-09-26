import projects from "./projects.json" with { type: "json" };
import { normalizeTags } from "./tags.js";

export { projects };

for (const project of projects) {
	project.tags = normalizeTags(project.tags);
}
