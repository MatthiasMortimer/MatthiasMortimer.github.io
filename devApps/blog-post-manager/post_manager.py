#!/usr/bin/env python3
"""Tkinter GUI for creating and editing blog posts (posts.js + .mdx files)."""

import re
import tkinter as tk
from datetime import date
from pathlib import Path
from tkinter import messagebox, scrolledtext, ttk

REPO_ROOT = Path(__file__).resolve().parent.parent.parent / "sites" / "s-blog"
POSTS_JS = REPO_ROOT / "const" / "posts.js"
TAGS_JS = REPO_ROOT / "const" / "tags.js"
POSTS_DIR = REPO_ROOT / "pages" / "posts"

ENTRY_RE = re.compile(r"\{([^{}]*)\}", re.DOTALL)
FIELD_RE = re.compile(r'(\w+)\s*:\s*"((?:[^"\\]|\\.)*)"')
MOJIBAKE_MARKERS = ("\u00c3", "\u00c2", "\u00e2", "\u00f0", "\u20ac")


def js_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def normalize_text(value: str) -> str:
    """Repair common UTF-8 text that was decoded as Latin-1 before saving."""
    if not any(marker in value for marker in MOJIBAKE_MARKERS):
        return value
    try:
        repaired = value.encode("cp1252").decode("utf-8")
    except UnicodeError:
        return value
    original_markers = sum(value.count(marker) for marker in MOJIBAKE_MARKERS)
    repaired_markers = sum(repaired.count(marker) for marker in MOJIBAKE_MARKERS)
    return repaired if repaired_markers < original_markers else value


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "post"


def parse_posts(text: str) -> list[dict]:
    posts = []
    for match in ENTRY_RE.finditer(text):
        fields = dict(FIELD_RE.findall(match.group(1)))
        if "href" in fields:
            fields = {
                k: normalize_text(v.replace('\\"', '"').replace("\\\\", "\\"))
                for k, v in fields.items()
            }
            posts.append(fields)
    return posts


def serialize_posts(posts: list[dict]) -> str:
    lines = ["export const posts = ["]
    for post in posts:
        lines.append("\t{")
        for key in ("title", "href", "date", "tag", "description"):
            lines.append(f'\t\t{key}: "{js_escape(post.get(key, ""))}",')
        lines.append("\t},")
    lines.append("];")
    return "\n".join(lines) + "\n"


def parse_tags(text: str) -> list[str]:
    match = re.search(r"\[(.*?)\]", text, re.DOTALL)
    if not match:
        return []
    return [normalize_text(tag) for tag in re.findall(r'"((?:[^"\\]|\\.)*)"', match.group(1))]


def serialize_tags(tags: list[str]) -> str:
    quoted = ", ".join(f'"{js_escape(t)}"' for t in tags)
    return f"export const tags = [{quoted}];\n"


def next_slug(existing_hrefs: list[str]) -> str:
    n = 1
    slugs = {href.strip("/").split("/")[-1] for href in existing_hrefs}
    while f"post-{n}" in slugs:
        n += 1
    return f"post-{n}"


BG = "#1e1f26"
PANEL = "#262832"
ACCENT = "#7aa2f7"
TEXT = "#e6e6f0"
MUTED = "#9a9cb3"


class PostManagerApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Blog Post Manager")
        self.geometry("960x680")
        self.configure(bg=BG)

        self.editing_slug: str | None = None

        self._apply_style()
        self._build_layout()
        self.reload_posts()

    def _apply_style(self):
        style = ttk.Style(self)
        style.theme_use("clam")

        style.configure(".", background=BG, foreground=TEXT, font=("Sans", 10))
        style.configure("TFrame", background=BG)
        style.configure("Panel.TFrame", background=PANEL)
        style.configure("Header.TFrame", background=ACCENT)
        style.configure("TLabel", background=BG, foreground=TEXT)
        style.configure("Muted.TLabel", background=BG, foreground=MUTED)
        style.configure("Header.TLabel", background=ACCENT, foreground="#10131c", font=("Sans", 14, "bold"))
        style.configure("TEntry", fieldbackground=PANEL, foreground=TEXT, insertcolor=TEXT, padding=4)
        style.configure("TButton", background=ACCENT, foreground="#10131c", font=("Sans", 10, "bold"), padding=6)
        style.map("TButton", background=[("active", "#5c85e0")])

    def _build_layout(self):
        header = ttk.Frame(self, style="Header.TFrame", padding=(14, 10))
        header.pack(fill="x")
        ttk.Label(header, text="📝 Blog Post Manager", style="Header.TLabel").pack(anchor="w")

        container = ttk.Frame(self, padding=12)
        container.pack(fill="both", expand=True)
        container.columnconfigure(1, weight=1)
        container.rowconfigure(0, weight=1)

        # Left: post list
        left = ttk.Frame(container, style="Panel.TFrame", padding=10)
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        left.rowconfigure(2, weight=1)
        ttk.Button(left, text="+ New Post", command=self.on_new_post).pack(fill="x", pady=(0, 10))
        ttk.Label(left, text="Posts", style="Muted.TLabel").pack(anchor="w", pady=(0, 4))

        list_frame = ttk.Frame(left, style="Panel.TFrame")
        list_frame.pack(fill="both", expand=True)
        list_scroll = ttk.Scrollbar(list_frame, orient="vertical")
        self.post_listbox = tk.Listbox(
            list_frame, width=28, exportselection=False,
            bg=PANEL, fg=TEXT, selectbackground=ACCENT, selectforeground="#10131c",
            highlightthickness=0, relief="flat", borderwidth=0,
            yscrollcommand=list_scroll.set,
        )
        list_scroll.config(command=self.post_listbox.yview)
        self.post_listbox.pack(side="left", fill="both", expand=True)
        list_scroll.pack(side="right", fill="y")
        self.post_listbox.bind("<<ListboxSelect>>", self.on_select_post)

        # Right: form
        form = ttk.Frame(container)
        form.grid(row=0, column=1, sticky="nsew")
        form.columnconfigure(1, weight=1)

        self.title_var = tk.StringVar()
        self.slug_var = tk.StringVar()
        self.date_var = tk.StringVar(value=str(date.today()))
        self.tag_var = tk.StringVar()
        self.tags_var = tk.StringVar()
        self.author_var = tk.StringVar(value="Matt")
        self.image_url_var = tk.StringVar()
        self.image_alt_var = tk.StringVar()
        self.description_var = tk.StringVar()

        row = 0
        row = self._add_row(form, row, "Title", self.title_var)
        row = self._add_row(form, row, "Slug (URL)", self.slug_var)
        row = self._add_row(form, row, "Date (YYYY-MM-DD)", self.date_var)
        row = self._add_row(form, row, "Main tag", self.tag_var)
        row = self._add_row(form, row, "All tags (comma separated)", self.tags_var)
        row = self._add_row(form, row, "Author", self.author_var)
        row = self._add_row(form, row, "Image URL", self.image_url_var)
        row = self._add_row(form, row, "Image alt text", self.image_alt_var)
        row = self._add_row(form, row, "Description", self.description_var)

        ttk.Label(form, text="Content (Markdown)", style="Muted.TLabel").grid(
            row=row, column=0, columnspan=2, sticky="w", pady=(10, 4)
        )
        row += 1
        self.content_text = scrolledtext.ScrolledText(
            form, wrap="word", height=20,
            bg=PANEL, fg=TEXT, insertbackground=TEXT,
            relief="flat", borderwidth=0, padx=8, pady=8,
        )
        self.content_text.grid(row=row, column=0, columnspan=2, sticky="nsew", pady=(0, 10))
        form.rowconfigure(row, weight=1)
        row += 1

        button_row = ttk.Frame(form)
        button_row.grid(row=row, column=0, columnspan=2, sticky="e")
        ttk.Button(button_row, text="💾 Save", command=self.on_save).pack(side="right")

    def _add_row(self, parent, row, label, var):
        ttk.Label(parent, text=label, style="Muted.TLabel").grid(row=row, column=0, sticky="w", pady=4)
        ttk.Entry(parent, textvariable=var).grid(row=row, column=1, sticky="ew", pady=4, padx=(10, 0))
        return row + 1

    def reload_posts(self):
        self.posts = parse_posts(POSTS_JS.read_text(encoding="utf-8")) if POSTS_JS.exists() else []
        self.available_tags = parse_tags(TAGS_JS.read_text(encoding="utf-8")) if TAGS_JS.exists() else []
        self.post_listbox.delete(0, "end")
        for post in self.posts:
            self.post_listbox.insert("end", post.get("title", "(untitled)"))

    def on_select_post(self, _event=None):
        selection = self.post_listbox.curselection()
        if not selection:
            return
        post = self.posts[selection[0]]
        slug = post["href"].strip("/").split("/")[-1]
        self.load_post(slug, post)

    def load_post(self, slug: str, post_entry: dict):
        self.editing_slug = slug
        mdx_path = POSTS_DIR / f"{slug}.mdx"
        frontmatter, content = {}, ""
        if mdx_path.exists():
            frontmatter, content = self._read_mdx(mdx_path)

        self.title_var.set(post_entry.get("title", ""))
        self.slug_var.set(slug)
        self.date_var.set(post_entry.get("date", str(date.today())))
        self.tag_var.set(post_entry.get("tag", ""))
        self.tags_var.set(", ".join(frontmatter.get("tags", [])))
        self.author_var.set(frontmatter.get("author", "Matt"))
        self.image_url_var.set(frontmatter.get("image_url", ""))
        self.image_alt_var.set(frontmatter.get("image_alt", ""))
        self.description_var.set(post_entry.get("description", ""))
        self.content_text.delete("1.0", "end")
        self.content_text.insert("1.0", content)

    def on_new_post(self):
        self.editing_slug = None
        self.title_var.set("")
        self.slug_var.set(next_slug([p["href"] for p in self.posts]))
        self.date_var.set(str(date.today()))
        self.tag_var.set("")
        self.tags_var.set("")
        self.author_var.set("Matt")
        self.image_url_var.set("")
        self.image_alt_var.set("")
        self.description_var.set("")
        self.content_text.delete("1.0", "end")
        self.post_listbox.selection_clear(0, "end")

    @staticmethod
    def _read_mdx(path: Path) -> tuple[dict, str]:
        text = path.read_text(encoding="utf-8")
        match = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
        if not match:
            return {}, text
        frontmatter_text, body = match.groups()
        fm = {}
        tags_match = re.search(r"tags:\s*\[(.*?)\]", frontmatter_text)
        if tags_match:
            fm["tags"] = re.findall(r'"([^"]*)"', tags_match.group(1))
        for key in ("author",):
            m = re.search(rf"{key}:\s*'([^']*)'", frontmatter_text)
            if m:
                fm[key] = m.group(1)
        url_match = re.search(r"url:\s*'([^']*)'", frontmatter_text)
        if url_match:
            fm["image_url"] = url_match.group(1)
        alt_match = re.search(r"alt:\s*'([^']*)'", frontmatter_text)
        if alt_match:
            fm["image_alt"] = alt_match.group(1)
        body = re.sub(r'^\s*import SiteNav.*?\n+<SiteNav />\n+', "", body, flags=re.MULTILINE)
        fm = {key: normalize_text(value) for key, value in fm.items()}
        return fm, normalize_text(body.strip()) + "\n"

    def on_save(self):
        title = normalize_text(self.title_var.get().strip())
        if not title:
            messagebox.showerror("Missing title", "Please enter a post title.")
            return

        slug = self.slug_var.get().strip() or slugify(title)
        slug = slugify(slug)
        href = f"/posts/{slug}/"
        main_tag = normalize_text(self.tag_var.get().strip())
        all_tags = [normalize_text(t.strip()) for t in self.tags_var.get().split(",") if t.strip()]
        if main_tag and main_tag not in all_tags:
            all_tags.insert(0, main_tag)

        entry = {
            "title": title,
            "href": href,
            "date": self.date_var.get().strip() or str(date.today()),
            "tag": main_tag,
            "description": normalize_text(self.description_var.get().strip()),
        }

        # Update posts.js (replace when editing an existing slug, else append)
        existing_slugs = [p["href"].strip("/").split("/")[-1] for p in self.posts]
        if self.editing_slug and self.editing_slug in existing_slugs:
            idx = existing_slugs.index(self.editing_slug)
            self.posts[idx] = entry
        else:
            self.posts.append(entry)
        POSTS_JS.write_text(serialize_posts(self.posts), encoding="utf-8")

        # Update tags.js with any new tags
        new_tags = [t for t in all_tags if t not in self.available_tags]
        if new_tags:
            self.available_tags.extend(new_tags)
            TAGS_JS.write_text(serialize_tags(self.available_tags), encoding="utf-8")

        # Write the .mdx file
        self._write_mdx(slug, entry, all_tags)

        self.editing_slug = slug
        self.reload_posts()
        # Reselect the saved post
        for i, p in enumerate(self.posts):
            if p["href"] == href:
                self.post_listbox.selection_set(i)
                break

        messagebox.showinfo("Saved", f"Post saved to src/pages/posts/{slug}.mdx")

    def _write_mdx(self, slug: str, entry: dict, all_tags: list[str]):
        content = normalize_text(self.content_text.get("1.0", "end").strip())
        tags_literal = ", ".join(f'"{t}"' for t in all_tags)
        frontmatter = (
            "---\n"
            f"title: '{entry['title']}'\n"
            f"pubDate: {entry['date']}\n"
            f"description: '{entry['description']}'\n"
            f"author: '{normalize_text(self.author_var.get().strip() or 'Matt')}'\n"
        )
        if self.image_url_var.get().strip():
            frontmatter += (
                "image:\n"
                f"    url: '{normalize_text(self.image_url_var.get().strip())}'\n"
                f"    alt: '{normalize_text(self.image_alt_var.get().strip())}'\n"
            )
        frontmatter += f"tags: [{tags_literal}]\n---\n"

        body = (
            'import SiteNav from "../../components/SiteNav.astro";\n\n'
            "<SiteNav />\n\n"
            f"{content}\n"
        )

        POSTS_DIR.mkdir(parents=True, exist_ok=True)
        (POSTS_DIR / f"{slug}.mdx").write_text(frontmatter + "\n" + body, encoding="utf-8")


if __name__ == "__main__":
    PostManagerApp().mainloop()
