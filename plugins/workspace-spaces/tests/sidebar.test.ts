import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { mountSidebar, type DomDocument } from "../client/web";
import {
  createSidebarController,
  matchProject,
  sidebarMembership,
  spaceActivity,
  type SidebarController,
  type SidebarSnapshot,
} from "../client/sidebar-state";
import {
  addSpace,
  moveProject,
  projectKey,
  removeSpace,
  renameSpace,
  stateSchema,
  type Activity,
} from "../shared/spaces";

const fixture = `<html><head></head><body><aside><section><div data-testid="sidebar-project-workspace-list-scroll"><div id="workspace-heading"><div>Workspaces</div><div><button data-testid="sidebar-display-preferences-menu">Display preferences</button></div></div><div role="group" id="p"><button data-testid="sidebar-project-row-repo:p">P</button><span>Existing agent</span></div><div role="group" id="q"><button data-testid="sidebar-project-row-repo:q">Q</button></div><div role="group" id="unknown"><button data-testid="sidebar-project-row-other">Other host</button></div></div></section></aside><main>Chat</main><div role="menu"><div data-testid="sidebar-project-menu-open-settings-repo:p">Settings</div></div></body></html>`;
function setup(
  html = fixture,
  moveSucceeded = true,
  thirdSpace = false,
  storage = new Map<string, string>(),
  mac = false,
) {
  const { document, window } = parseHTML(html);
  Object.assign(document.defaultView ?? window, {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  let state = addSpace(stateSchema.parse({}));
  if (thirdSpace) state = addSpace(state);
  state = moveProject(state, projectKey("sidebar", "p"), "space-2");
  let snapshot: SidebarSnapshot = {
    state,
    busy: false,
    error: "",
    projects: [
      { id: "p", name: "P", viewKey: "repo:p", workspaces: [] },
      { id: "q", name: "Q", viewKey: "repo:q", workspaces: [] },
    ],
  };
  let activity: Record<string, Activity> = {};
  let activityPolls = 0;
  let listener = () => {},
    mutations = () => {},
    disconnected = false,
    stopped = false;
  const controller = {
    get: () => snapshot,
    getLoadError: () => "",
    getActivity: () => activity,
    refreshActivity: async () => {
      activityPolls++;
    },
    subscribe(fn: () => void) {
      listener = fn;
      return () => {
        listener = () => {};
      };
    },
    refresh: async () => {
      listener();
    },
    create: async () => true,
    rename: async (id: string, name: string) => {
      if (!moveSucceeded) return false;
      snapshot = { ...snapshot, state: renameSpace(snapshot.state, id, name) };
      listener();
      return true;
    },
    remove: async (id: string) => {
      snapshot = { ...snapshot, state: removeSpace(snapshot.state, id) };
      listener();
      return true;
    },
    move: async () => true,
    moveView: async () => moveSucceeded,
    stop: () => {
      stopped = true;
    },
  } as SidebarController;
  const cleanup = mountSidebar(
    document as unknown as DomDocument,
    (fn) => {
      mutations = fn;
      return {
        observe() {},
        disconnect() {
          disconnected = true;
        },
      };
    },
    controller,
    { mac },
  );
  return {
    document,
    window,
    cleanup,
    mutations: () => mutations(),
    update(error: string) {
      snapshot = { ...snapshot, error };
      listener();
    },
    setActivity(next: Record<string, Activity>) {
      activity = next;
      listener();
    },
    activityPolls: () => activityPolls,
    stopped: () => stopped && disconnected,
  };
}
test("sidebar tabs filter whole project groups across hosts and clean up", () => {
  const f = setup(),
    d = f.document;
  assert.equal(d.querySelectorAll('[data-testid="spaces-sidebar-controls"]').length, 1);
  assert.equal(d.querySelector("#p")?.getAttribute("data-paseo-space-hidden"), "true");
  assert.equal(d.querySelector("#q")?.hasAttribute("data-paseo-space-hidden"), false);
  assert.equal(d.querySelector("#unknown")?.hasAttribute("data-paseo-space-hidden"), false);
  (d.querySelector('[aria-label="Workspace 2"]') as unknown as { click(): void }).click();
  assert.equal(d.querySelector("#p")?.hasAttribute("data-paseo-space-hidden"), false);
  assert.equal(d.querySelector("#q")?.getAttribute("data-paseo-space-hidden"), "true");
  assert.equal(d.querySelector("#unknown")?.getAttribute("data-paseo-space-hidden"), "true");
  assert.match(d.querySelector('[role="menu"]')!.textContent!, /Move to workspace/);
  assert.equal(d.querySelector("main")!.textContent, "Chat");
  f.cleanup();
  f.cleanup();
  assert.equal(d.querySelector("[data-paseo-space-hidden]"), null);
  assert.equal(d.querySelector("[data-paseo-spaces-owner]"), null);
  assert.equal(d.querySelector(".paseo-spaces-menu"), null);
  assert.equal(d.querySelector('[data-testid="spaces-sidebar-controls"]'), null);
  assert.equal(d.querySelector('[role="menu"]')!.textContent, "Settings");
  assert.equal(f.stopped(), true);
});
test("sidebar handles scoped wheel events, rerenders, and host errors", async () => {
  const f = setup(),
    d = f.document;
  const wheel = new f.window.Event("wheel", { bubbles: true, cancelable: true });
  Object.assign(wheel, { deltaX: 90, deltaY: 0, deltaMode: 0, buttons: 0 });
  d.querySelector('[data-testid="sidebar-project-workspace-list-scroll"]')!.dispatchEvent(wheel);
  assert.equal(
    d.querySelector('[aria-label="Workspace 2"]')!.getAttribute("aria-selected"),
    "true",
  );
  assert.equal(wheel.defaultPrevented, true);
  const group = d.querySelector("#q")!;
  group.removeAttribute("data-paseo-space-hidden");
  f.mutations();
  await Promise.resolve();
  assert.equal(group.getAttribute("data-paseo-space-hidden"), "true");
  f.update("Host offline");
  assert.equal(d.querySelector("[data-paseo-space-hidden]"), null);
  assert.match(d.querySelector('[role="status"]')!.textContent!, /Host offline/);
  f.cleanup();
});
test("maps equivalence and placement IDs without project-name guessing", () => {
  const projects = [{ id: "p", name: "Same name", viewKey: "repo:p", workspaces: [] }];
  assert.equal(matchProject("repo:p", projects)?.id, "p");
  assert.equal(matchProject('["host","p"]', projects)?.id, "p");
  assert.equal(matchProject("Same name", projects), undefined);
  const state = moveProject(addSpace(stateSchema.parse({})), projectKey("host", "p"), "space-2");
  assert.equal(sidebarMembership(state, "p"), "space-2");
});
test("revision conflicts preserve old state and report an actionable error", async () => {
  const initial = stateSchema.parse({});
  const client = {
    rpc: async (contract: { name: string }) => {
      if (contract.name === "spaces.catalog") return { projects: [] };
      if (contract.name.endsWith(".read"))
        return { status: "ready", revision: "r1", values: initial };
      return { status: "conflict", error: "Revision conflict" };
    },
  } as unknown as Parameters<typeof createSidebarController>[0];
  const controller = createSidebarController(client);
  await controller.refresh();
  assert.equal(await controller.create(), false);
  assert.equal(controller.get()!.state.spaces.length, 1);
  assert.match(controller.get()!.error, /Revision conflict/);
  controller.stop();
});

test("extends Paseo data-menu-surface menus without replacing built-in items", () => {
  const f = setup(fixture.replace('role="menu"', 'data-menu-surface="true"'));
  assert.match(
    f.document.querySelector("[data-menu-surface]")!.textContent!,
    /SettingsMove to workspace/,
  );
  f.cleanup();
  assert.equal(f.document.querySelector("[data-menu-surface]")!.textContent, "Settings");
});

test("removing the active Space moves its projects and protects the last Space", async () => {
  const f = setup(),
    d = f.document;
  try {
    const tab = d.querySelector('[aria-label="Workspace 2"]')!;
    tab.click();
    tab.dispatchEvent(new f.window.Event("contextmenu", { bubbles: true, cancelable: true }));
    const remove = d.querySelector('[aria-label="Remove Workspace 2"]')!;
    assert.match(remove.textContent!, /Workspace 1/);
    remove.click();
    await Promise.resolve();
    assert.equal(d.querySelector('[aria-label="Workspace 2"]'), null);
    assert.equal(
      d.querySelector('[aria-label="Workspace 1"]')!.getAttribute("aria-selected"),
      "true",
    );
    assert.equal(d.querySelector("#p")!.hasAttribute("data-paseo-space-hidden"), false);
    assert.equal(d.querySelector("#q")!.hasAttribute("data-paseo-space-hidden"), false);
    d.querySelector('[aria-label="Workspace 1"]')!.dispatchEvent(
      new f.window.Event("contextmenu", { bubbles: true, cancelable: true }),
    );
    assert.equal(
      d.querySelector('[aria-label="Remove Workspace 1"]')!.hasAttribute("disabled"),
      true,
    );
  } finally {
    f.cleanup();
  }
});

test("project menu dismisses only after a successful move", async () => {
  for (const success of [true, false]) {
    const f = setup(fixture, success);
    try {
      const menu = f.document.querySelector('[role="menu"]')!;
      let dismissed = false;
      f.document.addEventListener("keydown", (event: unknown) => {
        if ((event as unknown as { key: string }).key === "Escape") {
          dismissed = true;
          menu.remove();
        }
      });
      menu.querySelectorAll('[role="menuitemradio"]')[1].click();
      assert.equal(dismissed, false);
      await Promise.resolve();
      assert.equal(dismissed, success);
      assert.equal(menu.isConnected, !success);
    } finally {
      f.cleanup();
    }
  }
});

test("Space transition slides out then in and cancels on cleanup", async () => {
  const f = setup();
  const animations: { frames: { transform: string }[]; finish: () => void; canceled: boolean }[] =
    [];
  const node = f.document.querySelector('[data-testid="sidebar-project-workspace-list-scroll"]')!;
  Object.assign(node, {
    animate(frames: { transform: string }[]) {
      let finish = () => {};
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const item = { frames, finish, canceled: false };
      animations.push(item);
      return {
        finished,
        cancel() {
          item.canceled = true;
        },
      };
    },
  });
  try {
    f.document.querySelector('[aria-label="Workspace 2"]')!.click();
    assert.equal(animations[0].frames[1].transform, "translateX(-100%)");
    assert.equal(f.document.querySelector("#p")!.hasAttribute("data-paseo-space-hidden"), true);
    animations[0].finish();
    await Promise.resolve();
    assert.equal(f.document.querySelector("#p")!.hasAttribute("data-paseo-space-hidden"), false);
    assert.equal(animations[1].frames[0].transform, "translateX(100%)");
  } finally {
    f.cleanup();
  }
  assert.equal(
    animations.every((item) => item.canceled),
    true,
  );
});

test("swipe on the stationary sidebar reaches empty Space 3 from Space 2", () => {
  const f = setup(fixture, true, true);
  try {
    f.document.querySelector('[aria-label="Workspace 2"]')!.click();
    const wheel = new f.window.Event("wheel", { bubbles: true, cancelable: true });
    Object.assign(wheel, { deltaX: 90, deltaY: 0, deltaMode: 0, buttons: 0 });
    f.document.querySelector("section")!.dispatchEvent(wheel);
    assert.equal(
      f.document.querySelector('[aria-label="Workspace 3"]')!.getAttribute("aria-selected"),
      "true",
    );
    assert.equal(wheel.defaultPrevented, true);
    const reverse = new f.window.Event("wheel", { bubbles: true, cancelable: true });
    Object.assign(reverse, { deltaX: -28, deltaY: 0, deltaMode: 0, buttons: 0 });
    f.document.querySelector("section")!.dispatchEvent(reverse);
    assert.equal(
      f.document.querySelector('[aria-label="Workspace 2"]')!.getAttribute("aria-selected"),
      "true",
    );
  } finally {
    f.cleanup();
  }
});

test("initial load failure shows Refresh without editable defaults, then restores saved spaces", async () => {
  const { document } = parseHTML(fixture);
  const saved = addSpace(stateSchema.parse({}));
  let offline = true;
  let writes = 0;
  const controller = createSidebarController({
    rpc: async (contract: { name: string }) => {
      if (contract.name === "spaces.catalog") {
        if (offline) throw new Error("Transport not connected");
        return { projects: [] };
      }
      if (contract.name.endsWith(".read"))
        return { status: "ready", revision: "saved-revision", values: saved };
      if (contract.name === "spaces.activity") throw new Error("Transport not connected");
      writes++;
      throw new Error("Unexpected write");
    },
  } as unknown as Parameters<typeof createSidebarController>[0]);
  const cleanup = mountSidebar(
    document as unknown as DomDocument,
    () => ({ observe() {}, disconnect() {} }),
    controller,
  );
  try {
    await new Promise((resolve) => setImmediate(resolve));
    const bar = document.querySelector('[data-testid="spaces-sidebar-controls"]');
    assert.ok(bar, "initial failure must not hide the sidebar controls");
    assert.match(bar.querySelector('[role="status"]')!.textContent!, /Transport not connected/);
    assert.equal(bar.querySelector('[role="tab"]'), null);
    assert.equal(bar.querySelector('[aria-label="Create Space"]'), null);
    assert.equal(document.querySelector("[data-paseo-space-hidden]"), null);
    assert.equal(await controller.create(), false);
    assert.equal(await controller.moveView("repo:p", "space-1"), false);
    assert.equal(writes, 0);
    offline = false;
    bar.querySelector("button")!.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(bar.querySelector('[role="status"]')!.textContent, "");
    assert.equal(bar.querySelectorAll('[role="tab"]').length, 2);
    assert.deepEqual(controller.get()!.state, saved);
    assert.equal(writes, 0);
  } finally {
    cleanup();
  }
});

test("tab rename saves its name without changing selection or project visibility", async () => {
  const f = setup();
  try {
    const tab = f.document.querySelector('[aria-label="Workspace 2"]')!;
    tab.click();
    tab.dispatchEvent(new f.window.Event("contextmenu", { bubbles: true }));
    const actions = f.document.querySelector(".paseo-spaces-bar > .paseo-spaces-menu")!;
    actions.querySelector("button")!.click();
    const input = actions.querySelector("input")!;
    assert.equal(input.value, "Workspace 2");
    input.value = "  Công việc  ";
    const enter = new f.window.Event("keydown", { bubbles: true, cancelable: true });
    Object.assign(enter, { key: "Enter" });
    input.dispatchEvent(enter);
    await Promise.resolve();
    const renamed = f.document.querySelector('[role="tab"][aria-label="Công việc"]')!;
    assert.equal(renamed.textContent, "2");
    assert.equal(renamed.getAttribute("title"), "Công việc");
    assert.equal(f.document.querySelector("#workspace-heading > div")!.textContent, "Công việc");
    assert.equal(renamed.getAttribute("aria-selected"), "true");
    assert.equal(f.document.querySelector("#p")!.hasAttribute("data-paseo-space-hidden"), false);
    assert.equal(input.isConnected, false);
  } finally {
    f.cleanup();
  }
});

test("rename rejects blank names, keeps failed drafts, and Escape cancels", async () => {
  const f = setup(fixture, false);
  try {
    f.document
      .querySelector('[aria-label="Workspace 1"]')!
      .dispatchEvent(new f.window.Event("contextmenu", { bubbles: true }));
    const actions = f.document.querySelector(".paseo-spaces-bar > .paseo-spaces-menu")!;
    actions.querySelector("button")!.click();
    const input = actions.querySelector("input")!;
    const save = actions.querySelector("button")!;
    input.value = "   ";
    input.dispatchEvent(new f.window.Event("input"));
    assert.equal(save.hasAttribute("disabled"), true);
    input.value = "Draft";
    input.dispatchEvent(new f.window.Event("input"));
    save.click();
    await Promise.resolve();
    assert.equal(input.isConnected, true);
    assert.equal(input.value, "Draft");
    assert.equal(save.hasAttribute("disabled"), false);
    const escape = new f.window.Event("keydown", { bubbles: true });
    Object.assign(escape, { key: "Escape" });
    input.dispatchEvent(escape);
    assert.equal(input.isConnected, false);
    assert.ok(f.document.querySelector('[role="tab"][aria-label="Workspace 1"]'));
  } finally {
    f.cleanup();
  }
});

test("rename persists through refresh and revision conflict preserves saved name", async () => {
  let saved = addSpace(stateSchema.parse({}));
  let conflict = false;
  const controller = createSidebarController({
    rpc: async (contract: { name: string }, input: { revision: string; values: typeof saved }) => {
      if (contract.name === "spaces.catalog") return { projects: [] };
      if (contract.name.endsWith(".read"))
        return { status: "ready", revision: "r1", values: saved };
      assert.equal(input.revision, "r1");
      if (conflict) return { status: "conflict", error: "Revision conflict" };
      saved = input.values;
      return { status: "saved", revision: "r1", values: saved };
    },
  } as unknown as Parameters<typeof createSidebarController>[0]);
  try {
    await controller.refresh();
    assert.equal(await controller.rename("space-2", "Work"), true);
    await controller.refresh();
    assert.equal(controller.get()!.state.spaces[1].name, "Work");
    conflict = true;
    assert.equal(await controller.rename("space-2", "Other"), false);
    assert.equal(controller.get()!.state.spaces[1].name, "Work");
    assert.match(controller.get()!.error, /Revision conflict/);
  } finally {
    controller.stop();
  }
});

test("heading follows selection, survives host rerenders, and restores on cleanup", async () => {
  const f = setup();
  const heading = f.document.querySelector("#workspace-heading > div")!;
  try {
    assert.equal(heading.textContent, "Workspace 1");
    f.document.querySelector('[aria-label="Workspace 2"]')!.click();
    assert.equal(heading.textContent, "Workspace 2");
    heading.firstChild!.nodeValue = "Workspaces";
    f.mutations();
    await Promise.resolve();
    assert.equal(heading.textContent, "Workspace 2");
    f.update("Host offline");
    assert.equal(heading.textContent, "Workspaces");
    f.update("");
    assert.equal(heading.textContent, "Workspace 2");
  } finally {
    f.cleanup();
  }
  assert.equal(heading.textContent, "Workspaces");
  assert.equal(heading.hasAttribute("data-paseo-space-heading"), false);
  assert.equal(heading.hasAttribute("title"), false);
});
test("badges other Spaces by their most urgent agent and explains why", () => {
  const f = setup(undefined, true, true),
    d = f.document;
  const tab = (id: string) => d.querySelector(`[data-testid="spaces-tab-${id}"]`)!;
  const badge = (id: string) => tab(id).querySelector(".paseo-spaces-badge");
  assert.ok(f.activityPolls() >= 1);
  assert.equal(badge("space-2"), null);
  f.setActivity({ p: "running" });
  assert.equal(badge("space-2")?.getAttribute("data-activity"), "running");
  assert.equal(tab("space-2").getAttribute("aria-label"), "Workspace 2: an agent is running");
  assert.equal(tab("space-2").getAttribute("title"), "Workspace 2: an agent is running");
  assert.equal(badge("space-2")?.getAttribute("aria-hidden"), "true");
  // q lives in the current Space, so its permission stays on its visible row.
  f.setActivity({ p: "attention", q: "needs_input" });
  assert.equal(badge("space-1"), null);
  assert.equal(tab("space-1").getAttribute("aria-label"), "Workspace 1");
  assert.equal(badge("space-2")?.getAttribute("data-activity"), "attention");
  (tab("space-2") as unknown as { click(): void }).click();
  assert.equal(badge("space-2"), null);
  assert.equal(badge("space-1")?.getAttribute("data-activity"), "needs_input");
  assert.match(tab("space-1").getAttribute("aria-label")!, /needs permission/);
  assert.equal(badge("space-3"), null);
  f.update("Host offline");
  assert.equal(d.querySelector(".paseo-spaces-badge"), null);
  f.cleanup();
});
test("project activity folds to the most urgent status of each Space", () => {
  let state = addSpace(addSpace(stateSchema.parse({})));
  state = moveProject(state, projectKey("view", "repo:a"), "space-2");
  state = moveProject(state, projectKey("sidebar", "b"), "space-2");
  const projects = [
    { id: "a", name: "A", viewKey: "repo:a", workspaces: [] },
    { id: "b", name: "B", workspaces: [] },
    { id: "c", name: "C", workspaces: [] },
  ];
  assert.deepEqual(spaceActivity(state, projects, { a: "running", b: "needs_input" }), {
    "space-2": "needs_input",
  });
  assert.deepEqual(
    spaceActivity(state, projects, { a: "attention", c: "failed", gone: "running" }),
    {
      "space-2": "attention",
      "space-1": "failed",
    },
  );
});
test("badge palette follows the sidebar tone and polling stops on cleanup", async () => {
  const f = setup(),
    d = f.document;
  const bar = () => d.querySelector('[data-testid="spaces-sidebar-controls"]')!;
  Object.assign(d.defaultView ?? f.window, {
    getComputedStyle: () => ({ color: "rgb(20, 20, 20)" }),
  });
  f.mutations();
  await Promise.resolve();
  assert.equal(bar().getAttribute("data-tone"), "light");
  Object.assign(d.defaultView ?? f.window, {
    getComputedStyle: () => ({ color: "rgb(230, 230, 230)" }),
  });
  f.mutations();
  await Promise.resolve();
  assert.equal(bar().getAttribute("data-tone"), "dark");
  f.cleanup();
  const intervals = new Set<unknown>();
  const realSet = globalThis.setInterval,
    realClear = globalThis.clearInterval;
  globalThis.setInterval = ((fn: () => void, ms: number) => {
    const id = realSet(fn, ms);
    intervals.add(id);
    return id;
  }) as typeof setInterval;
  globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
    intervals.delete(id);
    realClear(id);
  }) as typeof clearInterval;
  try {
    const g = setup();
    assert.equal(intervals.size, 2);
    g.cleanup();
    assert.equal(intervals.size, 0);
  } finally {
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
  }
});
test("selected Space survives a reload and falls back to the first when it was removed", () => {
  const storage = new Map<string, string>();
  const selected = (d: { querySelector(s: string): unknown }) =>
    (d.querySelector('[role="tab"][aria-selected="true"]') as { textContent: string }).textContent;
  const first = setup(undefined, true, true, storage);
  (
    first.document.querySelector('[data-testid="spaces-tab-space-3"]') as unknown as {
      click(): void;
    }
  ).click();
  first.cleanup();
  assert.equal(storage.get("paseo-workspace-spaces:selected"), "space-3");
  const reloaded = setup(undefined, true, true, storage);
  assert.equal(selected(reloaded.document), "3");
  assert.equal(
    reloaded.document.querySelector("#q")?.getAttribute("data-paseo-space-hidden"),
    "true",
  );
  reloaded.cleanup();
  storage.set("paseo-workspace-spaces:selected", "space-9");
  const removed = setup(undefined, true, true, storage);
  assert.equal(selected(removed.document), "1");
  assert.equal(storage.get("paseo-workspace-spaces:selected"), "space-9");
  removed.cleanup();
  const broken = setup(undefined, true, true, {
    get: () => {
      throw new Error("denied");
    },
    set: () => {
      throw new Error("denied");
    },
  } as unknown as Map<string, string>);
  assert.equal(selected(broken.document), "1");
  (
    broken.document.querySelector('[data-testid="spaces-tab-space-2"]') as unknown as {
      click(): void;
    }
  ).click();
  assert.equal(selected(broken.document), "2");
  broken.cleanup();
});
test("Ctrl+digit on macOS and Ctrl+Shift+digit elsewhere jump to Space N outside text fields", () => {
  const html = fixture.replace(
    "<main>Chat</main>",
    '<main>Chat<textarea></textarea><div contenteditable="true"></div></main>',
  );
  const selected = (d: { querySelector(s: string): unknown }) =>
    (d.querySelector('[role="tab"][aria-selected="true"]') as { textContent: string }).textContent;
  const press = (
    f: ReturnType<typeof setup>,
    target: { dispatchEvent(e: Event): boolean },
    keys: Record<string, unknown>,
  ) => {
    const event = new f.window.Event("keydown", { bubbles: true, cancelable: true });
    Object.assign(event, {
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
      ...keys,
    });
    target.dispatchEvent(event as unknown as Event);
    return event.defaultPrevented;
  };
  const mac = setup(html, true, true, new Map(), true);
  const body = mac.document.body as unknown as { dispatchEvent(e: Event): boolean };
  assert.equal(press(mac, body, { code: "Digit3", key: "3", ctrlKey: true }), true);
  assert.equal(selected(mac.document), "3");
  // Native bindings keep their keys: Cmd+digit, Cmd+Alt+digit, and digits beyond the last Space.
  assert.equal(press(mac, body, { code: "Digit1", metaKey: true }), false);
  assert.equal(press(mac, body, { code: "Digit1", metaKey: true, altKey: true }), false);
  assert.equal(press(mac, body, { code: "Digit1", ctrlKey: true, shiftKey: true }), false);
  assert.equal(press(mac, body, { code: "Digit4", ctrlKey: true }), false);
  assert.equal(selected(mac.document), "3");
  for (const field of ["textarea", '[contenteditable="true"]'])
    assert.equal(
      press(mac, mac.document.querySelector(field) as unknown as typeof body, {
        code: "Digit1",
        ctrlKey: true,
      }),
      false,
    );
  assert.equal(selected(mac.document), "3");
  mac.cleanup();
  assert.equal(press(mac, body, { code: "Digit1", ctrlKey: true }), false);
  const other = setup(html, true, true);
  const otherBody = other.document.body as unknown as typeof body;
  assert.equal(press(other, otherBody, { code: "Digit2", key: "2", ctrlKey: true }), false);
  assert.equal(selected(other.document), "1");
  assert.equal(
    press(other, otherBody, { code: "Digit2", key: "@", ctrlKey: true, shiftKey: true }),
    true,
  );
  assert.equal(selected(other.document), "2");
  other.cleanup();
});
