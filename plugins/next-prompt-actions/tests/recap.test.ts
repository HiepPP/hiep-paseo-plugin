import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { decorateRecap, foldPanel, recapStyles } from "../client/recap";
import type { Node } from "../client/web";

const item = (value: string) =>
  `<div data-paseo-markdown-tag="li"><span data-paseo-markdown-ignore="true" data-paseo-markdown-list-marker="true">•</span><div><span>${value}</span></div></div>`;
const recap = (extra = "") =>
  `<div data-paseo-markdown-tag="h2"><span>Recap</span></div><div data-paseo-markdown-tag="ul">${item('Branch: <span data-paseo-markdown-tag="code">main</span>')}${item('Did: Read the <a href="/report">report</a>.')}${item("Commit/push: none")}${extra}</div><div data-paseo-markdown-tag="h2">What Next</div><div data-paseo-markdown-tag="p">Keep this paragraph.</div>`;

test("compact Recap preserves native content, links, code, and restores exact markup", () => {
  const { document } = parseHTML(`<div id="message">${recap()}</div>`);
  const message = document.querySelector("#message")!;
  const before = message.innerHTML;
  const link = message.querySelector("a");
  const cleanup = decorateRecap(message as unknown as Node);
  assert.ok(cleanup);
  assert.equal(message.querySelectorAll("[data-npa-recap-field]").length, 3);
  assert.equal(message.querySelector("a"), link);
  assert.equal(link!.getAttribute("href"), "/report");
  assert.equal(message.querySelector('[data-paseo-markdown-tag="code"]')!.textContent, "main");
  assert.equal(message.querySelectorAll("[data-paseo-markdown-list-marker]").length, 3);
  assert.equal(message.querySelector("[data-npa-recap-stacked]"), null);
  cleanup();
  assert.equal(message.innerHTML, before);
});

test("extra or quoted recap content retains the original rendering", () => {
  for (const content of [
    recap(item("Tests: pending")),
    `<div data-paseo-markdown-tag="blockquote">${recap()}</div>`,
    recap().replace("Did:", "Summary:"),
  ]) {
    const { document } = parseHTML(`<div id="message">${content}</div>`);
    const message = document.querySelector("#message")!;
    const before = message.innerHTML;
    assert.equal(decorateRecap(message as unknown as Node), null);
    assert.equal(message.innerHTML, before);
  }
});

test("Did may hold a nested list; other fields may not", () => {
  const nested = `<div data-paseo-markdown-tag="ul">${item("Added config.")}${item("Fixed bridge.")}</div>`;
  const didList = recap().replace('Did: Read the <a href="/report">report</a>.', `Did:${nested}`);
  const { document } = parseHTML(`<div id="message">${didList}</div>`);
  const message = document.querySelector("#message")!;
  const before = message.innerHTML;
  const cleanup = decorateRecap(message as unknown as Node);
  assert.ok(cleanup);
  assert.deepEqual(
    Array.from(message.querySelectorAll("[data-npa-recap-field]")).map((field) =>
      (field as Node).getAttribute("data-npa-recap-field"),
    ),
    ["branch", "did", "commit/push"],
  );
  // Bullets get their own row instead of a narrow middle column.
  assert.ok(message.querySelector("[data-npa-recap][data-npa-recap-stacked]"));
  cleanup();
  assert.equal(message.innerHTML, before);

  const branchList = recap().replace("Branch: ", `Branch: ${nested}`);
  const other = parseHTML(`<div id="message">${branchList}</div>`).document.querySelector(
    "#message",
  )!;
  assert.equal(decorateRecap(other as unknown as Node), null);
});

for (const split of [false, true]) {
  test(`plain Recap folds with ${split ? "separate paragraphs" : "inline hard breaks"} and restores exactly`, () => {
    const fields = [
      'Branch: <span data-paseo-markdown-tag="code">main</span>',
      'Did: Read the <a href="/report">report</a>.',
      "Commit/push: none.",
    ];
    const paragraph = (text: string) =>
      `<div data-paseo-markdown-tag="p"><span>${text}</span></div>`;
    const content = split
      ? fields.map(paragraph).join("")
      : paragraph(fields.join("<span>\n</span>"));
    const { document } = parseHTML(
      `<div id="message"><div data-paseo-markdown-tag="h2">Recap</div>${content}<div data-paseo-markdown-tag="h2">What Next</div><div data-paseo-markdown-tag="pre">prompt: Verify.</div></div><div id="panel"><div id="section"></div></div>`,
    );
    const message = document.querySelector("#message")!;
    const before = message.innerHTML;
    const panel = document.querySelector("#panel")!;
    const folded = foldPanel(
      document as unknown as Parameters<typeof foldPanel>[0],
      message as unknown as Node,
      message.querySelector('[data-paseo-markdown-tag="pre"]') as unknown as Node,
      panel as unknown as Node,
      document.querySelector("#section") as unknown as Node,
    );
    assert.equal(panel.querySelector(".npa-branch")?.textContent?.trim(), "main");
    assert.equal(panel.querySelector(".npa-did")?.textContent?.trim(), "Read the report.");
    assert.equal(
      panel.querySelector(".npa-commit")?.getAttribute("aria-label"),
      "Commit/push: none.",
    );
    assert.equal(panel.querySelector("a")?.getAttribute("href"), "/report");
    assert.equal(panel.querySelector("[data-npa-code]")?.textContent, "main");
    assert.equal(panel.querySelectorAll("[data-paseo-markdown-tag]").length, 0);
    assert.ok(folded.intact());
    folded.undo();
    assert.equal(message.innerHTML, before);
    assert.equal(panel.querySelector(".npa-recap"), null);
  });
}

