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
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  appendChild(node: Node): void;
  remove(): void;
  addEventListener(name: string, handler: () => void): void;
}
interface Document extends Node {
  head: Node;
  body: Node;
  createElement(tag: string): Node;
}
interface Fiber {
  memoizedProps?: Record<string, unknown>;
  return?: Fiber;
  alternate?: Fiber;
  stateNode?: { current?: Fiber };
}
declare const document: Document;
declare const navigator: { userAgent: string };
declare const MutationObserver: new (callback: () => void) => {
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
[${OWNER}] button:focus-visible {outline:2px solid currentColor;outline-offset:3px;}
[${OWNER}] button:disabled {opacity:.45;cursor:default;}
[${OWNER}] .npa-note {font-size:12px;opacity:.75;white-space:normal;overflow-wrap:anywhere;}
[${OWNER}] .npa-note:empty {display:none;}
[${OWNER}] .npa-label {flex:1;white-space:pre-wrap;overflow-wrap:anywhere;min-width:160px;}
`;

export function install(controller: Controller, doc: Document = document, identify = binding) {
  let stopped = false,
    scheduled = false,
    running = false,
    rescan = false;
  let scanTimer: ReturnType<typeof setTimeout> | undefined;
  const owned = new Map<Node, { signature: string; cleanup(): void }>();
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
    const signature = JSON.stringify([
      context,
      candidates,
      snapshot.enabled,
      snapshot.busy,
      snapshot.note,
    ]);
    if (owned.get(block)?.signature === signature) return;
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
    note.textContent = snapshot.note;
    ui.appendChild(note);
    const controls: Node[] = [];
    async function action(run: () => Promise<unknown>, label: string) {
      controls.forEach((button) => {
        button.disabled = true;
      });
      note.textContent = label;
      try {
        await run();
      } catch {
        note.textContent = "Action failed. Refresh state and try again.";
      } finally {
        const item = owned.get(block);
        if (item) item.signature = "";
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
      const send = doc.createElement("button");
      send.setAttribute("type", "button");
      send.setAttribute("class", "npa-send");
      send.setAttribute("aria-label", `Send suggested prompt: ${candidate.text}`);
      send.textContent =
        candidate.state === "sent"
          ? "Sent"
          : candidate.state === "unknown"
            ? "Check chat"
            : candidate.state === "sending"
              ? "Sending..."
              : "Send ↑";
      send.disabled =
        snapshot.busy || candidate.state !== "ready" || snapshot.note === "Jev reviewing...";
      send.addEventListener("click", () => {
        if (send.disabled || !valid(block, context, candidate)) return;
        void action(() => controller.send(context, candidate.key), "Sending...");
      });
      controls.push(send);
      row.appendChild(send);
      ui.appendChild(row);
    }
    block.appendChild(ui);
    const prior = block.getAttribute("data-npa-block");
    block.setAttribute("data-npa-block", candidates.length === 1 ? "single" : "multiple");
    owned.set(block, {
      signature,
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
    const found = new Set<Node>();
    const snapshots = new Map<string, Promise<Snapshot>>();
    try {
      for (const assistant of Array.from(
        doc.querySelectorAll('[data-testid="assistant-message"]'),
      )) {
        const context = identify(assistant);
        if (!context) continue;
        const blocks = Array.from(
          assistant.querySelectorAll('[data-paseo-markdown-tag="pre"]'),
        ).filter((b) => !b.closest('[data-paseo-markdown-tag="blockquote"]'));
        if (
          !blocks.some((b) =>
            /^prompt:/i.test(
              b.querySelector('[data-paseo-markdown-tag="code"]')?.textContent ?? "",
            ),
          )
        )
          continue;
        const id = JSON.stringify([context.serverId, context.agentId, context.workspaceId]);
        if (!snapshots.has(id)) snapshots.set(id, controller.inspect(context));
        let snapshot: Snapshot;
        try {
          snapshot = await snapshots.get(id)!;
        } catch {
          continue;
        }
        if (stopped) break;
        for (const block of blocks) {
          const code = block
            .querySelector('[data-paseo-markdown-tag="code"]')
            ?.textContent?.replace(/\r\n/g, "\n")
            .replace(/\n+$/, "");
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
  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  const timer = setInterval(schedule, 2500);
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
