export const BLOG_HOME_CARDS = [
	{
		id: "website-info",
		path: "content/home-info.json",
		label: "Left card - Website information",
		help: "Shown on the left of Blog Home. Leave both fields blank for an empty card. Text supports line breaks, not HTML.",
		fields: { title: "Card title", body: "Website information" },
	},
	{
		id: "about-me",
		path: "content/pages/about.md",
		label: "Right card - About Me",
		help: "Shown on the right of Blog Home. Optional placeholders: {firstName}, {occupation}, {country} in the introduction and {hobbies} in the hobbies text. Their values come from Blog Site Settings.",
		fields: { title: "Card title", intro: "About me", hobbies: "Outside of code" },
	},
];

export function homeCardGroup(site) {
	if (site?.slug !== "blog") return null;
	const files = site.groups.flatMap((group) => group.files);
	const cards = BLOG_HOME_CARDS.flatMap((card) => {
		const file = files.find((candidate) => candidate.relativePath === card.path);
		return file ? [{ ...file, card }] : [];
	});
	return cards.length ? { label: "Home cards", files: cards } : null;
}
