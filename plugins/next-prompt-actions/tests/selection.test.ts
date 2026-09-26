import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { renderSelection } from "../client/selection";
import type { Snapshot } from "../shared/contracts";
import type { Document, Node } from "../client/web";

test("compatible suggestions stay optional without inventing an exclusive group", () => {
  const { document, window } = parseHTML("<html><body><div id='root'></div></body></html>");
  const candidates: Snapshot["candidates"] = ["keyboard", "wrapping"].map((id) => ({
    key: id,
    text: `Review ${id}.`,
    source: "fixture",
    timestamp: 1,
    block: "fixture",
    state: "ready",
    selection: {
      id,
      blockKey: "same",
      exclusiveGroups: [],
      allowedCombinations: [["keyboard", "wrapping"]],
    },
  }));
  let edited: string[] = [];
  renderSelection(
    document as unknown as Document,
    document.querySelector("#root") as unknown as Node,
    document.querySelector("#root") as unknown as Node,
    candidates,
    { busy: false, enabled: false, note: "", candidates },
    {
      edit: (picked) => {
        edited = picked.map((c) => c.text);
      },
      send: async () => {},
    },
  );
  assert.equal(document.querySelectorAll('input[type="radio"]').length, 0);
  assert.equal(document.querySelectorAll('input[type="checkbox"]').length, 2);
  const edit = document.querySelector(".npa-selection-edit")!;
  assert.equal(edit.disabled, true);
  for (const input of document.querySelectorAll("input")) {
    assert.equal(input.checked, false);
    input.checked = true;
    input.dispatchEvent(new window.Event("change"));
  }
  assert.equal(edit.disabled, false);
  edit.dispatchEvent(new window.Event("click"));
  assert.deepEqual(edited, ["Review keyboard.", "Review wrapping."]);
  document.querySelector(".npa-selection-clear")!.dispatchEvent(new window.Event("click"));
  assert.equal(edit.disabled, true);
  assert.equal(document.querySelectorAll("input:checked").length, 0);
});
