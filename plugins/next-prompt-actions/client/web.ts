import type { Candidate, Scope, Snapshot } from "../shared/contracts";

export interface Node {
  textContent: string | null;
  isConnected: boolean;
  parentElement: Node | null;
  disabled: boolean;
  title: string;
  style: { cssText: string; setProperty(key: string, value: string): void };
  querySelector(selector: string): Node | null;
  querySelectorAll(selector: string): ArrayLike<Node>;
  closest(selector: string): Node | null;
  contains?(node: Node): boolean;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  appendChild(node: Node): void;
  remove(): void;
  addEventListener(name: string, handler: () => void): void;
  value?: string;
  focus?(): void;
  setSelectionRange?(start: number, end: number): void;
  dispatchEvent(event: object): void;
}
interface Document extends Node {
  head: Node;
  body: Node;
  createElement(tag: string): Node;
  defaultView?: { Event: new (type: string, init?: { bubbles?: boolean }) => object } | null;
}
interface Fiber {
  memoizedProps?: Record<string, unknown>;
  return?: Fiber;
  alternate?: Fiber;
  stateNode?: { current?: Fiber };
}
declare const document: Document;
declare const navigator: { userAgent: string };
type Mutation = { target: Node; addedNodes: ArrayLike<Node>; removedNodes: ArrayLike<Node> };
declare const MutationObserver: new (callback: (records: Mutation[]) => void) => {
  observe(node: Node, options: unknown): void;
  disconnect(): void;
};
declare function getComputedStyle(node: Node): { color: string; backgroundColor: string };

export type Binding = Scope & { message: string; timestamp: number };
export function binding(node: Node): Binding | null {
  let message: string | undefined, timestamp: number | undefined;
  let scope: Scope | undefined;
  const fiberKey = Object.keys(node).find((key) => key.startsWith("__reactFiber$"));
  if (!fiberKey) return null;
  let fiber = (node as unknown as Record<string, Fiber>)[fiberKey];
  // React keeps the DOM pointer on either buffer across commits. Read the active tree.
  let root = fiber;
  for (let depth = 0; root?.return && depth < 200; depth++) root = root.return;
  if (root?.stateNode?.current && root.stateNode.current !== root) {
    if (!fiber.alternate) return null;
    fiber = fiber.alternate;
  }
  for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return!) {
    const p = fiber.memoizedProps;
    if (!p) continue;
    if (
      typeof p.message === "string" &&
      typeof p.timestamp === "number" &&
      typeof p.phase === "string"
    ) {
      if (p.phase !== "complete") return null;
      message ??= p.message;
      timestamp ??= p.timestamp;
    }
    if (
      typeof p.agentId === "string" &&
      typeof p.serverId === "string" &&
      typeof p.workspaceId === "string"
    ) {
      scope = { agentId: p.agentId, serverId: p.serverId, workspaceId: p.workspaceId };
      break;
    }
  }
  return scope && message !== undefined && timestamp !== undefined
    ? { ...scope, message, timestamp }
    : null;
}
export function desktopSupported() {
  return (
    typeof document !== "undefined" &&
    typeof navigator !== "undefined" &&
    /Electron\//.test(navigator.userAgent)
  );
}

type Controller = {
  inspect(scope: Scope): Promise<Snapshot>;
  send(scope: Scope, key: string): Promise<Snapshot>;
};
const OWNER = "data-next-prompt-actions";
const styles = `
[${OWNER}] {display:flex;flex-direction:column;gap:8px;margin-top:10px;font:13px system-ui;line-height:1.4;}
[${OWNER}] .npa-row {display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;}
[${OWNER}] button {font:inherit;cursor:pointer;border:1px solid transparent;border-radius:7px;padding:7px 13px;min-height:34px;}
[${OWNER}] .npa-send {background:var(--npa-ink,#303034);color:var(--npa-paper,#fff);}
[${OWNER}] .npa-edit {background:transparent;color:var(--npa-ink,#303034);border-color:currentColor;}
[${OWNER}] button:focus-visible {outline:2px solid currentColor;outline-offset:3px;}
[${OWNER}] button:disabled {opacity:.45;cursor:default;}
[${OWNER}] .npa-note {font-size:12px;opacity:.75;white-space:normal;overflow-wrap:anywhere;}
[${OWNER}] .npa-note:empty {display:none;}
[${OWNER}] .npa-label {flex:1;white-space:pre-wrap;overflow-wrap:anywhere;min-width:160px;}
`;

