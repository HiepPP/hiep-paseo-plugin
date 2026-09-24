import { useEffect, useState } from "react";
import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { Text } from "react-native";
import { providerSchema, translateSettings, type TranslateSettings } from "../shared/settings";
import { current } from "./state";

export function TranslateSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(translateSettings);
  const [models, setModels] = useState<{ translateModel?: string; enhanceModel?: string }>({});
  useEffect(() => {
    if (settings.status === "ready") current.apply(settings.values);
  }, [settings]);
  if (settings.status === "loading" || settings.status === "error") {
    return (
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
        {settings.status === "loading"
          ? "Loading prompt translate settings…"
          : `Prompt translate settings are unavailable: ${settings.error}`}
      </Text>
    );
  }
  if (settings.status === "invalid") {
    return (
      <SettingsSection title="Prompt translate">
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
  const save = (next: TranslateSettings) => settings.save(next, revision);
  const draft = {
    translateModel: models.translateModel?.trim() || values.translateModel,
    enhanceModel: models.enhanceModel?.trim() || values.enhanceModel,
  };
  const dirty =
    draft.translateModel !== values.translateModel || draft.enhanceModel !== values.enhanceModel;
  return (
    <>
      <SettingsSection title="Prompt translate">
        <SettingsCard>
          <SettingsSwitch
            label="Translate Vietnamese prompts"
            hint="Show an English translation under each new Vietnamese prompt. Desktop only."
            error={settings.saveError}
            value={values.translate}
            disabled={settings.saving}
            onValueChange={(translate) => void save({ ...values, translate })}
          />
          <SettingsSwitch
            label="Cmd/Ctrl+Enter enhances and sends"
            hint="Rewrites the composer draft as an English prompt, then sends it like Enter. Replaces the keyboard Queue shortcut."
            value={values.enhanceShortcut}
            disabled={settings.saving}
            onValueChange={(enhanceShortcut) => void save({ ...values, enhanceShortcut })}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Models">
        <SettingsCard>
          <SettingsSelect
            label="Provider"
            hint="Prompts are sent to this third-party service."
            value={values.provider}
            options={[
              { label: "OpenRouter", value: "openrouter" },
              { label: "Vercel AI Gateway", value: "vercel" },
            ]}
            disabled={settings.saving}
            onValueChange={(provider) =>
              void save({ ...values, provider: providerSchema.parse(provider) })
            }
          />
          <SettingsInput
            label="Translate model"
            initialValue={values.translateModel}
            onChangeText={(translateModel) => setModels((m) => ({ ...m, translateModel }))}
          />
          <SettingsInput
            label="Enhance model"
            initialValue={values.enhanceModel}
            onChangeText={(enhanceModel) => setModels((m) => ({ ...m, enhanceModel }))}
          />
          <SettingsAction
            label="Save models"
            hint="Use model IDs exactly as the provider lists them."
            actionLabel="Save"
            disabled={settings.saving || !dirty}
            onPress={() =>
              void save({ ...values, ...draft }).then((saved) => {
                if (saved) setModels({});
              })
            }
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
