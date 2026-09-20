import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { mountSidebar, type DomDocument } from "../client/web";
import {
  createSidebarController,
  matchProject,
  sidebarMembership,
  type SidebarController,
  type SidebarSnapshot,
} from "../client/sidebar-state";
import { addSpace, moveProject, projectKey, removeSpace, stateSchema } from "../shared/spaces";

const fixture = `<html><head></head><body><aside><section><div data-testid="sidebar-project-workspace-list-scroll"><div role="group" id="p"><button data-testid="sidebar-project-row-repo:p">P</button><span>Existing agent</span></div><div role="group" id="q"><button data-testid="sidebar-project-row-repo:q">Q</button></div><div role="group" id="unknown"><button data-testid="sidebar-project-row-other">Other host</button></div></div></section></aside><main>Chat</main><div role="menu"><div data-testid="sidebar-project-menu-open-settings-repo:p">Settings</div></div></body></html>`;
function setup(html = fixture, moveSucceeded = true) {
  const { document, window } = parseHTML(html);
  let state = addSpace(stateSchema.parse({}));
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
  let listener = () => {},
    mutations = () => {},
    disconnected = false,
    stopped = false;
  const controller = {
    get: () => snapshot,
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