test("Recap chips wrap values in one span without host layout classes or styles", () => {
  const hosted = (value: string) =>
    `<div data-paseo-markdown-tag="li"><span data-paseo-markdown-ignore="true" data-paseo-markdown-list-marker="true">•</span><div class="css-view r-flex" style="flex:1 1 0%"><span class="css-text" style="white-space:pre-wrap">${value}</span></div></div>`;
  const list = [
    'Branch: <span data-paseo-markdown-tag="code" class="css-code">main</span> — ahead 1',
    "Did: Commit.",
    'Commit/push: committed <span data-paseo-markdown-tag="code">cc0ad67</span>; no push.',
  ]
    .map(hosted)
    .join("");
  const { document } = parseHTML(
    `<div id="message"><div data-paseo-markdown-tag="h2">Recap</div><div data-paseo-markdown-tag="ul">${list}</div><div data-paseo-markdown-tag="h2">What Next</div><div data-paseo-markdown-tag="pre">prompt: Verify.</div></div><div id="panel"><div id="section"></div></div>`,
  );
  const message = document.querySelector("#message")!;
  const before = message.innerHTML;
  const panel = document.querySelector("#panel")!;
  const folded = foldPanel(
    document as unknown as Parameters<typeof foldPanel>[0],
    message as unknown as Node,
    message.querySelector('[data-paseo-markdown-tag="pre"]') as unknown as Node,
    panel as unknown as Node,
    document.querySelector("#section") as unknown as Node,
  );
  const branch = panel.querySelector(".npa-branch")!;
  assert.equal(branch.children.length, 1);
  assert.equal(branch.firstElementChild!.className, "npa-branch-value");
  assert.equal(branch.textContent!.trim(), "main — ahead 1");
  assert.equal(branch.querySelector("[data-npa-code]")!.textContent, "main");
  for (const value of panel.querySelectorAll(".npa-branch-value, .npa-commit-value"))
    assert.doesNotMatch(value.innerHTML, /\s(?:class|style)="[^"]/);
  assert.equal(
    panel.querySelector(".npa-commit")!.textContent!.trim(),
    "committed cc0ad67; no push.",
  );
  folded.undo();
  assert.equal(message.innerHTML, before);
});

test("plain Recap rejects extra lines, empty, reordered and unknown fields", () => {
  for (const text of [
    "Branch: main\nDid: done\nCommit/push: none\nTests: pending",
    "Branch: main\nDid: \nCommit/push: none",
    "Did: done\nBranch: main\nCommit/push: none",
    "Branch: main\nSummary: done\nCommit/push: none",
  ]) {
    const { document } = parseHTML(
      `<div id="message"><div data-paseo-markdown-tag="h2">Recap</div><div data-paseo-markdown-tag="p">${text}</div><div data-paseo-markdown-tag="h2">What Next</div><div data-paseo-markdown-tag="pre">prompt: Verify.</div></div><div id="panel"><div id="section"></div></div>`,
    );
    const message = document.querySelector("#message")!;
    const panel = document.querySelector("#panel")!;
    const before = message.innerHTML;
    const folded = foldPanel(
      document as unknown as Parameters<typeof foldPanel>[0],
      message as unknown as Node,
      message.querySelector('[data-paseo-markdown-tag="pre"]') as unknown as Node,
      panel as unknown as Node,
      document.querySelector("#section") as unknown as Node,
    );
    assert.equal(panel.querySelector(".npa-recap"), null);
    folded.undo();
    assert.equal(message.innerHTML, before);
  }
});

