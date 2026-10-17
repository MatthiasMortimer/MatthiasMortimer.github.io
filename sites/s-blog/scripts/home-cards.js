const desktopLayout = window.matchMedia("(min-width: 70rem)");
const cards = [...document.querySelectorAll("[data-home-card]")].map((element) => ({
	element,
	details: element.querySelector("details"),
	summary: element.querySelector("summary"),
	body: element.querySelector(".home-card__body"),
}));

function updateLayout() {
	const target = document.getElementById(location.hash.slice(1));
	for (const card of cards) {
		const active = document.activeElement;
		if (desktopLayout.matches) {
			card.details.open = true;
			card.element.tabIndex = 0;
			if (card.summary.contains(active)) card.element.focus({ preventScroll: true });
			card.element.classList.add("home-info--static");
		} else {
			card.element.classList.remove("home-info--static");
			card.element.removeAttribute("tabindex");
			card.details.open = card.body.contains(active) || card.element.contains(target);
			if (active === card.element) card.summary.focus({ preventScroll: true });
		}
	}
}

function revealHashTarget() {
	const target = document.getElementById(location.hash.slice(1));
	if (desktopLayout.matches || !target) return;
	const card = cards.find(({ element }) => element.contains(target));
	if (!card) return;
	card.details.open = true;
	requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
}

updateLayout();
revealHashTarget();
desktopLayout.addEventListener("change", updateLayout);
window.addEventListener("hashchange", revealHashTarget);
