import type { Doc, El, Key } from "./dom";

export type ComposerApi = { enhance(text: string): Promise<string> };

// The host marks the field with dataSet={{composerInput:""}}; the root testID covers older hosts.
const FIELD = '[data-composer-input], [data-testid="message-input-root"] textarea';
const BADGE = "data-prompt-translate-badge";
const UNSENT = "Chưa gửi được, nhấn Enter để gửi";

// The field is uncontrolled, but React tracks the last value it saw: write through the prototype
// setter and replay the input event so the host adopts the new text.
export function fillField(field: El, text: string, doc: Doc): boolean {
  const view = doc.defaultView;
  if (!view) return false;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
  if (setter) setter.call(field, text);
  else field.value = text;
  field.dispatchEvent(new view.Event("input", { bubbles: true }));
  field.focus?.();
  field.setSelectionRange?.(text.length, text.length);
  return field.value === text;
}

// A synthetic plain Enter runs the host's default send action, which honors the user's
// send-or-queue preference while the agent runs. Compact windows do not submit on Enter.
function pressEnter(field: El, doc: Doc): boolean {
  const Keyboard = doc.defaultView?.KeyboardEvent;
  if (!Keyboard) return false;
  field.dispatchEvent(
    new Keyboard("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }),
  );
  return true;
}

export function installComposer(
  api: ComposerApi,
  options: { enabled(): boolean },
  doc: Doc,
  // send: let React adopt the new text before Enter; verify: when an unsent prompt means failure.
  timing = { send: 50, verify: 1_500 },
) {
  let pending: { field: El; draft: string } | null = null;
  let badge: El | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
  };

  function send(field: El, prompt: string) {
    later(timing.send, () => {
      if (field.value !== prompt) return;
      if (!pressEnter(field, doc)) return say(UNSENT, 4000);
      later(timing.verify, () => {
        if (field.isConnected && field.value === prompt) say(UNSENT, 4000);
      });
    });
  }

  function say(text: string | null, ms?: number) {
    clearTimeout(hideTimer);
    if (text === null) {
      badge?.remove();
      badge = null;
      return;
    }
    if (!badge) {
      badge = doc.createElement("div");
      badge.setAttribute(BADGE, "");
      // Fixed position keeps the host layout untouched.
      badge.style.cssText =
        "position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:6px 10px;border-radius:8px;font:12px/1.4 system-ui,sans-serif;background:rgba(24,24,27,.9);color:#fafafa;pointer-events:none;";
      doc.body.append(badge);
    }
    badge.textContent = text;
    if (ms) hideTimer = setTimeout(() => say(null), ms);
  }

  function onKeydown(event: Key) {
    if (event.key === "Escape" && pending) {
      pending = null;
      say(null);
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.shiftKey) return;
    if (event.isComposing || event.keyCode === 229) return;
    const field = (event.target as El | null)?.closest?.(FIELD) ?? null;
    if (!field || !options.enabled()) return;
    // Owned even when idle or empty, so the host never sends or queues on Cmd+Enter.
    event.preventDefault();
    event.stopImmediatePropagation();
    const draft = field.value ?? "";
    if (pending || !draft.trim()) return;
    const request = { field, draft };
    pending = request;
    say("Enhancing… (Esc để hủy)");
    api.enhance(draft).then(
      (prompt) => {
        if (pending !== request) return;
        pending = null;
        if (field.value !== draft) return say("Bản nháp đã đổi, bỏ qua kết quả enhance", 4000);
        if (!fillField(field, prompt, doc)) return say("Composer không nhận text đã enhance", 4000);
        say(null);
        send(field, prompt);
      },
      (error: unknown) => {
        if (pending !== request) return;
        pending = null;
        say(`Enhance lỗi: ${error instanceof Error ? error.message : String(error)}`, 4000);
      },
    );
  }

  doc.addEventListener("keydown", onKeydown, true);
  return {
    onKeydown,
    stop() {
      doc.removeEventListener("keydown", onKeydown, true);
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      pending = null;
      say(null);
    },
  };
}
