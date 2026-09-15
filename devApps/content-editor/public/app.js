const fileListEl = document.getElementById("file-list");
const formEl = document.getElementById("editor-form");
const titleEl = document.getElementById("editor-title");
const headerEl = document.getElementById("editor-header");
const emptyStateEl = document.getElementById("empty-state");
const saveBtn = document.getElementById("save-btn");
const saveStatusEl = document.getElementById("save-status");

let currentName = null;
let currentType = null;
let data = null; // frontmatter fields (object)
let bodyText = null; // markdown body, null for json files

init();

async function init() {
  const files = await fetchJSON("/api/files");
  for (const file of files) {
    const li = document.createElement("li");
    li.textContent = file.label;
    li.dataset.name = file.name;
    li.addEventListener("click", () => loadFile(file.name));
    fileListEl.appendChild(li);
  }
}

async function loadFile(name) {
  const res = await fetchJSON(`/api/files/${encodeURIComponent(name)}`);
  currentName = name;
  currentType = res.type;
  data = res.fields;
  bodyText = res.body;

  [...fileListEl.children].forEach((li) => li.classList.toggle("active", li.dataset.name === name));

  titleEl.textContent = name;
  headerEl.classList.remove("hidden");
  formEl.classList.remove("hidden");
  emptyStateEl.classList.add("hidden");
  saveStatusEl.textContent = "";

  renderForm();
}

function renderForm() {
  formEl.innerHTML = "";
  const root = renderObjectFields(data, []);
  formEl.appendChild(root);

  if (currentType === "md") {
    const wrapper = document.createElement("div");
    wrapper.className = "field body-field";
    const label = document.createElement("label");
    label.textContent = "Page Body (Markdown, optional)";
    const textarea = document.createElement("textarea");
    textarea.value = bodyText ?? "";
    textarea.addEventListener("input", () => {
      bodyText = textarea.value;
    });
    wrapper.appendChild(label);
    wrapper.appendChild(textarea);
    formEl.appendChild(wrapper);
  }
}

// Renders all keys of a plain object as top-level fields (no wrapping fieldset).
function renderObjectFields(obj, path) {
  const container = document.createElement("div");
  for (const key of Object.keys(obj)) {
    container.appendChild(renderField(key, obj[key], [...path, key]));
  }
  return container;
}

function renderField(key, value, path) {
  const label = humanize(key);

  if (Array.isArray(value)) {
    return renderArrayField(label, value, path);
  }
  if (value !== null && typeof value === "object") {
    return renderObjectField(label, value, path);
  }
  return renderLeafField(label, value, path);
}

function renderObjectField(label, value, path) {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = label;
  fieldset.appendChild(legend);
  fieldset.appendChild(renderObjectFields(value, path));
  return fieldset;
}

function renderArrayField(label, arr, path) {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = label;
  fieldset.appendChild(legend);

  const listContainer = document.createElement("div");
  fieldset.appendChild(listContainer);

  const renderItems = () => {
    listContainer.innerHTML = "";
    arr.forEach((item, index) => {
      const itemPath = [...path, index];
      const itemBox = document.createElement("div");
      itemBox.className = "array-item";

      const toolbar = document.createElement("div");
      toolbar.className = "array-item-toolbar";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        arr.splice(index, 1);
        renderItems();
      });
      toolbar.appendChild(removeBtn);
      itemBox.appendChild(toolbar);

      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        itemBox.appendChild(renderObjectFields(item, itemPath));
      } else if (Array.isArray(item)) {
        itemBox.appendChild(renderArrayField(`Item ${index + 1}`, item, itemPath));
      } else {
        itemBox.appendChild(renderLeafField(`Item ${index + 1}`, item, itemPath, (newVal) => {
          arr[index] = newVal;
        }));
      }

      listContainer.appendChild(itemBox);
    });
  };

  renderItems();

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "add-btn";
  addBtn.textContent = "+ Add item";
  addBtn.addEventListener("click", () => {
    const template = arr.length > 0 ? arr[arr.length - 1] : "";
    arr.push(emptyLike(template));
    renderItems();
  });
  fieldset.appendChild(addBtn);

  return fieldset;
}

// onLeafChange lets array items update in place (arrays hold primitives, not addressable objects).
function renderLeafField(label, value, path, onLeafChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";

  if (typeof value === "boolean") {
    const cbLabel = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = value;
    checkbox.addEventListener("change", () => {
      const v = checkbox.checked;
      if (onLeafChange) onLeafChange(v);
      else setAtPath(data, path, v);
    });
    cbLabel.appendChild(checkbox);
    cbLabel.appendChild(document.createTextNode(label));
    wrapper.appendChild(cbLabel);
    return wrapper;
  }

  const labelEl = document.createElement("label");
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  if (typeof value === "number") {
    const input = document.createElement("input");
    input.type = "number";
    input.value = value;
    input.addEventListener("input", () => {
      const v = input.value === "" ? 0 : Number(input.value);
      if (onLeafChange) onLeafChange(v);
      else setAtPath(data, path, v);
    });
    wrapper.appendChild(input);
    return wrapper;
  }

  const text = value == null ? "" : String(value);
  if (text.length > 70 || text.includes("\n")) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.addEventListener("input", () => {
      if (onLeafChange) onLeafChange(textarea.value);
      else setAtPath(data, path, textarea.value);
    });
    wrapper.appendChild(textarea);
  } else {
    const input = document.createElement("input");
    input.type = "text";
    input.value = text;
    input.addEventListener("input", () => {
      if (onLeafChange) onLeafChange(input.value);
      else setAtPath(data, path, input.value);
    });
    wrapper.appendChild(input);
  }

  return wrapper;
}

function emptyLike(value) {
  if (Array.isArray(value)) return [];
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) out[key] = emptyLike(value[key]);
    return out;
  }
  if (typeof value === "number") return 0;
  if (typeof value === "boolean") return false;
  return "";
}

function setAtPath(root, path, value) {
  let node = root;
  for (let i = 0; i < path.length - 1; i++) {
    node = node[path[i]];
  }
  node[path[path.length - 1]] = value;
}

function humanize(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

saveBtn.addEventListener("click", async () => {
  if (!currentName) return;
  saveStatusEl.textContent = "Saving...";
  try {
    await fetchJSON(`/api/files/${encodeURIComponent(currentName)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: data, body: bodyText }),
    });
    saveStatusEl.textContent = "Saved ✓";
    setTimeout(() => (saveStatusEl.textContent = ""), 2000);
  } catch (err) {
    saveStatusEl.textContent = `Error: ${err.message}`;
  }
});

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.json();
}
