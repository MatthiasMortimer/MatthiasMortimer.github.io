// Local content editor server: exposes read/write API for the s-blogrites site's content files and serves the UI.
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import open from "open";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CONTENT_DIR = path.join(REPO_ROOT, "sites", "s-blogrites", "content");
const PAGES_DIR = path.join(CONTENT_DIR, "pages");
const SITE_JSON = path.join(CONTENT_DIR, "site.json");

const PORT = process.env.PORT || 4555;

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Only allow known, expected filenames to prevent path traversal.
function resolveTarget(name) {
  if (name === "site.json") {
    return { file: SITE_JSON, type: "json" };
  }
  if (/^[a-z0-9-]+\.md$/i.test(name)) {
    const file = path.join(PAGES_DIR, name);
    return { file, type: "md" };
  }
  return null;
}

app.get("/api/files", async (_req, res) => {
  const pageFiles = (await fs.readdir(PAGES_DIR)).filter((f) => f.endsWith(".md"));
  const items = [
    { name: "site.json", label: "Site Settings (site.json)" },
    ...pageFiles.map((f) => ({ name: f, label: `pages/${f}` })),
  ];
  res.json(items);
});

app.get("/api/files/:name", async (req, res) => {
  const target = resolveTarget(req.params.name);
  if (!target) return res.status(404).json({ error: "Unknown file" });

  try {
    const raw = await fs.readFile(target.file, "utf8");
    if (target.type === "json") {
      return res.json({ type: "json", fields: JSON.parse(raw), body: null });
    }
    const parsed = matter(raw);
    res.json({ type: "md", fields: parsed.data, body: parsed.content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/files/:name", async (req, res) => {
  const target = resolveTarget(req.params.name);
  if (!target) return res.status(404).json({ error: "Unknown file" });

  const { fields, body } = req.body;

  try {
    if (target.type === "json") {
      await fs.writeFile(target.file, JSON.stringify(fields, null, 2) + "\n", "utf8");
    } else {
      // lineWidth: -1 keeps long strings on one line instead of folding them.
      const output = matter.stringify(body ?? "", fields, { lineWidth: -1 });
      await fs.writeFile(target.file, output, "utf8");
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, async () => {
  const url = `http://localhost:${PORT}`;
  console.log(`BlogRites content editor running at ${url}`);
  try {
    await open(url);
  } catch {
    // ignore if no default browser could be launched
  }
});
