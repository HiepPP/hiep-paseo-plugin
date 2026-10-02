import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useRevealedText } from "@getpaseo/plugin/client/react-native";
import { Text, View } from "react-native";
import { z } from "zod";

export const mathRowSchema = z.object({
  text: z.string(),
  phase: z.enum(["streaming", "complete"]),
});

export function MathRow({ item, theme }: PluginTimelineItemProps<z.output<typeof mathRowSchema>>) {
  const text = useRevealedText(item.data.text, item.data.phase);
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>math-render-spike</Text>
      <Text style={{ color: theme.colors.foreground }}>{text}</Text>
    </View>
  );
}
