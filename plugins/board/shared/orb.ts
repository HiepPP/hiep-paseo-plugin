/** thinking-orbs ships separately tuned designs at these sizes; other sizes scale the nearest. */
const ORB_PRESETS = [20, 32, 64] as const;

export function orbPreset(target: number): { size: (typeof ORB_PRESETS)[number]; scale: number } {
  const size = ORB_PRESETS.reduce((best, preset) =>
    Math.abs(preset - target) < Math.abs(best - target) ? preset : best,
  );
  return { size, scale: target / size };
}

/** The solving (rubik) sphere spans 0.82 of the canvas: `R = (size / 2) * 0.82` in the engine. */
const SOLVING_SPHERE = 0.82;

/** Canvas size whose solving sphere silhouette has the given diameter. */
export function sphereCanvas(diameter: number): number {
  return diameter / SOLVING_SPHERE;
}

function channels(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return [0, 2, 4].map((index) => parseInt(full.slice(index, index + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color.trim());
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/**
 * Plugin themes expose colors but no light/dark flag, and the orb's `auto` theme cannot see
 * Paseo's theme, so infer the mode from the surface. Unknown formats fall back to dark.
 */
export function isDarkSurface(color: string): boolean {
  const rgb = channels(color);
  if (!rgb) return true;
  const [r, g, b] = rgb.map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}
