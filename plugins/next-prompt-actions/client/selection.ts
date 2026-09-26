import type { Candidate, Snapshot } from "../shared/contracts";
import { selectionAllowed } from "../shared/next-prompts";
import type { Document, Node } from "./web";

export function renderSelection(
  doc: Document,
  root: Node,
  footerRoot: Node,
  candidates: Candidate[],
  snapshot: Snapshot,
  actions: { edit(picked: Candidate[]): void; send(picked: Candidate[]): Promise<void> },
) {
  let current = candidates,
    latest = snapshot,
    pending = false;
  const selected = new Set<string>();
  const inputs = new Map<string, Node>();
  const groups = candidates[0].selection!.exclusiveGroups;
  const list = doc.createElement("div");
  list.setAttribute("class", "npa-selection-list");
  root.appendChild(list);
  const containers = new Map<number, Node>();
  for (const [index, candidate] of candidates.entries()) {
    const id = candidate.selection!.id;
    const groupIndex = groups.findIndex((group) => group.includes(id));
    if (!containers.has(groupIndex)) {
      const fieldset = doc.createElement("fieldset");
      fieldset.setAttribute("class", "npa-choice-group");
      const legend = doc.createElement("legend");
      legend.textContent =
        groupIndex < 0
          ? groups.length
            ? "Additional suggestions"
            : "Suggestions"
          : groups.length === 1
            ? "Choose one"
            : `Choice ${groupIndex + 1} · choose one`;
      fieldset.appendChild(legend);
      const hint = doc.createElement("span");
      hint.setAttribute("class", "npa-group-hint");
      hint.textContent =
        groupIndex >= 0
          ? "Cannot be combined"
          : candidates[0].selection!.allowedCombinations.length
            ? "Can be sent with a compatible choice"
            : "Send one at a time";
      fieldset.appendChild(hint);
      const options = doc.createElement("div");
      options.setAttribute("class", "npa-choice-options");
      fieldset.appendChild(options);
      list.appendChild(fieldset);
      containers.set(groupIndex, options);
    }
    const container = containers.get(groupIndex)!;
    const row = doc.createElement("label");
    row.setAttribute("class", "npa-choice");
    const input = doc.createElement("input");
    input.setAttribute("type", groupIndex < 0 ? "checkbox" : "radio");
    if (groupIndex >= 0)
      input.setAttribute("name", `npa-${candidate.selection!.blockKey}-${groupIndex}`);
    input.setAttribute("aria-label", candidate.text);
    input.setAttribute("value", id);
    input.checked = false;
    input.addEventListener("change", () => {
      if (input.disabled || pending) {
        refresh();
        return;
      }
      if (input.checked) {
        if (groupIndex >= 0)
          for (const other of current)
            if (groups[groupIndex].includes(other.selection!.id)) selected.delete(other.key);
        selected.add(candidate.key);
      } else selected.delete(candidate.key);
      refresh();
    });
    inputs.set(candidate.key, input);
    row.appendChild(input);
    const mark = doc.createElement("span");
    mark.setAttribute("class", "npa-mark");
    mark.setAttribute("aria-hidden", "true");
    row.appendChild(mark);
    const label = doc.createElement("span");
    label.setAttribute("class", "npa-label");
    const text = doc.createElement("span");
    text.textContent = candidate.text;
    label.appendChild(text);
    if (candidate.why) {
      const why = doc.createElement("span");
      why.setAttribute("class", "npa-why");
      candidate.why.split(/\*\*(.+?)\*\*/).forEach((part, partIndex) => {
        if (!part) return;
        const span = doc.createElement(partIndex % 2 ? "strong" : "span");
        span.textContent = part;
        why.appendChild(span);
      });
      label.appendChild(why);
    }
    row.appendChild(label);
    const state = doc.createElement("span");
    state.setAttribute("class", "npa-choice-state");
    state.setAttribute("data-choice-index", String(index));
    row.appendChild(state);
    container.appendChild(row);
  }
  const footer = doc.createElement("div");
  footer.setAttribute("class", "npa-selection-footer");
  const summary = doc.createElement("div");
  summary.setAttribute("class", "npa-selection-summary");
  summary.setAttribute("role", "status");
  const count = doc.createElement("strong");
  const detail = doc.createElement("span");
  summary.appendChild(count);
  summary.appendChild(detail);
  footer.appendChild(summary);
  const buttons = doc.createElement("div");
  buttons.setAttribute("class", "npa-actions");
  const button = (className: string, text: string) => {
    const node = doc.createElement("button");
    node.setAttribute("class", className);
    node.setAttribute("type", "button");
    node.textContent = text;
    buttons.appendChild(node);
    return node;
  };
  const clear = button("npa-selection-clear", "Clear");
  clear.setAttribute("aria-label", "Clear selection");
  const edit = button("npa-edit npa-selection-edit", "Edit selected");
  const send = button("npa-send npa-selection-send", "Send selected");
  const picked = () => current.filter((c) => selected.has(c.key));
  const ready = () =>
    !pending &&
    !latest.busy &&
    latest.note !== "Jev reviewing..." &&
    selectionAllowed(picked()) &&
    picked().every((c) => c.state === "ready");
  function refresh() {
    const chosen = picked();
    const allowed = selectionAllowed(chosen);
    count.textContent = `${chosen.length} selected`;
    detail.textContent =
      chosen.length > 1
        ? allowed
          ? "One numbered message"
          : "These suggestions cannot be combined. Change your selection."
        : chosen.length
          ? "One prompt"
          : "Choose a suggestion to continue";
    summary.setAttribute("data-invalid", String(chosen.length > 1 && !allowed));
    for (const [index, candidate] of current.entries()) {
      const input = inputs.get(candidate.key)!;
      input.checked = selected.has(candidate.key);
      input.disabled =
        pending || latest.busy || candidate.state !== "ready" || latest.note === "Jev reviewing...";
      input.parentElement!.setAttribute("data-selected", String(input.checked));
      root.querySelector(`[data-choice-index="${index}"]`)!.textContent =
        candidate.state === "sent"
          ? "Sent"
          : candidate.state === "unknown"
            ? "Check chat"
            : candidate.state === "sending"
              ? "Sending..."
              : "";
    }
    clear.disabled = pending || !selected.size;
    edit.disabled = send.disabled = !ready();
    send.textContent = pending
      ? "Sending..."
      : chosen.some((c) => c.state === "unknown")
        ? "Check chat"
        : chosen.length && chosen.every((c) => c.state === "sent")
          ? "Sent"
          : chosen.some((c) => c.state === "sending")
            ? "Sending..."
            : chosen.length
              ? `Send selected (${chosen.length})`
              : "Send selected";
  }
  clear.addEventListener("click", () => {
    if (clear.disabled) return;
    selected.clear();
    refresh();
  });
  edit.addEventListener("click", () => {
    if (ready()) actions.edit(picked());
  });
  send.addEventListener("click", () => {
    if (!ready()) return;
    const chosen = picked();
    pending = true;
    refresh();
    void actions.send(chosen).finally(() => {
      pending = false;
      refresh();
    });
  });
  footer.appendChild(buttons);
  footerRoot.appendChild(footer);
  refresh();
  return (next: Candidate[], snapshot: Snapshot) => {
    current = next;
    latest = snapshot;
    refresh();
  };
}
