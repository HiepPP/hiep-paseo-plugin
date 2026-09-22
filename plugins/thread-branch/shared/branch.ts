import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const pullRequestSchema = z.object({
  number: z.number().int().positive(),
  url: z.url(),
  state: z.string(),
});

export const branchInfoSchema = z.object({
  /** False when `cwd` is not inside a git work tree or git is unavailable. */
  repo: z.boolean(),
  branch: z.string().nullable(),
  detached: z.boolean(),
  sha: z.string().nullable(),
  dirty: z.boolean(),
  upstream: z.string().nullable(),
  ahead: z.number().int().nonnegative().nullable(),
  behind: z.number().int().nonnegative().nullable(),
  pr: pullRequestSchema.nullable(),
  /** Why `pr` is null when a lookup could not run: gh missing, not a GitHub remote, or lookup failed. */
  prLookup: z.enum(["ok", "unavailable", "failed", "skipped"]),
});
export type BranchInfo = z.infer<typeof branchInfoSchema>;

export const getBranchRpc = defineRpc({
  name: "thread-branch.get",
  input: z.object({ cwd: z.string().min(1), force: z.boolean().optional() }),
  output: branchInfoSchema,
});
