import { createHash } from "node:crypto";
import type { Candidate, Scope, Snapshot } from "../shared/contracts";
import { parsePrompts } from "../shared/prompts";
import { Store } from "./store";

export type Row = {
  type: string;
  text?: string;
  id: string;
  messageId?: string;
  timestamp: number;
};
export type Current = { busy: boolean; epoch: string; rows: Row[]; complete: boolean };
export type Driver = {
  read(scope: Scope): Promise<Current>;
  send(scope: Scope, text: string, id: string, canSend: () => boolean): Promise<void>;
};
export type Judge = (
  state: { goal: string; context: string[]; response: string; prompt: string },
  signal: AbortSignal,
) => Promise<boolean>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class Engine {
  private locks = new Set<string>();
  private generations = new Map<string, number>();
  private eligible = new Set<string>();
  private controllers = new Map<string, AbortController>();
  private notes = new Map<string, string>();
  private stopped = false;
  constructor(
    readonly store: Store,
    private driver: Driver,
    private judge: Judge,
  ) {}

  private candidates(scope: Scope, current: Current): Candidate[] {
    const user = current.rows.findLastIndex((r) => r.type === "user_message");
    if (user < 0 || !current.complete) return [];
    // Only the last assistant response can offer a continuation, never tool output.
    const row = current.rows.findLast((r, i) => i > user && r.type === "assistant_message");
    if (!row?.text) return [];
    return parsePrompts(row.text).flatMap(({ block, prompts }, b) =>
      prompts.map((text, p) => {
        const key = hash(JSON.stringify([scope.agentId, current.epoch, row.id, b, p, text]));
        return {
          key,
          block,
          text,
          source: row.text!,
          timestamp: row.timestamp,
          state: this.store.get(scope.agentId).handled[key] ?? "ready",
        };
      }),
    );
  }

  async inspect(scope: Scope): Promise<Snapshot> {
    const current = await this.driver.read(scope);
    return {
      enabled: this.store.get(scope.agentId).enabled,
      busy: current.busy || this.locks.has(scope.agentId),
      note: this.notes.get(scope.agentId) ?? "",
      candidates: this.candidates(scope, current),
    };
  }
  async toggle(scope: Scope, enabled: boolean) {
    // Cancel pending judgment immediately, including while refreshing host state.
    this.invalidate(scope.agentId);
    await this.driver.read(scope);
    this.invalidate(scope.agentId);
    this.eligible.delete(scope.agentId);
    const entry = this.store.get(scope.agentId);
    entry.enabled = enabled;
    entry.remaining = 0;
    this.notes.set(
      scope.agentId,
      enabled ? "Jev enabled for the next new turn. Up to 3 continuations." : "Jev auto-run OFF",
    );
    this.store.save();
    return this.inspect(scope);
  }
  private invalidate(id: string) {
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
  }
  started(id: string) {
    if (!this.store.data[id]) return;
    this.invalidate(id);
    if (this.store.data[id]?.enabled) this.eligible.add(id);
  }
  interrupted(id: string) {
    if (!this.store.data[id]) return;
    this.invalidate(id);
    this.eligible.delete(id);
    this.store.get(id).remaining = 0;
    this.store.save();
  }

  async send(scope: Scope, key: string, automatic = false, generation?: number): Promise<void> {
    if (this.stopped || this.locks.has(scope.agentId)) throw new Error("Send already in progress.");
    this.locks.add(scope.agentId);
    try {
      const sourceGeneration = this.generations.get(scope.agentId);
      const current = await this.driver.read(scope);
      if (sourceGeneration !== this.generations.get(scope.agentId))
        throw new Error("Conversation changed.");
      const entry = this.store.get(scope.agentId);
      const candidate = this.candidates(scope, current).find((c) => c.key === key);
      if (current.busy || !candidate || candidate.state !== "ready")
        throw new Error("Prompt is stale, busy, or already submitted.");
      if (
        automatic &&
        (!entry.enabled ||
          entry.remaining <= 0 ||
          generation !== this.generations.get(scope.agentId))
      )
        throw new Error("Automatic send cancelled.");
      // Persist reservation before dispatch. An uncertain acknowledgement is never retried.
      entry.handled[key] = "sending";
      const messageId = `next-prompt-${key}`;
      if (automatic) {
        entry.remaining--;
        entry.autoMessageIds.push(messageId, `text:${hash(candidate.text)}`);
      } else this.invalidate(scope.agentId);
      this.store.save();
      try {
        const dispatchGeneration = this.generations.get(scope.agentId);
        await this.driver.send(
          scope,
          candidate.text,
          messageId,
          () =>
            !this.stopped &&
            dispatchGeneration === this.generations.get(scope.agentId) &&
            (!automatic || entry.enabled),
        );
        entry.handled[key] = "sent";
        this.notes.set(scope.agentId, automatic ? "Jev approved; prompt sent." : "Prompt sent.");
      } catch {
        entry.handled[key] = "unknown";
        entry.remaining = 0;
        this.notes.set(
          scope.agentId,
          "Send acknowledgement unknown. Check the conversation; no automatic retry.",
        );
      }
      this.store.save();
    } finally {
      this.locks.delete(scope.agentId);
    }
  }

  async ended(scope: Scope, completed: boolean) {
    if (!completed) {
      this.interrupted(scope.agentId);
      return;
    }
    if (this.stopped || !this.eligible.delete(scope.agentId)) return;
    const entry = this.store.get(scope.agentId);
    if (!entry.enabled) return;
    const generation = this.generations.get(scope.agentId);
    const controller = new AbortController();
    this.controllers.set(scope.agentId, controller);
    try {
      const current = await this.driver.read(scope);
      const lastUser = current.rows.findLast((r) => r.type === "user_message");
      if (!lastUser?.text || current.busy || controller.signal.aborted) return;
      if (
        !entry.autoMessageIds.includes(lastUser.messageId ?? "") &&
        !entry.autoMessageIds.includes(`text:${hash(lastUser.text)}`)
      ) {
        entry.remaining = 3;
        entry.scope = lastUser.text;
      }
      const candidates = this.candidates(scope, current).filter((c) => c.state === "ready");
      if (candidates.length !== 1 || entry.remaining === 0 || !entry.scope) {
        this.notes.set(
          scope.agentId,
          "Manual review: no single next step, or continuation limit reached.",
        );
        entry.remaining = 0;
        this.store.save();
        return;
      }
      const candidate = candidates[0];
      if (entry.evaluated.includes(candidate.key)) return;
      entry.evaluated.push(candidate.key);
      this.store.save();
      this.notes.set(scope.agentId, "Jev reviewing...");
      const context = current.rows
        .filter((r) => r.type === "user_message" && r.text)
        .map((r) => r.text!);
      const allowed = await this.judge(
        { goal: entry.scope, context, response: candidate.source, prompt: candidate.text },
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        generation !== this.generations.get(scope.agentId) ||
        !entry.enabled
      )
        return;
      if (!allowed) {
        entry.remaining = 0;
        this.store.save();
        this.notes.set(
          scope.agentId,
          "Manual review: Jev did not confirm a suitable, authorized continuation.",
        );
        return;
      }
      await this.send(scope, candidate.key, true, generation);
    } catch {
      entry.remaining = 0;
      this.store.save();
      if (!controller.signal.aborted)
        this.notes.set(scope.agentId, "Manual review: evaluation or state check failed.");
    } finally {
      if (this.controllers.get(scope.agentId) === controller)
        this.controllers.delete(scope.agentId);
    }
  }
  close() {
    this.stopped = true;
    for (const c of this.controllers.values()) c.abort();
    this.controllers.clear();
  }
}
