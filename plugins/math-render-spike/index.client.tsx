import type { PluginClientContext } from "@getpaseo/plugin/client";
import latexToUnicode from "latex-to-unicode";
import { MathRow, mathRowSchema } from "./client/math-row";

// Converts only $...$ spans so the probe shows the dependency ran inside the client bundle.
function renderMath(text: string): string {
  return text.replace(/\$([^$\n]+)\$/g, (_, tex: string) => latexToUnicode(tex));
}

export default function contribute(client: PluginClientContext) {
  const removeTransformer = client.addTimelineTransformer({
    id: "math-render-spike",
    query: { itemType: "assistant_message" },
    transform({ item, phase }) {
      if (!item.text.includes("$")) return undefined;
      return {
        items: [
          {
            type: "plugin",
            kind: "math-render-spike",
            version: 1,
            data: { text: renderMath(item.text), phase },
          },
        ],
      };
    },
  });
  const removeRenderer = client.addTimelineRenderer({
    kind: "math-render-spike",
    version: 1,
    schema: mathRowSchema,
    Component: MathRow,
  });
  return () => {
    removeTransformer();
    removeRenderer();
  };
}