test("global Recap fields fold across separate rows without decoration", () => {
  const row = (id: string, content: string) =>
    `<div data-message-id="same"><div id="${id}" data-testid="assistant-message">${content}</div></div>`;
  const { document } = parseHTML(
    `<div id="history">${row("heading", '<div data-paseo-markdown-tag="h2">Recap</div>')}${row("fields", `<div data-paseo-markdown-tag="ul">${item("Branch: main")}${item("Did: Verified rows.")}${item("Commit/push: none.")}</div>`)}${row("next", '<div data-paseo-markdown-tag="h2">Next Steps</div>')}${row("prompt", '<div data-paseo-markdown-tag="pre">prompt: Verify.</div>')}</div><div id="panel"><div id="section"></div></div>`,
  );
  const history = document.querySelector("#history")!;
  const before = history.innerHTML;
  const folded = foldPanel(
    document as unknown as Parameters<typeof foldPanel>[0],
    document.querySelector("#prompt") as unknown as Node,
    document.querySelector('[data-paseo-markdown-tag="pre"]') as unknown as Node,
    document.querySelector("#panel") as unknown as Node,
    document.querySelector("#section") as unknown as Node,
  );
  assert.equal(document.querySelector(".npa-did")?.textContent?.trim(), "Verified rows.");
  assert.equal(document.querySelector(".npa-commit")?.textContent, "No commit");
  assert.equal(document.querySelector(".npa-next-title")?.textContent, "Next Steps");
  assert.ok(folded.intact());
  folded.undo();
  assert.equal(history.innerHTML, before);
});

test("late Recap blocks and changed text invalidate a panel in the same mounted message", () => {
  const { document } = parseHTML(
    '<div id="message"><div data-paseo-markdown-tag="h2">What Next</div><div data-paseo-markdown-tag="pre">prompt: Verify.</div></div><div id="panel"><div id="section"></div></div>',
  );
  const message = document.querySelector("#message")!;
  const mount = () =>
    foldPanel(
      document as unknown as Parameters<typeof foldPanel>[0],
      message as unknown as Node,
      message.querySelector('[data-paseo-markdown-tag="pre"]') as unknown as Node,
      document.querySelector("#panel") as unknown as Node,
      document.querySelector("#section") as unknown as Node,
    );
  const first = mount();
  assert.ok(first.intact());
  message.insertAdjacentHTML(
    "afterbegin",
    `<div data-paseo-markdown-tag="h2">Recap</div><div data-paseo-markdown-tag="ul">${item("Branch: main")}${item("Did: Done.")}${item("Commit/push: none")}</div>`,
  );
  assert.equal(first.intact(), false);
  first.undo();
  const second = mount();
  assert.equal(document.querySelector(".npa-did")?.textContent?.trim(), "Done.");
  assert.ok(second.intact());
  message.querySelectorAll('[data-paseo-markdown-tag="li"]')[1].textContent = "Did: Updated.";
  assert.equal(second.intact(), false);
  second.undo();
  const third = mount();
  assert.equal(document.querySelector(".npa-did")?.textContent?.trim(), "Updated.");
  third.undo();
});

// Five-field Recap: Branch, Commit/push, Did, Not yet, Need from you.
const full = {
  branch: 'Branch: <span data-paseo-markdown-tag="code">main</span>',
  commit: "Commit/push: no",
  did: 'Did: Read the <a href="/report">report</a>.',
  notYet: "Not yet: Needs a device check.",
  need: "Need from you: Open a new session.",
};
const bullets = (...values: string[]) =>
  `<div data-paseo-markdown-tag="ul">${values.map(item).join("")}</div>`;
const tail = `<div data-paseo-markdown-tag="h2">What Next</div><div data-paseo-markdown-tag="p">Keep this paragraph.</div>`;
const fullRecap = (fields: string[] = Object.values(full)) =>
  `<div data-paseo-markdown-tag="h2"><span>Recap</span></div><div data-paseo-markdown-tag="ul">${fields.map(item).join("")}</div>`;
const fullList = (fields?: string[]) => `${fullRecap(fields)}${tail}`;
const paragraph = (text: string) => `<div data-paseo-markdown-tag="p"><span>${text}</span></div>`;
const lineBreak = "<span>\n</span>";
const recapHeading = '<div data-paseo-markdown-tag="h2"><span>Recap</span></div>';
function strip(content: string) {
  const { document } = parseHTML(`<div id="message">${content}</div>`);
  const message = document.querySelector("#message")!;
  const before = message.innerHTML;
  return { message, before, cleanup: decorateRecap(message as unknown as Node) };
}
function foldRecap(content: string) {
  const { document } = parseHTML(
    `<div id="message">${content}<div data-paseo-markdown-tag="h2">What Next</div><div data-paseo-markdown-tag="pre">prompt: Verify.</div></div><div id="panel"><div id="section"></div></div>`,
  );
  const message = document.querySelector("#message")!;
  const panel = document.querySelector("#panel")!;
  const before = message.innerHTML;
  const folded = foldPanel(
    document as unknown as Parameters<typeof foldPanel>[0],
    message as unknown as Node,
    message.querySelector('[data-paseo-markdown-tag="pre"]') as unknown as Node,
    panel as unknown as Node,
    document.querySelector("#section") as unknown as Node,
  );
  return { message, panel, before, folded };
}
const rows = (panel: Node) =>
  Array.from(panel.querySelectorAll(".npa-recap-row")).map((row) => [
    row.querySelector(".npa-recap-label")!.textContent,
    row.querySelector(".npa-recap-value")!.textContent!.replace(/•/g, "").trim(),
  ]);

