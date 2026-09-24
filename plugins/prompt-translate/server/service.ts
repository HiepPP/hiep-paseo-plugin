import { hasVietnamese } from "../shared/vietnamese";
import type { TranslateSettings } from "../shared/settings";
import type { Complete } from "./llm";
import { hash, type Store } from "./store";

export function createService(deps: {
  store: Store;
  complete: Complete;
  settings: () => Promise<TranslateSettings>;
}) {
  return {
    async translate({ text, cacheOnly }: { text: string; cacheOnly: boolean }) {
      if (!hasVietnamese(text)) throw new Error("Text has no Vietnamese to translate");
      const settings = await deps.settings();
      if (!settings.translate) return { translation: null };
      const { provider, translateModel: model } = settings;
      const key = hash("translate", provider, model, text);
      if (cacheOnly) return { translation: (await deps.store.get(key)) ?? null };
      const translation = await deps.store.run(key, () =>
        deps.complete({ mode: "translate", provider, model, text }),
      );
      return { translation };
    },
    async enhance({ text }: { text: string }) {
      const settings = await deps.settings();
      if (!settings.enhanceShortcut) throw new Error("Enhance shortcut is off");
      const { provider, enhanceModel: model } = settings;
      const prompt = await deps.store.run(hash("enhance", provider, model, text), () =>
        deps.complete({ mode: "enhance", provider, model, text }),
      );
      await deps.store.pair(prompt, text);
      return { prompt };
    },
    async original({ text }: { text: string }) {
      return { original: await deps.store.original(text) };
    },
  };
}
