import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const runSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  title: z.string(),
  project: z.string(),
  provider: z.string(),
  status: z.enum(["running", "completed", "failed", "cancelled", "unknown"]),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
});
export type BoardRun = z.infer<typeof runSchema>;
export const removeRunRpc = defineRpc({
  name: "board.remove-finished",
  input: z.object({ id: z.string(), observingSince: z.string(), endedAt: z.string().nullable() }),
  output: z.object({ removed: z.boolean() }),
});
export const boardRpc = defineRpc({
  name: "board.snapshot",
  input: z.object({}),
  output: z.object({
    runs: z.array(runSchema),
    observingSince: z.string(),
  }),
});
