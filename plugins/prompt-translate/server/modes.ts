import { mkdir, readFile, rename, writeFile, unlink, access, readdir } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { cavemanModeSchema, type TranslateSettings } from "../shared/settings";
import { hasVietnamese } from "../shared/vietnamese";

const tracker = "src/hooks/caveman-mode-tracker.js";
type Mode = TranslateSettings["cavemanMode"];
export class AgentModes {
  constructor(private root: string) {}
  private dir(agentId: string) {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(agentId))
      throw new Error("Invalid agent ID");
    return path.join(this.root, "agents", agentId);
  }
  private async write(file: string, value: unknown) {
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, file);
  }
  // Mirrors resolveCavemanRoot in caveman-hook.cjs, which runs standalone as the hook.
  private async cavemanRoot(): Promise<string> {
    const saved = JSON.parse(
      await readFile(path.join(this.root, "hook-runtime.json"), "utf8"),
    ).cavemanRoot;
    const exists = (dir: string) =>
      access(path.join(dir, tracker)).then(
        () => true,
        () => false,
      );
    if (saved && (await exists(saved))) return saved;
    const cache = path.join(
      process.env.CODEX_HOME || path.join(homedir(), ".codex"),
      "plugins/cache/caveman/caveman",
    );
    const names = (await readdir(cache).catch(() => [] as string[])).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true }),
    );
    for (const name of names)
      if (await exists(path.join(cache, name))) return path.join(cache, name);
    return saved;
  }
  async get(agentId: string): Promise<{ mode: Mode }> {
    try {
      return {
        mode: cavemanModeSchema.parse(
          JSON.parse(await readFile(path.join(this.dir(agentId), "mode.json"), "utf8")).mode,
        ),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { mode: "follow-agent" };
      throw error;
    }
  }
  async set(agentId: string, mode: Mode) {
    await this.write(path.join(this.dir(agentId), "mode.json"), {
      mode: cavemanModeSchema.parse(mode),
    });
    return { mode };
  }
  async prepare(
    input: { agentId: string; text: string; source: string; mode: Mode },
    settings: TranslateSettings,
  ) {
    await access(path.join(await this.cavemanRoot(), tracker));
    await this.set(input.agentId, input.mode);
    const token = `${Date.now()}-${randomUUID()}`;
    const hash = createHash("sha256").update(input.text.replace(/\r\n/g, "\n")).digest("hex");
    await this.write(path.join(this.dir(input.agentId), "pending", `${token}.json`), {
      hash,
      mode: input.mode,
      chineseScript: settings.chineseScript,
      replyVietnamese: settings.matchReplyLanguage && hasVietnamese(input.source),
      createdAt: Date.now(),
    });
    return { token };
  }
  async bindQueue(agentId: string, token: string, queueId: string) {
    if (!/^\d+-[a-f0-9-]+$/i.test(token)) throw new Error("Invalid turn token");
    await this.write(path.join(this.dir(agentId), "pending", `${token}.queue`), { queueId });
    try {
      await access(path.join(this.dir(agentId), "pending", `${token}.json`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.cancel(agentId, token);
    }
    return {};
  }
  async cancelQueue(agentId: string, queueId: string) {
    const dir = path.join(this.dir(agentId), "pending");
    const names = await readdir(dir).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return [] as string[];
    });
    for (const name of names) {
      if (!name.endsWith(".queue")) continue;
      try {
        const value = JSON.parse(await readFile(path.join(dir, name), "utf8"));
        if (value.queueId === queueId) await this.cancel(agentId, name.slice(0, -6));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return {};
  }
  async cancel(agentId: string, token: string) {
    if (!/^\d+-[a-f0-9-]+$/i.test(token)) throw new Error("Invalid turn token");
    await unlink(path.join(this.dir(agentId), "pending", `${token}.json`)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await unlink(path.join(this.dir(agentId), "pending", `${token}.queue`)).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    return {};
  }
}
