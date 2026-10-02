import type { Document, Node } from "./web";

const TAG = "data-paseo-markdown-tag";
const blocks = new Set(["ul", "ol", "p", "pre", "blockquote", "table", "hr"]);
const heading = /^h[1-6]$/;
const next = /^what(?:['’]s)? next$|^next steps$/i;

export const recapStyles = `
[data-npa-recap-heading] {font-size:22px!important;line-height:1.3!important;margin-top:20px!important;margin-bottom:12px!important;padding-bottom:0!important;border-bottom-width:0!important;}
[data-npa-recap-heading] * {font-size:inherit!important;line-height:inherit!important;}
[data-npa-recap] {display:grid!important;grid-template-columns:fit-content(32ch) minmax(0,max-content) fit-content(32ch);justify-content:start;align-items:baseline;gap:0!important;margin:0!important;padding:0 0 20px!important;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);}
[data-npa-recap-field] {display:block!important;min-width:0!important;margin:0!important;padding:0 24px!important;border-left:1px solid color-mix(in srgb,currentColor 16%,transparent);font:14px/1.6 system-ui!important;overflow-wrap:anywhere;text-wrap:pretty;}
[data-npa-recap-field="did"] {max-width:68ch;}
[data-npa-recap-stacked] {grid-template-columns:minmax(0,max-content) minmax(0,max-content);row-gap:10px!important;}
[data-npa-recap-stacked] > [data-npa-recap-field="did"] {grid-area:2/1/3/-1;padding:0!important;border-left:0;}
[data-npa-recap-stacked] > [data-npa-recap-field="not yet"], [data-npa-recap-stacked] > [data-npa-recap-field="need from you"] {grid-column:1/-1;max-width:68ch;padding:0!important;border-left:0;}
[data-npa-recap-field][data-npa-recap-empty] {display:none!important;}
/* Five-field strip: each free-text field is a section. An owned copy shows the label above the
   value; the native nodes stay in place, hidden. */
[data-npa-recap-stacked] > [data-npa-recap-sectioned]:not([data-npa-recap-field="did"]) {padding:10px 0 0!important;border-top:1px solid color-mix(in srgb,currentColor 11%,transparent);}
[data-npa-recap-sectioned] > :not([data-npa-recap-part]) {display:none!important;}
[data-npa-recap-field] [data-npa-recap-label] {display:block;margin-bottom:2px;font-size:12.5px!important;font-weight:600;color:color-mix(in srgb,currentColor 60%,transparent);}
[data-npa-recap-value] {color:color-mix(in srgb,currentColor 80%,transparent);}
[data-npa-recap-value]::first-letter {text-transform:uppercase;}
[data-npa-recap-value] * {display:inline!important;margin:0!important;}
[data-npa-recap-value] [data-npa-list] {display:block!important;}
[data-npa-recap-value] [data-npa-list="li"] {display:flex!important;gap:8px;margin-top:2px!important;}
[data-npa-recap-value] [data-npa-code] {border-radius:6px;padding:1px 5px!important;background:color-mix(in srgb,currentColor 6%,transparent)!important;}
[data-npa-recap-field]:first-child {padding-left:0!important;border-left:0;}
[data-npa-recap-field]:last-child {padding-right:0!important;}
[data-npa-recap-field] * {font-size:inherit!important;line-height:inherit!important;}
[data-npa-recap-field] > [data-paseo-markdown-list-marker] {display:none!important;}
[data-npa-recap-field] [data-paseo-markdown-tag="p"] {margin:0!important;}
[data-npa-recap-field] [data-paseo-markdown-tag="code"] {border-radius:6px;padding:1px 5px!important;background:color-mix(in srgb,currentColor 6%,transparent)!important;}
[data-npa-folded] {display:none!important;}
@media(max-width:800px) {
  [data-npa-recap] {grid-template-columns:minmax(0,1fr);gap:10px!important;}
  [data-npa-recap-field] {padding:0!important;border-left:0;}
  /* One column: a pinned Did would jump above Commit/push. */
  [data-npa-recap-stacked] > [data-npa-recap-field="did"] {grid-area:auto;}
}
`;

// One Recap field: a list item, or one labeled line plus the list block that follows it.
type Field = { node: Node; list?: Node };

const legacyLabels = ["Branch", "Did", "Commit/push"];
const fullLabels = ["Branch", "Commit/push", "Did", "Not yet", "Need from you"];
const labelLine = /^(Branch|Commit\/push|Did|Not yet|Need from you):\s*(\S[\s\S]*)?$/i;
const labelPrefix = /^\s*(?:Branch|Did|Commit\/push|Not yet|Need from you):\s*/i;
// Only free-text fields hold a list: nested in the item, or as the block after the line.
const freeText = new Set(["did", "not yet", "need from you"]);

const plain = (node: Node) => (node.textContent ?? "").replace(/^\s*[•*-]?\s*/, "").trim();
const nestedLists = (node: Node) =>
  Array.from(node.querySelectorAll(`[${TAG}="ul"], [${TAG}="ol"]`));
/** True when a free-text field says there is nothing to report. */
const saysNothing = (field: Field) =>
  !field.list && /^nothing\.?$/i.test(labelLine.exec(plain(field.node))?.[2] ?? "");

/**
 * Label order of a recognised Recap, else null: the legacy Branch, Did, Commit/push or the five
 * fields. An empty value needs a list. Lists may be nested in, or follow, free-text fields only;
 * a following list exists only in the five-field shape.
 */
function recapLabels(fields: Field[], nested: Node[]): string[] | null {
  const labels = fields.length === 3 ? legacyLabels : fields.length === 5 ? fullLabels : null;
  if (!labels) return null;
  const holds = (index: number) => freeText.has(labels[index].toLowerCase());
  if (fields.some((field, index) => field.list && (labels === legacyLabels || !holds(index))))
    return null;
  if (
    !nested.every((node) =>
      fields.some((field, index) => holds(index) && field.node.contains?.(node)),
    )
  )
    return null;
  return fields.every((field, index) => {
    const match = labelLine.exec(plain(field.node));
    return match?.[1].toLowerCase() === labels[index].toLowerCase() && !!(match[2] || field.list);
  })
    ? labels
    : null;
}

// One top-level list holds the fields as items. Otherwise they are labeled lines, and a list block
// directly after a line belongs to that line's field.
function recapFields(blocks: Node[]): { fields: Field[]; nested: Node[] } | null {
  if (blocks.length === 1 && blocks[0].getAttribute(TAG) === "ul")
    return {
      fields: items(blocks[0]).map((node) => ({ node })),
      nested: nestedLists(blocks[0]),
    };
  const fields: Field[] = [];
  for (const [index, block] of blocks.entries()) {
    const tag = block.getAttribute(TAG) ?? "";
    if (tag === "p") fields.push(...lines(block).map((node) => ({ node })));
    else if (/^[uo]l$/.test(tag) && blocks[index - 1]?.getAttribute(TAG) === "p")
      fields[fields.length - 1].list = block;
    else return null;
  }
  return { fields, nested: [] };
}

/**
 * Decorate known Markdown shapes without moving React-owned nodes. The legacy strip keeps the
 * native text; the five-field strip shows owned copies of its free-text fields.
 */
export function decorateRecap(message: Node): (() => void) | null {
  const nodes = Array.from(message.querySelectorAll(`[${TAG}]`));
  const start = nodes.findIndex(
    (node) =>
      /^h[1-6]$/.test(node.getAttribute(TAG) ?? "") &&
      /^recap$/i.test(node.textContent?.trim() ?? "") &&
      !node.closest(`[${TAG}="blockquote"]`),
  );
  if (start < 0) return null;
  let end = start + 1;
  while (end < nodes.length && !/^h[1-6]$/.test(nodes[end].getAttribute(TAG) ?? "")) end++;
  const section = nodes.slice(start + 1, end);
  const topBlocks = section.filter((node) => {
    if (!blocks.has(node.getAttribute(TAG) ?? "")) return false;
    for (
      let parent = node.parentElement;
      parent && parent !== message;
      parent = parent.parentElement
    )
      if (blocks.has(parent.getAttribute(TAG) ?? "")) return false;
    return true;
  });
  if (topBlocks.length !== 1 || topBlocks[0].getAttribute(TAG) !== "ul") return null;
  const list = topBlocks[0];
  const fields = items(list).map((node) => ({ node }));
  const nested = nestedLists(list);
  const labels = recapLabels(fields, nested);
  if (!labels) return null;
  const changed: { node: Node; name: string; before: string | null }[] = [];
  const mark = (node: Node, name: string, value: string) => {
    changed.push({ node, name, before: node.getAttribute(name) });
    node.setAttribute(name, value);
  };
  mark(nodes[start], "data-npa-recap-heading", "true");
  mark(list, "data-npa-recap", "true");
  // Bullets in a middle column wrap to a few words per line; give Did its own row. The five
  // fields always stack: Branch and Commit/push, then each free-text field on its own row.
  if (nested.length || labels === fullLabels) mark(list, "data-npa-recap-stacked", "true");
  const doc = message.ownerDocument;
  const added: Node[] = [];
  fields.forEach((field, index) => {
    const name = labels[index].toLowerCase();
    mark(field.node, "data-npa-recap-field", name);
    if (labels !== fullLabels || !freeText.has(name)) return;
    if (name !== "did" && saysNothing(field)) {
      mark(field.node, "data-npa-recap-empty", "true");
      return;
    }
    if (!doc) return;
    // The label shares a text node with its value, so only a copy can put it on its own line.
    const part = doc.createElement("div");
    part.setAttribute("data-npa-recap-part", "true");
    const label = doc.createElement("span");
    label.setAttribute("data-npa-recap-label", "true");
    label.textContent = labels[index];
    const value = doc.createElement("div");
    value.setAttribute("data-npa-recap-value", "true");
    const clone = copy(field.node);
    stripLabel(clone);
    for (const child of Array.from(clone.childNodes ?? [])) value.appendChild(child);
    part.appendChild(label);
    part.appendChild(value);
    field.node.appendChild(part);
    added.push(part);
    mark(field.node, "data-npa-recap-sectioned", "true");
  });
  return () => {
    for (const node of added) node.remove();
    for (const { node, name, before } of changed) {
      if (before === null) node.removeAttribute(name);
      else node.setAttribute(name, before);
    }
  };
}

function items(list: Node) {
  return Array.from(list.querySelectorAll(`[${TAG}="li"]`)).filter((item) => {
    let parent = item.parentElement;
    while (parent && !/^[uo]l$/.test(parent.getAttribute(TAG) ?? "")) parent = parent.parentElement;
    return parent === list;
  });
}

// Paseo renders each Markdown block of one reply as its own history row; the rows share a message ID.
export function messageParts(message: Node): Node[] {
  const row = message.closest("[data-message-id]");
  const id = row?.getAttribute("data-message-id");
  const list = row?.parentElement;
  if (!id || !list) return [message];
  return Array.from(list.querySelectorAll('[data-testid="assistant-message"]')).filter(
    (part) => part.closest("[data-message-id]")?.getAttribute("data-message-id") === id,
  );
}

function topLevel(message: Node) {
  return Array.from(message.querySelectorAll(`[${TAG}]`)).filter((node) => {
    const tag = node.getAttribute(TAG) ?? "";
    if (!blocks.has(tag) && !heading.test(tag)) return false;
    for (
      let parent = node.parentElement;
      parent && parent !== message;
      parent = parent.parentElement
    ) {
      const outer = parent.getAttribute(TAG) ?? "";
      if (blocks.has(outer) || outer === "li" || heading.test(outer)) return false;
    }
    return true;
  });
}

// Clones keep the host's classes and inline styles but drop Markdown tags, so later scans and the
// host's copy logic never mistake them for message content.
function copy(node: Node) {
  const clone = node.cloneNode!(true);
  // A strip section already holds a copy of this field; copying it again would repeat the text.
  for (const part of Array.from(clone.querySelectorAll("[data-npa-recap-part]"))) part.remove();
  // Keep markers of nested list items; drop only the copied item's own marker.
  for (const marker of Array.from(clone.querySelectorAll("[data-paseo-markdown-list-marker]"))) {
    const item = marker.parentElement?.closest(`[${TAG}="li"]`);
    if (!item || item === clone) marker.remove();
  }
  for (const inner of [clone, ...Array.from(clone.querySelectorAll("*"))]) {
    const tag = inner.getAttribute(TAG) ?? "";
    if (tag === "code") inner.setAttribute("data-npa-code", "true");
    if (inner !== clone && (tag === "li" || /^[uo]l$/.test(tag)))
      inner.setAttribute("data-npa-list", tag);
    for (const name of [TAG, "data-npa-recap-field"]) inner.removeAttribute(name);
  }
  return clone;
}

function stripLabel(node: Node, prefix = labelPrefix): boolean {
  for (const child of Array.from(node.childNodes ?? [])) {
    if (child.nodeType === 3) {
      if (!child.nodeValue?.trim()) continue;
      child.nodeValue = child.nodeValue.replace(prefix, "");
      return true;
    }
    if (stripLabel(child, prefix)) return true;
  }
  return false;
}

// Split cloned inline trees at Markdown line breaks; React-owned nodes stay untouched.
function lines(node: Node): Node[] {
  if (node.nodeType === 3) {
    return (node.nodeValue ?? "").split(/\r?\n/).map((text) => {
      const clone = node.cloneNode!(false);
      clone.nodeValue = text;
      return clone;
    });
  }
  const result = [node.cloneNode!(false)];
  for (const child of Array.from(node.childNodes ?? [])) {
    const parts = lines(child);
    parts.forEach((part, index) => {
      if (index) result.push(node.cloneNode!(false));
      result[result.length - 1].appendChild(part);
    });
  }
  return result;
}

function precedingRecap(tops: Node[], end: number) {
  let start = end;
  while (start > 0 && !heading.test(tops[start - 1].getAttribute(TAG) ?? "")) start--;
  const title = tops[start - 1];
  if (
    !title ||
    !heading.test(title.getAttribute(TAG) ?? "") ||
    !/^recap$/i.test(title.textContent?.trim() ?? "") ||
    title.closest(`[${TAG}="blockquote"]`)
  )
    return null;
  const paragraphs = tops.slice(start, end);
  const parsed = recapFields(paragraphs);
  const labels = parsed && recapLabels(parsed.fields, parsed.nested);
  if (!parsed || !labels) return null;
  return { title, paragraphs, fields: parsed.fields, labels };
}

/** True when the nearest heading before `block` in the same reply is What Next or Next Steps. */
export function underNextHeading(message: Node, block: Node): boolean {
  const tops = messageParts(message).flatMap(topLevel);
  for (let index = tops.indexOf(block) - 1; index >= 0; index--)
    if (heading.test(tops[index].getAttribute(TAG) ?? ""))
      return next.test(tops[index].textContent?.trim() ?? "");
  return false;
}

/**
 * Show a directly preceding compact Recap, the What Next heading, and its intro paragraphs inside
 * the prompt panel. Native nodes are hidden in place, never moved, and restored by `undo`.
 * `intact` turns false when the host re-renders a hidden node, so the caller can fold again.
 */
export function foldPanel(
  doc: Document,
  message: Node,
  block: Node,
  panel: Node,
  section: Node,
  done = false,
): { undo(): void; intact(): boolean } {
  const parts = messageParts(message);
  const tops = parts.flatMap(topLevel);
  // The panel sits inside the prompt block and its text changes with every selection; only host
  // text marks a re-render.
  const text = (node: Node) => (node.contains?.(panel) ? ownText(node, panel) : node.textContent);
  const contents = new Map(tops.map((node) => [node, text(node)]));
  let index = tops.indexOf(block) - 1;
  const intro: Node[] = [];
  while (index >= 0 && tops[index].getAttribute(TAG) === "p") intro.unshift(tops[index--]);
  const title = tops[index];
  if (
    !title ||
    !heading.test(title.getAttribute(TAG) ?? "") ||
    !next.test(title.textContent?.trim() ?? "")
  )
    return { undo() {}, intact: () => true };
  const element = (tag: string, name: string, text?: string) => {
    const node = doc.createElement(tag);
    if (name) node.setAttribute("class", name);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const badge = () => {
    const node = element("span", "npa-badge");
    node.setAttribute("aria-hidden", "true");
    return node;
  };
  const value = ({ node, list }: Field, into: Node) => {
    const clone = copy(node);
    stripLabel(clone);
    for (const child of Array.from(clone.childNodes ?? [])) into.appendChild(child);
    if (list) {
      // A list block after a labeled line reads like the nested bullets of a list item.
      const bullets = copy(list);
      bullets.setAttribute("data-npa-list", list.getAttribute(TAG) ?? "ul");
      into.appendChild(bullets);
    }
    return into;
  };
  // The reply declared its goal done; everything suggested after it only closes or leaves the task.
  const goal = () => {
    const node = element("span", "npa-chip npa-goal", "Task done");
    node.setAttribute("aria-label", "Task done");
    return node;
  };
  const added: Node[] = [];
  const hidden = [title, ...intro];
  const parsed = precedingRecap(tops, index);
  // Host layout classes (flex, width, pre-wrap) squeeze chip text into one word per line.
  const chip = (field: Field, name: string) => {
    const into = value(field, element("span", name));
    for (const inner of Array.from(into.querySelectorAll("*"))) {
      inner.removeAttribute("class");
      inner.removeAttribute("style");
    }
    return into;
  };
  if (parsed) {
    const { title: recapTitle, paragraphs, fields, labels } = parsed;
    hidden.unshift(recapTitle, ...paragraphs);
    const field = (label: string) => fields[labels.indexOf(label)];
    const [branch, did, commit] = [field("Branch"), field("Did"), field("Commit/push")];
    const recap = element("div", "npa-section npa-recap");
    recap.setAttribute("role", "group");
    recap.setAttribute("aria-label", "Recap");
    const head = element("div", "npa-recap-head");
    const kicker = element("span", "npa-kicker");
    kicker.appendChild(badge());
    kicker.appendChild(element("span", "", recapTitle.textContent?.trim() || "Recap"));
    head.appendChild(kicker);
    const meta = element("span", "npa-meta");
    const branchChip = element("span", "npa-chip npa-branch");
    branchChip.appendChild(chip(branch, "npa-branch-value"));
    meta.appendChild(branchChip);
    const shown = chip(commit, "npa-commit-value");
    const said = shown.textContent?.trim() ?? "";
    const yes = /^yes\b/i.test(said);
    const status = element(
      "span",
      yes || /^(?:committed|pushed)\b/i.test(said)
        ? "npa-chip npa-commit npa-ok"
        : "npa-chip npa-commit",
    );
    status.setAttribute("aria-label", `Commit/push: ${said}`);
    // `yes` only confirms; the chip shows the detail after it.
    if (yes) {
      stripLabel(shown, /^\s*yes\b[\s,;:.\u2013\u2014-]*/i);
      // Leftover punctuation alone (`yes!`) is not a detail.
      if (!/[\p{L}\p{N}]/u.test(shown.textContent ?? "")) shown.textContent = "Committed";
    }
    // State reads from the icon and wording, not an extra hue (TASTE.md).
    status.appendChild(/^(?:no|none)\.?$/i.test(said) ? element("span", "", "No commit") : shown);
    meta.appendChild(status);
    if (done) meta.appendChild(goal());
    head.appendChild(meta);
    recap.appendChild(head);
    const bullets = did.list ?? did.node.querySelector(`[${TAG}="ul"], [${TAG}="ol"]`);
    const text = value(did, element(bullets ? "div" : "p", "npa-did"));
    if (labels === fullLabels) {
      // Each five-field item is a small section: its label above its value.
      const part = element("div", "npa-recap-part");
      part.appendChild(element("span", "npa-recap-label", "Did"));
      part.appendChild(text);
      recap.appendChild(part);
    } else recap.appendChild(text);
    // A field that says nothing needs no row.
    for (const label of ["Not yet", "Need from you"]) {
      const open = field(label);
      if (!open || saysNothing(open)) continue;
      const row = element("div", "npa-recap-row npa-recap-part");
      row.appendChild(element("span", "npa-recap-label", label));
      row.appendChild(value(open, element("div", "npa-recap-value")));
      recap.appendChild(row);
    }
    panel.prepend!(recap);
    added.push(recap);
  }
  const head = element("div", "npa-next-head");
  const name = element("div", "npa-next-title");
  name.appendChild(badge());
  name.appendChild(element("span", "", title.textContent?.trim() ?? ""));
  name.setAttribute("role", "heading");
  name.setAttribute("aria-level", "2");
  head.appendChild(name);
  if (done && !parsed) name.appendChild(goal());
  if (intro.length) {
    const text = element("div", "npa-next-intro");
    for (const paragraph of intro) text.appendChild(copy(paragraph));
    head.appendChild(text);
  }
  section.prepend!(head);
  added.push(head);
  // A row left with only hidden blocks would still add its spacing.
  const own = message.closest("[data-message-id]");
  for (const part of parts) {
    const row = part.closest("[data-message-id]");
    if (row && row !== own && topLevel(part).every((node) => hidden.includes(node)))
      hidden.push(row);
  }
  const prior = hidden.map((node) => node.getAttribute("data-npa-folded"));
  for (const node of hidden) node.setAttribute("data-npa-folded", "true");
  // Virtualized rows unmount and remount; a node that left with its row needs no refold.
  const owners = hidden.map(
    (node) => parts.find((part) => part.contains?.(node) || node.contains?.(part)) ?? node,
  );
  return {
    undo() {
      for (const node of added) node.remove();
      hidden.forEach((node, position) => {
        if (prior[position] === null) node.removeAttribute("data-npa-folded");
        else node.setAttribute("data-npa-folded", prior[position]!);
      });
    },
    intact: () =>
      hidden.every((node, position) =>
        node.isConnected
          ? node.getAttribute("data-npa-folded") === "true"
          : !owners[position].isConnected,
      ) &&
      messageParts(message).every((part) => parts.includes(part)) &&
      messageParts(message)
        .flatMap(topLevel)
        .every((node) => contents.has(node) && contents.get(node) === text(node)),
  };
}

function ownText(node: Node, skip: Node): string {
  if (node === skip) return "";
  if (node.nodeType === 3) return node.nodeValue ?? "";
  if (node.nodeType !== 1) return "";
  return Array.from(node.childNodes ?? [])
    .map((child) => ownText(child, skip))
    .join("");
}
