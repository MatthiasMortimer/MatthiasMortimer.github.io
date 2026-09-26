const form = document.querySelector("#post-form");
const emptyState = document.querySelector("#empty-state");
const postList = document.querySelector("#post-list");
const searchInput = document.querySelector("#post-search");
const saveState = document.querySelector("#save-state");
const deleteButton = document.querySelector("#delete-post");
const fields = Object.fromEntries(
	["title", "slug", "pubDate", "description", "author", "tags", "imageUrl", "imageAlt", "content"].map(
		(name) => [name, document.querySelector(`#${name}`)]
	)
);

let posts = [];
let knownTags = [];
let originalSlug = null;
let dirty = false;
let toastTimer;

async function loadPosts(selectedSlug = originalSlug) {
	try {
		[posts, knownTags] = await Promise.all([window.postsAPI.list(), window.postsAPI.tags()]);
		const tagOptions = document.querySelector("#tag-options");
		tagOptions.replaceChildren(...knownTags.map((tag) => {
			const option = document.createElement("option");
			option.value = tag;
			return option;
		}));
		renderPosts(selectedSlug);
	} catch (error) {
		showToast(error.message, true);
	}
}

function renderPosts(selectedSlug = originalSlug) {
	const query = searchInput.value.trim().toLowerCase();
	const filtered = posts.filter((post) =>
		[post.title, post.description, post.author, post.tags].join(" ").toLowerCase().includes(query)
	);

	document.querySelector("#post-count").textContent = `${posts.length} ${posts.length === 1 ? "entry" : "entries"}`;
	postList.replaceChildren();

	if (!filtered.length) {
		const message = document.createElement("p");
		message.className = "empty-list";
		message.textContent = query ? "No matching posts" : "No posts yet";
		postList.append(message);
		return;
	}

	for (const post of filtered) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = `post-item${post.slug === selectedSlug ? " active" : ""}`;
		button.dataset.slug = post.slug;

		const title = document.createElement("strong");
		title.textContent = post.title;
		const meta = document.createElement("span");
		meta.textContent = `${post.pubDate} · ${post.author}`;
		button.append(title, meta);
		button.addEventListener("click", () => openPost(post.slug));
		postList.append(button);
	}
}

async function openPost(slug) {
	if (!canDiscardChanges()) return;

	try {
		const post = await window.postsAPI.read(slug);
		originalSlug = slug;
		fillForm(post);
		document.querySelector("#editor-mode").textContent = "Editing post";
		deleteButton.hidden = false;
		showEditor();
		setDirty(false);
		renderPosts(slug);
	} catch (error) {
		showToast(error.message, true);
	}
}

function createPost() {
	if (!canDiscardChanges()) return;

	originalSlug = null;
	fillForm({
		title: "",
		slug: "",
		pubDate: new Date().toISOString().slice(0, 10),
		description: "",
		author: "RitesDev",
		tags: "",
		imageUrl: "",
		imageAlt: "",
		content: 'import SiteNav from "../../components/SiteNav.astro";\n\n<SiteNav />\n\n# New post\n\nStart writing here.',
	});
	document.querySelector("#editor-mode").textContent = "New post";
	deleteButton.hidden = true;
	showEditor();
	setDirty(false);
	fields.title.focus();
	renderPosts();
}

function fillForm(post) {
	for (const [name, input] of Object.entries(fields)) {
		input.value = post[name] || "";
	}
	updateEditorTitle();
}

function showEditor() {
	emptyState.hidden = true;
	form.hidden = false;
}

function setDirty(value) {
	dirty = value;
	saveState.textContent = value ? "Unsaved changes" : "Saved";
	saveState.classList.toggle("dirty", value);
}

function canDiscardChanges() {
	return !dirty || window.confirm("Discard your unsaved changes?");
}

function updateEditorTitle() {
	document.querySelector("#editor-title").textContent = fields.title.value.trim() || "Untitled post";
}

form.addEventListener("input", () => {
	setDirty(true);
	updateEditorTitle();
});

form.addEventListener("submit", async (event) => {
	event.preventDefault();
	if (!form.reportValidity()) return;

	saveState.textContent = "Saving…";
	try {
		const saved = await window.postsAPI.save({
			originalSlug,
			...Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value])),
		});
		originalSlug = saved.slug;
		fillForm(saved);
		setDirty(false);
		await loadPosts(saved.slug);
		showToast("Post saved");
	} catch (error) {
		setDirty(true);
		showToast(error.message, true);
	}
});

deleteButton.addEventListener("click", async () => {
	if (!originalSlug || !window.confirm(`Delete “${fields.title.value}”? This cannot be undone.`)) return;

	try {
		await window.postsAPI.remove(originalSlug);
		originalSlug = null;
		setDirty(false);
		form.hidden = true;
		emptyState.hidden = false;
		await loadPosts(null);
		showToast("Post deleted");
	} catch (error) {
		showToast(error.message, true);
	}
});

document.querySelector("#new-post").addEventListener("click", createPost);
searchInput.addEventListener("input", () => renderPosts());

window.addEventListener("beforeunload", (event) => {
	if (dirty) event.preventDefault();
});

function showToast(message, isError = false) {
	const toast = document.querySelector("#toast");
	clearTimeout(toastTimer);
	toast.textContent = message;
	toast.classList.toggle("error", isError);
	toast.classList.add("visible");
	toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

loadPosts();