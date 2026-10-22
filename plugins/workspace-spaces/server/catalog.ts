import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import { activityPriority, type Activity } from "../shared/spaces";

type PaseoApi = PluginHandlerContext["paseo"];
type Workspace = { id: string; projectId: string; name: string; status?: string };

async function forEachWorkspace(
  paseo: Pick<PaseoApi, "workspaces">,
  visit: (workspace: Workspace) => void,
) {
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await paseo.workspaces.list({
      page: { limit: 200, ...(cursor ? { cursor } : {}) },
    });
    for (const workspace of page.entries) visit(workspace);
    if (!page.pageInfo.hasMore) break;
    cursor = page.pageInfo.nextCursor ?? undefined;
    if (!cursor || cursors.has(cursor))
      throw new Error("Workspace list changed. Refresh to retry.");
    cursors.add(cursor);
  } while (cursor);
}

export async function loadCatalog(paseo: Pick<PaseoApi, "projects" | "workspaces">) {
  const { projects } = await paseo.projects.list();
  const rows = new Map(
    projects.map((p) => [
      p.projectId,
      {
        id: p.projectId,
        name: p.projectDisplayName,
        path: p.projectRootPath,
        viewKey: p.projectKey,
        workspaces: [] as { id: string; name: string }[],
      },
    ]),
  );
  await forEachWorkspace(paseo, (workspace) => {
    const row = rows.get(workspace.projectId);
    if (row && !row.workspaces.some((w) => w.id === workspace.id))
      row.workspaces.push({ id: workspace.id, name: workspace.name });
  });
  return { projects: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

// The daemon already folds each workspace's agents into one status bucket, so a project's
// activity is its most urgent workspace. "done" and unknown buckets need nothing from the user.
export async function loadActivity(paseo: Pick<PaseoApi, "workspaces">) {
  const projects: Record<string, Activity> = {};
  await forEachWorkspace(paseo, ({ projectId, status }) => {
    if (!status || !Object.hasOwn(activityPriority, status)) return;
    const activity = status as Activity;
    const current = projects[projectId];
    if (!current || activityPriority[activity] < activityPriority[current])
      projects[projectId] = activity;
  });
  return { projects };
}
