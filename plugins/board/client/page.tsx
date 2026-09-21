import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { boardRpc, removeRunRpc, starRunRpc, starredFirst, type BoardRun } from "../shared/board";
import { BoardSizeControl } from "./size-control";
import { boardConnectionState } from "./connection";

const SECOND = 1_000;

// Retain size across navigation without changing host appearance.
let boardSize = 100;

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
  scale,
}: {
  scale: number;
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
  const s = (value: number) => value * scale;
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
        gap: s(12),
        padding: s(18),
        borderRadius: s(12),
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
        style={({ pressed }) => ({ gap: s(12), opacity: pressed ? 0.7 : 1 })}
      >
        <Text
          numberOfLines={2}
          style={{
            color: colors.foreground,
            fontSize: s(18),
            lineHeight: s(24),
            fontWeight: "600",
            paddingRight: s(38),
          }}
        >
          {run.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: s(24),
              height: s(24),
              borderRadius: s(6),
              backgroundColor: colors.accent,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Text style={{ color: colors.accentForeground, fontSize: s(13), fontWeight: "700" }}>
              {Array.from(run.project.trim())[0]?.toUpperCase() ?? "?"}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={{
              color: colors.foreground,
              fontSize: s(15),
              lineHeight: s(22),
              fontWeight: "700",
              flexShrink: 1,
            }}
          >
            {run.project}
          </Text>
          <Text style={{ color: colors.foregroundMuted, fontSize: s(13), lineHeight: s(20) }}>
            · {run.provider}
          </Text>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: s(8),
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
            <View
              accessibilityElementsHidden
              style={{
                width: s(9),
                height: s(9),
                borderRadius: s(5),
                backgroundColor: statusColor,
              }}
            />
            <Text style={{ color: statusColor, fontSize: s(14), lineHeight: s(20) }}>
              {statusLabel(run.status)} · {timing}
            </Text>
          </View>
          {run.status !== "running" ? (
            <Text style={{ color: colors.foregroundMuted, fontSize: s(13), lineHeight: s(20) }}>
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
          top: s(8),
          right: s(8),
          width: Math.max(44, s(44)),
          height: Math.max(44, s(44)),
          alignItems: "center",
          justifyContent: "center",
          opacity: starring ? 0.5 : 1,
        }}
      >
        <Text
          style={{
            color: run.starred ? colors.statusWarning : colors.foregroundMuted,
            fontSize: s(24),
          }}
        >
          {run.starred ? "★" : "☆"}
        </Text>
      </Pressable>
      {starError ? (
        <Text accessibilityRole="alert" style={{ color: colors.statusDanger, fontSize: s(13) }}>
          Could not update star. Please retry.
        </Text>
      ) : null}
      {run.status !== "running" && onRemove ? (
        <View style={{ alignItems: "flex-end", gap: s(6) }}>
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
              paddingHorizontal: s(12),
              paddingVertical: s(8),
              borderRadius: s(8),
              backgroundColor: colors.surface2,
              opacity: removing ? 0.5 : 1,
            }}
          >
            <Text style={{ color: colors.foregroundMuted, fontSize: s(13) }}>
              {removing ? "Removing…" : "Remove"}
            </Text>
          </Pressable>
          {removeError ? (
            <Text accessibilityRole="alert" style={{ color: colors.statusDanger, fontSize: s(13) }}>
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
  scale,
}: {
  scale: number;
  title: string;
  runs: BoardRun[];
  now: number;
  emptyMessage: string;
  theme: PluginSurfaceProps["theme"];
  onRemove?: (id: string) => Promise<void>;
  onOpen?: (agentId: string) => void;
  onStar: (id: string, starred: boolean) => Promise<void>;
}) {
  const s = (value: number) => value * scale;
  const colors = theme.colors;
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        gap: s(14),
        padding: s(16),
        borderRadius: s(14),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface0,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}>
        <Text
          style={{
            color: colors.foreground,
            fontSize: s(20),
            lineHeight: s(26),
            fontWeight: "600",
          }}
        >
          {title}
        </Text>
        <View
          accessibilityLabel={`${runs.length} runs`}
          style={{
            minWidth: s(30),
            height: s(26),
            paddingHorizontal: s(9),
            alignItems: "center",
            justifyContent: "center",
            borderRadius: s(13),
            backgroundColor: colors.surface2,
          }}
        >
          <Text style={{ color: colors.foreground, fontSize: s(13), fontWeight: "600" }}>
            {runs.length}
          </Text>
        </View>
      </View>
      {runs.length ? (
        runs.map((run) => (
          <RunCard
            key={run.id}
            scale={scale}
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
            minHeight: s(112),
            alignItems: "center",
            justifyContent: "center",
            padding: s(20),
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.foregroundMuted, fontSize: s(14), textAlign: "center" }}>
            {emptyMessage}
          </Text>
        </View>
      )}
    </View>
  );
}

