import type { Candidate, Scope, Snapshot } from "../shared/contracts";
import { gitAction, joinPrompts } from "../shared/prompts";

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
  send(scope: Scope, key: string | string[]): Promise<{ sent: boolean }>;
  /** Runs on click with the pending outcome, so navigation need not wait for the send. */
  sending?(outcome: Promise<boolean>): void;
};
// The Board plugin listens for these events; plugin surfaces cannot open another plugin's surface.
export type BoardEvent = "paseo-board:open" | "paseo-board:sent" | "paseo-board:send-failed";
export function boardEvent(name: BoardEvent, doc: Document = document) {
  const view = doc.defaultView;
  if (view) doc.dispatchEvent(new view.Event(name));
}
const OWNER = "data-next-prompt-actions";
function iconMask(shape: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
// Each prompt renders as its own card, so the shared fence box, raw `prompt:`/`why:` text, and its
// copy button hide.
const styles = `
[${OWNER}] {display:flex;flex-direction:column;gap:8px;margin-top:10px;font:13px system-ui;line-height:1.4;}
[${OWNER}] .npa-row {display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;}
[${OWNER}] .npa-actions {display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:6px;margin-left:auto;max-width:100%;}
[${OWNER}] button {display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0;font:inherit;font-size:12px;font-weight:600;line-height:18px;white-space:nowrap;cursor:pointer;user-select:none;border:1px solid transparent;border-radius:6px;padding:6px 12px;min-height:32px;transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease,transform .12s ease;}
[${OWNER}] button::before {content:"";width:14px;height:14px;flex-shrink:0;background:currentColor;mask:var(--npa-icon) center / contain no-repeat;}
[${OWNER}] .npa-edit {--npa-icon:${iconMask('<path d="m16 3 5 5-13 13H3v-5L16 3Zm-2 2 5 5"/>')};}
[${OWNER}] .npa-send.npa-commit {--npa-icon:${iconMask('<circle cx="12" cy="12" r="4"/><path d="M3 12h5m8 0h5"/>')};}
[${OWNER}] .npa-send.npa-push {--npa-icon:${iconMask('<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>')};}
[${OWNER}] .npa-send {--npa-icon:${iconMask('<path d="M12 19V5m-6 6 6-6 6 6"/>')};}
[${OWNER}] .npa-send {min-width:88px;background:var(--npa-ink,#303034);color:var(--npa-paper,#fff);box-shadow:0 1px 2px color-mix(in srgb,var(--npa-ink,#303034) 15%,transparent);}
[${OWNER}] .npa-edit {background:color-mix(in srgb,var(--npa-ink,#303034) 4%,transparent);color:var(--npa-ink,#303034);border-color:color-mix(in srgb,var(--npa-ink,#303034) 40%,transparent);}
@media (hover:hover) {
  [${OWNER}] .npa-send:not(:disabled):hover {background:color-mix(in srgb,var(--npa-ink,#303034) 86%,var(--npa-paper,#fff));box-shadow:0 2px 5px color-mix(in srgb,var(--npa-ink,#303034) 18%,transparent);}
  [${OWNER}] .npa-edit:not(:disabled):hover {background:color-mix(in srgb,var(--npa-ink,#303034) 8%,transparent);border-color:color-mix(in srgb,var(--npa-ink,#303034) 60%,transparent);}
}
[${OWNER}] button:not(:disabled):active {transform:translateY(1px);box-shadow:none;}
[${OWNER}] button:focus-visible {outline:2px solid var(--npa-ink,#303034);outline-offset:3px;}
[${OWNER}] button:disabled {opacity:.4;cursor:default;box-shadow:none;}
@media (pointer:coarse) { [${OWNER}] button {min-height:44px;} }
@media (prefers-reduced-motion:reduce) {
  [${OWNER}] button {transition:none;}
  [${OWNER}] button:not(:disabled):active {transform:none;}
}
[${OWNER}] .npa-note {font-size:12px;opacity:.75;white-space:normal;overflow-wrap:anywhere;}
[${OWNER}] .npa-note:empty {display:none;}
[${OWNER}] .npa-label {flex:1;white-space:pre-wrap;overflow-wrap:anywhere;min-width:160px;}
[${OWNER}] .npa-why {display:block;margin-top:2px;font-size:12px;opacity:.7;}
[${OWNER}] .npa-why strong {font-weight:650;}
[data-npa-block] {background:transparent!important;border-color:transparent!important;padding:0!important;}
[data-npa-block] > :not([${OWNER}]) {display:none!important;}
[data-npa-block] > [${OWNER}] {margin-top:0;gap:6px;}
[data-npa-block] .npa-row {background:var(--npa-card,transparent);border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:8px;padding:8px 8px 8px 14px;gap:8px;transition:border-color .15s;}
[data-npa-block] .npa-row:hover, [data-npa-block] .npa-row:focus-within {border-color:color-mix(in srgb,currentColor 40%,transparent);}
[data-npa-block] .npa-row.npa-all {background:none;border-color:transparent;padding-top:0;padding-bottom:0;}
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
    : "The composer did not accept the text; copy the prompt text above.";
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
      ui.style.setProperty("--npa-card", computed.backgroundColor);
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
    const gitActions = candidates.map((candidate) => gitAction(candidate.text));
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
                : (gitActions[index]?.label ?? "Send");
        sends[index].disabled =
          latest.busy || candidate.state !== "ready" || latest.note === "Jev reviewing...";
      });
      // The trailing pair acts on every prompt as one message, so it needs all of them unsent.
      if (sends.length > next.length) {
        edits[next.length].disabled = false;
        sends[next.length].textContent = "Send all";
        sends[next.length].disabled =
          latest.busy ||
          next.some((c) => c.state !== "ready") ||
          latest.note === "Jev reviewing...";
      }
    }
    async function action(run: () => Promise<unknown>, label: string) {
      [...edits, ...sends].forEach((button) => {
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
    const items = candidates.map((c) => ({
      text: c.text,
      why: c.why,
      key: c.key as string | string[],
      all: false,
    }));
    if (candidates.length > 1 && !gitActions.some(Boolean))
      items.push({
        text: joinPrompts(candidates.map((c) => c.text)),
        why: undefined,
        key: candidates.map((c) => c.key),
        all: true,
      });
    for (const [index, item] of items.entries()) {
      const candidate = candidates[0];
      const git = gitActions[index];
      const row = doc.createElement("div");
      row.setAttribute("class", item.all ? "npa-row npa-all" : "npa-row");
      if (!item.all) {
        const label = doc.createElement("span");
        label.setAttribute("class", "npa-label");
        label.textContent = item.text;
        if (item.why) {
          const why = doc.createElement("span");
          why.setAttribute("class", "npa-why");
          // `**word**` marks the key outcome; odd split parts are the bold ones.
          item.why.split(/\*\*(.+?)\*\*/).forEach((part, index) => {
            if (!part) return;
            const span = doc.createElement(index % 2 ? "strong" : "span");
            span.textContent = part;
            why.appendChild(span);
          });
          label.appendChild(why);
        }
        row.appendChild(label);
      }
      const actions = doc.createElement("div");
      actions.setAttribute("class", "npa-actions");
      const edit = doc.createElement("button");
      edit.setAttribute("type", "button");
      edit.setAttribute("class", "npa-edit");
      edit.setAttribute(
        "aria-label",
        item.all
          ? "Edit all suggested prompts in the composer"
          : `Edit suggested prompt in the composer: ${item.text}`,
      );
      edit.textContent = item.all ? "Edit all" : "Edit";
      edit.addEventListener("click", () => {
        if (edit.disabled || !valid(block, context, candidate)) return;
        note.textContent = fillComposer(item.text, doc, block);
      });
      edits.push(edit);
      actions.appendChild(edit);
      const send = doc.createElement("button");
      send.setAttribute("type", "button");
      send.setAttribute(
        "class",
        git ? `npa-send npa-${git.kind === "push" ? "push" : "commit"}` : "npa-send",
      );
      send.setAttribute(
        "aria-label",
        item.all
          ? "Send all suggested prompts as one message"
          : `${git?.label ?? "Send"} suggested prompt: ${item.text}`,
      );
      send.addEventListener("click", () => {
        if (send.disabled || !valid(block, context, candidate)) return;
        send.textContent = "Sending...";
        void action(async () => {
          const outcome = controller.send(context, item.key);
          controller.sending?.(outcome.then((r) => r.sent).catch(() => false));
          await outcome;
        }, "Sending...");
      });
      sends.push(send);
      actions.appendChild(send);
      row.appendChild(actions);
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