test("five-field list Recap decorates as a stacked strip and restores exact markup", () => {
  const { message, before, cleanup } = strip(fullList());
  assert.ok(cleanup);
  assert.deepEqual(
    Array.from(message.querySelectorAll("[data-npa-recap-field]")).map((field) =>
      (field as Node).getAttribute("data-npa-recap-field"),
    ),
    ["branch", "commit/push", "did", "not yet", "need from you"],
  );
  assert.ok(message.querySelector("[data-npa-recap][data-npa-recap-stacked]"));
  assert.equal(message.querySelector("[data-npa-recap-empty]"), null);
  assert.equal(message.querySelectorAll("[data-paseo-markdown-list-marker]").length, 5);
  cleanup();
  assert.equal(message.innerHTML, before);
});

test("five-field strip marks Not yet and Need from you rows that say nothing", () => {
  for (const [notYet, need, empty] of [
    ["Not yet: nothing", "Need from you: Nothing.", ["not yet", "need from you"]],
    ["Not yet: Nothing.", "Need from you: Check the chip.", ["not yet"]],
    ["Not yet: Nothing left but docs.", "Need from you: nothing", ["need from you"]],
  ] as const) {
    const { message, before, cleanup } = strip(
      fullList([full.branch, full.commit, full.did, notYet, need]),
    );
    assert.ok(cleanup);
    assert.deepEqual(
      Array.from(message.querySelectorAll("[data-npa-recap-empty]")).map((field) =>
        (field as Node).getAttribute("data-npa-recap-field"),
      ),
      empty,
    );
    cleanup();
    assert.equal(message.innerHTML, before);
  }
  // Only the free-text fields can be empty; Did and Commit/push always show.
  const { message } = strip(
    fullList([full.branch, "Commit/push: nothing", "Did: nothing", full.notYet, full.need]),
  );
  assert.equal(message.querySelector("[data-npa-recap-empty]"), null);
});

test("five-field list allows nested lists inside Did, Not yet, and Need from you only", () => {
  const nested = (label: string) => `${label}${bullets("One.", "Two.")}`;
  const { message, before, cleanup } = strip(
    fullList([
      full.branch,
      full.commit,
      nested("Did:"),
      nested("Not yet:"),
      nested("Need from you:"),
    ]),
  );
  assert.ok(cleanup);
  assert.equal(message.querySelectorAll("[data-npa-recap-field]").length, 5);
  assert.equal(message.querySelector("[data-npa-recap-empty]"), null);
  cleanup();
  assert.equal(message.innerHTML, before);
  for (const index of [0, 1]) {
    const fields = Object.values(full);
    fields[index] = `${fields[index]}${bullets("One.")}`;
    assert.equal(strip(fullList(fields)).cleanup, null, `field ${index} may not hold a list`);
  }
});

test("other five-field shapes keep native rendering in the strip", () => {
  const [branch, commit, did, notYet, need] = Object.values(full);
  const owned = (content: string) => ({ ...strip(content) });
  for (const content of [
    fullList([branch, did, commit, notYet, need]),
    fullList([branch, commit, did, need, notYet]),
    fullList([branch, commit, did, notYet]),
    fullList([branch, commit, did, notYet, need, "Tests: pending"]),
    fullList([branch, commit, did, "Not yet:", need]),
    fullList([branch, commit, did, notYet, "Need from you:"]),
    fullList([branch, commit, did, notYet.replace("Not yet", "Open"), need]),
    `<div data-paseo-markdown-tag="blockquote">${fullList()}</div>`,
    // Lines under the heading are not decorated, as with the legacy plain Recap.
    `${recapHeading}${paragraph(Object.values(full).join(lineBreak))}${tail}`,
  ]) {
    const { message, before, cleanup } = owned(content);
    assert.equal(cleanup, null);
    assert.equal(message.innerHTML, before);
  }
});

test("a five-field Recap in a panel folds Not yet and Need from you into labeled rows", () => {
  const { panel, message, before, folded } = foldRecap(fullRecap());
  assert.equal(panel.querySelector(".npa-branch")?.textContent?.trim(), "main");
  assert.equal(panel.querySelector(".npa-commit")?.textContent?.trim(), "No commit");
  assert.equal(panel.querySelector(".npa-did")?.textContent?.trim(), "Read the report.");
  assert.deepEqual(rows(panel), [
    ["Not yet", "Needs a device check."],
    ["Need from you", "Open a new session."],
  ]);
  assert.equal(panel.querySelector("a")?.getAttribute("href"), "/report");
  assert.equal(panel.querySelectorAll("[data-paseo-markdown-tag]").length, 0);
  assert.ok(folded.intact());
  folded.undo();
  assert.equal(message.innerHTML, before);
  assert.equal(panel.querySelector(".npa-recap"), null);
});

