import type { PluginButton } from "@getpaseo/plugin/client";
import type { BranchInfo } from "../shared/branch";
import { pillLabel, pillTitle } from "./label";

export function describeBranchPill(
  info: BranchInfo,
  actions: { copy(): Promise<void>; refresh(): Promise<void> },
): PluginButton {
  return {
    title: pillTitle(info),
    icon: "GitBranch",
    label: pillLabel(info),
    visible: info.repo,
    behavior: {
      kind: "menu",
      items: [
        {
          kind: "item",
          id: "copy-branch",
          title: "Copy branch name",
          icon: "Copy",
          visible: !info.detached && info.branch !== null,
          behavior: { kind: "action", onPress: actions.copy },
        },
        { kind: "separator", id: "refresh-divider" },
        {
          kind: "item",
          id: "refresh",
          title: "Refresh",
          icon: "RefreshCw",
          behavior: { kind: "action", onPress: actions.refresh },
        },
      ],
    },
  };
}

/** One click opens the pull request; hidden when the branch has none. */
export function describePrPill(info: BranchInfo, openPr: () => Promise<void>): PluginButton {
  const pr = info.pr;
  return {
    title: pr ? `Open PR #${pr.number} (${pr.state.toLowerCase()})` : "Open PR",
    icon: "GitPullRequest",
    label: pr ? `#${pr.number}` : "PR",
    visible: info.repo && pr !== null,
    behavior: { kind: "action", onPress: openPr },
  };
}

/** One click opens the repository page of `origin`; hidden when there is no web remote. */
export function describeRepoPill(info: BranchInfo, openRepo: () => Promise<void>): PluginButton {
  const url = info.remoteUrl;
  const label = url
    ? url
        .replace(/^https?:\/\/[^/]+\//, "")
        .split("/")
        .pop() || "Repo"
    : "Repo";
  return {
    title: url ? `Open ${url}` : "Open repository",
    icon: url?.includes("github.com") ? "Github" : "Globe",
    label,
    visible: info.repo && url !== null,
    behavior: { kind: "action", onPress: openRepo },
  };
}

/** `↑ahead | ↓behind` against the upstream; hidden when in sync or without an upstream. */
export function describeSyncPill(info: BranchInfo, refresh: () => Promise<void>): PluginButton {
  const ahead = info.ahead ?? 0;
  const behind = info.behind ?? 0;
  const counts = [
    ahead > 0 ? `${ahead} to push` : null,
    behind > 0 ? `${behind} to pull` : null,
  ].filter(Boolean);
  return {
    title: `${counts.join(", ") || "In sync"} vs ${info.upstream ?? "upstream"} · click to refresh`,
    icon: "ArrowUpDown",
    label: `↑${ahead} | ↓${behind}`,
    visible: info.repo && info.upstream !== null && ahead + behind > 0,
    behavior: { kind: "action", onPress: refresh },
  };
}
