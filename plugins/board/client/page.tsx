import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { boardRpc, removeRunRpc, starRunRpc, starredFirst, type BoardRun } from "../shared/board";
import { boardConnectionState } from "./connection";

const SECOND = 1_000;

function timeValue(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function durationLabel(milliseconds: number | null): string | null {
  if (milliseconds === null || milliseconds < 0) return null;
  const seconds = Math.floor(milliseconds / SECOND);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function relativeLabel(value: string | null, now: number): string {
  const time = timeValue(value);
  if (time === null) return "Finish time unavailable";
  const elapsed = Math.max(0, now - time);
  if (elapsed < 10 * SECOND) return "Just now";
  return `${durationLabel(elapsed) ?? "0s"} ago`;
}

function observedSinceLabel(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(time));
}

function statusLabel(status: BoardRun["status"]): string {
  if (status === "unknown") return "Outcome unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function runDuration(run: BoardRun, now: number): string | null {
  if (run.status === "unknown") return null;
  const started = timeValue(run.startedAt);
  if (started === null) return null;
  const ended = run.status === "running" ? now : timeValue(run.endedAt);
  if (ended === null) return null;
  return durationLabel(ended - started);
}

function RunCard({
  run,
  now,
  theme,
  onRemove,
  onOpen,
  onStar,
}: {
  run: BoardRun;
  now: number;
  theme: PluginSurfaceProps["theme"];
  onRemove?: (id: string) => Promise<void>;
  onOpen?: (agentId: string) => void;
  onStar: (id: string, starred: boolean) => Promise<void>;
}) {
  const [starring, setStarring] = useState(false);
  const [starError, setStarError] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const colors = theme.colors;
  const duration = runDuration(run, now);
  const statusColor =
    run.status === "failed"
      ? colors.statusDanger
      : run.status === "cancelled" || run.status === "unknown"
        ? colors.statusWarning
        : colors.statusSuccess;
  const relative = relativeLabel(run.endedAt, now);
  const timing =
    run.status === "running"
      ? (duration ?? "Timing unavailable")
      : run.status === "unknown"
        ? relative === "Finish time unavailable"
          ? "Observation time unavailable"
          : `Observed ${relative.toLowerCase()}`
        : relative;

  return (
    <View
      accessibilityLabel={`${run.title}, ${statusLabel(run.status)}`}
      style={{
        gap: 12,
        padding: 18,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface1,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open conversation ${run.title}`}
        disabled={!onOpen}
        onPress={() => onOpen?.(run.agentId)}
        style={({ pressed }) => ({ gap: 12, opacity: pressed ? 0.7 : 1 })}
      >
        <Text
          numberOfLines={2}
          style={{
            color: colors.foreground,
            fontSize: 18,
            lineHeight: 24,
            fontWeight: "600",
            paddingRight: 38,
          }}
        >
          {run.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Text style={{ color: colors.accentForeground, fontSize: 13, fontWeight: "700" }}>
              {Array.from(run.project.trim())[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{
              color: colors.foreground,
              fontSize: 15,
              lineHeight: 22,
              fontWeight: "700",
              flexShrink: 1,
            }}
          >
            {run.project}
          </Text>
          <Text style={{ color: colors.foregroundMuted, fontSize: 13, lineHeight: 20 }}>
            · {run.provider}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              accessibilityElementsHidden
              style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: statusColor }}
            />
            <Text style={{ color: statusColor, fontSize: 14, lineHeight: 20 }}>
              {statusLabel(run.status)} · {timing}
            </Text>
          </View>
          {run.status !== "running" ? (
            <Text style={{ color: colors.foregroundMuted, fontSize: 13, lineHeight: 20 }}>
              {duration ? `Duration ${duration}` : "Duration unavailable"}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${run.starred ? "Unstar" : "Star"} ${run.title}`}
        accessibilityState={{ selected: run.starred, disabled: starring }}
        disabled={starring}
        onPress={async () => {
          setStarring(true);
          setStarError(false);
          try {
            await onStar(run.id, !run.starred);
          } catch {
            setStarError(true);
          } finally {
            setStarring(false);
          }
        }}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 44,
          height: 44,
          alignItems: "center",
          justifyContent: "center",
          opacity: starring ? 0.5 : 1,
        }}
      >
        <Text
          style={{
            color: run.starred ? colors.statusWarning : colors.foregroundMuted,
            fontSize: 24,
          }}
        >
          {run.starred ? "★" : "☆"}
        </Text>
      </Pressable>
      {starError ? (
        <Text accessibilityRole="alert" style={{ color: colors.statusDanger, fontSize: 13 }}>
          Could not update star. Please retry.
        </Text>
      ) : null}
      {run.status !== "running" && onRemove ? (
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${run.title} from Board`}
            disabled={removing}
            onPress={async () => {
              setRemoving(true);
              setRemoveError(false);
              try {
                await onRemove(run.id);
              } catch {
                setRemoveError(true);
              } finally {
                setRemoving(false);
              }
            }}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: colors.surface2,
              opacity: removing ? 0.5 : 1,
            }}
          >
            <Text style={{ color: colors.foregroundMuted, fontSize: 13 }}>
              {removing ? "Removing…" : "Remove"}
            </Text>
          </Pressable>
          {removeError ? (
            <Text accessibilityRole="alert" style={{ color: colors.statusDanger, fontSize: 13 }}>
              Could not remove. Please retry.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function RunColumn({
  title,
  runs,
  now,
  emptyMessage,
  theme,
  onRemove,
  onOpen,
  onStar,
}: {
  title: string;
  runs: BoardRun[];
  now: number;
  emptyMessage: string;
  theme: PluginSurfaceProps["theme"];
  onRemove?: (id: string) => Promise<void>;
  onOpen?: (agentId: string) => void;
  onStar: (id: string, starred: boolean) => Promise<void>;
}) {
  const colors = theme.colors;
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        gap: 14,
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface0,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: colors.foreground, fontSize: 20, lineHeight: 26, fontWeight: "600" }}>
          {title}
        </Text>
        <View
          accessibilityLabel={`${runs.length} runs`}
          style={{
            minWidth: 30,
            height: 26,
            paddingHorizontal: 9,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 13,
            backgroundColor: colors.surface2,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>
            {runs.length}
          </Text>
        </View>
      </View>
      {runs.length ? (
        runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            now={now}
            theme={theme}
            onRemove={onRemove}
            onOpen={onOpen}
            onStar={onStar}
          />
        ))
      ) : (
        <View
          style={{
            minHeight: 112,
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.foregroundMuted, fontSize: 14, textAlign: "center" }}>
            {emptyMessage}
          </Text>
        </View>
      )}
    </View>
  );
}

export function BoardPage({ host, theme, layout, navigation }: PluginSurfaceProps) {
  const readBoard = useRpc(boardRpc);
  const removeRun = useRpc(removeRunRpc);
  const setStarred = useRpc(starRunRpc);
  const board = useQuery({
    queryKey: ["board", host.id],
    queryFn: () => readBoard({}),
    retry: false,
    refetchInterval: 2_000,
    refetchOnWindowFocus: false,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), SECOND);
    return () => clearInterval(timer);
  }, []);
  const onStar = async (id: string, starred: boolean) => {
    const result = await setStarred({ id, starred, observingSince: board.data!.observingSince });
    if (!result.updated) throw new Error("Run changed. Refresh and retry.");
    await board.refetch({ throwOnError: true });
  };
  const runs = board.data?.runs ?? [];
  const running = useMemo(
    () => runs.filter((run) => run.status === "running").sort(starredFirst),
    [runs],
  );
  const finished = useMemo(
    () =>
      runs
        .filter((run) => run.status !== "running")
        .sort(
          (left, right) =>
            starredFirst(left, right) ||
            (timeValue(right.endedAt) ?? -1) - (timeValue(left.endedAt) ?? -1),
        ),
    [runs],
  );
  const colors = theme.colors;
  const connection = boardConnectionState({
    hasData: Boolean(board.data),
    isError: board.isError,
    isPaused: board.isPaused,
    dataUpdatedAt: board.dataUpdatedAt,
    now,
  });
  const initialLoading = connection === "connecting";
  const unavailable = !board.data && (connection === "error" || connection === "offline");
  const connectionColor =
    connection === "error"
      ? colors.statusDanger
      : connection === "live"
        ? colors.statusSuccess
        : colors.statusWarning;
  const connectionLabel =
    connection === "error"
      ? "Connection issue"
      : connection === "offline"
        ? "Offline"
        : connection === "stale"
          ? "Stale"
          : connection === "connecting"
            ? "Connecting"
            : "Live";
  const snapshotWarning =
    connection === "error"
      ? "Could not refresh. Showing the last successful snapshot."
      : connection === "offline"
        ? "Host is offline. Showing the last successful snapshot."
        : connection === "stale"
          ? "Updates are delayed. Showing a snapshot older than 10 seconds."
          : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.surface0 }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: layout.compact ? 14 : 28,
        gap: layout.compact ? 18 : 24,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.foreground,
              fontSize: layout.compact ? 28 : 34,
              lineHeight: layout.compact ? 34 : 40,
              fontWeight: "700",
            }}
          >
            Board
          </Text>
          <Text style={{ color: colors.foregroundMuted, fontSize: 15, lineHeight: 22 }}>
            Running and recently finished conversations
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 9 }}>
          <View
            accessibilityElementsHidden
            style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: connectionColor }}
          />
          <Text
            style={{
              color: connection === "error" ? colors.statusDanger : colors.foreground,
              fontSize: 14,
            }}
          >
            {connectionLabel}
          </Text>
        </View>
      </View>

      {initialLoading ? (
        <View
          style={{
            flex: 1,
            minHeight: 220,
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <ActivityIndicator color={colors.accent} />
          <Text style={{ color: colors.foregroundMuted }}>Loading runs…</Text>
        </View>
      ) : unavailable ? (
        <View
          accessibilityRole="alert"
          style={{
            minHeight: 220,
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            padding: 24,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface1,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "600" }}>
            {connection === "offline" ? "Board is offline" : "Board is unavailable"}
          </Text>
          <Text style={{ color: colors.foregroundMuted, textAlign: "center", lineHeight: 21 }}>
            {connection === "offline"
              ? "Reconnect to the host, then retry."
              : "Check the host connection, then retry."}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading Board"
            disabled={board.isFetching}
            onPress={() => void board.refetch()}
            style={{
              paddingHorizontal: 18,
              paddingVertical: 11,
              borderRadius: 8,
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ color: colors.accentForeground, fontWeight: "600" }}>
              {board.isFetching ? "Retrying…" : "Retry"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {snapshotWarning ? (
            <View
              accessibilityRole="alert"
              style={{
                flexDirection: layout.compact ? "column" : "row",
                alignItems: layout.compact ? "stretch" : "center",
                justifyContent: "space-between",
                gap: 10,
                padding: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: connectionColor,
              }}
            >
              <Text style={{ flex: 1, color: connectionColor, lineHeight: 20 }}>
                {snapshotWarning}
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={board.isFetching}
                onPress={() => void board.refetch()}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 7,
                  backgroundColor: colors.surface2,
                }}
              >
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                  {board.isFetching ? "Retrying…" : "Retry"}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View
            style={{
              flexGrow: layout.compact ? 0 : 1,
              flexDirection: layout.compact ? "column" : "row",
              alignItems: "stretch",
              gap: 16,
            }}
          >
            <RunColumn
              title="Running"
              runs={running}
              onStar={onStar}
              now={now}
              emptyMessage="No conversations are running."
              theme={theme}
              onOpen={navigation ? (agentId) => navigation.openAgent({ agentId }) : undefined}
            />
            <RunColumn
              title="Just finished"
              runs={finished}
              onStar={onStar}
              now={now}
              emptyMessage="No finished conversations observed yet."
              theme={theme}
              onOpen={navigation ? (agentId) => navigation.openAgent({ agentId }) : undefined}
              onRemove={async (id) => {
                const result = await removeRun({
                  id,
                  observingSince: board.data!.observingSince,
                  endedAt: finished.find((item) => item.id === id)?.endedAt ?? null,
                });
                if (!result.removed) throw new Error("Run changed. Refresh and retry.");
                await board.refetch({ throwOnError: true });
              }}
            />
          </View>
          <Text style={{ color: colors.foregroundMuted, fontSize: 12, lineHeight: 18 }}>
            Last 50 finished conversations · observed since{" "}
            {observedSinceLabel(board.data!.observingSince)}
          </Text>
        </>
      )}
    </ScrollView>
  );
}