// The host marks the composer field with dataSet={{composerInput:""}}; the root testID is the
// fallback for hosts that predate it.
const FIELDS = ["[data-composer-input]", '[data-testid="message-input-root"] textarea'];
// Several conversations can stay mounted at once, so prefer the composer sharing the closest
// ancestor with the clicked prompt rather than whichever comes first in the document.
export function composerField(doc: Document, block?: Node): Node | null {
  const fields = FIELDS.flatMap((selector) => Array.from(doc.querySelectorAll(selector)));
  if (fields.length < 2) return fields[0] ?? null;
  for (let node = block ?? null; node; node = node.parentElement)
    for (const field of fields) if (node.contains?.(field)) return field;
  return fields[fields.length - 1];
}
export function fillComposer(text: string, doc: Document, block?: Node): string {
  const field = composerField(doc, block);
  const view = doc.defaultView;
  if (!field || !view) return "Composer not found. Open the conversation, then try again.";
  // The field is uncontrolled, but React still tracks the last value it saw: write through the
  // prototype setter and replay the input event so the host adopts the new text.
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
  if (setter) setter.call(field, text);
  else field.value = text;
  field.dispatchEvent(new view.Event("input", { bubbles: true }));
  field.focus?.();
  field.setSelectionRange?.(text.length, text.length);
  return field.value === text
    ? "Ready in the composer."
    : "The composer did not accept the text; copy it from the block above.";
}