export function BoardPage({ host, theme, layout, navigation }: PluginSurfaceProps) {
  const [size, setSize] = useState(boardSize);
  const scale = size / 100;
  const changeSize = (value: number) => {
    boardSize = Math.max(10, Math.min(150, value));
    setSize(boardSize);
  };
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
  const s = (value: number) => value * scale;
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
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      {/* Outside scaled scroll content so repeated clicks keep the same target. */}
      <View
        style={{
          alignItems: "flex-end",
          paddingHorizontal: layout.compact ? 14 : 28,
          paddingTop: 14,
          paddingBottom: 8,
        }}
      >
        <BoardSizeControl size={size} onChange={changeSize} theme={theme} />
      </View>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.surface0 }}
        contentContainerStyle={{
          flexGrow: 1,
          padding: s(layout.compact ? 14 : 28),
          gap: s(layout.compact ? 18 : 24),
        }}
      >
        <View
          style={{
            flexDirection: layout.compact ? "column" : "row",
            flexWrap: "wrap",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: s(16),
          }}
        >
          <View style={{ flexGrow: 1, flexShrink: 1, gap: s(4) }}>
            <Text
              accessibilityRole="header"
              style={{
                color: colors.foreground,
                fontSize: s(layout.compact ? 28 : 34),
                lineHeight: s(layout.compact ? 34 : 40),
                fontWeight: "700",
              }}
            >
              Board
            </Text>
            <Text style={{ color: colors.foregroundMuted, fontSize: s(15), lineHeight: s(22) }}>
              Running and recently finished conversations
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
              <View
                accessibilityElementsHidden
                style={{
                  width: s(9),
                  height: s(9),
                  borderRadius: s(5),
                  backgroundColor: connectionColor,
                }}
              />
              <Text
                style={{
                  color: connection === "error" ? colors.statusDanger : colors.foreground,
                  fontSize: s(14),
                }}
              >
                {connectionLabel}
              </Text>
            </View>
          </View>
        </View>

        {initialLoading ? (
          <View
            style={{
              flex: 1,
              minHeight: s(220),
              alignItems: "center",
              justifyContent: "center",
              gap: s(12),
            }}
          >
            <ActivityIndicator color={colors.accent} />
            <Text style={{ color: colors.foregroundMuted, fontSize: s(14) }}>Loading runs…</Text>
          </View>
        ) : unavailable ? (
          <View
            accessibilityRole="alert"
            style={{
              minHeight: s(220),
              alignItems: "center",
              justifyContent: "center",
              gap: s(14),
              padding: s(24),
              borderRadius: s(14),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface1,
            }}
          >
            <Text style={{ color: colors.foreground, fontSize: s(18), fontWeight: "600" }}>
              {connection === "offline" ? "Board is offline" : "Board is unavailable"}
            </Text>
            <Text
              style={{
                color: colors.foregroundMuted,
                fontSize: s(14),
                textAlign: "center",
                lineHeight: s(21),
              }}
            >
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
                paddingHorizontal: s(18),
                paddingVertical: s(11),
                borderRadius: s(8),
                backgroundColor: colors.accent,
              }}
            >
              <Text style={{ color: colors.accentForeground, fontSize: s(14), fontWeight: "600" }}>
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
                  gap: s(10),
                  padding: s(12),
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: connectionColor,
                }}
              >
                <Text
                  style={{ flex: 1, color: connectionColor, fontSize: s(14), lineHeight: s(20) }}
                >
                  {snapshotWarning}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={board.isFetching}
                  onPress={() => void board.refetch()}
                  style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(8),
                    borderRadius: s(7),
                    backgroundColor: colors.surface2,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontSize: s(14), fontWeight: "600" }}>
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
                gap: s(16),
              }}
            >
              <RunColumn
                scale={scale}
                title="Running"
                runs={running}
                onStar={onStar}
                now={now}
                emptyMessage="No conversations are running."
                theme={theme}
                onOpen={navigation ? (agentId) => navigation.openAgent({ agentId }) : undefined}
              />
              <RunColumn
                scale={scale}
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
            <Text style={{ color: colors.foregroundMuted, fontSize: s(12), lineHeight: s(18) }}>
              Last 50 finished conversations · observed since{" "}
              {observedSinceLabel(board.data!.observingSince)}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
