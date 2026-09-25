import { composerAgent, type AgentModeState } from "./agent-mode";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { type TranslateSettings } from "../shared/settings";
import type { Doc, DomEvent, El, Observer } from "./dom";

type Mode = TranslateSettings["cavemanMode"];
type Client = Pick<PluginClientContext, "rpc">;

const modes: readonly { value: Mode; label: string }[] = [
  { value: "follow-agent", label: "Default" },
  { value: "lite", label: "Lite" },
  { value: "full", label: "Full" },
  { value: "ultra", label: "Ultra" },
  { value: "wenyan-lite", label: "Wenyan Lite" },
  { value: "wenyan-full", label: "Wenyan Full" },
  { value: "wenyan-ultra", label: "Wenyan Ultra" },
];
const ROOT = '[data-testid="message-input-root"]';
const ATTACH = '[data-testid="message-input-attach-button"]';
const CONTROL = "data-prompt-translate-mode";
const OPTION = "data-prompt-translate-option";

const styles = `
[${CONTROL}] { position:relative; display:flex; align-items:center; min-width:0; }
[${CONTROL}] [data-pt-trigger] { appearance:none; display:inline-flex; align-items:center; gap:6px;
  height:28px; max-width:180px; padding:0 8px; border:0; border-radius:999px;
  background:transparent; color:inherit; font:inherit; font-size:14px; white-space:nowrap;
  cursor:pointer; }
[${CONTROL}] [data-pt-trigger]:hover, [${CONTROL}] [data-pt-trigger][aria-expanded="true"] {
  background:color-mix(in srgb,currentColor 9%,transparent); }
[${CONTROL}] [data-pt-trigger]:focus-visible { outline:2px solid currentColor; outline-offset:2px; }
[${CONTROL}] [data-pt-label] { overflow:hidden; text-overflow:ellipsis; }
[${CONTROL}] [data-pt-chevron] { flex:none; width:6px; height:6px; margin-top:-3px;
  border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor;
  transform:rotate(45deg); opacity:.7; }
[${CONTROL}] [data-pt-menu] { position:absolute; left:0; bottom:calc(100% + 8px); z-index:2147483646;
  min-width:224px; max-height:310px; overflow:auto; padding:6px;
  border:1px solid color-mix(in srgb,var(--pt-foreground) 14%,transparent);
  border-radius:12px; background:var(--pt-surface); color:var(--pt-foreground);
  box-shadow:0 12px 32px rgba(0,0,0,.18); }
[${CONTROL}] [${OPTION}] { appearance:none; display:flex; align-items:center; justify-content:space-between;
  width:100%; min-height:34px; padding:6px 10px; border:0; border-radius:7px;
  background:transparent; color:inherit; font:inherit; font-size:14px; text-align:left;
  cursor:pointer; }
[${CONTROL}] [${OPTION}]:hover, [${CONTROL}] [${OPTION}]:focus-visible {
  background:color-mix(in srgb,currentColor 9%,transparent); outline:none; }
[${CONTROL}] [data-pt-check] { margin-left:14px; font-size:15px; }
`;

function label(mode: Mode) {
  return modes.find((item) => item.value === mode)?.label ?? "Default";
}

function surfaceColor(doc: Doc, root: El): { foreground: string; surface: string } {
  const computed = doc.defaultView?.getComputedStyle;
  const foreground = computed?.(root).color || "CanvasText";
  for (let node: El | null = root; node; node = node.parentElement) {
    const background = computed?.(node).backgroundColor;
    if (background && background !== "transparent" && !/^rgba\([^)]*,\s*0\)$/.test(background))
      return { foreground, surface: background };
  }
  return { foreground, surface: "Canvas" };
}

