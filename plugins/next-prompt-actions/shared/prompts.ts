// `whys[i]` is the optional reason shown under `prompts[i]`; it is never sent.
export type PromptBlock = { block: string; prompts: string[]; whys: string[] };

export function commitPrompt(text: string): string | null {
  if (!/\bcommit\b/i.test(text)) return null;
  return /^\s*\/commit(?=\s|$)/.test(text) ? text : `/commit\n${text}`;
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