export function install(controller: Controller, doc: Document = document, identify = binding) {
  let stopped = false,
    scheduled = false,
    running = false,
    rescan = false,
    fresh = true;
  // A streaming reply mutates the DOM constantly. Reuse the last timeline read unless a prompt
  // block appeared or changed; the interval and user actions still force a fresh read.
  const cache = new Map<string, { seen: Set<string>; snapshot: Promise<Snapshot> }>();
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  type Owned = {
    structure: string;
    state: string;
    update(candidates: Candidate[], snapshot: Snapshot): void;
    cleanup(): void;
  };
  const owned = new Map<Node, Owned>();
  const style = doc.createElement("style");
  style.textContent = styles;
  doc.head.appendChild(style);
  function clear(block: Node) {
    owned.get(block)?.cleanup();
    owned.delete(block);
  }
  function valid(block: Node, expected: Binding, candidate: Candidate) {
    const now = identify(block.closest('[data-testid="assistant-message"]') ?? block);
    return (
      block.isConnected &&
      now &&
      now.agentId === expected.agentId &&
      now.serverId === expected.serverId &&
      now.workspaceId === expected.workspaceId &&
      now.message === expected.message &&
      now.timestamp === expected.timestamp &&
      candidate.timestamp === now.timestamp
    );
  }
  function render(block: Node, context: Binding, candidates: Candidate[], snapshot: Snapshot) {
    // Rebuilding the controls flashes and shifts layout, so state changes patch them in place.
    const structure = JSON.stringify([context, candidates.map(({ state: _, ...rest }) => rest)]);
    const state = JSON.stringify([
      candidates.map((c) => c.state),
      snapshot.enabled,
      snapshot.busy,
      snapshot.note,
    ]);
    const current = owned.get(block);
    if (current?.structure === structure) {
      if (current.state !== state) {
        current.state = state;
        current.update(candidates, snapshot);
      }
      return;
    }
    clear(block);
    if (block.querySelector(`[${OWNER}]`)) return;
    const ui = doc.createElement("div");
    ui.setAttribute(OWNER, "true");
    ui.setAttribute("data-paseo-markdown-ignore", "true");
    const computed = typeof getComputedStyle === "function" ? getComputedStyle(block) : null;
    if (computed) {
      ui.style.setProperty("--npa-ink", computed.color);
      ui.style.setProperty(
        "--npa-paper",
        computed.backgroundColor === "rgba(0, 0, 0, 0)" ? "#fff" : computed.backgroundColor,
      );
    }
    const note = doc.createElement("div");
    note.setAttribute("class", "npa-note");
    note.setAttribute("role", "status");
    ui.appendChild(note);
    const edits: Node[] = [];
    const sends: Node[] = [];
    const controls = [edits, sends];
    function update(next: Candidate[], latest: Snapshot) {
      note.textContent = latest.note;
      next.forEach((candidate, index) => {
        edits[index].disabled = false;
        sends[index].textContent =
          candidate.state === "sent"
            ? "Sent"
            : candidate.state === "unknown"
              ? "Check chat"
              : candidate.state === "sending"
                ? "Sending..."
                : "Send ↑";
        sends[index].disabled =
          latest.busy || candidate.state !== "ready" || latest.note === "Jev reviewing...";
      });
    }
    async function action(run: () => Promise<unknown>, label: string) {
      controls.flat().forEach((button) => {
        button.disabled = true;
      });
      note.textContent = label;
      try {
        await run();
      } catch {
        note.textContent = "Action failed. Refresh state and try again.";
      } finally {
        const item = owned.get(block);
        if (item) item.state = "";
        fresh = true;
        schedule();
      }
    }
    for (const candidate of candidates) {
      const row = doc.createElement("div");
      row.setAttribute("class", "npa-row");
      if (candidates.length > 1) {
        const label = doc.createElement("span");
        label.setAttribute("class", "npa-label");
        label.textContent = candidate.text;
        row.appendChild(label);
      }
      const edit = doc.createElement("button");
      edit.setAttribute("type", "button");
      edit.setAttribute("class", "npa-edit");
      edit.setAttribute("aria-label", `Edit suggested prompt in the composer: ${candidate.text}`);
      edit.textContent = "Edit ↓";
      edit.addEventListener("click", () => {
        if (edit.disabled || !valid(block, context, candidate)) return;
        note.textContent = fillComposer(candidate.text, doc, block);
      });
      edits.push(edit);
      row.appendChild(edit);
      const send = doc.createElement("button");
      send.setAttribute("type", "button");
      send.setAttribute("class", "npa-send");
      send.setAttribute("aria-label", `Send suggested prompt: ${candidate.text}`);
      send.addEventListener("click", () => {
        if (send.disabled || !valid(block, context, candidate)) return;
        send.textContent = "Sending...";
        void action(() => controller.send(context, candidate.key), "Sending...");
      });
      sends.push(send);
      row.appendChild(send);
      ui.appendChild(row);
    }
    update(candidates, snapshot);
    block.appendChild(ui);
    const prior = block.getAttribute("data-npa-block");
    block.setAttribute("data-npa-block", candidates.length === 1 ? "single" : "multiple");
    owned.set(block, {
      structure,
      state,
      update,
      cleanup() {
        ui.remove();
        if (prior === null) block.removeAttribute("data-npa-block");
        else block.setAttribute("data-npa-block", prior);
      },
    });
  }
  async function scan() {
    if (stopped) return;
    if (running) {
      rescan = true;
      return;
    }
    running = true;
    const refresh = fresh;
    fresh = false;
    const found = new Set<Node>();
    const reads = new Set<string>();
    try {
      for (const assistant of Array.from(
        doc.querySelectorAll('[data-testid="assistant-message"]'),
      )) {
        const context = identify(assistant);
        if (!context) continue;
        const blocks = Array.from(
          assistant.querySelectorAll('[data-paseo-markdown-tag="pre"]'),
        ).filter((b) => !b.closest('[data-paseo-markdown-tag="blockquote"]'));
        const codes = blocks.map((b) =>
          b
            .querySelector('[data-paseo-markdown-tag="code"]')
            ?.textContent?.replace(/\r\n/g, "\n")
            .replace(/\n+$/, ""),
        );
        if (!codes.some((code) => /^prompt:/i.test(code ?? ""))) continue;
        const id = JSON.stringify([context.serverId, context.agentId, context.workspaceId]);
        const key = JSON.stringify([context.message, context.timestamp, codes]);
        let entry = cache.get(id);
        if (!reads.has(id) && (refresh || !entry?.seen.has(key))) {
          entry = { seen: new Set(), snapshot: controller.inspect(context) };
          cache.set(id, entry);
          reads.add(id);
        }
        if (!entry) continue;
        entry.seen.add(key);
        let snapshot: Snapshot;
        try {
          snapshot = await entry.snapshot;
        } catch {
          cache.delete(id);
          continue;
        }
        if (stopped) break;
        for (const [index, block] of blocks.entries()) {
          const code = codes[index];
          const candidates = snapshot.candidates.filter(
            (c) =>
              c.block === code &&
              c.timestamp === context.timestamp &&
              c.source.includes(context.message),
          );
          if (!candidates.length || !valid(block, context, candidates[0])) continue;
          found.add(block);
          render(block, context, candidates, snapshot);
        }
      }
      for (const block of owned.keys()) if (!found.has(block)) clear(block);
    } finally {
      running = false;
      if (rescan) {
        rescan = false;
        schedule();
      }
    }
  }
  function schedule() {
    if (scheduled || stopped) return;
    scheduled = true;
    scanTimer = setTimeout(() => {
      scheduled = false;
      void scan();
    }, 100);
  }
  // Our own note and button updates must not trigger another timeline read.
  function ours(node: Node) {
    const element = typeof node.closest === "function" ? node : node.parentElement;
    return !!element?.closest(`[${OWNER}]`);
  }
  const observer = new MutationObserver((records) => {
    const foreign = records.some((record) => {
      if (ours(record.target)) return false;
      const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
      return !nodes.length || !nodes.every(ours);
    });
    if (foreign) schedule();
  });
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  const timer = setInterval(() => {
    fresh = true;
    schedule();
  }, 2500);
  schedule();
  return () => {
    stopped = true;
    observer.disconnect();
    clearInterval(timer);
    clearTimeout(scanTimer);
    for (const block of owned.keys()) clear(block);
    style.remove();
  };
}
