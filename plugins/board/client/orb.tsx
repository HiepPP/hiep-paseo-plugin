import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Platform, View } from "react-native";
import { ThinkingOrb } from "thinking-orbs";
import { isDarkSurface, orbPreset, sphereCanvas } from "../shared/orb";
import { AgentAvatar } from "./avatar";

/** thinking-orbs draws on a DOM canvas, so native keeps the avatar and host spinner. */
export const orbSupported = Platform.OS === "web";

const AVATAR_OPACITY = 0.55;

/** A solving orb drawn at `size` px; a larger canvas overflows the box evenly on every side. */
export function Orb({
  size,
  theme,
  color,
}: {
  size: number;
  theme: PluginSurfaceProps["theme"];
  /** Hex or rgb() ink tint; omitted keeps the orb monochrome. */
  color?: string;
}) {
  const orb = orbPreset(size);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      <ThinkingOrb
        aria-hidden
        state="solving"
        size={orb.size}
        theme={isDarkSurface(theme.colors.surface0) ? "dark" : "light"}
        color={color}
        style={{ transform: `scale(${orb.scale})`, flexShrink: 0 }}
      />
    </View>
  );
}

/**
 * Running-card avatar: the bot fades into a circle whose edge is the orb's sphere silhouette,
 * inside the same footprint as AgentAvatar.
 */
export function OrbAvatar({
  agentId,
  size,
  theme,
}: {
  agentId: string;
  size: number;
  theme: PluginSurfaceProps["theme"];
}) {
  const avatar = size * 0.9;
  const canvas = sphereCanvas(avatar);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: avatar,
          height: avatar,
          borderRadius: avatar / 2,
          overflow: "hidden",
          opacity: AVATAR_OPACITY,
          filter: "saturate(0.6)",
        }}
      >
        <AgentAvatar agentId={agentId} size={avatar} />
      </View>
      <View style={{ position: "absolute", left: (size - canvas) / 2, top: (size - canvas) / 2 }}>
        <Orb size={canvas} theme={theme} />
      </View>
    </View>
  );
}