test("a row whose value is nothing is omitted, but longer sentences stay", () => {
  const rowsFor = (notYet: string, need: string) =>
    rows(foldRecap(fullRecap([full.branch, full.commit, full.did, notYet, need])).panel);
  assert.deepEqual(rowsFor("Not yet: nothing", "Need from you: Nothing."), []);
  assert.deepEqual(rowsFor("Not yet: Nothing.", "Need from you: Check the chip."), [
    ["Need from you", "Check the chip."],
  ]);
  assert.deepEqual(rowsFor("Not yet: Nothing blocks this.", "Need from you: NOTHING"), [
    ["Not yet", "Nothing blocks this."],
  ]);
});

test("a five-field list keeps sub-bullets of Did, Not yet, and Need from you as lists", () => {
  const nested = (label: string, ...values: string[]) => `${label}${bullets(...values)}`;
  const { panel, message, before, folded } = foldRecap(
    fullRecap([
      full.branch,
      full.commit,
      nested("Did:", "Added config."),
      nested("Not yet:", "Item one.", "Item two."),
      nested("Need from you:", "Check the chip."),
    ]),
  );
  assert.equal(panel.querySelector(".npa-did")?.tagName, "DIV");
  assert.equal(panel.querySelectorAll(".npa-did [data-npa-list='li']").length, 1);
  assert.deepEqual(rows(panel), [
    ["Not yet", "Item one.Item two."],
    ["Need from you", "Check the chip."],
  ]);
  const notYet = panel.querySelector(".npa-recap-row")!;
  assert.equal(notYet.querySelectorAll("[data-npa-list='li']").length, 2);
  assert.equal(notYet.querySelectorAll("[data-npa-list='ul']").length, 1);
  assert.equal(notYet.querySelectorAll("[data-paseo-markdown-list-marker]").length, 2);
  assert.equal(panel.querySelectorAll("[data-paseo-markdown-tag]").length, 0);
  folded.undo();
  assert.equal(message.innerHTML, before);
});

test("commit chip maps no, yes, and legacy values", () => {
  for (const [value, text, ok] of [
    ["no", "No commit", false],
    ["No.", "No commit", false],
    ["none", "No commit", false],
    ["none.", "No commit", false],
    ["yes", "Committed", true],
    ["Yes.", "Committed", true],
    ["yes!", "Committed", true],
    ["yes, committed abc1234", "committed abc1234", true],
    ["yes - pushed main", "pushed main", true],
    ["yes committed abc1234", "committed abc1234", true],
    ["Yes: pushed origin/main", "pushed origin/main", true],
    ["committed abc1234", "committed abc1234", true],
    ["pushed main", "pushed main", true],
    ["not committed", "not committed", false],
    ["yesterday", "yesterday", false],
  ] as const) {
    const { panel } = foldRecap(
      fullRecap([full.branch, `Commit/push: ${value}`, full.did, full.notYet, full.need]),
    );
    const commit = panel.querySelector(".npa-commit")!;
    assert.equal(commit.textContent!.trim(), text, value);
    assert.equal(commit.classList.contains("npa-ok"), ok, value);
    assert.equal(commit.getAttribute("aria-label"), `Commit/push: ${value}`, value);
  }
});

test("a yes commit value keeps code in the chip after the dropped yes", () => {
  const { panel } = foldRecap(
    fullRecap([
      full.branch,
      'Commit/push: yes, committed <span data-paseo-markdown-tag="code">abc1234</span>',
      full.did,
      full.notYet,
      full.need,
    ]),
  );
  const commit = panel.querySelector(".npa-commit")!;
  assert.equal(commit.textContent!.trim(), "committed abc1234");
  assert.equal(commit.querySelector("[data-npa-code]")?.textContent, "abc1234");
  assert.equal(commit.getAttribute("aria-label"), "Commit/push: yes, committed abc1234");
});

const plainFields = [full.branch, full.commit, "Did: Rewrote the section. +12/-8.", "Not yet:"];
const plainList = bullets("Item one.", "Item two.");
const sectionPlain = `${recapHeading}${paragraph(plainFields.join(lineBreak))}${plainList}${paragraph("Need from you: Open a new session and check the chip.")}`;