export function installComposerModeMenu(
  _client: Client,
  doc: Doc,
  Observer: Observer | undefined,
  state: AgentModeState,
) {
  const controls = new Map<El, { trigger: El; label: El; menu: El | null }>();
  const style = doc.createElement("style");
  style.textContent = styles;
  doc.head.append(style);
  let stopped = false;
  let scheduled = false;
  let saving = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function close(wrapper: El) {
    const control = controls.get(wrapper);
    if (!control) return;
    control.menu?.remove();
    control.menu = null;
    control.trigger.setAttribute("aria-expanded", "false");
  }

  async function save(mode: Mode, trigger: El) {
    if (saving) return;
    saving = true;
    trigger.setAttribute("aria-busy", "true");
    const id = composerAgent(trigger.closest(ROOT)!);
    try {
      if (!id) throw new Error("Open an agent conversation first");
      await state.set(id, mode);
      update();
      trigger.removeAttribute("title");
    } catch (error) {
      trigger.setAttribute("title", error instanceof Error ? error.message : String(error));
    } finally {
      saving = false;
      trigger.removeAttribute("aria-busy");
    }
  }

  function open(wrapper: El) {
    const control = controls.get(wrapper);
    if (!control || control.menu) return;
    for (const other of controls.keys()) close(other);
    const id = composerAgent(wrapper.closest(ROOT)!);
    if (!id || state.get(id) === undefined) return;
    const selectedMode = state.get(id);
    const menu = doc.createElement("div");
    menu.setAttribute("data-pt-menu", "");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", "Caveman mode");
    const colors = surfaceColor(doc, wrapper);
    menu.style.cssText = `--pt-surface:${colors.surface};--pt-foreground:${colors.foreground};`;
    for (const mode of modes) {
      const option = doc.createElement("button");
      option.setAttribute("type", "button");
      option.setAttribute(OPTION, mode.value);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(mode.value === selectedMode));
      const name = doc.createElement("span");
      name.textContent = mode.label;
      option.append(name);
      if (mode.value === selectedMode) {
        const check = doc.createElement("span");
        check.setAttribute("data-pt-check", "");
        check.setAttribute("aria-hidden", "true");
        check.textContent = "✓";
        option.append(check);
      }
      option.addEventListener("click", () => {
        close(wrapper);
        control.trigger.focus?.();
        void save(mode.value, control.trigger);
      });
      menu.append(option);
    }
    control.menu = menu;
    wrapper.append(menu);
    control.trigger.setAttribute("aria-expanded", "true");
  }

  function scan() {
    scheduled = false;
    if (stopped) return;
    for (const wrapper of controls.keys()) if (!wrapper.isConnected) controls.delete(wrapper);
    for (const root of Array.from(doc.querySelectorAll(ROOT))) {
      const id = composerAgent(root);
      if (id) void state.load(id).catch(() => undefined);
      if (root.querySelector(`[${CONTROL}]`)) continue;
      const attach = root.querySelector(ATTACH);
      const agentControl = root.querySelector(
        '[data-testid="agent-provider-selector"], [data-testid="mode-control"]',
      );
      let group = attach?.parentElement;
      while (group && agentControl && !group.contains(agentControl)) group = group.parentElement;
      if (!group) continue;
      const wrapper = doc.createElement("div");
      wrapper.setAttribute(CONTROL, "");
      const trigger = doc.createElement("button");
      trigger.setAttribute("type", "button");
      trigger.setAttribute("data-pt-trigger", "");
      trigger.setAttribute("aria-label", "Caveman mode");
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      const name = doc.createElement("span");
      name.setAttribute("data-pt-label", "");
      name.textContent = "Caveman: Default";
      const chevron = doc.createElement("span");
      chevron.setAttribute("data-pt-chevron", "");
      chevron.setAttribute("aria-hidden", "true");
      trigger.append(name, chevron);
      trigger.addEventListener("click", () => {
        if (controls.get(wrapper)?.menu) close(wrapper);
        else open(wrapper);
      });
      wrapper.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (!controls.get(wrapper)?.menu) return;
          event.preventDefault();
          event.stopPropagation();
          close(wrapper);
          trigger.focus?.();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          if (!controls.get(wrapper)?.menu) open(wrapper);
          const options = Array.from(wrapper.querySelectorAll(`[${OPTION}]`));
          const selected = (event.target as El | null)?.closest?.(`[${OPTION}]`);
          const index = options.indexOf(selected as El);
          const next =
            event.key === "ArrowDown"
              ? (index + 1) % options.length
              : index < 0
                ? options.length - 1
                : (index - 1 + options.length) % options.length;
          options[next]?.focus?.();
        }
      });
      wrapper.append(trigger);
      controls.set(wrapper, { trigger, label: name, menu: null });
      if (attach && agentControl) {
        let anchor = attach;
        while (anchor.parentElement && anchor.parentElement !== group)
          anchor = anchor.parentElement;
        anchor.after(wrapper);
      } else group.append(wrapper);
    }
  }

  function update() {
    for (const [wrapper, control] of controls) {
      const root = wrapper.closest(ROOT);
      const model = root?.querySelector('[data-testid="combined-model-selector"]');
      const modelLabel =
        model &&
        Array.from(model.querySelectorAll("div,span")).find(
          (node) => node.textContent?.trim() && !node.querySelector("div,span,svg"),
        );
      const typography = modelLabel && doc.defaultView?.getComputedStyle?.(modelLabel);
      if (typography) {
        const css = `color:${typography.color};font-family:${typography.fontFamily};font-size:${typography.fontSize};font-weight:${typography.fontWeight};font-style:${typography.fontStyle};line-height:${typography.lineHeight};letter-spacing:${typography.letterSpacing};`;
        if (control.trigger.getAttribute("data-pt-typography") !== css) {
          control.trigger.style.cssText = css;
          control.trigger.setAttribute("data-pt-typography", css);
        }
      }
      const id = root && composerAgent(root);
      const mode = id ? state.get(id) : undefined;
      const text = `Caveman: ${mode ? label(mode) : id ? "Loading…" : "Default"}`;
      if (control.label.textContent !== text) {
        control.label.textContent = text;
        close(wrapper);
      }
      if (id && mode) control.trigger.removeAttribute("disabled");
      else control.trigger.setAttribute("disabled", "");
    }
  }
  const unsubscribe = state.subscribe(update);
  function outside(event: DomEvent) {
    const target = event.target as El | null;
    for (const wrapper of controls.keys()) if (!wrapper.contains(target)) close(wrapper);
  }
  doc.body.addEventListener("pointerdown", outside, true);
  const observer = Observer
    ? new Observer(() => {
        if (scheduled || stopped) return;
        scheduled = true;
        timer = setTimeout(() => {
          scan();
          update();
        }, 50);
      })
    : undefined;
  observer?.observe(doc.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });
  scan();
  update();

  return {
    scan,
    update,
    stop() {
      stopped = true;
      unsubscribe();
      observer?.disconnect();
      clearTimeout(timer);
      doc.body.removeEventListener("pointerdown", outside, true);
      for (const wrapper of controls.keys()) wrapper.remove();
      controls.clear();
      style.remove();
    },
  };
}
