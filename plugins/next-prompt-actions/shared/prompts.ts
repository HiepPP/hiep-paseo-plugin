// `whys[i]` is the optional reason shown under `prompts[i]`; it is never sent.
export type PromptBlock = { block: string; prompts: string[]; whys: string[] };

export type GitAction = {
  kind: "commit" | "commit-push" | "push";
  label: "Commit" | "Commit & Push" | "Push";
  prompt: string;
};

// Recognize explicit actions conservatively; mentions and unclear wording keep normal Send.
export function gitAction(text: string): GitAction | null {
  const normalized = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
  const skill = /^\s*[/$]commit(?=\s|$)/i.test(text);
  const clauses = normalized
    .replace(/^\s*[/$]commit(?=\s|$)/, "commit")
    .split(/[!?;,\n]+|\.(?=\s|$)|\b(?:then|roi|sau do)\b/);
  const commands = clauses.map((clause) =>
    clause
      .trim()
      .replace(/^(?:(?:please|hay|vui long|chi can|chi)\s+)+/, "")
      .replace(/^git\s+/, "")
      .replace(/^(?:create(?: a)?|tao(?: mot)?)\s+(?=commit\b)/, ""),
  );
  const denied = (verb: string) =>
    new RegExp(
      `\\b(?:do not|don['’]t|never|not|no|without|avoid|skip|khong|chua|dung|cam)(?:\\s+\\w+){0,3}\\s+${verb}\\b`,
    ).test(normalized);
  const isCommit = (command: string) =>
    /^commit(?=[:\s]|$)(?!\s+(?:messages?|buttons?|hash|sha|history|status|diff|log|is|was|has|da|already|done|completed)\b)/.test(
      command,
    );
  const isPush = (command: string) =>
    /^push(?=[:\s]|$)(?!\s+(?:notifications?|buttons?|events?|messages?|behavior|is|was|has|da|already|done|completed)\b)/.test(
      command,
    );
  const commit = !denied("commit(?:ting|s)?") && (skill || commands.some(isCommit));
  const noPush = /--no-push\b/.test(normalized) || denied("push(?:ing)?");
  const push =
    !noPush &&
    (commands.some(isPush) ||
      (commit &&
        commands.some(
          (command) =>
            isCommit(command) &&
            command
              .split(/\b(?:and|va)\b|[&+]/)
              .slice(1)
              .some((part) => isPush(part.trim().replace(/^git\s+/, ""))),
        )));
  if (!commit) return push ? { kind: "push", label: "Push", prompt: text } : null;

  const command = push ? "/commit" : "/commit --no-push";
  const prompt = skill
    ? text.replace(
        /^\s*[/$]commit(?=\s|$)/i,
        push || /--no-push\b/i.test(text) ? "/commit" : command,
      )
    : `${command}\n${text}`;
  return {
    kind: push ? "commit-push" : "commit",
    label: push ? "Commit & Push" : "Commit",
    prompt: `${prompt}\nCommit only the described changes. Preserve unrelated work.`,
  };
}

// Accept only top-level fenced suggestions in an explicit next-step section.
export function parsePrompts(markdown: string): PromptBlock[] {
  const result: PromptBlock[] = [];
  let section = false;
  let fence: { char: string; length: number; eligible: boolean; lines: string[] } | null = null;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (fence) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) {
        if (fence.eligible) {
          const block = fence.lines.join("\n").replace(/\n+$/, "");
          const prompts: string[] = [];
          const whys: string[] = [];
          let current: string[] | null = null;
          let valid = true;
          for (const bodyLine of block.split("\n")) {
            if (/^prompt:/i.test(bodyLine)) {
              if (current) prompts.push(current.join("\n").replace(/\n+$/, ""));
              current = [bodyLine.replace(/^prompt:[ \t]?/i, "")];
              whys.push("");
            } else if (current && /^why:/i.test(bodyLine) && !whys[whys.length - 1])
              whys[whys.length - 1] = bodyLine.replace(/^why:/i, "").trim();
            else if (current) current.push(bodyLine);
            else if (bodyLine.trim()) valid = false;
          }
          if (current) prompts.push(current.join("\n").replace(/\n+$/, ""));
          if (valid && prompts.length && prompts.every((p) => p.trim() && p.length <= 16000))
            result.push({ block, prompts, whys });
        }
        fence = null;
        continue;
      }
      fence.lines.push(line);
      continue;
    }
    const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) section = /^(?:what next|next steps)$/i.test(heading[1].trim());
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})([^`]*)$/);
    if (opening)
      fence = {
        char: opening[1][0],
        length: opening[1].length,
        eligible: section && /^(?:text|txt|plaintext)?\s*$/i.test(opening[2].trim()),
        lines: [],
      };
  }
  return result;
}

// Several prompts sent or edited together become one numbered message.
export function joinPrompts(prompts: string[]): string {
  if (prompts.length === 1) return prompts[0];
  return prompts.map((p, i) => `${i + 1}. ${p.replace(/\n/g, "\n   ")}`).join("\n");
}