test("labeled lines may be followed by a list that belongs to the field", () => {
  const { panel, message, before, folded } = foldRecap(sectionPlain);
  assert.equal(panel.querySelector(".npa-branch")?.textContent?.trim(), "main");
  assert.equal(panel.querySelector(".npa-commit")?.textContent?.trim(), "No commit");
  assert.equal(
    panel.querySelector(".npa-did")?.textContent?.trim(),
    "Rewrote the section. +12/-8.",
  );
  assert.deepEqual(rows(panel), [
    ["Not yet", "Item one.Item two."],
    ["Need from you", "Open a new session and check the chip."],
  ]);
  const notYet = panel.querySelector(".npa-recap-row")!;
  assert.equal(notYet.querySelectorAll("[data-npa-list='li']").length, 2);
  assert.equal(notYet.querySelectorAll("[data-paseo-markdown-list-marker]").length, 2);
  assert.equal(panel.querySelectorAll("[data-paseo-markdown-tag]").length, 0);
  // Heading, two paragraphs, the list, and What Next are hidden in place.
  assert.equal(message.querySelectorAll("[data-npa-folded]").length, 5);
  assert.equal(
    message.querySelector('[data-paseo-markdown-tag="ul"]')?.getAttribute("data-npa-folded"),
    "true",
  );
  assert.ok(folded.intact());
  folded.undo();
  assert.equal(message.innerHTML, before);
  assert.equal(message.querySelector("[data-npa-folded]"), null);
});

test("a hidden list of labeled lines reports a changed host render through intact", () => {
  const { message, folded } = foldRecap(sectionPlain);
  assert.ok(folded.intact());
  message.querySelectorAll('[data-paseo-markdown-tag="li"]')[1].textContent = "Item changed.";
  assert.equal(folded.intact(), false);
  folded.undo();
});

test("labeled lines support a list after Did and inline values with lists", () => {
  const { panel } = foldRecap(
    `${recapHeading}${paragraph([full.branch, full.commit, "Did: Rewrote the section."].join(lineBreak))}${bullets("Moved the header.", "Fixed spacing.")}${paragraph("Not yet: Needs a device check.<span>\n</span>Need from you:")}${bullets("Check the chip.")}`,
  );
  assert.equal(panel.querySelector(".npa-did")?.tagName, "DIV");
  assert.equal(
    panel.querySelector(".npa-did")?.textContent?.replace(/•/g, "").trim(),
    "Rewrote the section.Moved the header.Fixed spacing.",
  );
  assert.deepEqual(rows(panel), [
    ["Not yet", "Needs a device check."],
    ["Need from you", "Check the chip."],
  ]);
});

test("five labeled lines or paragraphs fold without any list", () => {
  const lines = Object.values(full);
  for (const content of [
    `${recapHeading}${paragraph(lines.join(lineBreak))}`,
    `${recapHeading}${lines.map(paragraph).join("")}`,
  ]) {
    const { panel, message, before, folded } = foldRecap(content);
    assert.equal(panel.querySelector(".npa-did")?.textContent?.trim(), "Read the report.");
    assert.deepEqual(rows(panel), [
      ["Not yet", "Needs a device check."],
      ["Need from you", "Open a new session."],
    ]);
    folded.undo();
    assert.equal(message.innerHTML, before);
  }
});

test("labeled-line shapes outside the contract keep native rendering", () => {
  const [branch, commit, did] = plainFields;
  const joined = (...fields: string[]) => paragraph(fields.join(lineBreak));
  const need = "Need from you: Open a new session.";
  for (const content of [
    // A label with an empty value needs a list right after it.
    `${recapHeading}${joined(branch, commit, did, "Not yet:", need)}`,
    `${recapHeading}${joined(branch, commit, did, "Not yet: Needs a check.", "Need from you:")}`,
    // A list may only follow Did, Not yet, or Need from you.
    `${recapHeading}${joined(branch, commit)}${plainList}${joined(did, "Not yet: x", need)}`,
    `${recapHeading}${joined(branch)}${plainList}${joined(commit, did, "Not yet: x", need)}`,
    // Lists must directly follow a labeled line, once.
    `${recapHeading}${plainList}${joined(branch, commit, did, "Not yet: x", need)}`,
    `${recapHeading}${joined(branch, commit, did, "Not yet:")}${plainList}${plainList}${paragraph(need)}`,
    `${recapHeading}${joined(branch, commit, did, "Not yet: x", need)}<div data-paseo-markdown-tag="blockquote">${paragraph("Quoted.")}</div>`,
    // Wrong order, missing label, extra or unlabeled block, unknown label.
    `${recapHeading}${joined(branch, did, commit, "Not yet: x", need)}`,
    `${recapHeading}${joined(branch, commit, did, need, "Not yet: x")}`,
    `${recapHeading}${joined(branch, commit, did, "Not yet: x")}`,
    `${recapHeading}${joined(branch, commit, did, "Not yet: x", need, "Tests: pending")}`,
    `${recapHeading}${joined(branch, commit, did, "Not yet: x", need)}${paragraph("Extra paragraph.")}`,
    `${recapHeading}${joined(branch, commit, did, "Open: x", need)}`,
    // The legacy three-field Recap accepts no list blocks.
    `${recapHeading}${joined(branch, did)}${plainList}${paragraph("Commit/push: no")}`,
    `${recapHeading}${joined(branch, did, "Commit/push: no")}${plainList}`,
  ]) {
    const { panel, message, before, folded } = foldRecap(content);
    assert.equal(panel.querySelector(".npa-recap"), null);
    assert.equal(panel.querySelector(".npa-recap-row"), null);
    folded.undo();
    assert.equal(message.innerHTML, before);
  }
});

