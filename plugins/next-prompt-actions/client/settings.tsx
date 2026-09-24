import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { sendSettings } from "../shared/settings";

export function SendSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(sendSettings);
  if (settings.status === "loading" || settings.status === "error") {
    return (
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
        {settings.status === "loading"
          ? "Loading next prompt settings…"
          : `Next prompt settings are unavailable: ${settings.error}`}
      </Text>
    );
  }
  if (settings.status === "invalid") {
    return (
      <SettingsSection title="Next prompt actions">
        <SettingsCard>
          <SettingsAction
            label="Stored settings are invalid"
            hint={settings.error}
            error={settings.saveError}
            actionLabel="Reset to defaults"
            disabled={settings.saving}
            onPress={() => void settings.reset()}
          />
        </SettingsCard>
      </SettingsSection>
    );
  }
  const { values, revision } = settings;
  return (
    <SettingsSection title="Next prompt actions">
      <SettingsCard>
        <SettingsSwitch
          label="Back to Board after send"
          hint="After Send or Send all succeeds, open the Board. Requires the Board plugin."
          error={settings.saveError}
          value={values.backToBoard}
          disabled={settings.saving}
          onValueChange={(backToBoard) => void settings.save({ ...values, backToBoard }, revision)}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
