const targets = document.querySelectorAll("[data-scroll-reveal]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (!reducedMotion.matches && "IntersectionObserver" in window) {
	const observer = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			if (!entry.isIntersecting || entry.target.hidden) continue;
			observer.unobserve(entry.target);
			entry.target.classList.add("is-revealing");
		}
	}, { threshold: 0.1 });

	for (const target of targets) {
		observer.observe(target);
		target.addEventListener("animationend", (event) => {
			if (event.target === target) target.classList.remove("is-revealing");
		});
		target.addEventListener("focusin", () => {
			observer.unobserve(target);
			target.classList.remove("is-revealing");
		});
	}

	reducedMotion.addEventListener("change", (event) => {
		if (!event.matches) return;
		observer.disconnect();
		for (const target of targets) target.classList.remove("is-revealing");
	});
}