test("legacy Recap renders without Not yet or Need from you rows", () => {
  const { panel, message, before, folded } = foldRecap(
    recap().split('<div data-paseo-markdown-tag="h2">What Next')[0],
  );
  assert.equal(panel.querySelector(".npa-did")?.textContent?.trim(), "Read the report.");
  assert.equal(panel.querySelector(".npa-commit")?.textContent?.trim(), "No commit");
  assert.equal(panel.querySelector(".npa-recap-row"), null);
  folded.undo();
  assert.equal(message.innerHTML, before);
});

test("the five-field strip keeps field order in the one-column layout", () => {
  const narrow = recapStyles.slice(recapStyles.indexOf("@media(max-width:800px)"));
  assert.match(
    narrow,
    /\[data-npa-recap-stacked\] > \[data-npa-recap-field="did"\] \{grid-area:auto;\}/,
  );
});

const classes = (node: Node) => node.getAttribute("class");
const sectionLabels = (panel: Node) =>
  Array.from(panel.querySelectorAll(".npa-recap-part")).map(
    (part) => part.querySelector(".npa-recap-label")!.textContent,
  );

test("a five-field Recap folds Did, Not yet, and Need from you into labeled sections in order", () => {
  const { panel, message, before, folded } = foldRecap(fullRecap());
  const recap = panel.querySelector(".npa-recap")!;
  assert.deepEqual(
    Array.from(recap.children).map((child) => classes(child as Node)),
    [
      "npa-recap-head",
      "npa-recap-part",
      "npa-recap-row npa-recap-part",
      "npa-recap-row npa-recap-part",
    ],
  );
  assert.deepEqual(sectionLabels(panel), ["Did", "Not yet", "Need from you"]);
  // The label sits above its value inside each section.
  for (const part of panel.querySelectorAll(".npa-recap-part")) {
    assert.equal(classes(part.children[0] as Node), "npa-recap-label");
    assert.equal(part.children.length, 2);
  }
  const did = panel.querySelector(".npa-recap-part")!;
  assert.equal(did.querySelector(".npa-recap-row"), null, "the Did section is not a row");
  assert.equal(classes(did.children[1] as Node), "npa-did");
  assert.equal(did.querySelector(".npa-did")?.textContent?.trim(), "Read the report.");
  assert.equal(did.querySelector("a")?.getAttribute("href"), "/report");
  assert.deepEqual(rows(panel), [
    ["Not yet", "Needs a device check."],
    ["Need from you", "Open a new session."],
  ]);
  folded.undo();
  assert.equal(message.innerHTML, before);
});

test("sections whose value is nothing are omitted, but Did always shows", () => {
  const labelsFor = (notYet: string, need: string) =>
    sectionLabels(
      foldRecap(fullRecap([full.branch, full.commit, "Did: nothing", notYet, need])).panel,
    );
  assert.deepEqual(labelsFor("Not yet: nothing", "Need from you: Nothing."), ["Did"]);
  assert.deepEqual(labelsFor("Not yet: Nothing.", "Need from you: Check the chip."), [
    "Did",
    "Need from you",
  ]);
  assert.deepEqual(labelsFor("Not yet: Needs a check.", "Need from you: NOTHING"), [
    "Did",
    "Not yet",
  ]);
});

test("labeled lines fold into the same sections, with a list inside its own section", () => {
  const { panel } = foldRecap(sectionPlain);
  assert.deepEqual(sectionLabels(panel), ["Did", "Not yet", "Need from you"]);
  const [, notYet] = Array.from(panel.querySelectorAll(".npa-recap-part")) as Node[];
  assert.equal(notYet.querySelectorAll("[data-npa-list='li']").length, 2);
  assert.equal(notYet.querySelector(".npa-recap-value")?.parentElement, notYet);
});

test("the legacy Recap panel has no Did label, section wrapper, or divider element", () => {
  const { panel } = foldRecap(recap().split('<div data-paseo-markdown-tag="h2">What Next')[0]);
  const recapNode = panel.querySelector(".npa-recap")!;
  assert.equal(panel.querySelector(".npa-recap-part"), null);
  assert.equal(panel.querySelector(".npa-recap-label"), null);
  assert.deepEqual(
    Array.from(recapNode.children).map((child) => classes(child as Node)),
    ["npa-recap-head", "npa-did"],
  );
});

const parts = (message: { querySelectorAll(selector: string): ArrayLike<unknown> }) =>
  Array.from(message.querySelectorAll("[data-npa-recap-part]")) as unknown as Node[];

test("the five-field strip shows each free-text field as a labeled section", () => {
  const { message, before, cleanup } = strip(fullList());
  assert.deepEqual(
    parts(message).map((part) => [
      part.parentElement!.getAttribute("data-npa-recap-field"),
      part.querySelector("[data-npa-recap-label]")!.textContent,
      part.querySelector("[data-npa-recap-value]")!.textContent!.trim(),
    ]),
    [
      ["did", "Did", "Read the report."],
      ["not yet", "Not yet", "Needs a device check."],
      ["need from you", "Need from you", "Open a new session."],
    ],
  );
  // Links survive in the copy, and the copy never looks like host Markdown.
  assert.ok(parts(message)[0].querySelector('a[href="/report"]'));
  assert.equal(parts(message)[0].querySelector("[data-paseo-markdown-tag]"), null);
  assert.equal(message.querySelectorAll("[data-npa-recap-sectioned]").length, 3);
  cleanup!();
  assert.equal(message.innerHTML, before);
});

test("strip sections leave every native node in place", () => {
  const { message, cleanup } = strip(fullList());
  const did = message.querySelector('[data-npa-recap-field="did"]')!;
  const native = (
    Array.from(did.children) as { hasAttribute(name: string): boolean; textContent: string }[]
  ).filter((child) => !child.hasAttribute("data-npa-recap-part"));
  assert.equal(native.length, 2);
  assert.ok(native[0].hasAttribute("data-paseo-markdown-list-marker"));
  assert.equal(native[1].textContent, "Did: Read the report.");
  assert.equal(did.lastElementChild!.getAttribute("data-npa-recap-part"), "true");
  cleanup!();
});

test("strip sections keep sub-bullets and code, and skip fields that say nothing", () => {
  const { message, before, cleanup } = strip(
    fullList([
      full.branch,
      full.commit,
      `Did: Edited <span data-paseo-markdown-tag="code">recap.ts</span>.`,
      `Not yet:${bullets("Check dark theme.", "Check narrow width.")}`,
      "Need from you: nothing",
    ]),
  );
  const [did, notYet, ...rest] = parts(message);
  assert.equal(rest.length, 0);
  assert.equal(did.querySelector("[data-npa-code]")!.textContent, "recap.ts");
  assert.equal(notYet.querySelectorAll('[data-npa-list="li"]').length, 2);
  assert.equal(notYet.querySelectorAll('[data-npa-list="ul"]').length, 1);
  assert.equal(
    notYet.querySelector("[data-npa-recap-value]")!.textContent!.replace(/•/g, "").trim(),
    "Check dark theme.Check narrow width.",
  );
  assert.equal(
    message
      .querySelector('[data-npa-recap-field="need from you"]')!
      .getAttribute("data-npa-recap-empty"),
    "true",
  );
  cleanup!();
  assert.equal(message.innerHTML, before);
});

test("Branch, Commit/push, and the legacy strip get no section copy", () => {
  const five = strip(fullList());
  for (const name of ["branch", "commit/push"])
    assert.equal(
      five.message.querySelector(`[data-npa-recap-field="${name}"] [data-npa-recap-part]`),
      null,
    );
  five.cleanup!();
  const legacy = strip(recap());
  assert.ok(legacy.cleanup);
  assert.equal(parts(legacy.message).length, 0);
  assert.equal(legacy.message.querySelector("[data-npa-recap-sectioned]"), null);
});

test("a panel folded over a sectioned strip does not repeat the copied text", () => {
  const { document } = parseHTML(
    `<div id="message">${fullRecap()}<div data-paseo-markdown-tag="h2">What Next</div><div data-paseo-markdown-tag="pre">prompt: Verify.</div></div><div id="panel"><div id="section"></div></div>`,
  );
  const message = document.querySelector("#message")!;
  const before = message.innerHTML;
  const cleanup = decorateRecap(message as unknown as Node)!;
  const folded = foldPanel(
    document as unknown as Parameters<typeof foldPanel>[0],
    message as unknown as Node,
    message.querySelector('[data-paseo-markdown-tag="pre"]') as unknown as Node,
    document.querySelector("#panel") as unknown as Node,
    document.querySelector("#section") as unknown as Node,
  );
  const panel = document.querySelector("#panel")!;
  assert.equal(panel.querySelector(".npa-did")!.textContent!.trim(), "Read the report.");
  assert.deepEqual(rows(panel as unknown as Node), [
    ["Not yet", "Needs a device check."],
    ["Need from you", "Open a new session."],
  ]);
  assert.equal(panel.querySelector("[data-npa-recap-part]"), null);
  folded.undo();
  cleanup();
  assert.equal(message.innerHTML, before);
});

test("strip section styles put the label on its own line and hide the native copy", () => {
  assert.match(
    recapStyles,
    /\[data-npa-recap-sectioned\] > :not\(\[data-npa-recap-part\]\) \{display:none!important;\}/,
  );
  assert.match(recapStyles, /\[data-npa-recap-label\] \{display:block;/);
  assert.match(
    recapStyles,
    /\[data-npa-recap-sectioned\]:not\(\[data-npa-recap-field="did"\]\) \{padding:10px 0 0!important;border-top:1px solid/,
  );
});
